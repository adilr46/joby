/**
 * `OpportunityService implements OpportunityModule`, so the contract is enforced by the compiler
 * rather than by anyone remembering to keep the two in step.
 */

import type { Database } from '@joby/database';

import { OpportunityCaptureService, type CaptureEvidenceInput, type CaptureEvidenceResult } from './capture';
import type { EvidenceText, OpportunityModule, OpportunitySummary } from './contract';
import type { OpportunityEvidence, OpportunityEvidenceContent, OpportunityRecord } from './model';
import { OpportunityRepository } from './repository';

const DEFAULT_RECENT_LIMIT = 50;
const MAX_RECENT_LIMIT = 200;

export class OpportunityService implements OpportunityModule {
  readonly #repository: OpportunityRepository;
  readonly #capture: OpportunityCaptureService;
  readonly #db: Database;

  constructor(options: { db: Database }) {
    this.#db = options.db;
    this.#repository = new OpportunityRepository(options.db);
    this.#capture = new OpportunityCaptureService({ db: options.db, repository: this.#repository });
  }

  captureEvidence(input: CaptureEvidenceInput): Promise<CaptureEvidenceResult> {
    return this.#capture.capture(input);
  }

  async getOpportunity(opportunityId: string): Promise<OpportunityRecord | undefined> {
    const opportunity = await this.#repository.findOpportunity(opportunityId);
    if (!opportunity) return undefined;
    return { opportunity, evidence: await this.#repository.listEvidence(opportunityId) };
  }

  listEvidence(opportunityId: string): Promise<readonly OpportunityEvidence[]> {
    return this.#repository.listEvidence(opportunityId);
  }

  getEvidenceContent(evidenceId: string): Promise<OpportunityEvidenceContent | undefined> {
    return this.#repository.getEvidenceContent(evidenceId);
  }

  async readEvidenceText(opportunityId: string): Promise<readonly EvidenceText[]> {
    const evidence = await this.#repository.listEvidence(opportunityId);
    const decoded = await Promise.all(
      evidence.map(async (item): Promise<EvidenceText | undefined> => {
        const full = await this.#repository.getEvidenceContent(item.id);
        return full === undefined
          ? undefined
          : {
              evidenceId: item.id,
              kind: item.kind,
              source: item.source,
              ...(item.uri ? { uri: item.uri } : {}),
              text: full.content.toString('utf8'),
            };
      }),
    );
    return decoded.filter((item): item is EvidenceText => item !== undefined);
  }

  async listSummaries(options?: { limit?: number; after?: string }): Promise<readonly OpportunitySummary[]> {
    const limit = Math.min(Math.max(options?.limit ?? DEFAULT_RECENT_LIMIT, 1), MAX_RECENT_LIMIT);
    // Ordered by (first capture, id) so the sequence is stable and total: every opportunity is
    // reachable by paging, and a page boundary cannot skip one.
    const { rows } = await this.#db.query<{
      opportunity_id: string;
      evidence_ids: string[];
      latest_captured_at: Date | string;
      cursor: string;
    }>(
      `SELECT opportunity_id,
              array_agg(id ORDER BY captured_at, id) AS evidence_ids,
              max(captured_at)                       AS latest_captured_at,
              to_char(min(captured_at), 'YYYY-MM-DD"T"HH24:MI:SS.USOF') || '|' || opportunity_id AS cursor
         FROM opportunity_evidence
        GROUP BY opportunity_id
       HAVING $2::text IS NULL
           OR to_char(min(captured_at), 'YYYY-MM-DD"T"HH24:MI:SS.USOF') || '|' || opportunity_id > $2::text
        ORDER BY cursor
        LIMIT $1`,
      [limit, options?.after ?? null],
    );
    return rows.map((row) => ({
      opportunityId: row.opportunity_id,
      evidenceIds: row.evidence_ids,
      latestCapturedAt:
        row.latest_captured_at instanceof Date
          ? row.latest_captured_at.toISOString()
          : new Date(row.latest_captured_at).toISOString(),
      cursor: row.cursor,
    }));
  }
}
