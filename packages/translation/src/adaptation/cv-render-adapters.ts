/**
 * Dumb renderer adapters for contextual CV plans.
 *
 * These are intentionally mechanical. Adaptation has already selected, ordered and grounded the
 * evidence; adapters only reshape the plan for a renderer.
 */

import type { CvRenderPlan } from './cv-render-plan';
import type { LatexTexPatchManifest, LatexTexSlot } from './latex-tex';

export interface HtmlPdfCvPayload {
  readonly summary: string;
  readonly competencies: readonly string[];
  readonly experience: readonly HtmlPdfCvEntry[];
  readonly projects: readonly HtmlPdfCvEntry[];
  readonly education: readonly HtmlPdfCvEntry[];
  readonly awards: readonly HtmlPdfCvEntry[];
  readonly skills: readonly { readonly category: string; readonly items: readonly string[] }[];
}

export interface HtmlPdfCvEntry {
  readonly name: string;
  readonly description: string;
  readonly groundingProfileUnitId: string;
}

export interface LatexCvPayload {
  readonly experience: readonly LatexCvEntry[];
  readonly projects: readonly LatexCvEntry[];
  readonly education: readonly LatexCvEntry[];
  readonly awards: readonly LatexCvEntry[];
  readonly skills: readonly { readonly category: string; readonly items: string }[];
}

export interface LatexCvEntry {
  readonly name: string;
  readonly bullets: readonly string[];
  readonly groundingProfileUnitId: string;
}

export function toHtmlPdfPayload(plan: CvRenderPlan): HtmlPdfCvPayload {
  return {
    summary: summaryFor(plan),
    competencies: plan.keywords,
    experience: entriesFor(plan, 'experience'),
    projects: entriesFor(plan, 'projects'),
    education: entriesFor(plan, 'education'),
    awards: entriesFor(plan, 'achievements'),
    skills: plan.keywords.length > 0 ? [{ category: 'Relevant Capabilities', items: plan.keywords }] : [],
  };
}

export function toGeneratedLatexPayload(plan: CvRenderPlan): LatexCvPayload {
  const toLatex = (section: CvRenderPlan['entries'][number]['section']): readonly LatexCvEntry[] =>
    plan.entries
      .filter((entry) => entry.section === section)
      .map((entry) => ({
        name: entry.title,
        bullets: [entry.detail ?? entry.title],
        groundingProfileUnitId: entry.grounding.profileUnitId,
      }));

  return {
    experience: toLatex('experience'),
    projects: toLatex('projects'),
    education: toLatex('education'),
    awards: toLatex('achievements'),
    skills: plan.keywords.length > 0
      ? [{ category: 'Relevant Capabilities', items: plan.keywords.join(', ') }]
      : [],
  };
}

export function toLatexTexPatchManifest(input: {
  readonly plan: CvRenderPlan;
  readonly slots: readonly LatexTexSlot[];
}): LatexTexPatchManifest {
  const bulletSlots = input.slots.filter((slot) => slot.kind === 'bullet');
  const patches = input.plan.entries.slice(0, bulletSlots.length).map((entry, index) => ({
    id: bulletSlots[index]!.id,
    text: entry.detail ?? entry.title,
  }));

  return { slots: input.slots, patches };
}

function entriesFor(plan: CvRenderPlan, section: CvRenderPlan['entries'][number]['section']): readonly HtmlPdfCvEntry[] {
  return plan.entries
    .filter((entry) => entry.section === section)
    .map((entry) => ({
      name: entry.title,
      description: entry.detail ?? entry.title,
      groundingProfileUnitId: entry.grounding.profileUnitId,
    }));
}

function summaryFor(plan: CvRenderPlan): string {
  const role = plan.keywords.length > 0 ? ` for ${plan.keywords.slice(0, 3).join(', ')}` : '';
  return `Contextual CV plan${role}.`;
}
