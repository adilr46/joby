/**
 * Persistence for written representation: elicited input, and drafts with their edits.
 *
 * Two tables, both Adaptation-owned and both temporary. They exist because a user's edit and a
 * user's answer **cannot be recomputed from the inputs** — which is precisely the trigger ADR 0019
 * named for making this state durable.
 *
 * **A draft is not a submission.** There is no `submitted` column and no way to add one here:
 * Execution freezes what actually entered the world, in its own record (ADRs 0013, 0022).
 */

import type { Database, Queryable, Transaction } from '@joby/database';

import type {
  ApplicationInput,
  ApplicationInputKind,
  DraftSegment,
  RepresentationSurface,
  SurfaceConstraints,
} from './writing';

/**
 * A generated draft, and the person's edit of it.
 *
 * Both are kept: "what Joby wrote" and "what the person decided" must never collapse into each
 * other, and the difference is exactly what a later Application Record needs to preserve.
 */
export interface RepresentationDraft {
  readonly id: string;
  readonly contextId: string;
  readonly surface: RepresentationSurface;
  readonly question?: string;
  readonly constraints: SurfaceConstraints;
  /** What the writer produced, with its grounding, unchanged by any edit. */
  readonly generated: readonly DraftSegment[];
  /** What the person changed it to, when they have. */
  readonly edited?: readonly DraftSegment[];
  readonly writer: string;
  readonly model: string;
  readonly generatedAt: string;
  readonly generatedBy: string;
  readonly editedAt?: string;
  readonly editedBy?: string;
  readonly revision: number;
  /**
   * Always false in this slice, and present so nobody has to infer it.
   *
   * A draft becomes history by being submitted through Execution, which creates an Application
   * Record. Nothing here can make that true.
   */
  readonly submitted: false;
}

interface InputRow extends Record<string, unknown> {
  kind: string;
  prompt: string;
  answer: string;
  provided_at: Date | string;
  provided_by: string;
}

interface DraftRow extends Record<string, unknown> {
  id: string;
  context_id: string;
  surface: string;
  question: string | null;
  constraints: unknown;
  content: unknown;
  writer: string;
  model: string;
  edited_content: unknown;
  edited_at: Date | string | null;
  edited_by: string | null;
  generated_at: Date | string;
  generated_by: string;
  revision: number;
}

const DRAFT_COLUMNS = `id, context_id, surface, question, constraints, content, writer, model,
                       edited_content, edited_at, edited_by, generated_at, generated_by, revision`;

const iso = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const segments = (value: unknown): readonly DraftSegment[] =>
  Array.isArray(value) ? (value as DraftSegment[]) : [];

function toDraft(row: DraftRow): RepresentationDraft {
  return {
    id: row.id,
    contextId: row.context_id,
    surface: row.surface as RepresentationSurface,
    constraints: (row.constraints ?? {}) as SurfaceConstraints,
    generated: segments(row.content),
    writer: row.writer,
    model: row.model,
    generatedAt: iso(row.generated_at),
    generatedBy: row.generated_by,
    revision: row.revision,
    submitted: false,
    ...(row.question === null ? {} : { question: row.question }),
    ...(row.edited_content === null ? {} : { edited: segments(row.edited_content) }),
    ...(row.edited_at === null ? {} : { editedAt: iso(row.edited_at) }),
    ...(row.edited_by === null ? {} : { editedBy: row.edited_by }),
  };
}

export class WrittenRepresentationRepository {
  readonly #db: Database;

  constructor(db: Database) {
    this.#db = db;
  }

  // --- Elicited application input ------------------------------------------------------------

  /** Context-scoped, not surface-scoped: an answer and a cover letter share what the person said. */
  async listInput(
    contextId: string,
    runner: Queryable = this.#db,
  ): Promise<readonly ApplicationInput[]> {
    const { rows } = await runner.query<InputRow>(
      `SELECT kind, prompt, answer, provided_at, provided_by
         FROM adaptation_application_input WHERE context_id = $1 ORDER BY provided_at, kind`,
      [contextId],
    );
    return rows.map((row) => ({
      kind: row.kind as ApplicationInputKind,
      prompt: row.prompt,
      answer: row.answer,
      providedAt: iso(row.provided_at),
      providedBy: row.provided_by,
    }));
  }

  async upsertInput(
    input: {
      id: string;
      contextId: string;
      kind: ApplicationInputKind;
      prompt: string;
      answer: string;
      providedBy: string;
    },
    runner: Queryable = this.#db,
  ): Promise<void> {
    await runner.query(
      `INSERT INTO adaptation_application_input (id, context_id, kind, prompt, answer, provided_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       -- Re-answering replaces. Two answers to "why this role" is two intents attributed to one
       -- person, and a generator would have to pick.
       ON CONFLICT (context_id, kind) DO UPDATE SET
         prompt = EXCLUDED.prompt, answer = EXCLUDED.answer,
         provided_at = now(), provided_by = EXCLUDED.provided_by`,
      [input.id, input.contextId, input.kind, input.prompt, input.answer, input.providedBy],
    );
  }

  // --- Drafts ---------------------------------------------------------------------------------

  async upsertDraft(
    input: {
      id: string;
      contextId: string;
      surface: RepresentationSurface;
      question?: string;
      constraints: SurfaceConstraints;
      segments: readonly DraftSegment[];
      writer: string;
      model: string;
      generatedBy: string;
    },
    runner: Queryable = this.#db,
  ): Promise<RepresentationDraft> {
    // Regenerating replaces: a draft is working state, and keeping every attempt would bury the one
    // the person is actually working on. The edit is cleared with it — it belonged to that text.
    const conflict =
      input.question === undefined
        ? '(context_id, surface) WHERE question IS NULL'
        : '(context_id, surface, question) WHERE question IS NOT NULL';

    const { rows } = await runner.query<DraftRow>(
      `INSERT INTO adaptation_representation_draft
         (id, context_id, surface, question, constraints, content, writer, model, generated_by)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9)
       ON CONFLICT ${conflict} DO UPDATE SET
         constraints    = EXCLUDED.constraints,
         content        = EXCLUDED.content,
         writer         = EXCLUDED.writer,
         model          = EXCLUDED.model,
         edited_content = NULL,
         edited_at      = NULL,
         edited_by      = NULL,
         generated_at   = now(),
         generated_by   = EXCLUDED.generated_by,
         revision       = adaptation_representation_draft.revision + 1
       RETURNING ${DRAFT_COLUMNS}`,
      [
        input.id,
        input.contextId,
        input.surface,
        input.question ?? null,
        JSON.stringify(input.constraints),
        JSON.stringify(input.segments),
        input.writer,
        input.model,
        input.generatedBy,
      ],
    );
    return toDraft(rows[0]!);
  }

  async findDraft(id: string, runner: Queryable = this.#db): Promise<RepresentationDraft | undefined> {
    const { rows } = await runner.query<DraftRow>(
      `SELECT ${DRAFT_COLUMNS} FROM adaptation_representation_draft WHERE id = $1`,
      [id],
    );
    return rows[0] ? toDraft(rows[0]) : undefined;
  }

  async listDrafts(
    contextId: string,
    runner: Queryable = this.#db,
  ): Promise<readonly RepresentationDraft[]> {
    const { rows } = await runner.query<DraftRow>(
      `SELECT ${DRAFT_COLUMNS} FROM adaptation_representation_draft
        WHERE context_id = $1 ORDER BY generated_at DESC, id`,
      [contextId],
    );
    return rows.map(toDraft);
  }

  /** Guarded by the draft revision: two tabs editing one draft must not silently overwrite. */
  async applyEdit(
    tx: Transaction,
    input: {
      id: string;
      expectedRevision: number;
      segments: readonly DraftSegment[];
      editedBy: string;
    },
  ): Promise<RepresentationDraft | undefined> {
    const { rows } = await tx.query<DraftRow>(
      `UPDATE adaptation_representation_draft
          SET edited_content = $3::jsonb, edited_at = now(), edited_by = $4,
              revision = revision + 1
        WHERE id = $1 AND revision = $2
        RETURNING ${DRAFT_COLUMNS}`,
      [input.id, input.expectedRevision, JSON.stringify(input.segments), input.editedBy],
    );
    return rows[0] ? toDraft(rows[0]) : undefined;
  }
}
