/**
 * Renderer-neutral contextual CV plan.
 *
 * Rendering adapters consume this shape; they do not decide which evidence belongs in the CV.
 * Every professional entry traces back to an Adapted State element, which traces back to a
 * confirmed Profile Unit / canonical node.
 */

import type { AdaptedElement, AdaptedState } from './adapted-state';
import type { CvPathDecision } from './cv-path';

export type CvRenderSurface = 'html_pdf' | 'generated_latex' | 'latex_tex';

export interface CvRenderPlanEntry {
  readonly nodeId: string;
  readonly section: AdaptedElement['section'];
  readonly title: string;
  readonly detail?: string;
  readonly capabilities: readonly string[];
  readonly speaksTo: readonly string[];
  readonly origin: AdaptedElement['origin'];
  readonly grounding: {
    readonly profileUnitId: string;
    readonly visibility: AdaptedElement['visibility'];
  };
}

export interface CvRenderPlan {
  readonly contextId: string;
  readonly personId: string;
  readonly opportunityId: string;
  readonly representationId?: string;
  readonly identityRevision: number;
  readonly opportunityRevision: number;
  readonly surface: CvRenderSurface;
  readonly path: CvPathDecision['path'];
  readonly unsupported: readonly string[];
  readonly keywords: readonly string[];
  readonly entries: readonly CvRenderPlanEntry[];
}

export class CvRenderPlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CvRenderPlanError';
  }
}

export function buildCvRenderPlan(input: {
  readonly adapted: AdaptedState;
  readonly decision: CvPathDecision;
  readonly surface: CvRenderSurface;
}): CvRenderPlan {
  if (input.decision.path === 'needs_attention') {
    throw new CvRenderPlanError(
      `Cannot build a CV render plan while unsupported requirements remain: ${input.decision.unsupported.join(', ')}`,
    );
  }

  return {
    contextId: input.adapted.contextId,
    personId: input.adapted.personId,
    opportunityId: input.adapted.opportunityId,
    ...(input.adapted.representationId ? { representationId: input.adapted.representationId } : {}),
    identityRevision: input.adapted.identityRevision,
    opportunityRevision: input.adapted.opportunityRevision,
    surface: input.surface,
    path: input.decision.path,
    unsupported: input.decision.unsupported,
    keywords: renderKeywords(input.adapted),
    entries: input.adapted.elements.map(toPlanEntry),
  };
}

function toPlanEntry(element: AdaptedElement): CvRenderPlanEntry {
  return {
    nodeId: element.nodeId,
    section: element.section,
    title: element.title,
    ...(element.detail ? { detail: element.detail } : {}),
    capabilities: element.capabilities,
    speaksTo: element.speaksTo,
    origin: element.origin,
    grounding: {
      profileUnitId: element.nodeId,
      visibility: element.visibility,
    },
  };
}

function renderKeywords(adapted: AdaptedState): readonly string[] {
  const seen = new Set<string>();
  const keywords: string[] = [];
  for (const value of [
    ...adapted.opportunity.requiredCapabilities,
    ...adapted.opportunity.preferredCapabilities,
    ...adapted.elements.flatMap((element) => element.speaksTo),
  ]) {
    const key = value.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    keywords.push(value);
  }
  return keywords;
}
