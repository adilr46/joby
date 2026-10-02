import type { Queryable } from '@joby/database';
import type { Cohort } from './model';

export class SocialRepository {
  constructor(private readonly db: Queryable) {}
  async memberships(personId: string) {
    return (await this.db.query<{ id: string; cohort: Cohort }>(
      'SELECT cohort_id AS id, cohort FROM social_membership WHERE person_id = $1 ORDER BY cohort_id', [personId])).rows;
  }
  async join(personId: string, id: string, cohort: Cohort) {
    await this.db.query('INSERT INTO social_membership (person_id, cohort_id, cohort) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [personId, id, JSON.stringify(cohort)]);
  }
  async leave(personId: string, cohortId: string) {
    await this.db.query('DELETE FROM social_membership WHERE person_id=$1 AND cohort_id=$2', [personId, cohortId]);
  }
  async share(personId: string, applicationId: string, signalId: string, cohortId: string, sourceCohortId: string) {
    await this.db.query(`INSERT INTO social_share (person_id, application_id, signal_id, cohort_id, source_cohort_id)
      VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`, [personId, applicationId, signalId, cohortId, sourceCohortId]);
  }
  async hide(personId: string, signalId: string) {
    await this.db.query('DELETE FROM social_share WHERE person_id=$1 AND signal_id=$2', [personId, signalId]);
  }
  async shares(cohortId: string) {
    return (await this.db.query<{ signalId: string; applicationId: string; personId: string }>(
      `SELECT signal_id AS "signalId", application_id AS "applicationId", person_id AS "personId"
       FROM social_share WHERE cohort_id=$1 ORDER BY signal_id`, [cohortId])).rows;
  }
  async linkedSignals(personId: string, cohortId: string) {
    return (await this.db.query<{ signalId: string }>(
      `SELECT l.signal_id AS "signalId" FROM social_link l JOIN social_share s ON s.signal_id=l.signal_id
       WHERE l.person_id=$1 AND s.cohort_id=$2`, [personId, cohortId])).rows.map(row => row.signalId);
  }
  async lockAudience(personId: string, sourceCohortId: string, signalId: string, cohortId: string) {
    return (await this.db.query(`SELECT s.signal_id FROM social_share s JOIN social_membership m
      ON m.person_id=$3 AND m.cohort_id=$4 WHERE s.signal_id=$1 AND s.cohort_id=$2 FOR SHARE OF s, m`,
      [signalId, cohortId, personId, sourceCohortId])).rowCount > 0;
  }
  async link(personId: string, targetPersonId: string, signalId: string, cohortId: string) {
    await this.db.query(`INSERT INTO social_link (person_id,target_person_id,signal_id,cohort_id)
      VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`, [personId, targetPersonId, signalId, cohortId]);
  }
  async unlink(personId: string, signalId: string) {
    await this.db.query('DELETE FROM social_link WHERE person_id=$1 AND signal_id=$2', [personId, signalId]);
  }
  async receivedLinks(personId: string) {
    return (await this.db.query<{ personId: string; signalId: string; applicationId: string }>(
      `SELECT l.person_id AS "personId", l.signal_id AS "signalId", s.application_id AS "applicationId"
       FROM social_link l JOIN social_share s USING (signal_id,cohort_id) WHERE l.target_person_id=$1`, [personId])).rows;
  }
}
