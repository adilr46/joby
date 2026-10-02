import { describe, expect, it } from 'vitest';
import { manualDate, manualLabel, manualStage } from './manual-input';

describe('manual progress validation', () => {
  it('accepts supported external stages and rejects arbitrary states', () => {
    expect(manualStage('interviewing')).toBe('interviewing');
    for (const stage of ['drafting', 'hacked', null, 12]) expect(() => manualStage(stage)).toThrow();
  });
  it('requires bounded company and role labels', () => {
    expect(manualLabel('  Acme  ', 'Company')).toBe('Acme');
    for (const label of ['', '  ', null, {}, 'a'.repeat(201)]) expect(() => manualLabel(label, 'Role')).toThrow();
  });
  it('accepts historical dates and rejects invalid calendars and future progress', () => {
    expect(manualDate('2026-01-03')).toBe('2026-01-03T00:00:00.000Z');
    for (const date of ['2026-02-30', '2026-13-01', 'tomorrow', null, '2999-01-01']) expect(() => manualDate(date)).toThrow();
  });
});
