# ADR 0023 — One Modular Core with Strongly Owned Modules

- **Status:** Superseded by ADR 0029 as the governing semantic topology; modular-core and deployment defaults retained
- **Date:** 2026-08-16
- **Modules affected:** Cross-cutting
- **Supersedes:** ADR 0001; ADR 0012
- **Related:** ADR 0002 (in-process events), ADR 0003 (one PostgreSQL database), ADR 0004
  (durable delivery), ADRs 0005–0022 (product semantics)

## Context

Joby's documentation has used domain, package, module and deployment terminology for overlapping
ideas. Conceptual Identity, Adaptation, Application and Memory groupings have consequently been
described as deployment-shaped architectural boundaries even though none is independently distributed.
That language makes internal semantic boundaries look like deployment decisions and encourages
network-shaped abstractions before an operational need exists.

The product needs strong ownership and isolation of meaning. It does not currently need a set of
distributed services. Several runtimes may still be useful for request handling, background work,
browser automation or other operational concerns, but a process boundary is not automatically a
business ownership boundary.

## Decision

**Joby begins and currently remains one modular core. Semantic boundaries are explicit and enforced
internally; runtime boundaries may differ for operational reasons; network-distributed services are
introduced only when a module demonstrates a concrete need for independent distribution.**

The active architectural topology is:

```text
JOBY CORE
│
├── Durable Identity
├── Identity Representation
├── Adaptation
├── Opportunity
├── Application
├── Portal
└── Memory
```

These are the core's strongly owned domain modules. Conceptual groupings such as identity,
application and memory remain useful when explaining the product model, but they are not deployment
boundaries and are not called services in active architecture documentation.

### Module ownership

Each module:

- owns its behavior, invariants and data;
- declares a public module interface for other modules and runtimes;
- keeps repositories, tables, persistence models and implementation details private;
- never reads or writes another module's tables or imports another module's internals;
- collaborates through public interfaces, identifiers and meaningful events;
- owns every table in its namespace, with ownership named in migrations.

The initial ownership map is:

| Module | Owns |
|---|---|
| Durable Identity | Person-centric canonical professional state: Explicit State, Stated Context, provenance and the held Learned State produced through governed learning |
| Identity Representation | Persistent, reusable, non-canonical positioning lenses and their decisions, references and general materializations |
| Adaptation | Temporary opportunity-specific interpretation, Adapted State, contextual drafts, elicited input and operational representation edits |
| Opportunity | Opportunity sourcing, normalization, company/role understanding and opportunity evaluation |
| Application | Application lifecycle, tasks, submissions and the immutable Application Record |
| Portal | Interaction with external application portals, including portal-specific execution state and failures |
| Memory | Evidence accumulation, Records, slower-loop learning and proposals that may update held learned state through the owning public interface |

Existing product invariants remain binding unless another ADR explicitly changes them. In
particular, Adaptation cannot write Durable Identity or Identity Representation; Opportunity does not
own representation; Application records what happened; Portal does not own application truth; and
Memory cannot bypass the governed Durable Identity write boundary.

### Data topology

Joby initially uses **one PostgreSQL database**, as decided by ADR 0003. Table ownership follows the
module map above rather than a deployment map. A module accesses another module's data only through
that module's public interface or a meaningful event. Cross-module transactions are allowed while
the modules share a runtime and database, but they do not transfer table ownership.

Schema- or role-level enforcement may be introduced if review and import rules prove insufficient.
Separate databases are not a default consequence of module ownership.

### Runtime topology

Runtimes are operational composition choices, not domain boundaries. The current web, API and worker
runtimes may compose several modules in-process. Additional runtimes, such as a portal worker, may be
introduced for a demonstrated operational need without turning the hosted module into a distributed
service.

Inside one runtime, modules call public interfaces in-process. Joby does not add HTTP, RPC or a
broker merely to imitate distribution.

### Distribution rule

A module may become an independently distributed service only after evidence demonstrates a concrete
need such as materially different scaling, availability, security/isolation, release cadence,
failure containment or team ownership. The extraction requires a new ADR that records:

1. the observed evidence;
2. why another runtime in the modular core is insufficient;
3. the transport and failure semantics;
4. data ownership and migration;
5. consistency and observability consequences; and
6. an explicit rollback or reintegration path.

Until that ADR is accepted, the module remains part of Joby Core.

### Terminology

In active architecture documentation, **service** means an independently distributed runtime
boundary. Internal boundaries are called modules, public module interfaces, ports or runtimes.
Historical ADR and completed-plan text remains unchanged where required to preserve the decision
record, but it is non-governing when superseded by this ADR.

## Consequences

- Joby has one formal architecture instead of separate conceptual and deployment models.
- The seven current module boundaries are first-class even when multiple modules temporarily share a
  package or runtime.
- Existing package layout is an implementation state, not the architecture. Modules may be extracted
  from `packages/identity` into clearer package boundaries without becoming network services.
- Public-interface and import-boundary tests become the main enforcement mechanism, supplemented by
  table-ownership tests and later database roles if needed.
- Runtimes can be added or split for operational reasons without redrawing domain ownership.
- Distribution remains possible, but its cost is paid only after evidence justifies it.

## Superseded decisions

- **ADR 0001** fixed the architecture around seven older domain packages. Its modularity,
  public-interface and delayed-distribution principles are retained here, but its domain topology is
  replaced by the seven Joby Core modules above.
- **ADR 0012** placed Adaptation as an Identity-owned internal sub-boundary. Its behavioral authority
  and hard negative boundaries are retained, but Adaptation is now a peer Joby Core module and not a
  sub-boundary of an Identity deployment.

## Alternatives Considered

- **Keep the old domain map and treat the new names as submodules.** Rejected: it preserves two
  competing architectural models and leaves ownership ambiguous.
- **Deploy one service per module now.** Rejected: no module has demonstrated an independent
  distribution need, and doing so would add network and consistency failure modes without product
  value.
- **Use one flat core without enforced modules.** Rejected: semantic ownership is load-bearing even
  when deployment is unified.

## Revisit When

A module presents measured evidence for independent distribution, or repeated ownership violations
show that package/import/database enforcement is insufficient. The default response to the latter is
stronger internal enforcement, not automatic distribution.
