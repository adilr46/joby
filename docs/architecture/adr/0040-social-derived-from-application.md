# ADR 0040 — Social derives signals from Application

Status: accepted

Interaction and audience policy amended by ADR 0041; Application authority and read-time
projection decisions below remain in force.

Application owns the record of a person's process. Social needs peer-relative progress and
knowledge exchange without becoming another tracker or exposing private application evidence.

Social computes status signals on read through Application's public contract. Company and role
are resolved in the composition root from Application's recorded Opportunity reference/revision.
Social persists only cohort memberships, explicit sharing grants and authored interactions.
No cross-module SQL joins, application writes, copied stage columns or generic status score exist.

Read-time derivation is deliberate: timeline appends currently have no notification event, and
corrections must take effect immediately. A materialized projection would require a complete
change contract, idempotent worker handling and invalidation. None is necessary for this slice.
Application's existing event publication and outbox guarantees remain unchanged.

The only initial surfacing rule is owner consent into a joined cohort. Cohorts are self-declared
peer context, scoped by recruiting cycle. Read/write authorization gates all conversations and
signals. Removing a share removes attached conversation data; leaving removes that cohort's
sharing grants. Corrections invalidate signal access on the next read. No private fact contributes
to aggregate peer context. Counts measure distinct participating people, never rank or worth.

Questions, tips, replies, collaboration and connection invitations support knowledge exchange.
Prestige and rivalry may emerge socially, but the schema and API do not encode a combined score.

Costs: live projection requires domain reads per shared application and per opportunity description.
Large cohorts will need pagination and batched read contracts. HTTP uses a replaceable trusted actor
resolver, with server-provisioned bearer credentials until the API gains session infrastructure.
