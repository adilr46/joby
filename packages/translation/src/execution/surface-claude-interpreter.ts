/**
 * Claude adapter — the real `SurfaceInterpreter`.
 *
 * Behind the provider-neutral port, so nothing else in Execution knows this exists. `fetch` against
 * the Messages API is enough; no SDK dependency is justified for one call per inspection. Structured
 * output (`output_config.format`) constrains the shape; `parseSurfaceInterpretationResult` then
 * enforces what a schema alone cannot — that every grounding claim points at something actually
 * sent, not just something structurally well-formed.
 *
 * The prompt intentionally names no portal, vendor or ATS. It is instructions about element shapes
 * (kind, label, required) and the four requirement kinds only — "no ATS-specific branching" applies
 * to the prompt as much as it does to the code around it.
 */

import type { SurfaceRequirementKind } from './session';
import { parseSurfaceInterpretationResult } from './surface-validate';
import {
  SurfaceInterpretationError,
  type SurfaceInterpretationOutput,
  type SurfaceInterpretationRequest,
  type SurfaceInterpreter,
} from './surface-port';

const DEFAULT_MODEL = 'claude-opus-5';
const ENDPOINT = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const MAX_TOKENS = 4096;

const REQUIREMENT_KINDS: readonly SurfaceRequirementKind[] = [
  'known',
  'generated_answer',
  'user_required',
  'portal_operation',
];

const SYSTEM_PROMPT = `You inspect one application page's controls and say what that surface requires.

You receive a compact list of page elements (a kind, an id, and whatever label/text/options/required
flag was observed) and session context (a role/company for display, a list of already-known facts,
and labels already resolved this session). You never see the page itself and you never see which
product or portal produced it — classify only from element shape and label text.

For every element that still needs attention, classify it into exactly one of four kinds:
- "known" — a known fact answers it directly. You MUST cite that fact's exact label in
  groundedFactLabel. Never mark something known unless a supplied fact actually answers it — a
  plausible guess is not knowledge.
- "generated_answer" — an open-ended question (e.g. a motivation or "tell us about yourself" prompt)
  that a drafted answer could address. You are not drafting the answer here, only flagging the kind.
- "user_required" — must come from the person directly; nothing supplied can answer it.
- "portal_operation" — not a content question at all: a file to upload, a consent checkbox, a
  "Continue"/"Submit" action.

Rules you must not break:
1. NEVER invent a surfaceElementId. Only use ids that appear in the element list you were given.
2. NEVER cite a groundedFactLabel that is not one of the supplied fact labels, verbatim.
3. If you cannot confidently classify an element into one of the four kinds, do not guess — put it in
   "unclear" with a short note saying why, instead of forcing a kind.
4. Skip elements that are already resolved (their label appears in resolvedRequirementLabels) and
   skip static text and links that ask nothing of the person.
5. Do not branch on the portal's name, vendor, or url — none of that is given to you, and nothing
   about your classification should depend on which product the page came from.

Respond with structured output only — no prose.`;

const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['requirements', 'unclear'],
  properties: {
    requirements: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['surfaceElementId', 'kind', 'label', 'groundedFactLabel', 'note'],
        properties: {
          surfaceElementId: { type: 'string' },
          kind: { type: 'string', enum: REQUIREMENT_KINDS as unknown as string[] },
          label: { type: 'string' },
          // Nullable, not optional: the schema must make "absent" expressible, or the model will
          // fill the field to satisfy it — the same fabrication risk the CV extractor's schema guards.
          groundedFactLabel: { type: ['string', 'null'] },
          note: { type: ['string', 'null'] },
        },
      },
    },
    unclear: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['surfaceElementId', 'note'],
        properties: {
          surfaceElementId: { type: 'string' },
          note: { type: 'string' },
        },
      },
    },
  },
} as const;

export interface ClaudeSurfaceInterpreterOptions {
  readonly apiKey: string;
  readonly model?: string;
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
}

export class ClaudeSurfaceInterpreter implements SurfaceInterpreter {
  readonly name = 'claude';
  readonly #options: Required<Omit<ClaudeSurfaceInterpreterOptions, 'fetchImpl'>> & { fetchImpl: typeof fetch };

  constructor(options: ClaudeSurfaceInterpreterOptions) {
    this.#options = {
      apiKey: options.apiKey,
      model: options.model ?? DEFAULT_MODEL,
      timeoutMs: options.timeoutMs ?? 120_000,
      fetchImpl: options.fetchImpl ?? fetch,
    };
  }

  async interpret(request: SurfaceInterpretationRequest): Promise<SurfaceInterpretationOutput> {
    const { apiKey, model, fetchImpl, timeoutMs } = this.#options;
    const abort = AbortSignal.timeout(timeoutMs);

    const userContent = JSON.stringify({ surface: request.surface, context: request.context });

    let response: Response;
    try {
      response = await fetchImpl(ENDPOINT, {
        method: 'POST',
        signal: abort,
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          model,
          max_tokens: MAX_TOKENS,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userContent }],
          output_config: {
            effort: 'medium',
            format: { type: 'json_schema', schema: RESPONSE_SCHEMA },
          },
        }),
      });
    } catch (error) {
      throw new SurfaceInterpretationError(`Claude request failed: ${String(error)}`, { cause: error });
    }

    if (!response.ok) {
      throw new SurfaceInterpretationError(`Claude returned ${response.status}: ${await safeText(response)}`);
    }

    const body = (await response.json()) as {
      stop_reason?: string;
      content?: Array<{ type: string; text?: string }>;
    };

    if (body.stop_reason === 'refusal') {
      throw new SurfaceInterpretationError('Claude declined to interpret this surface');
    }
    // A truncated response is an arbitrary prefix, not a partial interpretation — the grounding
    // claims that survived may be missing the object fields that made them checkable.
    if (body.stop_reason === 'max_tokens') {
      throw new SurfaceInterpretationError('Claude response was truncated before the interpretation was complete');
    }

    const textBlock = body.content?.find((block) => block.type === 'text');
    const text = textBlock?.text;
    if (typeof text !== 'string' || text.trim() === '') {
      throw new SurfaceInterpretationError('Claude returned no content');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      throw new SurfaceInterpretationError(`Claude returned content that is not JSON: ${String(error)}`, {
        cause: error,
      });
    }

    return {
      model,
      result: parseSurfaceInterpretationResult(parsed, request.surface, request.context),
    };
  }
}

async function safeText(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 500);
  } catch {
    return '<unreadable body>';
  }
}
