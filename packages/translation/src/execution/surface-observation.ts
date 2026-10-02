/**
 * The **Execution Surface**: a compact, generic representation of one application page.
 *
 * `PageObservation` is what a browser adapter hands in — every interactive control and meaningful
 * block of text it found, in whatever order it found them. Nothing here is specific to any ATS or
 * portal vendor: an element is described by its shape (`kind`, `label`, `options`, `required`), never
 * by which product produced the page. `buildExecutionSurface` is a pure function from one arbitrary
 * observation to a compact surface — the same function runs whether the page came from a static form
 * or a single-page app, and it must never branch on the page's `url` or `title`.
 *
 * Compaction exists because the surface is what gets sent to Claude alongside session context, and
 * the acceptance bar is "compact" — a raw DOM dump is neither compact nor more informative for this
 * purpose than the fields already captured.
 */

export const SURFACE_ELEMENT_KINDS = [
  'text_input',
  'textarea',
  'select',
  'checkbox',
  'radio',
  'file_upload',
  'button',
  'link',
  'static_text',
] as const;

export type SurfaceElementKind = (typeof SURFACE_ELEMENT_KINDS)[number];

/**
 * One control or block of text as a browser adapter observed it.
 *
 * `id` is whatever stable reference the adapter can produce for this element (a selector, an
 * accessibility-tree id) — Execution never invents one and never uses it to act on the page; it is
 * purely a grounding anchor so a later requirement can point back at exactly this element.
 */
export interface PageObservationElement {
  readonly id: string;
  readonly kind: SurfaceElementKind;
  readonly label?: string;
  readonly name?: string;
  readonly value?: string;
  readonly options?: readonly string[];
  readonly required?: boolean;
  readonly text?: string;
}

export interface PageObservation {
  readonly url: string;
  readonly title?: string;
  readonly elements: readonly PageObservationElement[];
}

/** The compacted form of one element, after truncation. Same shape, deliberately — no new kind of loss. */
export interface ExecutionSurfaceElement {
  readonly id: string;
  readonly kind: SurfaceElementKind;
  readonly label?: string;
  readonly name?: string;
  readonly value?: string;
  readonly options?: readonly string[];
  readonly required?: boolean;
  readonly text?: string;
}

export interface ExecutionSurface {
  readonly url: string;
  readonly title?: string;
  readonly elements: readonly ExecutionSurfaceElement[];
}

const MAX_ELEMENTS = 80;
const MAX_TEXT_LENGTH = 300;
const MAX_OPTIONS = 30;

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

/**
 * Extract usable controls and text from a raw page observation.
 *
 * Deliberately generic: it filters, deduplicates and truncates by element *shape* only — an element
 * with no id or an empty label carries nothing groundable and is dropped; a duplicate id keeps its
 * first occurrence; long text is truncated, never summarised (summarising here would be a second,
 * unaudited interpretation step ahead of the one Claude is asked to make). No branch here reads
 * `observation.url` or `observation.title` to change how an element is treated — that is exactly the
 * ATS-specific branching this slice must not contain.
 */
export function buildExecutionSurface(observation: PageObservation): ExecutionSurface {
  const seen = new Set<string>();
  const elements: ExecutionSurfaceElement[] = [];

  for (const element of observation.elements) {
    if (elements.length >= MAX_ELEMENTS) break;
    if (!element.id || seen.has(element.id)) continue;

    const label = element.label?.trim();
    const text = element.text?.trim();
    // Nothing to ground a requirement against: no label, no text, no name. Static noise like a
    // decorative element with an id but no content would otherwise pad every request.
    if (!label && !text && !element.name) continue;

    seen.add(element.id);
    elements.push({
      id: element.id,
      kind: element.kind,
      ...(label ? { label: truncate(label, MAX_TEXT_LENGTH) } : {}),
      ...(element.name ? { name: element.name } : {}),
      ...(element.value !== undefined ? { value: truncate(element.value, MAX_TEXT_LENGTH) } : {}),
      ...(element.options ? { options: element.options.slice(0, MAX_OPTIONS) } : {}),
      ...(element.required !== undefined ? { required: element.required } : {}),
      ...(text ? { text: truncate(text, MAX_TEXT_LENGTH) } : {}),
    });
  }

  return {
    url: observation.url,
    ...(observation.title ? { title: observation.title } : {}),
    elements,
  };
}
