import { InvalidApplicationInputError } from './contract';
import { TIMELINE_STAGES, type TimelineStage } from './model';

export function manualStage(stage: unknown): TimelineStage {
  if (typeof stage !== 'string' || !(TIMELINE_STAGES as readonly string[]).includes(stage) || stage === 'drafting') {
    throw new InvalidApplicationInputError('Choose a stage for an application already submitted.');
  }
  return stage as TimelineStage;
}
export function manualLabel(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 200) throw new InvalidApplicationInputError(`${name} must be 1–200 characters.`);
  return value.trim();
}
export function manualDate(value: unknown): string {
  if (value === undefined) return new Date().toISOString();
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2}))?$/.test(value)) throw new InvalidApplicationInputError('Use an ISO date or timestamp.');
  const date = new Date(value);
  const calendarDate = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || !Number.isFinite(calendarDate.getTime()) || calendarDate.toISOString().slice(0, 10) !== value.slice(0, 10) || date.getTime() > Date.now()) throw new InvalidApplicationInputError('Progress date must be valid and not in the future.');
  return date.toISOString();
}
