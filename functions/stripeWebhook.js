// ============================================================================
// STRIPE WEBHOOK — Level 2 revenue (ACTUAL dollars collected)
// ----------------------------------------------------------------------------
// Status: WRITTEN, NOT YET WIRED IN. This module is intentionally NOT required
// from index.js so nothing about it deploys until Stripe is live (which is
// gated on the EIN). Everything needed to switch it on is in STRIPE_WEBHOOK.md.
//
// What it does when activated: Stripe calls this HTTPS endpoint on every
// payment event. We verify the signature, dedupe on the event id, and write
// two things to Firestore:
//   1. payments/{event.id}         — an immutable ledger row per event
//   2. orgs/{orgId}.billing        — the workspace's current subscription state
// The super-admin Revenue view (Level 2) reads those to show collected-vs-
// expected. The Stripe SECRET KEY never touches the client — it lives only in
// this server-side function as a Cloud Functions secret.
//
// Multi-tenant mapping: when the portal creates a Checkout Session or a
// Subscription for a workspace, it MUST stamp `metadata.orgId` (and ideally
// `metadata.orgName`). That's how an incoming Stripe event is tied back to the
// right workspace here. See STRIPE_WEBHOOK.md → "Portal side".
// ============================================================================

const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');

// admin.initializeApp() is already called once in index.js; guard so this
// module is safe to require in any order (or in isolation from a test).
if (!admin.apps.length) admin.initializeApp();

// Two secrets — set both with `firebase functions:secrets:set` before deploy.
//   STRIPE_SECRET_KEY     — sk_live_… (used to build the Stripe client)
//   STRIPE_WEBHOOK_SECRET — whsec_… (from the Stripe webhook endpoint page)
const STRIPE_SECRET_KEY = defineSecret('STRIPE_SECRET_KEY');
const STRIPE_WEBHOOK_SECRET = defineSecret('STRIPE_WEBHOOK_SECRET');

// Map a Stripe price id → our internal plan key, so a collected subscription
// lines up with the same PLAN_PRICES tiers the app's Level-1 view uses. Fill
// these in with the real price ids from the Stripe Dashboard when you create
// the products. Unknown/absent price ids fall back to 'unknown' (still logged).
const PRICE_TO_PLAN = {
  // 'price_xxx_founder':   'founder',
  // 'price_xxx_starter':   'starter',
  // 'price_xxx_pro':       'pro',
  // 'price_xxx_authority': 'authority',
};

// Events we act on. Anything else is acknowledged (200) and ignored so Stripe
// doesn't retry it — we still write a ledger row for the audit trail.
const HANDLED = new Set([
  'checkout.session.completed',
  'invoice.paid',
  'invoice.payment_failed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'charge.refunded',
]);

exports.stripeWebhook = onRequest(
  { secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET], cors: false },
  async (req, res) => {
    // Stripe only ever POSTs. Reject everything else fast.
    if (req.method !== 'POST') { res.status(405).send('Method Not Allowed'); return; }

    // `stripe` is a lazy require so this file can sit in the repo without the
    // dependency installed until you actually activate (see package.json step).
    let stripe;
    try {
      stripe = require('stripe')(STRIPE_SECRET_KEY.value());
    } catch (e) {
      console.error('stripe SDK not installed — add "stripe" to functions/package.json before activating', e);
      res.status(500).send('Stripe not configured'); return;
    }

    // 1) Verify the signature against the RAW body. onRequest exposes req.rawBody
    //    (a Buffer) specifically for this — do NOT use the parsed req.body, or
    //    verification will fail.
    let event;
    try {
      const sig = req.headers['stripe-signature'];
      event = stripe.webhooks.constructEvent(req.rawBody, sig, STRIPE_WEBHOOK_SECRET.value());
    } catch (err) {
      console.error('Stripe signature verification failed:', err.message);
      res.status(400).send(`Webhook Error: ${err.message}`); return;
    }

    const db = admin.firestore();

    // 2) Idempotency: Stripe retries deliveries. Key the ledger row on the
    //    event id and bail if we've already processed it.
    const ledgerRef = db.collection('payments').doc(event.id);
    try {
      const existing = await ledgerRef.get();
      if (existing.exists) { res.status(200).json({ received: true, duplicate: true }); return; }
    } catch (e) {
      // A read hiccup shouldn't drop the event — fall through and process; the
      // set() below is still a single deterministic write keyed by event id.
      console.warn('idempotency check failed (processing anyway):', e.message);
    }

    try {
      const obj = event.data.object || {};
      const orgId =
        (obj.metadata && obj.metadata.orgId) ||
        (obj.subscription_details && obj.subscription_details.metadata && obj.subscription_details.metadata.orgId) ||
        null;

      // Always write an immutable ledger row for the audit trail, even for
      // events we don't otherwise act on.
      const amount = typeof obj.amount_paid === 'number' ? obj.amount_paid
        : typeof obj.amount_total === 'number' ? obj.amount_total
        : typeof obj.amount === 'number' ? obj.amount
        : null;
      await ledgerRef.set({
        eventId: event.id,
        type: event.type,
        orgId: orgId || null,
        customerId: obj.customer || null,
        subscriptionId: obj.subscription || (obj.object === 'subscription' ? obj.id : null) || null,
        amountCents: amount,                             // Stripe reports minor units
        amount: amount != null ? amount / 100 : null,    // convenience: dollars
        currency: obj.currency || null,
        status: obj.status || null,
        livemode: !!event.livemode,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        eventCreated: event.created ? new Date(event.created * 1000) : null,
        handled: HANDLED.has(event.type),
      });

      // 3) Update the workspace's billing state for the events that change it.
      if (orgId && HANDLED.has(event.type)) {
        const orgRef = db.collection('orgs').doc(orgId);
        const patch = { billing: {} };
        const b = patch.billing;

        switch (event.type) {
          case 'checkout.session.completed':
            b.customerId = obj.customer || null;
            b.subscriptionId = obj.subscription || null;
            b.status = 'active';
            b.lastEvent = 'checkout.session.completed';
            break;
          case 'invoice.paid':
            b.status = 'active';
            b.lastPaidAt = admin.firestore.FieldValue.serverTimestamp();
            b.lastPaidAmount = amount != null ? amount / 100 : null;
            b.lastEvent = 'invoice.paid';
            break;
          case 'invoice.payment_failed':
            b.status = 'past_due';
            b.lastEvent = 'invoice.payment_failed';
            break;
          case 'customer.subscription.created':
          case 'customer.subscription.updated': {
            b.subscriptionId = obj.id || null;
            b.status = obj.status || null; // active | trialing | past_due | canceled | unpaid …
            b.cancelAtPeriodEnd = !!obj.cancel_at_period_end;
            b.currentPeriodEnd = obj.current_period_end ? new Date(obj.current_period_end * 1000) : null;
            const priceId = obj.items && obj.items.data && obj.items.data[0] && obj.items.data[0].price && obj.items.data[0].price.id;
            if (priceId) { b.priceId = priceId; b.plan = PRICE_TO_PLAN[priceId] || 'unknown'; }
            b.lastEvent = event.type;
            break;
          }
          case 'customer.subscription.deleted':
            b.status = 'canceled';
            b.canceledAt = admin.firestore.FieldValue.serverTimestamp();
            b.lastEvent = 'customer.subscription.deleted';
            break;
          case 'charge.refunded':
            b.lastEvent = 'charge.refunded';
            b.lastRefundAmount = amount != null ? amount / 100 : null;
            break;
          default:
            break;
        }
        b.updatedAt = admin.firestore.FieldValue.serverTimestamp();
        // merge:true so we only touch the `billing` map, never clobber the org.
        await orgRef.set(patch, { merge: true });
      } else if (!orgId && HANDLED.has(event.type)) {
        // A real payment we couldn't attribute — surface it loudly so it gets
        // reconciled by hand rather than silently lost.
        console.warn(`Stripe ${event.type} (${event.id}) had no metadata.orgId — cannot attribute to a workspace. Set metadata.orgId when creating the Checkout Session / Subscription.`);
      }

      res.status(200).json({ received: true });
    } catch (err) {
      // Return 500 so Stripe retries — but the ledger row (keyed by event id)
      // makes the retry idempotent.
      console.error('stripeWebhook processing error:', err);
      res.status(500).send('Webhook handler failed');
    }
  }
);
