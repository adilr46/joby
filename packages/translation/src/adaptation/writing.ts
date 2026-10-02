/**
 * Module 3 — written representation (UC10, UC11).
 *
 *   AdaptedState + SurfaceContext + References + ApplicationInput  ->  RepresentationDraft
 *
 * > **The user owns meaning and intent. Joby owns translation.**
 *
 * Three boundaries live here, and two of them are deliberately provisional (ADR 0022):
 *
 *   SatisfactionGate(...)         readiness — replaceable, provisional
 *   ResolveReferenceConflict(...) which references speak — replaceable, provisional
 *   RepresentationWriter          the provider — deterministic in tests, a model in production
 *
 * The failure this file is built to prevent is not bad prose. It is **fabricated meaning**: a
 * generator holding true facts, a question asking "why do you want to work here?", no information
 * about why this person wants to work there, and a plausible sentence anyway. Nothing factual is
 * violated; the person is simply given a motivation they do not have, in their own voice, and finds
 * out in an interview.
 */

import type { RepresentationReference } from '@joby/identity/representation';
import type { AdaptedState } from './adapted-state';

/** The surfaces this slice renders. Recruiter messages and interview narratives are later. */
export type RepresentationSurface = 'application_answer' | 'cover_letter';

/** What the posting asks for in form. Absent means unconstrained, not "no limit intended". */
export interface SurfaceConstraints {
  readonly wordLimit?: number;
  readonly characterLimit?: number;
  /** The posting's own words for the shape it wants, e.g. `STAR`, `bullet points`. */
  readonly format?: string;
  /** The competency or topic the question is about, when the posting names one. */
  readonly competency?: string;
  /** True when the question demands a specific example rather than a general statement. */
  readonly requiresExample?: boolean;
}

/**
 * Meaning only the person can supply.
 *
 * **Not professional facts.** A new claim about what someone did goes through Identity, confirmed —
 * eliciting it here would let an unconfirmed claim into an application under their name.
 */
export type ApplicationInputKind = 'motivation' | 'timing' | 'disclosure' | 'context';

export interface ApplicationInput {
  readonly kind: ApplicationInputKind;
  readonly prompt: string;
  readonly answer: string;
  readonly providedAt: string;
  readonly providedBy: string;
}

/** One thing Joby needs and cannot infer, phrased as the question it will ask. */
export interface InputRequest {
  readonly kind: ApplicationInputKind;
  readonly prompt: string;
  readonly why: string;
}

/**
 * Whether there is enough to write without inventing.
 *
 * Two distinct kinds of missing, and conflating them would be a serious error:
 *
 *  - `missing` — **meaning** only the person has. Joby asks.
 *  - `unsupported` — **professional claims** the surface wants and no confirmed fact backs. Joby
 *    does **not** ask for these; being told something in a chat box is not confirmation, and using
 *    it would put an unverified claim in an application. It says so instead, and points at Identity.
 */
export interface ReadinessAssessment {
  readonly ready: boolean;
  readonly missing: readonly InputRequest[];
  readonly unsupported: readonly string[];
  readonly provisional: boolean;
  readonly reason: string;
}

/**
 * `SatisfactionGate(...)` — **PLACEHOLDER**.
 *
 * The algorithm is an open product decision (ADR 0022). What is decided is the invariant it serves:
 *
 * > Generation must not fabricate meaningful user intent, motivation, disclosure or unsupported
 * > claims merely to satisfy the writing request.
 *
 * The provisional implementation below asks for what is structurally underivable and nothing more.
 * It carries no thresholds, no confidence values and no completeness score, and it does not cap the
 * number of questions — a caller may answer, reassess, and be asked again.
 */
export interface SatisfactionGate {
  assess(input: {
    readonly surface: RepresentationSurface;
    readonly adapted: AdaptedState;
    readonly question?: string;
    readonly constraints: SurfaceConstraints;
    readonly provided: readonly ApplicationInput[];
  }): ReadinessAssessment;
}

const MOTIVATION_QUESTION = /\b(why|motivat|interest|attract|excit|drawn)\b/i;
const DISCLOSURE_QUESTION = /\b(disabilit|adjustment|visa|sponsor|right to work|health|ethnic)\b/i;

/**
 * The provisional gate.
 *
 * It asks for exactly the things that **cannot be derived from professional truth**:
 *
 *  - a cover letter's *why this opportunity* and *why now* — fit is not motivation, and a role
 *    suiting someone is not evidence that they want it;
 *  - a question that asks why, or asks for a disclosure.
 *
 * It reports as `unsupported` any competency the surface requires that no element of the Adapted
 * State speaks to. That is the honest answer, and it is the one place a generator would otherwise
 * be tempted to invent.
 */
export class ProvisionalSatisfactionGate implements SatisfactionGate {
  assess(input: {
    surface: RepresentationSurface;
    adapted: AdaptedState;
    question?: string;
    constraints: SurfaceConstraints;
    provided: readonly ApplicationInput[];
  }): ReadinessAssessment {
    const held = new Set(input.provided.map((given) => given.kind));
    const missing: InputRequest[] = [];

    const need = (kind: ApplicationInputKind, prompt: string, why: string): void => {
      if (!held.has(kind)) missing.push({ kind, prompt, why });
    };

    if (input.surface === 'cover_letter') {
      // Opportunity Intelligence may not know the role or company: evidence that never stated one is a
      // real case (ADR 0028). Ask the plain question rather than a question with a hole in it.
      const named = [input.adapted.opportunity.role, input.adapted.opportunity.company]
        .filter((value): value is string => Boolean(value))
        .join(' at ');
      // Neither is derivable from Adapted State, and writing them anyway is the failure mode.
      need(
        'motivation',
        named ? `Why do you want this ${named} role in particular?` : 'Why do you want this role in particular?',
        'A cover letter has to say why this opportunity. That a role suits you is not evidence that you want it, and Joby will not write enthusiasm you have not expressed.',
      );
      need(
        'timing',
        'Why does this opportunity make sense for you now?',
        'Why now is about where you are, which Joby cannot read from your confirmed history.',
      );
    }

    if (input.question && MOTIVATION_QUESTION.test(input.question)) {
      need(
        'motivation',
        `In your own words: ${input.question}`,
        'This question asks what you want or why, and only you know that.',
      );
    }

    if (input.question && DISCLOSURE_QUESTION.test(input.question)) {
      need(
        'disclosure',
        `How would you like to answer: ${input.question}`,
        'This asks about something personal. It is never inferred, never defaulted and never pre-filled.',
      );
    }

    // A competency the surface demands that no confirmed fact speaks to. Reported, never asked for:
    // being told something in a chat box is not confirmation, and it would enter an application as
    // an unverified claim under the person's name.
    const unsupported: string[] = [];
    const competency = input.constraints.competency;
    if (competency) {
      const spoken = input.adapted.elements.some((element) =>
        element.speaksTo.some(
          (claim) => claim.trim().toLowerCase() === competency.trim().toLowerCase(),
        ),
      );
      if (!spoken) unsupported.push(competency);
    }
    if (input.constraints.requiresExample && input.adapted.elements.length === 0) {
      unsupported.push('a specific example');
    }

    const ready = missing.length === 0;
    return {
      ready,
      missing,
      unsupported,
      provisional: true,
      reason: ready
        ? 'Provisional: everything Joby cannot infer has been supplied.'
        : `Provisional: ${missing.length} thing${missing.length === 1 ? '' : 's'} only you can tell Joby.`,
    };
  }
}

/**
 * `ResolveReferenceConflict(...)` — **PLACEHOLDER**.
 *
 * Two references may pull different ways: a formal letter and a conversational sample, or a voice
 * that contradicts the framing the person chose in their lens. **No implementation may silently
 * resolve that** in a way that overrides factual grounding or current user agency (ADR 0021).
 *
 * The provisional selector below establishes **no precedence**. It takes the most recent few and
 * surfaces the fact that more exist, so a person can see that a choice is being made without one
 * having been decided for them.
 */
export interface ReferenceSelectionPolicy {
  select(references: readonly RepresentationReference[], surface: RepresentationSurface): {
    readonly selected: readonly RepresentationReference[];
    readonly provisional: boolean;
    readonly note: string;
  };
}

const MAX_REFERENCES = 3;

export class ProvisionalReferenceSelection implements ReferenceSelectionPolicy {
  select(references: readonly RepresentationReference[], surface: RepresentationSurface) {
    // A same-surface reference is the closest thing to what is being written, so it goes first.
    // That is an ordering, not a precedence rule: nothing here decides that one reference *wins*.
    const sameSurface = surface === 'cover_letter' ? 'cover_letter' : 'application_answer';
    const ordered = [...references].sort((left, right) => {
      const leftMatch = left.kind === sameSurface ? 0 : 1;
      const rightMatch = right.kind === sameSurface ? 0 : 1;
      return leftMatch - rightMatch;
    });

    const selected = ordered.slice(0, MAX_REFERENCES);
    return {
      selected,
      provisional: true,
      note:
        references.length > selected.length
          ? `Provisional: using ${selected.length} of ${references.length} references, most relevant surface first. How conflicting references should be resolved is an open decision.`
          : 'Provisional: using all available references. How conflicting references should be resolved is an open decision.',
    };
  }
}

// --- The writer provider ------------------------------------------------------------------------

/**
 * One piece of generated text, with what it stands on.
 *
 * Segmented rather than prose so **grounding survives storage and can be re-checked**. A paragraph
 * claiming professional fact must cite the canonical node behind it; a paragraph expressing
 * motivation must cite the input the person gave. Anything citing nothing is style — a greeting, a
 * connective — and may assert nothing.
 */
export interface DraftSegment {
  readonly text: string;
  /** Canonical node ids this text makes claims from. */
  readonly groundedInNodeIds: readonly string[];
  /** Application-input kinds this text draws meaning from. */
  readonly groundedInInput: readonly ApplicationInputKind[];
}

export interface WriteRequest {
  readonly surface: RepresentationSurface;
  readonly adapted: AdaptedState;
  readonly question?: string;
  readonly constraints: SurfaceConstraints;
  readonly references: readonly RepresentationReference[];
  readonly provided: readonly ApplicationInput[];
}

export interface WriteResult {
  readonly segments: readonly DraftSegment[];
  readonly model: string;
}

/**
 * Provider-neutral, like extraction (ADR-free, plan `002`): the domain depends on this interface and
 * never on a vendor SDK, and every test runs without a network.
 */
export interface RepresentationWriter {
  /** Stable identifier stored on the draft, e.g. `deterministic` or `openai`. */
  readonly name: string;
  write(request: WriteRequest): Promise<WriteResult>;
}

export class WritingError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'WritingError';
  }
}
