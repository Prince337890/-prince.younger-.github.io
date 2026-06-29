# Forward OS — Firebase Rules

These are the security rules for the Forward OS portal. They are **not** auto-deployed —
you paste them into the Firebase console and click **Publish**.

| File | What it is | Where to paste it |
|------|-----------|-------------------|
| `firestore.rules.multitenant` | Multi-tenant (workspace-isolated) Firestore rules | Firebase console → **Firestore Database → Rules** |
| `storage.rules` | Storage rules (RateCon / BOL / POD / credential uploads) | Firebase console → **Storage → Rules** |

The `storage.rules` are already what should be live today. The
`firestore.rules.multitenant` file is the **next** version — do not publish it
until you finish the cutover steps below.

---

## Multi-tenancy cutover — run these IN ORDER

The app code is already multi-tenant-ready and **non-breaking**: until a user has
an `orgId`, everything behaves exactly like the single-tenant version. The cutover
is a deliberate, one-time sequence. Do not skip or reorder steps.

> **Publish the new rules FIRST.** Your current live rules have no `orgs` block,
> so "Create my home workspace" would be denied under them. The new rules let
> *you* (super-admin, matched by email) read and write everything regardless of
> `orgId`, so your console still loads and the backfill runs. The only thing that
> breaks in the gap before backfill is a *driver / other dispatcher* logging in —
> so run these steps back-to-back while you're the only one signed in.

1. **Publish** `firestore.rules.multitenant` (Firestore → Rules → paste → Publish).
2. **Reload** the app, sign in as yourself, open **Workspaces** in the sidebar
   (it only appears for you).
3. Under **One-Time Data Migration**, type a name in the "Workspace name" field
   above, then click **1. Create my home workspace**. This creates your `orgs`
   document and stamps your own user with `orgId` + `role: admin`.
4. In the same card, pick your new workspace in the dropdown and click
   **Run backfill**. This stamps every existing carrier, load, intel note,
   expense, etc. with your `orgId`. Watch the log until it says **Done**.
5. **Reload** the app.

After that, each new dispatcher you provision in Workspaces gets their own
isolated workspace — they only ever see their own carriers, loads, and intel.

### How isolation works (the short version)
- Every workspace document carries an `orgId`.
- A user's `orgId` and `role` live on their own `users/{uid}` document.
- The rules resolve those with a `get()` at evaluation time and require
  `orgId == myOrg()` for workspace-scoped collections.
- You (super-admin, by email) keep full cross-workspace access for provisioning.
- No Cloud Functions or custom claims required.
