/**
 * The CV document (UC09).
 *
 *   Identity Representation -> CVDocument -> LaTeX -> PDF
 *
 * `CvDocument` is **the** schema for a rendered representation. LaTeX is a renderer downstream of
 * it, never the domain model: swapping the template, or adding a second output format later, must
 * not require a second idea of what a CV is.
 *
 * Two properties hold by construction:
 *
 *  - **Every factual entry carries the canonical node behind it.** A document cannot contain a line
 *    no confirmed fact stands behind, because entries are built from the positioned projection and
 *    nothing else.
 *  - **It is general, not opportunity-specific.** Nothing here takes an opportunity, JD or company.
 *    A CV tailored to a posting is Adapted State, and it is Adaptation's to produce.
 *
 * Nothing is stored. A document is derived on request from current Explicit State plus the lens, so
 * a correction reaches every future render with nothing to invalidate.
 */

import type { PermanentIdentityView } from '@joby/identity';
import type {
  IdentityRepresentation,
  PositionedEntry,
  RepresentationEmphasis,
  RepresentationGrounding,
  RepresentationPositioning,
  SourceVisibilityOfEntry,
} from './model';

/**
 * Presentation input supplied by the caller at render time.
 *
 * **Joby holds no name for the person.** The Person is created from a professional source and an
 * Account Claim is authentication that never enters the ontology (ADR 0010), so a name, email or
 * phone number is not person-state and must not be invented from one. It arrives here, is printed,
 * and is not stored.
 */
export interface CvHeader {
  readonly fullName?: string;
  /** A one-line positioning statement. Defaults to the lens's purpose when there is one. */
  readonly headline?: string;
  /** Free-form contact lines. Presentation input, never Explicit State. */
  readonly contact?: readonly string[];
}

export interface CvEntry {
  /** The canonical fact behind this line. Absent only for aggregates like skills. */
  readonly nodeId?: string;
  /** What the lens says — its framing where one is set, the canonical label otherwise. */
  readonly title: string;
  /** What Explicit State records. Present whenever framing changed the title. */
  readonly canonicalTitle?: string;
  readonly detail?: string;
  readonly startedAt?: string;
  readonly endedAt?: string;
  readonly emphasis?: RepresentationEmphasis;
  /** Carried through so a disclosure surface can warn before this leaves the person's hands. */
  readonly visibility?: SourceVisibilityOfEntry;
}

export interface CvSection {
  readonly kind: 'experience' | 'projects' | 'education' | 'achievements' | 'skills';
  readonly title: string;
  readonly entries: readonly CvEntry[];
}

export interface CvDocument {
  readonly representationId: string;
  /** The lens this is a CV *of*. A general Markets CV, not a CV for one Markets job. */
  readonly representationName: string;
  readonly header: CvHeader;
  /** The lens's positioning themes, rendered as its leading line. Choices, never claims. */
  readonly themes: readonly string[];
  readonly sections: readonly CvSection[];
  /** Which identity, at which canonical revision, rendered when. */
  readonly grounding: RepresentationGrounding;
}

const SECTION_TITLES: Record<CvSection['kind'], string> = {
  experience: 'Experience',
  projects: 'Projects',
  education: 'Education',
  achievements: 'Achievements',
  skills: 'Skills',
};

function toEntry(positioned: PositionedEntry): CvEntry {
  // An activity's label and its contribution are frequently the same sentence, and printing it
  // twice reads as a mistake in a document someone is about to send.
  const detail =
    positioned.detail && positioned.detail !== positioned.title && positioned.detail !== positioned.canonicalTitle
      ? positioned.detail
      : undefined;

  return {
    nodeId: positioned.nodeId,
    title: positioned.title,
    visibility: positioned.visibility,
    // Only when the lens actually reworded it: a canonical title repeated identically would be
    // noise, and its absence here means "the lens changed nothing about how this is said".
    ...(positioned.framing ? { canonicalTitle: positioned.canonicalTitle } : {}),
    ...(detail ? { detail } : {}),
    ...(positioned.startedAt ? { startedAt: positioned.startedAt } : {}),
    ...(positioned.endedAt ? { endedAt: positioned.endedAt } : {}),
    ...(positioned.emphasis ? { emphasis: positioned.emphasis } : {}),
  };
}

export interface BuildCvDocumentInput {
  readonly representation: IdentityRepresentation;
  readonly grounding: RepresentationGrounding;
  readonly positioning: RepresentationPositioning;
  readonly projection: PermanentIdentityView;
  readonly header?: CvHeader;
}

/**
 * Build the document for one lens.
 *
 * Hidden evidence is omitted — that is what UC05 is for, and the lens's own read model still shows
 * what was set aside. Ordering is the lens's ordering, already applied by `positionProjection`.
 */
export function buildCvDocument(input: BuildCvDocumentInput): CvDocument {
  const { representation, positioning, projection } = input;

  const included = positioning.evidence.filter((entry) => entry.included);

  const sections: CvSection[] = (['experience', 'projects', 'education', 'achievements'] as const)
    .map((kind) => ({
      kind,
      title: SECTION_TITLES[kind],
      entries: included.filter((entry) => entry.section === kind).map(toEntry),
    }))
    .filter((section) => section.entries.length > 0);

  // Skills are capability components aggregated across activities (ADR 0009): there is no single
  // canonical node behind one, so there is nothing for a positioning decision to be about, and they
  // are rendered as Explicit State aggregates them. Lens-level skill positioning is a later
  // decision, not something to approximate here by matching labels.
  if (projection.skills.length > 0) {
    sections.push({
      kind: 'skills',
      title: SECTION_TITLES.skills,
      entries: projection.skills.map((skill) => ({
        title: skill.capability,
        detail: skill.evidencedBy.join(', '),
        visibility: skill.visibility,
      })),
    });
  }

  const header: CvHeader = {
    ...input.header,
    ...(input.header?.headline || !representation.purpose
      ? {}
      : { headline: representation.purpose }),
  };

  return {
    representationId: representation.id,
    representationName: representation.name,
    header,
    themes: positioning.themes.map((theme) => theme.label),
    sections,
    grounding: input.grounding,
  };
}
