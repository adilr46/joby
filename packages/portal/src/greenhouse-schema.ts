import type { PageObservation, PageObservationElement, SurfaceElementKind } from '@joby/translation/execution';
import { DnsEgressGuard } from './egress-guard';

export interface GreenhouseField {
  readonly label: string;
  readonly kind: SurfaceElementKind;
  readonly required: boolean;
  readonly options: readonly string[];
}

export function parseGreenhouse(url: string): { readonly token: string; readonly jobId: string } | undefined {
  try {
    const parsed = new URL(url);
    if (!/(^|\.)greenhouse\.io$/i.test(parsed.hostname)) return undefined;
    const path = parsed.pathname.match(/\/([^/]+)\/jobs\/(\d+)/);
    if (path) return { token: path[1]!, jobId: path[2]! };
    const token = parsed.searchParams.get('for');
    const jobId = parsed.searchParams.get('token');
    return token && jobId ? { token, jobId } : undefined;
  } catch {
    return undefined;
  }
}

const KIND_BY_GREENHOUSE_TYPE: Record<string, SurfaceElementKind> = {
  input_text: 'text_input',
  textarea: 'textarea',
  input_file: 'file_upload',
  multi_value_single_select: 'select',
  multi_value_multi_select: 'select',
  multi_select: 'select',
  single_select: 'select',
  boolean: 'select',
};

export async function fetchGreenhouseSchema(input: {
  readonly token: string;
  readonly jobId: string;
  readonly guard?: DnsEgressGuard;
  readonly fetchImpl?: typeof fetch;
}): Promise<ReadonlyMap<string, GreenhouseField> | undefined> {
  const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(input.token)}/jobs/${encodeURIComponent(input.jobId)}?questions=true`;
  await (input.guard ?? new DnsEgressGuard()).validate(url);

  try {
    const response = await (input.fetchImpl ?? fetch)(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return undefined;
    const data = await response.json() as {
      questions?: Array<{
        label?: string;
        required?: boolean;
        fields?: Array<{ name?: string; type?: string; values?: Array<{ label?: string }> }>;
      }>;
    };
    const fields = new Map<string, GreenhouseField>();
    for (const question of data.questions ?? []) {
      const label = (question.label ?? '').replace(/\s*\*+\s*$/, '').trim();
      for (const field of question.fields ?? []) {
        if (!field.name) continue;
        const shaped: GreenhouseField = {
          label,
          kind: KIND_BY_GREENHOUSE_TYPE[field.type ?? ''] ?? 'text_input',
          required: question.required === true,
          options: (field.values ?? []).map((value) => value.label?.trim() ?? '').filter(Boolean),
        };
        fields.set(field.name, shaped);
        if (label) fields.set(`label:${label.toLowerCase()}`, shaped);
      }
    }
    return fields.size > 0 ? fields : undefined;
  } catch {
    return undefined;
  }
}

export async function enrichObservationFromGreenhouse(input: {
  readonly url: string;
  readonly observation: PageObservation;
  readonly guard?: DnsEgressGuard;
  readonly fetchImpl?: typeof fetch;
}): Promise<PageObservation> {
  const parsed = parseGreenhouse(input.url);
  if (!parsed) return input.observation;
  const schema = await fetchGreenhouseSchema({ ...parsed, guard: input.guard, fetchImpl: input.fetchImpl });
  if (!schema) return input.observation;

  const elements = input.observation.elements.map((element): PageObservationElement => {
    const match = (element.name ? schema.get(element.name) : undefined) ??
      (element.label ? schema.get(`label:${element.label.toLowerCase()}`) : undefined);
    if (!match) return element;
    return {
      ...element,
      kind: match.kind,
      label: match.label || element.label,
      required: match.required || element.required,
      ...(match.options.length > 0 ? { options: match.options } : {}),
    };
  });

  return { ...input.observation, elements };
}
