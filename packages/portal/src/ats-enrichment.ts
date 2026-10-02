import type { PageObservation, PageObservationElement, SurfaceElementKind } from '@joby/translation/execution';
import { DnsEgressGuard } from './egress-guard';
import { enrichObservationFromGreenhouse } from './greenhouse-schema';

export interface AtsField {
  readonly label: string;
  readonly kind?: SurfaceElementKind;
  readonly required?: boolean;
  readonly options?: readonly string[];
}

export async function enrichObservationFromKnownAts(input: {
  readonly url: string;
  readonly observation: PageObservation;
  readonly guard?: DnsEgressGuard;
  readonly fetchImpl?: typeof fetch;
}): Promise<PageObservation> {
  const greenhouse = await enrichObservationFromGreenhouse(input);
  const ashby = await enrichObservationFromAshby({ ...input, observation: greenhouse });
  return enrichObservationFromLever({ ...input, observation: ashby });
}

export function parseAshby(url: string): { readonly organization: string; readonly jobId?: string } | undefined {
  try {
    const parsed = new URL(url);
    if (!/(^|\.)ashbyhq\.com$/i.test(parsed.hostname)) return undefined;
    const parts = parsed.pathname.split('/').filter(Boolean);
    const orgIndex = parts[0] === 'application' ? 1 : 0;
    const organization = parts[orgIndex];
    const jobId = parts[orgIndex + 1];
    return organization ? { organization, ...(jobId ? { jobId } : {}) } : undefined;
  } catch {
    return undefined;
  }
}

export function parseLever(url: string): { readonly company: string; readonly postingId?: string } | undefined {
  try {
    const parsed = new URL(url);
    if (!/(^|\.)lever\.co$/i.test(parsed.hostname)) return undefined;
    const parts = parsed.pathname.split('/').filter(Boolean);
    const company = parts[0];
    const postingId = parts[1] === 'apply' ? parts[2] : parts[1];
    return company ? { company, ...(postingId ? { postingId } : {}) } : undefined;
  } catch {
    return undefined;
  }
}

export async function enrichObservationFromAshby(input: {
  readonly url: string;
  readonly observation: PageObservation;
  readonly guard?: DnsEgressGuard;
  readonly fetchImpl?: typeof fetch;
}): Promise<PageObservation> {
  const parsed = parseAshby(input.url);
  if (!parsed) return input.observation;
  const url = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(parsed.organization)}`;
  const json = await fetchJson({ url, guard: input.guard, fetchImpl: input.fetchImpl });
  const root = asRecord(json);
  const jobs = Array.isArray(root.jobs) ? root.jobs : [];
  const job = parsed.jobId
    ? jobs.find((candidate: unknown) => stringAt(candidate, ['id']).toLowerCase() === parsed.jobId!.toLowerCase())
    : jobs[0];
  const fields = collectQuestionFields(job ?? root);
  return fields.length > 0 ? applyFieldEnrichment(input.observation, fields) : input.observation;
}

export async function enrichObservationFromLever(input: {
  readonly url: string;
  readonly observation: PageObservation;
  readonly guard?: DnsEgressGuard;
  readonly fetchImpl?: typeof fetch;
}): Promise<PageObservation> {
  const parsed = parseLever(input.url);
  if (!parsed?.postingId) return input.observation;
  const url = `https://api.lever.co/v0/postings/${encodeURIComponent(parsed.company)}/${encodeURIComponent(parsed.postingId)}`;
  const json = await fetchJson({ url, guard: input.guard, fetchImpl: input.fetchImpl });
  const fields = collectQuestionFields(json);
  return fields.length > 0 ? applyFieldEnrichment(input.observation, fields) : input.observation;
}

async function fetchJson(input: {
  readonly url: string;
  readonly guard?: DnsEgressGuard;
  readonly fetchImpl?: typeof fetch;
}): Promise<unknown> {
  await (input.guard ?? new DnsEgressGuard()).validate(input.url);
  try {
    const response = await (input.fetchImpl ?? fetch)(input.url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(8_000),
    });
    return response.ok ? response.json() : undefined;
  } catch {
    return undefined;
  }
}

function applyFieldEnrichment(observation: PageObservation, fields: readonly AtsField[]): PageObservation {
  const byLabel = new Map(fields.map((field) => [normalize(field.label), field]));
  const elements = observation.elements.map((element): PageObservationElement => {
    const match = byLabel.get(normalize(element.label ?? element.name ?? element.text ?? ''));
    if (!match) return element;
    return {
      ...element,
      ...(match.kind ? { kind: match.kind } : {}),
      label: match.label || element.label,
      ...(match.required !== undefined ? { required: match.required || element.required } : {}),
      ...(match.options && match.options.length > 0 ? { options: match.options } : {}),
    };
  });
  return { ...observation, elements };
}

function collectQuestionFields(root: unknown): readonly AtsField[] {
  const fields: AtsField[] = [];
  const seen = new Set<unknown>();
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }

    const record = value as Record<string, unknown>;
    const label = firstString(record, ['label', 'title', 'text', 'question', 'name', 'prompt']);
    const options = optionLabels(record);
    if (label && looksQuestionLike(record, options)) {
      fields.push({
        label,
        kind: kindFromType(firstString(record, ['type', 'fieldType', 'inputType', 'controlType'])),
        required: Boolean(record.required ?? record.isRequired ?? record.mandatory),
        options,
      });
    }

    Object.values(record).forEach(visit);
  };
  visit(root);
  return dedupeFields(fields);
}

function looksQuestionLike(record: Record<string, unknown>, options: readonly string[]): boolean {
  if (record.required !== undefined || record.isRequired !== undefined || record.mandatory !== undefined) return true;
  if (firstString(record, ['type', 'fieldType', 'inputType', 'controlType'])) return true;
  return options.length > 0;
}

function firstString(record: Record<string, unknown>, keys: readonly string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function optionLabels(record: Record<string, unknown>): readonly string[] {
  const raw = record.options ?? record.values ?? record.choices ?? record.enum;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => typeof item === 'string' ? item : stringAt(item, ['label']) || stringAt(item, ['value']) || stringAt(item, ['text']))
    .map((value) => value.trim())
    .filter(Boolean);
}

function kindFromType(type: string): SurfaceElementKind | undefined {
  const value = type.toLowerCase();
  if (!value) return undefined;
  if (value.includes('textarea') || value.includes('long_text')) return 'textarea';
  if (value.includes('select') || value.includes('dropdown') || value.includes('boolean')) return 'select';
  if (value.includes('checkbox')) return 'checkbox';
  if (value.includes('radio')) return 'radio';
  if (value.includes('file') || value.includes('resume')) return 'file_upload';
  if (value.includes('email') || value.includes('phone') || value.includes('text') || value.includes('url')) return 'text_input';
  return undefined;
}

function stringAt(value: unknown, path: readonly string[]): string {
  let current = value;
  for (const key of path) {
    if (!current || typeof current !== 'object') return '';
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === 'string' ? current.trim() : '';
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function dedupeFields(fields: readonly AtsField[]): readonly AtsField[] {
  const seen = new Set<string>();
  return fields.filter((field) => {
    const key = normalize(field.label);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
