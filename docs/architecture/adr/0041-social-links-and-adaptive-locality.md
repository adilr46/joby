# ADR 0041 — One Link action and adaptive local cohorts

Status: accepted

Amends ADR 0040's interaction and cohort policies. Application remains the sole authority for
application facts, with Social deriving signals on read.

Questions, tips, replies, collaboration invitations and connection requests collapse into one
Link action. The profile number is total received Links across signals, not unique linkers.
The same actor can link several signals but can contribute only once per signal across audiences.
Links are reversible, require visibility, and cannot target one's own signal. Legacy authored
interactions remain stored but their APIs are retired; they are not consent to create a Link.

Relevant groups overlap. Full university/degree/track/cycle intersections can widen into
university/degree/cycle, country/degree/cycle, country/track/audience and global/track/audience.
Only explicitly supplied dimensions support widening. A broader cohort is still relevant context,
never everyone. Multiple memberships participate in selection, ordered by locality before expansion
distance. Signal-specific company/process context may use a different eligible reference cohort.

Feed selection chooses the closest sufficiently populated relevant group. Density counts distinct
other people with explicitly shared, valid, filter-matching signals; default threshold five,
configurable at composition. If every group is sparse, retain a broader populated relevant group
or the closest empty one. Return the reason and chosen group. No global ranking is introduced.

Audience expansion does not expand publication consent. Shares still name explicit audiences,
and reference the source membership authorizing that audience. Leaving it revokes those grants.
Hiding removes shares and attached Links; Application corrections exclude invalid signals and
their Links from profile counts. Link creation serializes with grant revocation through the
existing transaction pattern. Profile totals can be read by self and overlapping relevant peers,
without exposing the underlying Link identities or private source details.

Prestige, knowledge and rivalry remain emergent social dynamics. A Link count is not an application
quality measure, not a ranking input, and not combined with progress into a prestige score.

Costs: adaptive selection reads multiple audience grant sets. Application reads are shared within
the request. Pagination and batching remain future work; the empty web package still requires a
frontend to render the API's Link button, count and cohort explanation.
