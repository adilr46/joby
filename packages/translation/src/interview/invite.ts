import type { InterviewBrief, InterviewFact } from './model';

export interface ParsedInterviewInvite {
  readonly company?: string;
  readonly requisitionId?: string;
  readonly brief: InterviewBrief;
}

const fact = (value: string): InterviewFact => ({ value, source: 'invite' });

/**
 * Deterministic invite parsing. The result is only an observed scheduling fact; callers must match
 * it to an Application themselves and must not advance a lifecycle stage from an email alone.
 */
export function parseInterviewInvite(text: string): ParsedInterviewInvite {
  const normalized = text.trim();
  const requisition = /\b(?:requisition|req(?:uisition)?|job)\s*(?:id|#|number)?\s*[:#-]?\s*([A-Za-z0-9_-]{3,})\b/i.exec(normalized)?.[1];
  const company = /\b(?:at|with)\s+([A-Z][\w&.' -]{1,80}?)(?=\s+(?:for|on|via|interview|team)\b|[.,\n]|$)/.exec(normalized)?.[1]?.trim();
  const platform = platformFor(normalized);
  const aiInterviewer = /(?:alex|apriora)\.(?:ai|com)\b/i.test(normalized);
  const hireVue = /hirevue\.com\b|\bhirevue\b/i.test(normalized);
  return {
    ...(company ? { company } : {}),
    ...(requisition ? { requisitionId: requisition } : {}),
    brief: {
      ...(platform ? { platform: fact(platform) } : {}),
      ...(requisition ? { requisitionId: fact(requisition) } : {}),
      ...(aiInterviewer ? { aiInterviewer: true } : {}),
      ...(hireVue && !aiInterviewer ? { hireVueModalityUnconfirmed: true } : {}),
    },
  };
}

function platformFor(text: string): string | undefined {
  if (/zoom\.us\b|\bzoom meeting\b/i.test(text)) return 'Zoom';
  if (/teams\.microsoft\.com\b|\bmicrosoft teams\b/i.test(text)) return 'Microsoft Teams';
  if (/meet\.google\.com\b|\bgoogle meet\b/i.test(text)) return 'Google Meet';
  if (/hirevue\.com\b|\bhirevue\b/i.test(text)) return 'HireVue';
  if (/alex\.ai\b/i.test(text)) return 'Alex';
  if (/apriora\.com\b|\bapriora\b/i.test(text)) return 'Apriora';
  if (/\b(?:phone|call us at|dial in)\b/i.test(text)) return 'Phone';
  return undefined;
}
