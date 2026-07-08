# Stripe Webhook — activation spec (Level 2 revenue)

**Status: written, not wired in.** `functions/stripeWebhook.js` is a complete,
ready-to-deploy Cloud Function, but it is **not** required from `index.js`, so
nothing about it ships until you deliberately turn it on. It's gated on the
**EIN** (Stripe can't go live without a verified business), not on engineering.

This is **Level 2** of the revenue picture:

| | Level 1 (live today) | Level 2 (this webhook) |
|---|---|---|
| Source | Plan you set per workspace + booked-load rev-share | Actual dollars Stripe collected |
| Needs Stripe? | No | Yes (live mode, after EIN) |
| Where it shows | Revenue tab → "Expected MRR" | Revenue tab → "Collected" (drop-in) |

The secret key **never** touches the browser. It lives only inside this
server-side function as a Cloud Functions secret. That is the whole reason this
is a webhook and not a client call.

---

## What it does

Stripe POSTs an event to the function's HTTPS URL on every payment action. The
function:

1. **Verifies the signature** against the raw request body (`req.rawBody`) using
   the webhook signing secret — rejects anything unsigned/forged with a 400.
2. **Dedupes** on `event.id` (Stripe retries deliveries) — writes each event
   exactly once.
3. Writes an **immutable ledger row** to `payments/{event.id}`.
4. Updates the workspace's **`orgs/{orgId}.billing`** map (subscription status,
   last paid, plan, period end) for the events that change it.

---

## Firestore shape it writes

**`payments/{event.id}`** (append-only ledger, one row per Stripe event):
```
{ eventId, type, orgId, customerId, subscriptionId,
  amountCents, amount (dollars), currency, status,
  livemode, createdAt, eventCreated, handled }
```

**`orgs/{orgId}.billing`** (current state, merged — never clobbers the org):
```
billing: {
  customerId, subscriptionId, priceId, plan,        // plan ∈ PLAN_PRICES keys
  status,                                            // active | trialing | past_due | canceled | unpaid
  cancelAtPeriodEnd, currentPeriodEnd,
  lastPaidAt, lastPaidAmount, lastRefundAmount,
  lastEvent, updatedAt, canceledAt
}
```
The Revenue view already reserves room for this; a Level-2 section reads
`orgs.*.billing` (collected) and the `payments` ledger (history) next to the
Level-1 "expected" totals.

---

## Activation checklist (the day Stripe goes live)

1. **Add the dependency.** In `functions/package.json` add `"stripe": "^16.0.0"`
   to `dependencies`, then `cd functions && npm install`.

2. **Wire it into `index.js`** — one line at the bottom:
   ```js
   exports.stripeWebhook = require('./stripeWebhook').stripeWebhook;
   ```

3. **Set the two secrets** (never commit these):
   ```bash
   firebase functions:secrets:set STRIPE_SECRET_KEY      # sk_live_…
   firebase functions:secrets:set STRIPE_WEBHOOK_SECRET  # whsec_… (from step 5)
   ```

4. **Deploy:** `firebase deploy --only functions:stripeWebhook`
   Copy the deployed URL (looks like
   `https://us-central1-<project>.cloudfunctions.net/stripeWebhook`).

5. **Register the endpoint in Stripe** → Developers → Webhooks → *Add endpoint*.
   Paste the URL, subscribe to these events:
   `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`,
   `customer.subscription.created`, `customer.subscription.updated`,
   `customer.subscription.deleted`, `charge.refunded`.
   Stripe shows the endpoint's **signing secret** (`whsec_…`) — that's the value
   for `STRIPE_WEBHOOK_SECRET` in step 3 (re-run that one secret, then redeploy).

6. **Fill in `PRICE_TO_PLAN`** in `stripeWebhook.js` with the real Stripe price
   ids once you create the products, so a collected subscription maps to the
   same plan tiers (`founder`/`starter`/`pro`/`authority`) the app already uses.

7. **Publish Firestore rules** for the two paths (below).

---

## Firestore rules to add

The function uses the Admin SDK, which **bypasses** security rules, so writes
work regardless. Rules only govern who can *read* from the portal:

```
// Actual-payment ledger — super-admin reads only; only the webhook (Admin SDK) writes.
match /payments/{id} {
  allow read:  if isSuper();
  allow write: if false;
}
```
`orgs/{id}.billing` is written by the Admin SDK and read under the existing
`orgs` read rule (super-admin, or the workspace owner). No rule change needed
for `orgs` beyond what's already published — but note the dispatcher-update
allowlist does **not** include `billing`, so a dispatcher can never forge their
own billing state. Keep it that way.

---

## Portal side (when you build the checkout flow)

The **only** thing the client must do for this webhook to attribute money
correctly: stamp the workspace id on whatever it creates in Stripe.

- When creating a **Checkout Session** or a **Subscription**, set
  `metadata.orgId = <the workspace's org id>` (and `metadata.orgName` for
  readability). That's the sole link back to the workspace.
- The checkout session itself should be created **server-side** (a companion
  `onCall` function using `STRIPE_SECRET_KEY`) — the browser only ever receives
  the resulting redirect URL. Never ship `sk_live_…` to the client.

---

## Testing before real money moves

Use **test mode** end-to-end first (`sk_test_…`, test webhook secret):

```bash
stripe login
stripe listen --forward-to http://localhost:5001/<project>/us-central1/stripeWebhook
stripe trigger checkout.session.completed
stripe trigger invoice.paid
```
Confirm a `payments/{id}` row appears and `orgs/{orgId}.billing.status` flips to
`active`. Then swap the test secrets for live and repeat once with a real $1
before opening it up.

---

## Security notes (Locke)

- Secret key is server-only, injected as a Cloud Functions secret — never in the
  bundle, never in Firestore, never in the repo.
- Signature verification is mandatory and uses the **raw** body; a request that
  doesn't verify is rejected 400 and never touches Firestore.
- The ledger is keyed by `event.id` → replays/retries are idempotent.
- `payments` is read-super-only / write-never from the client; only the Admin
  SDK (this function) writes it.
- `billing` is not in the dispatcher org-update allowlist, so a workspace owner
  cannot self-report as paid.
