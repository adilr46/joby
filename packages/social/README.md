# Social

Social derives status signals on read from Application. It owns cohort memberships, explicit
sharing grants and Links. It never stores company, role, stage, progression or outcome.
The composition root resolves company/role through Application's recorded Opportunity id/revision.

Application corrections immediately remove superseded signals from feeds, prevent further Links,
and exclude their Links from profile counts. Private notes, materials, observations, feedback and
reflections never enter the projection. There is no materialized status store or new event handler;
Application's state-first publication and outbox behavior remain unchanged.

## One Link action

A signal exposes a single Link/unlink action (`linked` in the feed). Separate question, tip, reply,
collaboration and connection APIs have been retired. Legacy interaction rows are preserved by the
forward migration; they are not silently converted into Links.

A profile's `linkCount` is **total received Links across signals**, as requested, not distinct people.
One person linking three signals contributes three. Repeated clicks on the same signal, including
through different audiences, contribute only one. Self-linking is rejected. Unlinking removes that
actor's Link; hiding a signal removes its grants and Links. Counts are computed from still-valid
Application facts and never written into Application or Identity. Profile counts are readable by
self or people with a relevant overlapping cohort; individual Link identities are not exposed.
This count is not used to rank feeds or combined with prestige or application progress into a score.

## Adaptive overlapping cohorts

Memberships are self-declared social context, not verified education or Identity changes. Supply
`university`, `degree`, `careerTrack`, `recruitingCycle`, `country` and `audience` as applicable.
Matching normalizes case/whitespace; it does not infer country, degree equivalence or role synonyms.

For a full Bath/CS/SWE/UK/student/2027-internship membership, eligible scopes are:

1. The full intersection.
2. Bath CS, 2027 internships.
3. UK CS, 2027 internships.
4. UK SWE, students.
5. Global SWE, students.

Only scopes supported by the supplied dimensions are generated. An explicitly supplied track and
audience are needed for the broader student network; there is never an everyone fallback.
A person may join several overlapping intersections. The feed compares all eligible scopes by
locality, then expansion distance, then stable cohort id. A standalone global membership does not
outrank a populated local one.

`GET /social/feed` chooses the **closest sufficiently populated relevant cohort**. The default
threshold is five distinct other people with visible matching signals, configurable through
`createSocial({ minimumFeedPeers })`. Own signals, repeated applications/observations and Link
counts cannot inflate density. Company/process filters apply before density is evaluated.
If none qualifies, use the broadest populated relevant scope; if all are empty, return the closest
empty scope. No memberships returns an empty feed. `selection` explains the choice and threshold.

Each signal also carries its company/process peer context. Among audiences explicitly containing
that signal, the closest sufficiently populated company/process comparison group is preferred;
otherwise the selected feed cohort is used. Reference counts use distinct people, unlike profile
Link totals. Feed ordering remains chronological, not prestige-based.

## Consent

Eligible readership and publication consent are separate. Joining an intersection makes its
relevant broader scopes available for reading, but **never shares a signal into those scopes**.
Use `/social/audiences` to discover eligible audience ids. Each `/social/shares` call grants one
explicit audience. Local-only signals are not copied into broader feeds when a viewer widens.
Every Link requires current source validity and audience access; author identity is server-resolved.

Shares record the membership that authorized their audience. Leaving that source membership
revokes its grants (including broader ones) and attached Links. Rejoining does not restore consent.
A Link is attached to its original grant; revoking that grant removes it, even when another audience
still has permission to see the signal. Unlink remains available after the actor loses audience access.

## HTTP

All routes require a trusted actor and return `Cache-Control: no-store`. Until session middleware
exists, `JOBY_SOCIAL_ACTORS` is a server-only JSON mapping of high-entropy bearer tokens (at least
32 characters) to person ids. Send credentials over HTTPS as `Authorization: Bearer ...`.
No configuration means 401. Body/query parameters cannot choose the acting person.

| Method | Route | Input / purpose |
| --- | --- | --- |
| GET | `/social/cohorts` | Own declared memberships |
| POST | `/social/cohorts` | Cohort dimensions; returns membership and eligible audiences |
| DELETE | `/social/cohorts` | `{ cohortId }`; leave and revoke its shares |
| GET | `/social/audiences` | Derived relevant scopes from all memberships |
| GET | `/social/signals` | Own candidate signals, private by default |
| POST | `/social/shares` | `{ applicationId, signalId, cohortId }`; explicit audience consent |
| DELETE | `/social/shares` | `{ signalId }`; hide from every audience |
| GET | `/social/feed` | Adaptive feed; optional `company`, `milestone`, explicit `cohortId` |
| POST | `/social/links` | `{ cohortId, signalId }`; idempotent Link |
| DELETE | `/social/links` | `{ signalId }`; remove own Link |
| GET | `/social/profile` | Own total received Links; optional `personId` for a relevant peer |

Apply forward migrations with `pnpm db:migrate`, including `0016_social.sql` and
`0017_social_links_and_cohort_scopes.sql`. Existing cohort ids remain stable. No signal backfill
is needed. The full feed frontend remains pending; the manual entry/profile page is available below.
Projection scans eligible cohort grants and caches Application
reads per request; large cohorts will need pagination and batched domain contracts.

The initial manual entry/profile UI is now served at `/applications/manual`. It records external
applications through Application, supports stage updates and explicit progress sharing, and displays
the owner's current company/role/stage. Peer `/social/profile` responses expose only shared signals,
not private current stages. External entries are labeled `user_reported` and need no Opportunity lookup.

Run `pnpm typecheck` and `pnpm test`. PostgreSQL integration tests require `DATABASE_URL` and
explicitly skip when it is absent.
