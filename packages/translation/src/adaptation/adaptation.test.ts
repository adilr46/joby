/**
 * Module 2 — Context Adaptation (UC06–UC08), as pure functions.
 *
 *   P_i(E_t) -> Assess -> Recover(E_t, C) [optional] -> A^C
 *
 * The two paths this file exists to hold apart:
 *
 *   baseline-only    P_i(E_t) + C -> A^C                        the normal case
 *   fallback         P_i(E_t) + C -> Recover(E_t, C) -> A^C     only where the lens is silent
 *
 * If recovery ever becomes the default, the lens the person maintains has been made decorative and
 * Adaptation is re-solving Durable Identity per opportunity. Several tests below exist purely to
 * fail if that happens.
 */

import { describe, expect, it } from 'vitest';

import type { PermanentIdentityView } from '@joby/identity';
import type { PositionedEntry } from '@joby/identity/representation';
import {
  assessRepresentation,
  composeElements,
  recoverEvidence,
  requiresCanonicalEvidence,
} from './adaptation';
import type { AdaptedState } from './adapted-state';
import { ProvisionalCvRoutingPolicy } from './cv-path';
import type { OpportunityContext } from './model';

const opportunity = (
  required: readonly string[],
  preferred: readonly string[] = [],
): OpportunityContext => ({
  opportunityId: 'opp-1',
  revision: 1,
  role: 'Markets Placement',
  company: 'A Bank',
  requiredCapabilities: required,
  preferredCapabilities: preferred,
  responsibilities: [],
  conditions: {},
  applicationQuestions: [],
  attribution: [],
  uncertainty: [],
});

const positioned = (
  nodeId: string,
  title: string,
  capabilities: readonly string[],
  extra: Partial<PositionedEntry> = {},
): PositionedEntry => ({
  nodeId,
  section: 'projects',
  title,
  canonicalTitle: title,
  capabilities,
  included: true,
  epistemicStatus: 'observed',
  visibility: 'private',
  ...extra,
});

const canonicalEntry = (nodeId: string, title: string, capabilities?: readonly string[]) => ({
  nodeId,
  title,
  epistemicStatus: 'observed' as const,
  visibility: 'private' as const,
  ...(capabilities ? { capabilities } : {}),
});

/**
 * A placement student's confirmed history. The lens exposes the first two; the pricer and the
 * teaching role are canonical but not currently positioned.
 */
const CANONICAL: PermanentIdentityView = {
  personId: 'person-1',
  revision: 9,
  education: [canonicalEntry('n-degree', 'BSc Computer Science')],
  experience: [canonicalEntry('n-role', 'Software Engineering Intern', ['TypeScript'])],
  projects: [
    canonicalEntry('n-solver', 'Rota scheduler', ['Python', 'Optimisation']),
    canonicalEntry('n-pricer', 'Options pricer', ['Derivatives', 'Statistics']),
    canonicalEntry('n-teaching', 'Peer tutoring', ['Teaching']),
  ],
  skills: [],
  achievements: [],
  evidence: [],
};

const BASELINE: readonly PositionedEntry[] = [
  positioned('n-solver', 'Rota scheduler', ['Python', 'Optimisation'], { priority: 0 }),
  positioned('n-role', 'Software Engineering Intern', ['TypeScript'], { section: 'experience' }),
];

describe('UC06 — assessing the representation against the context', () => {
  it('recognises evidence that already lands', () => {
    const assessment = assessRepresentation('rep-1', BASELINE, CANONICAL, opportunity(['Python']));

    const solver = assessment.baseline.find((item) => item.nodeId === 'n-solver')!;
    // Ranked by the lens *and* relevant here: nothing to change.
    expect(solver.verdict).toBe('well_represented');
    expect(solver.speaksTo).toEqual(['Python']);
  });

  it('suggests emphasis for relevant evidence the lens does not lead with', () => {
    const baseline = [positioned('n-solver', 'Rota scheduler', ['Python'])];
    const assessment = assessRepresentation('rep-1', baseline, CANONICAL, opportunity(['Python']));

    expect(assessment.baseline[0]!.verdict).toBe('emphasise');
    expect(assessment.baseline[0]!.summary).toMatch(/not currently prominent/);
  });

  it('suggests de-emphasis without calling anything irrelevant', () => {
    const assessment = assessRepresentation('rep-1', BASELINE, CANONICAL, opportunity(['Python']));

    const role = assessment.baseline.find((item) => item.nodeId === 'n-role')!;
    expect(role.verdict).toBe('de_emphasise');
    expect(role.speaksTo).toEqual([]);
    // The person put it in their lens. The summary says what this posting asks about, not that the
    // work does not matter.
    expect(role.summary).toMatch(/nothing this posting asks for is recorded against it/);
  });

  it('finds the gap when the lens is silent and the history is not', () => {
    const assessment = assessRepresentation(
      'rep-1',
      BASELINE,
      CANONICAL,
      opportunity(['Derivatives']),
    );

    expect(assessment.gaps).toHaveLength(1);
    expect(assessment.gaps[0]).toMatchObject({
      capability: 'Derivatives',
      required: true,
      recoverableNodeIds: ['n-pricer'],
    });
    expect(assessment.unevidenced).toEqual([]);
  });

  it('says so plainly when nothing in the person\'s history evidences an ask', () => {
    const assessment = assessRepresentation('rep-1', BASELINE, CANONICAL, opportunity(['Rust']));

    // No gap to close and nothing to recover: thin evidence is a real answer, and inventing
    // something to fill it is the failure the whole architecture exists to prevent.
    expect(assessment.gaps).toEqual([]);
    expect(assessment.unevidenced).toEqual(['Rust']);
  });

  it('produces no score, rank or verdict about the opportunity', () => {
    const assessment = assessRepresentation(
      'rep-1',
      BASELINE,
      CANONICAL,
      opportunity(['Python'], ['Derivatives']),
    );

    // Every judgement is about the *representation*. Whether the person suits the role is
    // Opportunity Evaluation, and it belongs to Opportunity (ADR 0029).
    const serialised = JSON.stringify(assessment).toLowerCase();
    expect(serialised).not.toMatch(/score|rank|fit|suitab|eligib|recommend/);
  });
});

describe('UC07 — recovering canonical evidence, selectively', () => {
  it('recovers only what closes a gap', () => {
    const assessment = assessRepresentation(
      'rep-1',
      BASELINE,
      CANONICAL,
      opportunity(['Derivatives']),
    );
    const recovered = recoverEvidence(assessment, CANONICAL, opportunity(['Derivatives']));

    expect(recovered.map((element) => element.nodeId)).toEqual(['n-pricer']);
    expect(recovered[0]).toMatchObject({
      origin: 'recovered',
      canonicalTitle: 'Options pricer',
      speaksTo: ['Derivatives'],
    });
    // Traceable to the fact and explainable to the person.
    expect(recovered[0]!.rationale).toMatch(/Recovered from your confirmed history/);
    expect(recovered[0]!.capabilities).toEqual(['Derivatives', 'Statistics']);
  });

  it('pulls in nothing when the lens already covers the opportunity', () => {
    const assessment = assessRepresentation('rep-1', BASELINE, CANONICAL, opportunity(['Python']));
    const recovered = recoverEvidence(assessment, CANONICAL, opportunity(['Python']));

    // **The normal path.** Durable Identity is the fallback reservoir, not the default surface — if
    // this ever returns evidence, Adaptation has started re-solving the identity per opportunity.
    expect(recovered).toEqual([]);
  });

  it('leaves irrelevant canonical evidence exactly where it is', () => {
    const assessment = assessRepresentation(
      'rep-1',
      BASELINE,
      CANONICAL,
      opportunity(['Derivatives']),
    );
    const recovered = recoverEvidence(assessment, CANONICAL, opportunity(['Derivatives']));

    // Peer tutoring and the degree are canonical, confirmed and entirely absent — the opportunity
    // does not ask about them, so recovery does not scoop them up on the way past.
    const ids = recovered.map((element) => element.nodeId);
    expect(ids).not.toContain('n-teaching');
    expect(ids).not.toContain('n-degree');
  });

  it('caps how much one gap may drag in', () => {
    const many: PermanentIdentityView = {
      ...CANONICAL,
      projects: [
        ...CANONICAL.projects,
        canonicalEntry('n-extra-1', 'Vol surface notebook', ['Derivatives']),
        canonicalEntry('n-extra-2', 'Options reading group', ['Derivatives']),
        canonicalEntry('n-extra-3', 'Greeks calculator', ['Derivatives']),
      ],
    };
    const context = opportunity(['Derivatives']);
    const recovered = recoverEvidence(
      assessRepresentation('rep-1', BASELINE, many, context),
      many,
      context,
    );

    // Selective, not exhaustive: closing a gap must not bury the positioning the person maintains.
    expect(recovered).toHaveLength(2);
  });
});

describe('UC09 — the CV representation path decision', () => {
  const adapted: AdaptedState = {
    contextId: 'ctx-1',
    personId: 'person-1',
    opportunityId: 'opp-1',
    representationId: 'rep-1',
    identityRevision: 9,
    opportunityRevision: 1,
    composedAt: '2026-08-16T00:00:00.000Z',
    elements: [
      {
        nodeId: 'node-1',
        section: 'projects',
        title: 'Rota scheduler',
        canonicalTitle: 'Rota scheduler',
        capabilities: ['Python'],
        origin: 'representation',
        emphasis: 'emphasised',
        speaksTo: ['Python'],
        rationale: 'From your positioning; speaks to Python.',
        visibility: 'public',
      },
    ],
    assessment: {
      representationId: 'rep-1',
      baseline: [
        {
          nodeId: 'node-1',
          verdict: 'well_represented',
          speaksTo: ['Python'],
          summary: 'Already leading.',
        },
      ],
      gaps: [],
      unevidenced: [],
    },
    recoveryUsed: false,
    opportunity: opportunity(['Python']),
    user: {
      personId: 'person-1',
      identityRevision: 9,
      conditions: {},
      otherConstraints: [],
      preferences: [],
      notes: {},
    },
  };

  it('reuses the selected representation when coverage and prominence are already good', () => {
    const decision = new ProvisionalCvRoutingPolicy().resolve(adapted);

    expect(decision.path).toBe('reuse');
    expect(decision.provisional).toBe(false);
    expect(decision.changes).toEqual([]);
    expect(decision.unsupported).toEqual([]);
  });

  it('adapts when confirmed evidence had to be recovered', () => {
    const policy = new ProvisionalCvRoutingPolicy();

    const recovered = policy.resolve({ ...adapted, recoveryUsed: true });
    expect(recovered.path).toBe('adapt');
    expect(recovered.changes).toContain('recover_confirmed_evidence');
  });

  it('adapts when relevant evidence is present but not prominent enough', () => {
    const decision = new ProvisionalCvRoutingPolicy().resolve({
      ...adapted,
      assessment: {
        representationId: 'rep-1',
        baseline: [
          {
            nodeId: 'node-1',
            verdict: 'emphasise',
            speaksTo: ['Python'],
            summary: 'Speaks to Python but is not prominent.',
          },
        ],
        gaps: [],
        unevidenced: [],
      },
    });

    expect(decision.path).toBe('adapt');
    expect(decision.changes).toContain('promote_relevant_evidence');
  });

  it('needs attention rather than rendering around unsupported requirements', () => {
    const decision = new ProvisionalCvRoutingPolicy().resolve({
      ...adapted,
      assessment: {
        representationId: 'rep-1',
        baseline: [],
        gaps: [],
        unevidenced: ['Rust'],
      },
    });

    expect(decision.path).toBe('needs_attention');
    expect(decision.unsupported).toEqual(['Rust']);
    expect(decision.reason).toMatch(/no confirmed Profile Unit supports Rust/);
  });
});

describe('UC08 — composing one Adapted State', () => {
  const context = opportunity(['Derivatives', 'Python']);
  const assessment = assessRepresentation('rep-1', BASELINE, CANONICAL, context);
  const recovered = recoverEvidence(assessment, CANONICAL, context);
  const elements = composeElements(BASELINE, assessment, recovered, context);

  it('leads with what speaks to this opportunity, representation first', () => {
    // Both speak to one ask each, so the lens's own material stays ahead of the fallback.
    expect(elements.map((element) => element.nodeId)).toEqual(['n-solver', 'n-pricer', 'n-role']);
    expect(elements[0]!.origin).toBe('representation');
    expect(elements[1]!.origin).toBe('recovered');
  });

  it('keeps every element traceable to a confirmed fact', () => {
    const canonicalIds = new Set([
      'n-degree',
      'n-role',
      'n-solver',
      'n-pricer',
      'n-teaching',
    ]);
    for (const element of elements) {
      expect(canonicalIds.has(element.nodeId), `${element.title} has no canonical node`).toBe(true);
      expect(element.canonicalTitle.length).toBeGreaterThan(0);
    }
  });

  it('carries the lens\'s framing while keeping the canonical fact visible', () => {
    const framed = composeElements(
      [
        positioned('n-solver', 'Constraint solving under uncertainty', ['Python'], {
          framing: 'Constraint solving under uncertainty',
          canonicalTitle: 'Rota scheduler',
        }),
      ],
      assessment,
      [],
      context,
    );

    expect(framed[0]!.title).toBe('Constraint solving under uncertainty');
    // Reinterpretation is allowed; replacing the fact is not.
    expect(framed[0]!.canonicalTitle).toBe('Rota scheduler');
  });

  it('drops nothing the person positioned, even when this posting ignores it', () => {
    const role = elements.find((element) => element.nodeId === 'n-role')!;
    // De-emphasis is a suggestion about ordering, not a deletion: the lens is the person's, and one
    // posting does not get to remove things from it.
    expect(role).toBeDefined();
    expect(role.rationale).toMatch(/This posting does not ask about it/);
  });

  it('invents nothing — every capability claim comes from the canonical record', () => {
    for (const element of elements) {
      for (const claim of element.speaksTo) {
        expect(
          element.capabilities.map((capability) => capability.toLowerCase()),
          `${element.title} claims ${claim} without recording it`,
        ).toContain(claim.toLowerCase());
      }
    }
  });

  it('composes a baseline-only state when the lens already covers the opportunity', () => {
    const covered = opportunity(['Python']);
    const coveredAssessment = assessRepresentation('rep-1', BASELINE, CANONICAL, covered);
    const coveredRecovered = recoverEvidence(coveredAssessment, CANONICAL, covered);
    const composed = composeElements(BASELINE, coveredAssessment, coveredRecovered, covered);

    expect(coveredRecovered).toEqual([]);
    expect(composed.every((element) => element.origin === 'representation')).toBe(true);
    expect(composed.map((element) => element.nodeId)).toEqual(['n-solver', 'n-role']);
  });
});

describe('when the canonical reservoir is actually required', () => {
  const lensShowing = (...capabilities: readonly string[]) => [
    positioned('n1', 'A project', capabilities),
  ];

  it('is not required when the lens already speaks to everything asked', () => {
    // Durable Identity remains the authority over canonical truth. That does not mean every
    // adaptation must load the whole person: here the reservoir would be fetched and never read.
    expect(requiresCanonicalEvidence(lensShowing('Python'), opportunity(['Python']))).toBe(false);
  });

  it('is required the moment the posting asks about something the lens does not show', () => {
    // `HiddenInRepresentation != UnavailableToAdaptation`. Skipping the reservoir here would report
    // evidence as absent that the person actually has — the one thing this module must never do.
    expect(requiresCanonicalEvidence(lensShowing('Python'), opportunity(['Python', 'Rust']))).toBe(true);
  });

  it('is required for a preferred capability too, not only a hard requirement', () => {
    expect(requiresCanonicalEvidence(lensShowing('Python'), opportunity(['Python'], ['Rust']))).toBe(true);
  });

  it('is required when the person keeps no lens at all', () => {
    expect(requiresCanonicalEvidence([], opportunity(['Python']))).toBe(true);
  });

  it('is not required when the posting asks for nothing', () => {
    expect(requiresCanonicalEvidence([], opportunity([]))).toBe(false);
  });

  it('assesses and recovers nothing when the reservoir was deliberately not retrieved', () => {
    // Passing `undefined` is only correct where nothing is uncovered, which is exactly when the gap
    // loop never runs. The assessment of what the lens *does* expose is unaffected.
    const assessment = assessRepresentation(
      'rep-1',
      lensShowing('Python'),
      undefined,
      opportunity(['Python']),
    );

    expect(assessment.gaps).toEqual([]);
    expect(assessment.unevidenced).toEqual([]);
    expect(assessment.baseline).toHaveLength(1);
    expect(recoverEvidence(assessment, undefined, opportunity(['Python']))).toEqual([]);
  });
});
