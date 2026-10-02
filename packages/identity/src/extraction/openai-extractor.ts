/**
 * OpenAI adapter — the v1 default when `OPENAI_API_KEY` is configured.
 *
 * Behind the provider-neutral port, so nothing in the domain knows this exists. It uses the
 * Chat Completions API with a strict JSON schema; `fetch` is enough, and an SDK dependency would
 * buy nothing here.
 *
 * The prompt does most of the doctrinal work, and every instruction in it is a specific failure
 * being prevented — upgrading verbs, inventing consequences, inferring tools, merging roles,
 * making vague dates precise. `validate.ts` then enforces what a prompt cannot guarantee.
 */

import { parseProposalContent } from './validate';
import { ExtractionError, type CvExtractor, type ExtractionRequest, type ExtractionResult } from './port';

const DEFAULT_MODEL = 'gpt-4o-2024-08-06';
const ENDPOINT = 'https://api.openai.com/v1/chat/completions';

const SYSTEM_PROMPT = `You extract a professional history from a CV so a person can review it.

You are not writing a CV, improving one, or summarising favourably. You are recording, in structured
form, only what this document actually states.

Model:
- Structure = the contexts a professional life sits in: institution, organisation, programme, role,
  engagement, team, period. Where and within what — never what was done.
- Activity = what the person did, as three independent parts: contribution (what they did),
  capability (what it required or demonstrated), consequence (what resulted).
- Relations = occurred_within, associated_with, uses_capability. No other relation kind exists.

Rules you must not break:
1. NEVER invent a component. If a bullet states what someone did but not what resulted, record the
   contribution and leave consequence absent. A sparse activity is correct and complete. Omitting is
   always better than guessing.
2. NEVER upgrade language. "contributed to" does not become "led". "helped build" does not become
   "built". "assisted" does not become "managed". Keep the source's strength exactly.
3. NEVER infer capability that is not stated. Do not conclude a language, framework or tool from the
   kind of work described. Only record capability the document names.
4. NEVER make a vague date precise. "2023" stays "2023". "summer" stays "summer". Copy dates as
   written; if there is no date, omit it.
5. NEVER merge two similar roles or two similar projects. If the document lists them separately,
   they stay separate — merging rewrites someone's history.
6. Ignore statements of ambition, desired roles, or preferences. A personal statement saying what
   the person is "seeking" is NOT part of their history. Do not record it anywhere.
7. Every item must quote the exact text supporting it, verbatim from the source.
8. epistemicStatus is "observed" when the document states it directly, "inferred" when you derived
   it defensibly from what it says, "hypothesized" when it is a guess worth confirming. Prefer
   observed; if you find yourself choosing hypothesized, consider omitting the item instead.
9. Use "uncertainty" to say precisely what you were unsure about for that item.
10. Use "conflicts" when two parts of the document cannot both be true. Do not resolve a conflict by
    choosing the more impressive version — surface both.

An empty or nearly empty result is a valid, honest answer for a thin CV.`;

const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['structure', 'activities', 'relations', 'conflicts', 'notes'],
  properties: {
    structure: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'kind', 'label', 'epistemicStatus', 'sources', 'startedAt', 'endedAt', 'uncertainty'],
        properties: {
          id: { type: 'string' },
          kind: {
            type: 'string',
            enum: ['institution', 'organisation', 'programme', 'role', 'engagement', 'team', 'period'],
          },
          label: { type: 'string' },
          startedAt: { type: ['string', 'null'] },
          endedAt: { type: ['string', 'null'] },
          epistemicStatus: { type: 'string', enum: ['observed', 'inferred', 'hypothesized'] },
          uncertainty: { type: ['string', 'null'] },
          sources: { $ref: '#/$defs/sources' },
        },
      },
    },
    activities: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'id',
          'label',
          'contribution',
          'capability',
          'consequence',
          'epistemicStatus',
          'sources',
          'uncertainty',
        ],
        properties: {
          id: { type: 'string' },
          label: { type: 'string' },
          // Nullable, not optional: the schema must make "absent" expressible, or the model will
          // fill the field to satisfy it — which is the fabrication this slice exists to prevent.
          contribution: { type: ['string', 'null'] },
          capability: { type: ['array', 'null'], items: { type: 'string' } },
          consequence: { type: ['string', 'null'] },
          epistemicStatus: { type: 'string', enum: ['observed', 'inferred', 'hypothesized'] },
          uncertainty: { type: ['string', 'null'] },
          sources: { $ref: '#/$defs/sources' },
        },
      },
    },
    relations: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'kind', 'fromId', 'toId', 'epistemicStatus', 'sources', 'uncertainty'],
        properties: {
          id: { type: 'string' },
          kind: { type: 'string', enum: ['occurred_within', 'associated_with', 'uses_capability'] },
          fromId: { type: 'string' },
          toId: { type: 'string' },
          epistemicStatus: { type: 'string', enum: ['observed', 'inferred', 'hypothesized'] },
          uncertainty: { type: ['string', 'null'] },
          sources: { $ref: '#/$defs/sources' },
        },
      },
    },
    conflicts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'description', 'itemIds', 'sources'],
        properties: {
          id: { type: 'string' },
          description: { type: 'string' },
          itemIds: { type: 'array', items: { type: 'string' } },
          sources: { $ref: '#/$defs/sources' },
        },
      },
    },
    notes: { type: 'array', items: { type: 'string' } },
  },
  $defs: {
    sources: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['quote', 'startOffset', 'endOffset'],
        properties: {
          quote: { type: 'string' },
          startOffset: { type: ['integer', 'null'] },
          endOffset: { type: ['integer', 'null'] },
        },
      },
    },
  },
} as const;

export interface OpenAiCvExtractorOptions {
  readonly apiKey: string;
  readonly model?: string;
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
}

export class OpenAiCvExtractor implements CvExtractor {
  readonly name = 'openai';
  readonly #options: Required<Omit<OpenAiCvExtractorOptions, 'fetchImpl'>> & { fetchImpl: typeof fetch };

  constructor(options: OpenAiCvExtractorOptions) {
    this.#options = {
      apiKey: options.apiKey,
      model: options.model ?? DEFAULT_MODEL,
      timeoutMs: options.timeoutMs ?? 120_000,
      fetchImpl: options.fetchImpl ?? fetch,
    };
  }

  async extract(request: ExtractionRequest): Promise<ExtractionResult> {
    const { apiKey, model, fetchImpl, timeoutMs } = this.#options;
    const abort = AbortSignal.timeout(timeoutMs);

    let response: Response;
    try {
      response = await fetchImpl(ENDPOINT, {
        method: 'POST',
        signal: abort,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          // Extraction is a reading task. Sampling variance here shows up as invented detail.
          temperature: 0,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: `CV source id: ${request.sourceId}\n\n---\n${request.text}\n---` },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: { name: 'reconstruction_proposal', strict: true, schema: RESPONSE_SCHEMA },
          },
        }),
      });
    } catch (error) {
      throw new ExtractionError(`OpenAI request failed: ${String(error)}`, { cause: error });
    }

    if (!response.ok) {
      throw new ExtractionError(`OpenAI returned ${response.status}: ${await safeText(response)}`);
    }

    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
    };
    const choice = body.choices?.[0];

    // A truncated response is not a partial proposal — it is an arbitrary prefix of one, and the
    // items that survived may be missing the very components that made them honest.
    if (choice?.finish_reason === 'length') {
      throw new ExtractionError('OpenAI response was truncated before the proposal was complete');
    }

    const content = choice?.message?.content;
    if (typeof content !== 'string' || content.trim() === '') {
      throw new ExtractionError('OpenAI returned no content');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch (error) {
      throw new ExtractionError(`OpenAI returned content that is not JSON: ${String(error)}`, { cause: error });
    }

    return { model, content: parseProposalContent(parsed, request.sourceId) };
  }
}

async function safeText(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 500);
  } catch {
    return '<unreadable body>';
  }
}
