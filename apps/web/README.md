# apps/web

The first UI is a small, framework-free manual Application entry/profile page in `public/`.
The API serves it at `/applications/manual`, with same-origin API calls. It supports company,
role and stage entry, stage updates, peer group membership, and explicit signal sharing/hiding.
An access token uses the existing `JOBY_SOCIAL_ACTORS` bootstrap authentication; it stays in memory.
There is no separate frontend build or server for this page.

## Rules

- The web app talks to `apps/api`. It does not import domain packages and does not touch the database.
- Domain logic never lives here. If the UI needs a rule, the rule belongs in the domain.
- The UI must keep doctrine visible rather than smoothing it away:
  - `Observed` / `Inferred` / `Hypothesized` are distinguishable to the user.
  - AI proposals are shown as proposals until the user confirms them.
  - Consequential claims and sensitive disclosures require an explicit user decision.
  - An Application Record is displayed as what was submitted, never re-rendered from current truth.
