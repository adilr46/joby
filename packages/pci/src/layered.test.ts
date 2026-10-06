/**
 * LayeredPci tests (ADR 0041).
 *
 * These tests use an in-memory fake Queryable — no real database required. The fake faithfully
 * models the two tables (pci_shared_cell, pci_personal_cell) and the upsert semantics so the
 * tests exercise real SQL logic paths without a running Postgres.
 */

import { describe, expect, it, beforeEach } from 'vitest';

import { LayeredPci, extractSharedFeatures, toCellKey } from './layered';
import type { ResolvedApplicationEvidence } from './model';

// ---------------------------------------------------------------------------
// In-memory fake Queryable
// ---------------------------------------------------------------------------

interface SharedCellRow { cell_key: string; alpha: number; beta: number }
interface PersonalCellRow { person_id: string; cell_key: string; alpha: number; beta: number }

/**
 * A minimal in-memory implementation of the two PCI tables.
 * Handles only the four SQL patterns LayeredPci actually issues.
 */
function makeDb() {
  const shared = new Map<string, SharedCellRow>();
  const personal = new Map<string, PersonalCellRow>();

  function personalKey(personId: string, cellKey: string) {
    return `${personId}|${cellKey}`;
  }

  return {
    async query<Row extends Record<string, unknown>>(
      sql: string,
      params?: readonly unknown[],
    ): Promise<{ rows: Row[]; rowCount: number }> {
      const s = sql.replace(/\s+/g, ' ').trim();

      // ── shared upsert (alpha or beta) ──────────────────────────────────────
      if (s.startsWith('INSERT INTO pci_shared_cell')) {
        const cellKey = params![0] as string;
        const col = s.includes('pci_shared_cell.alpha + 1') ? 'alpha' : 'beta';
        const existing = shared.get(cellKey);
        if (existing) {
          existing[col] += 1;
        } else {
          // Initial insert: the SQL inserts '2' for the incremented column.
          shared.set(cellKey, {
            cell_key: cellKey,
            alpha: col === 'alpha' ? 2 : 1,
            beta:  col === 'beta'  ? 2 : 1,
          });
        }
        return { rows: [], rowCount: 1 };
      }

      // ── personal upsert (alpha or beta) ────────────────────────────────────
      if (s.startsWith('INSERT INTO pci_personal_cell')) {
        const personId = params![0] as string;
        const cellKey  = params![1] as string;
        const col = s.includes('pci_personal_cell.alpha + 1') ? 'alpha' : 'beta';
        const pk = personalKey(personId, cellKey);
        const existing = personal.get(pk);
        if (existing) {
          existing[col] += 1;
        } else {
          personal.set(pk, {
            person_id: personId,
            cell_key: cellKey,
            alpha: col === 'alpha' ? 1 : 0,
            beta:  col === 'beta'  ? 1 : 0,
          });
        }
        return { rows: [], rowCount: 1 };
      }

      // ── shared SELECT by exact key ──────────────────────────────────────────
      if (s.startsWith('SELECT cell_key, alpha, beta FROM pci_shared_cell WHERE cell_key = $1')) {
        const cellKey = params![0] as string;
        const row = shared.get(cellKey);
        return { rows: (row ? [row] : []) as Row[], rowCount: row ? 1 : 0 };
      }

      // ── shared SELECT by LIKE prefix ───────────────────────────────────────
      if (s.startsWith('SELECT cell_key, alpha, beta FROM pci_shared_cell WHERE cell_key LIKE')) {
        const prefix = (params![0] as string).replace('%', '');
        const rows = [...shared.values()].filter((r) => r.cell_key.startsWith(prefix));
        return { rows: rows as Row[], rowCount: rows.length };
      }

      // ── personal SELECT by person + exact key ──────────────────────────────
      if (s.includes('FROM pci_personal_cell WHERE person_id = $1 AND cell_key = $2')) {
        const personId = params![0] as string;
        const cellKey  = params![1] as string;
        const row = personal.get(personalKey(personId, cellKey));
        return { rows: (row ? [row] : []) as Row[], rowCount: row ? 1 : 0 };
      }

      // ── personal SELECT by person + LIKE prefix ────────────────────────────
      if (s.includes('FROM pci_personal_cell WHERE person_id = $1 AND cell_key LIKE')) {
        const personId = params![0] as string;
        const prefix   = (params![1] as string).replace('%', '');
        const rows = [...personal.values()].filter(
          (r) => r.person_id === personId && r.cell_key.startsWith(prefix),
        );
        return { rows: rows as Row[], rowCount: rows.length };
      }

      throw new Error(`Unhandled SQL in fake db: ${s}`);
    },

    // Expose internals for assertion
    _shared: shared,
    _personal: personal,
  };
}

// ---------------------------------------------------------------------------
// Shared evidence fixtures
// ---------------------------------------------------------------------------

const successEvidence: ResolvedApplicationEvidence = {
  applicationId: 'app-1',
  personId: 'person-1',
  opportunityId: 'opp-1',
  representationId: 'rep-SWE',
  resolvedAt: '2026-01-01T00:00:00.000Z',
  progression: { reachedInterview: true, reachedOffer: false, terminal: true, terminalPolarity: 'negative' },
  signals: [
    { family: 'user_response', observation: 'Accepted framing unchanged', observedAt: '2026-01-01T00:00:00.000Z' },
    { family: 'world_response', observation: 'Called for screening', observedAt: '2026-01-02T00:00:00.000Z' },
  ],
};

const failureEvidence: ResolvedApplicationEvidence = {
  applicationId: 'app-2',
  personId: 'person-1',
  opportunityId: 'opp-2',
  representationId: 'rep-SWE',
  resolvedAt: '2026-01-03T00:00:00.000Z',
  progression: { reachedInterview: false, reachedOffer: false, terminal: true, terminalPolarity: 'negative' },
  signals: [
    { family: 'user_response', observation: 'Rewrote the opening line', observedAt: '2026-01-03T00:00:00.000Z' },
    { family: 'world_response', observation: 'No response after two weeks', observedAt: '2026-01-10T00:00:00.000Z' },
  ],
};

// ---------------------------------------------------------------------------
// Feature extraction
// ---------------------------------------------------------------------------

describe('extractSharedFeatures', () => {
  it('produces deterministic, identity-free features', () => {
    const features = extractSharedFeatures(successEvidence, 'world');
    expect(features.signalFamily).toBe('world');
    expect(features.representationTrack).toBe('rep-SWE');
    expect(features.roleDomain).toBe('unknown');
    // No personId, no applicationId, no free text
    expect(JSON.stringify(features)).not.toContain('person-1');
    expect(JSON.stringify(features)).not.toContain('app-1');
  });

  it('falls back to "untracked" when no representationId is present', () => {
    const noRep = { ...successEvidence, representationId: undefined };
    const features = extractSharedFeatures(noRep, 'world');
    expect(features.representationTrack).toBe('untracked');
  });

  it('produces different cell keys for world and user families', () => {
    const worldKey = toCellKey(extractSharedFeatures(successEvidence, 'world'));
    const userKey  = toCellKey(extractSharedFeatures(successEvidence, 'user'));
    expect(worldKey).not.toBe(userKey);
    expect(worldKey.startsWith('world:')).toBe(true);
    expect(userKey.startsWith('user:')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Core Beta-Bernoulli mechanics
// ---------------------------------------------------------------------------

describe('observe — Beta-Bernoulli updates', () => {
  it('increments alpha in the shared world cell on a successful application', async () => {
    const db = makeDb();
    const pci = new LayeredPci(db);

    await pci.observe(successEvidence);

    const worldKey = toCellKey(extractSharedFeatures(successEvidence, 'world'));
    const row = db._shared.get(worldKey)!;
    // Alpha should be 2 (Laplace start = 1, +1 for success = 2, but upsert starts at 2 on first insert)
    expect(row.alpha).toBe(2);
    expect(row.beta).toBe(1);
  });

  it('increments beta in the shared world cell on a failed application', async () => {
    const db = makeDb();
    const pci = new LayeredPci(db);

    await pci.observe(failureEvidence);

    const worldKey = toCellKey(extractSharedFeatures(failureEvidence, 'world'));
    const row = db._shared.get(worldKey)!;
    expect(row.alpha).toBe(1);
    expect(row.beta).toBe(2);
  });

  it('increments alpha in the personal world cell on a successful application', async () => {
    const db = makeDb();
    const pci = new LayeredPci(db);

    await pci.observe(successEvidence);

    const worldKey = toCellKey(extractSharedFeatures(successEvidence, 'world'));
    const row = db._personal.get(`person-1|${worldKey}`)!;
    expect(row.alpha).toBe(1);
    expect(row.beta).toBe(0);
  });

  it('correctly classifies user-response: edit = failure, no edit = success', async () => {
    const db = makeDb();
    const pci = new LayeredPci(db);

    // successEvidence has "Accepted framing unchanged" → no edit terms → success
    await pci.observe(successEvidence);
    const userKey = toCellKey(extractSharedFeatures(successEvidence, 'user'));
    // user_response is shared-only — the trial lands in pci_shared_cell, never pci_personal_cell.
    const successRow = db._shared.get(userKey)!;
    expect(successRow.alpha).toBe(2); // accepted (fresh-insert Laplace start: alpha=2, beta=1)
    expect(successRow.beta).toBe(1);

    // failureEvidence has "Rewrote the opening line" → edit term → failure
    const db2 = makeDb();
    const pci2 = new LayeredPci(db2);
    await pci2.observe(failureEvidence);
    const failRow = db2._shared.get(userKey)!;
    expect(failRow.alpha).toBe(1);
    expect(failRow.beta).toBe(2); // edited (fresh-insert Laplace start: alpha=1, beta=2)
  });

  it('does not create a personal cell for user_response — shared-only for now, not excluded forever (ADR 0041)', async () => {
    const db = makeDb();
    const pci = new LayeredPci(db);

    await pci.observe(successEvidence); // carries a user_response signal

    const userKey = toCellKey(extractSharedFeatures(successEvidence, 'user'));
    expect(db._personal.has(`person-1|${userKey}`)).toBe(false);
    // The shared cell exists — the trial happened, it just isn't attributed to this person yet.
    expect(db._shared.has(userKey)).toBe(true);
  });

  it('records no user_response trial at all when evidence carries no user_response signals', async () => {
    const db = makeDb();
    const pci = new LayeredPci(db);

    const noUserSignals: ResolvedApplicationEvidence = {
      ...successEvidence,
      signals: successEvidence.signals.filter((s) => s.family !== 'user_response'),
    };
    await pci.observe(noUserSignals);

    const userKey = toCellKey(extractSharedFeatures(successEvidence, 'user'));
    expect(db._shared.has(userKey)).toBe(false);
    // World trial still happens — it is unconditional.
    const worldKey = toCellKey(extractSharedFeatures(successEvidence, 'world'));
    expect(db._shared.has(worldKey)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

describe('idempotency', () => {
  it('observing the same applicationId twice changes nothing', async () => {
    const db = makeDb();
    const pci = new LayeredPci(db);

    await pci.observe(successEvidence);
    await pci.observe(successEvidence);

    const worldKey = toCellKey(extractSharedFeatures(successEvidence, 'world'));
    const shared = db._shared.get(worldKey)!;
    // Should still be the result of exactly one observation
    expect(shared.alpha).toBe(2);
    expect(shared.beta).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// The blend formula
// ---------------------------------------------------------------------------

describe('blend formula: α_blend = α_shared + α_personal', () => {
  it('with zero personal evidence, E[θ] equals the shared prior', async () => {
    // Seed shared layer only (person-2 has no personal history).
    const db = makeDb();
    const pciForPerson1 = new LayeredPci(db);
    // person-1 submits and reaches interview — this seeds the shared layer
    await pciForPerson1.observe(successEvidence);

    // person-2 reads the context-side prior — no personal applications yet
    const pci2 = new LayeredPci(db);
    const prior = await pci2.contextSidePrior({ personId: 'person-2', opportunityId: 'opp-X' });

    // With sharedSupport > 0 and no personal evidence, basis must be 'shared'
    expect(prior.basis).toBe('shared');
    expect(prior.supportingApplications).toBe(0);
    expect(prior.sharedSupport).toBeGreaterThan(0);
  });

  it('personal evidence moves E[θ] toward the personal outcomes', async () => {
    const db = makeDb();
    const pci = new LayeredPci(db);

    // Seed shared layer with 8 successes and 2 failures (via multiple persons)
    // We simulate this by directly populating the shared table
    const worldKey = toCellKey(extractSharedFeatures(successEvidence, 'world'));
    db._shared.set(worldKey, { cell_key: worldKey, alpha: 9, beta: 3 }); // 8+1 successes, 2+1 failures

    // person-1 has 5 failures out of 5 — below the shared mean
    for (let i = 0; i < 5; i++) {
      const ev: ResolvedApplicationEvidence = {
        ...failureEvidence,
        applicationId: `fail-${i}`,
      };
      await pci.observe(ev);
    }

    const prior = await pci.contextSidePrior({ personId: 'person-1', opportunityId: 'opp-X' });

    // observe() increments both layers on every call, so the shared cell moves too: starting
    // from alpha=9, beta=3, five failures push it to alpha=9, beta=8 (sharedMean drops from
    // 9/12=0.75 to 9/17≈0.529 on its own). The personal cell accumulates alpha=0, beta=5.
    // Blended: α=9+0=9, β=8+5=13 → E[θ] = 9/22 ≈ 0.409 — lower than the shared-alone figure,
    // because the personal layer's five failures count twice: once inside the shared cell's own
    // update, and again as the additive personal term on top of it.
    const observation = prior.observations[0];
    expect(observation).toBeDefined();
    const match = observation?.match(/prior (\d+\.\d+)/);
    const estimatedMean = match ? parseFloat(match[1]) : null;
    expect(estimatedMean).not.toBeNull();
    expect(estimatedMean!).toBeCloseTo(9 / 22, 2);
    expect(prior.basis).toBe('both');
  });

  it('with many personal observations, E[θ] is dominated by personal evidence', async () => {
    const db = makeDb();
    const pci = new LayeredPci(db);

    // Weak shared prior: α=2, β=2 (uniform)
    const worldKey = toCellKey(extractSharedFeatures(successEvidence, 'world'));
    db._shared.set(worldKey, { cell_key: worldKey, alpha: 2, beta: 2 });

    // person-1 has 50 successes — overwhelming personal signal
    for (let i = 0; i < 50; i++) {
      const ev: ResolvedApplicationEvidence = {
        ...successEvidence,
        applicationId: `win-${i}`,
      };
      await pci.observe(ev);
    }

    const prior = await pci.contextSidePrior({ personId: 'person-1', opportunityId: 'opp-X' });

    // α_blend = 2 + 50 = 52, β_blend = 2 + 0 = 2 → E[θ] = 52/54 ≈ 0.96
    const match = prior.observations[0]?.match(/prior (\d+\.\d+)/);
    const estimatedMean = match ? parseFloat(match[1]) : null;
    expect(estimatedMean).not.toBeNull();
    // Personal evidence (50 successes) clearly dominates the weak shared prior (2/2)
    expect(estimatedMean!).toBeGreaterThan(0.9);
    expect(prior.basis).toBe('both');
  });
});

// ---------------------------------------------------------------------------
// Routing prior
// ---------------------------------------------------------------------------

describe('routingPrior', () => {
  it('returns no weights when neither layer has data for a representation', async () => {
    const db = makeDb();
    const pci = new LayeredPci(db);

    const routing = await pci.routingPrior({
      personId: 'person-1',
      opportunityId: 'opp-1',
      representationIds: ['rep-unknown'],
    });

    expect(routing.weights.size).toBe(0);
  });

  it('returns a weight once shared or personal data exists for a representation', async () => {
    const db = makeDb();
    const pci = new LayeredPci(db);

    await pci.observe(successEvidence); // seeds rep-SWE

    const routing = await pci.routingPrior({
      personId: 'person-1',
      opportunityId: 'opp-1',
      representationIds: ['rep-SWE', 'rep-Markets'],
    });

    expect(routing.weights.has('rep-SWE')).toBe(true);
    expect(routing.weights.has('rep-Markets')).toBe(false);
  });

  it('weight is in (0, 1]', async () => {
    const db = makeDb();
    const pci = new LayeredPci(db);

    await pci.observe(successEvidence);

    const routing = await pci.routingPrior({
      personId: 'person-1',
      opportunityId: 'opp-1',
      representationIds: ['rep-SWE'],
    });

    const w = routing.weights.get('rep-SWE')!;
    expect(w).toBeGreaterThan(0);
    expect(w).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// basis and sharedSupport
// ---------------------------------------------------------------------------

describe('basis determination', () => {
  it('basis is "shared" when no personal evidence exists but shared does', async () => {
    const db = makeDb();
    // Seed shared directly
    const worldKey = 'world:rep-SWE:unknown';
    db._shared.set(worldKey, { cell_key: worldKey, alpha: 5, beta: 3 });

    const pci = new LayeredPci(db);
    const prior = await pci.contextSidePrior({ personId: 'person-1', opportunityId: 'opp-1' });
    expect(prior.basis).toBe('shared');
    expect(prior.supportingApplications).toBe(0);
    expect(prior.sharedSupport).toBeGreaterThan(0);
  });

  it('basis is "both" once personal evidence exists alongside shared', async () => {
    const db = makeDb();
    const worldKey = 'world:rep-SWE:unknown';
    db._shared.set(worldKey, { cell_key: worldKey, alpha: 5, beta: 3 });

    const pci = new LayeredPci(db);
    await pci.observe(successEvidence);

    const prior = await pci.contextSidePrior({ personId: 'person-1', opportunityId: 'opp-1' });
    expect(prior.basis).toBe('both');
    expect(prior.supportingApplications).toBeGreaterThan(0);
    expect(prior.sharedSupport).toBeGreaterThan(0);
  });

  it('basis is "personal" when a personal cell exists with no corresponding shared row', async () => {
    // observe() always updates both layers together, so this state cannot arise through the
    // normal path — it only arises if the shared cell is missing entirely (e.g. a migration
    // edge case, or a personal row surviving a shared-table reset). Seed the fake db directly
    // to exercise that boundary, since #blendedCells treats a missing shared row as the
    // Laplace-smoothed default (alpha=1, beta=1) and reports sharedSupport as 0 in that case.
    const db = makeDb();
    const worldKey = 'world:rep-SWE:unknown';
    db._personal.set(`person-1|${worldKey}`, { person_id: 'person-1', cell_key: worldKey, alpha: 3, beta: 0 });
    // Deliberately no db._shared.set(...) here.

    const pci = new LayeredPci(db);
    const prior = await pci.contextSidePrior({ personId: 'person-1', opportunityId: 'opp-1' });

    expect(prior.supportingApplications).toBeGreaterThan(0);
    expect(prior.sharedSupport).toBe(0);
    expect(prior.basis).toBe('personal');
  });

  it('personSidePrior currently reports basis "shared" because user_response has no personal term yet (ADR 0041)', async () => {
    const db = makeDb();
    const pci = new LayeredPci(db);

    // Even after many personal applications with user_response signals, there is no personal
    // user cell to blend yet — deferred, not excluded (see observe()'s doc comment). This
    // assertion documents today's behaviour; it is expected to change once the personal term
    // for user_response is turned on.
    for (let i = 0; i < 10; i++) {
      await pci.observe({ ...successEvidence, applicationId: `app-${i}` });
    }

    const person = await pci.personSidePrior('person-1');
    expect(person.supportingApplications).toBe(0);
    expect(person.sharedSupport).toBeGreaterThan(0);
    expect(person.basis).toBe('shared');
  });
});

// ---------------------------------------------------------------------------
// Graceful empty-database behaviour
// ---------------------------------------------------------------------------

describe('empty database behaviour', () => {
  it('returns empty priors with zero support when no cells exist', async () => {
    const db = makeDb();
    const pci = new LayeredPci(db);

    const person = await pci.personSidePrior('person-1');
    expect(person.observations).toHaveLength(0);
    expect(person.supportingApplications).toBe(0);
    expect(person.sharedSupport).toBe(0);
    expect(person.basis).toBe('shared'); // no evidence anywhere → shared (uninformative)

    const context = await pci.contextSidePrior({ personId: 'person-1', opportunityId: 'opp-1' });
    expect(context.observations).toHaveLength(0);

    const routing = await pci.routingPrior({
      personId: 'person-1',
      opportunityId: 'opp-1',
      representationIds: ['rep-1'],
    });
    expect(routing.weights.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Privacy
// ---------------------------------------------------------------------------

describe('privacy: shared layer stores no personId', () => {
  it('shared cell keys contain no personId after observations from multiple persons', async () => {
    const db = makeDb();
    const pci = new LayeredPci(db);

    await pci.observe(successEvidence); // person-1
    await pci.observe({ ...failureEvidence, personId: 'person-2', applicationId: 'app-p2' });

    for (const [key, row] of db._shared.entries()) {
      expect(key).not.toContain('person-1');
      expect(key).not.toContain('person-2');
      expect(JSON.stringify(row)).not.toContain('person-1');
      expect(JSON.stringify(row)).not.toContain('person-2');
    }
  });
});
