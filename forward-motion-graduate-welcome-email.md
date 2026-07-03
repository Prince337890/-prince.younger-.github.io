# INTERNAL — Founding Graduate welcome email + day-25 check-in

Not a site page. Operational template for Prince to send by hand when provisioning
a Forward OS workspace for a 2-Week Dispatcher Crash Course graduate
(`dispatcher_leads` record tagged `courseCompleted: true`).

Send within 24–48 hours of the workspace request — that window is the promise
made on the crash-course completion screen and the request-access confirmation.

---

## 1. Welcome email — send at provisioning

**Subject:** Your Forward OS workspace is live — here's your 30 days

**Body:**

[Name] —

Workspace is built, login's below. You've got 30 days of Forward OS free, full
Pro access, on us.

Here's the deal: price one load, onboard one carrier, or send one invoice
before day 30, and you lock the Founding Graduate rate for as long as you're
running Forward OS — Starter at $29/mo (normally $39), Pro at $79/mo
(normally $99).

That rate goes away once we turn on self-serve billing. You're getting the
early number because you're one of the first through the course, not because
we're running a sale.

If the 30 days pass and nothing's moved, no hard feelings — the workspace
pauses and you can pick it back up at the standard rate whenever you're ready.
Nothing gets charged either way — we don't have your card.

Questions, just reply. I read everything.

— Prince

[Login link / credentials]

---

## 2. Day-25 check-in — send if no milestone logged yet

**Subject:** 3 days left on your free 30

**Body:**

[Name] —

Quick one — you've got about 3 days left on your free Forward OS trial. If
you've priced a load, onboarded a carrier, or sent an invoice, you're already
set — your Founding Graduate rate locks automatically.

If not yet, no pressure, just don't want you to lose the window without
knowing. Reply if you want a hand getting your first one through the system.

— Prince

---

## Tracking (manual, per graduate)

Add to the lead record or a tracking sheet:

- `trialStart` — date workspace was provisioned
- `trialEnd` — trialStart + 30 days
- `milestoneHit` — true once one of: load priced / carrier onboarded / invoice sent
- `discountLocked` — true once milestoneHit and Founding Graduate rate confirmed to the graduate
- `tier` — Founder ($19) / Starter ($29) / Pro ($79) founding rate, once locked

Founding Graduate rate numbers reference: Starter $39→$29/mo, Pro $99→$79/mo,
Founder $29→$19/mo. Offer closes to new graduates once self-serve Stripe
billing is live — do not extend it past that point without checking with
Prince first.
