# packages/shared

Genuinely cross-cutting primitives: identifier types, result/error shapes, date and time helpers,
common utilities.

**Not yet populated.**

## Rule

`shared` is not a dumping ground. Something belongs here only when **more than one domain needs it
and no domain owns it**. Domain concepts live in their domain, even when two domains touch them —
if two domains need the same concept, one of them owns it and the other goes through its public API.

`shared` must not depend on any domain package.
