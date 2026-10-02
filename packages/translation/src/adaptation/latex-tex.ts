/**
 * User-owned LaTeX CV adaptation.
 *
 * This is an opt-in path for a hand-tuned `.tex` CV. It does not change Durable Identity, an
 * Identity Representation, or any global CV source. The only editable surface is prose already
 * present in supported document-body slots.
 */

export type LatexTexLayoutFamily = 'resumeSubheading' | 'tabularx-itemize';

export interface LatexTexSlot {
  readonly id: string;
  readonly kind: 'bullet' | 'skill';
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

export interface LatexTexManifest {
  readonly supported: boolean;
  readonly family?: LatexTexLayoutFamily;
  readonly slots: readonly LatexTexSlot[];
  readonly error?: string;
  readonly hint?: string;
}

export interface LatexTexPatch {
  readonly id: string;
  readonly text: string;
}

export interface LatexTexPatchManifest {
  readonly slots: readonly LatexTexSlot[];
  readonly patches: readonly LatexTexPatch[];
}

export interface LatexTexSourceResolution {
  readonly source?: string;
  readonly error?: string;
  readonly hint?: string;
}

const UNSUPPORTED_HINT = 'Use /career-ops latex to render from cv.md through the career-ops template.';

export function resolveLatexTexSource(input: {
  readonly profileYaml?: string;
  readonly existingFiles: readonly string[];
}): LatexTexSourceResolution {
  const configured = readConfiguredLatexSource(input.profileYaml);
  if (configured) return { source: configured };

  if (input.existingFiles.includes('resume.tex')) return { source: 'resume.tex' };
  if (input.existingFiles.includes('cv.tex')) return { source: 'cv.tex' };

  return {
    error: 'No LaTeX CV source found.',
    hint: 'Add resume.tex, cv.tex, or set config/profile.yml latex.source.',
  };
}

function readConfiguredLatexSource(profileYaml: string | undefined): string | undefined {
  if (!profileYaml) return undefined;

  const lines = profileYaml.split(/\r?\n/);
  let inLatex = false;
  for (const raw of lines) {
    const line = raw.replace(/\s+#.*$/, '');
    if (/^\S/.test(line)) inLatex = /^latex\s*:\s*$/.test(line);
    if (!inLatex) continue;

    const match = line.match(/^\s+source\s*:\s*["']?([^"'\s]+)["']?\s*$/);
    if (match?.[1]) return match[1];
  }
  return undefined;
}

export function extractLatexTexContent(latex: string): LatexTexManifest {
  const bodyRange = documentBodyRange(latex);
  const body = bodyRange ? latex.slice(bodyRange.start, bodyRange.end) : latex;
  const uncommented = stripCommentedLines(body);

  const hasResumeMacros = /\\resumeSubheading\b/.test(uncommented);
  const hasResumeItems = /\\resume(?:Item|ItemWithoutTitle|SubItem)\b/.test(uncommented);
  if (hasResumeMacros && hasResumeItems) {
    return supported('resumeSubheading', [
      ...resumeBulletSlots(body, bodyRange?.start ?? 0),
      ...resumeSkillSlots(body, bodyRange?.start ?? 0),
    ]);
  }

  if (/\\begin\{tabularx\}/.test(uncommented) && /\\begin\{itemize\}/.test(uncommented)) {
    return supported('tabularx-itemize', itemizeSlots(body, bodyRange?.start ?? 0));
  }

  return {
    supported: false,
    slots: [],
    error: 'Unsupported LaTeX CV layout.',
    hint: UNSUPPORTED_HINT,
  };
}

function supported(family: LatexTexLayoutFamily, slots: readonly LatexTexSlot[]): LatexTexManifest {
  return { supported: true, family, slots };
}

function documentBodyRange(latex: string): { start: number; end: number } | undefined {
  const begin = latex.match(/\\begin\{document\}/);
  const end = latex.match(/\\end\{document\}/);
  if (begin?.index === undefined || end?.index === undefined || end.index <= begin.index) {
    return undefined;
  }
  return { start: begin.index + begin[0].length, end: end.index };
}

function stripCommentedLines(text: string): string {
  return text
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith('%'))
    .join('\n');
}

function resumeBulletSlots(body: string, offset: number): LatexTexSlot[] {
  const slots: LatexTexSlot[] = [];
  for (const command of ['resumeItem', 'resumeSubItem']) {
    for (const match of balancedCommandArguments(body, command, offset)) {
      if (isCommented(body, match.commandStart - offset)) continue;
      const textArg = command === 'resumeSubItem' ? match.arguments[1] : match.arguments[0];
      if (!textArg) continue;
      slots.push(slot(`bullet-${slots.length}`, 'bullet', textArg));
    }
  }

  for (const match of balancedCommandArguments(body, 'resumeItemWithoutTitle', offset)) {
    if (isCommented(body, match.commandStart - offset)) continue;
    const textArg = match.arguments[1];
    if (textArg) slots.push(slot(`bullet-${slots.length}`, 'bullet', textArg));
  }

  return orderByLocation(slots);
}

function resumeSkillSlots(body: string, offset: number): LatexTexSlot[] {
  const slots: LatexTexSlot[] = [];
  for (const match of balancedCommandArguments(body, 'resumeSubItem', offset)) {
    if (isCommented(body, match.commandStart - offset)) continue;
    const label = match.arguments[0]?.text.trim();
    const value = match.arguments[1];
    if (!label || !value) continue;
    slots.push(slot(`skill-${slots.length}`, 'skill', value));
  }

  const textbf = /\\textbf\{([^{}]+)\}\s*\{:\s*([^{}]+)\}/g;
  for (const match of body.matchAll(textbf)) {
    if (match.index === undefined || isCommented(body, match.index)) continue;
    const valueStart = match.index + match[0].indexOf(match[2]!);
    slots.push({
      id: `skill-${slots.length}`,
      kind: 'skill',
      text: match[2]!.trim(),
      start: offset + valueStart,
      end: offset + valueStart + match[2]!.length,
    });
  }

  return orderByLocation(slots);
}

function itemizeSlots(body: string, offset: number): LatexTexSlot[] {
  const slots: LatexTexSlot[] = [];
  const item = /(^|\n)(\s*)\\item\s+([^\n]+)/g;
  for (const match of body.matchAll(item)) {
    if (match.index === undefined) continue;
    const commandStart = match.index + match[1]!.length + match[2]!.length;
    if (isCommented(body, commandStart)) continue;
    const text = match[3]!;
    const itemPrefix = body.slice(commandStart).match(/^\\item\s+/)?.[0] ?? '\\item ';
    const start = offset + commandStart + itemPrefix.length;
    slots.push({
      id: `bullet-${slots.length}`,
      kind: 'bullet',
      text: text.trim(),
      start,
      end: start + text.length,
    });
  }
  return slots;
}

function slot(id: string, kind: LatexTexSlot['kind'], arg: BalancedArgument): LatexTexSlot {
  return { id, kind, text: arg.text.trim(), start: arg.start, end: arg.end };
}

function orderByLocation(slots: readonly LatexTexSlot[]): LatexTexSlot[] {
  return [...slots].sort((left, right) => left.start - right.start).map((item, index) => ({
    ...item,
    id: `${item.kind === 'skill' ? 'skill' : 'bullet'}-${index}`,
  }));
}

interface BalancedArgument {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

interface BalancedCommand {
  readonly commandStart: number;
  readonly arguments: readonly BalancedArgument[];
}

function balancedCommandArguments(body: string, command: string, offset: number): BalancedCommand[] {
  const commands: BalancedCommand[] = [];
  const marker = `\\${command}`;
  let cursor = 0;
  while (cursor < body.length) {
    const commandStart = body.indexOf(marker, cursor);
    if (commandStart === -1) break;
    let position = commandStart + marker.length;
    const args: BalancedArgument[] = [];
    while (body[position] === '{') {
      const parsed = readBalanced(body, position, offset);
      if (!parsed) break;
      args.push(parsed);
      position = parsed.end - offset + 1;
    }
    commands.push({ commandStart: offset + commandStart, arguments: args });
    cursor = Math.max(position, commandStart + marker.length);
  }
  return commands;
}

function readBalanced(body: string, openIndex: number, offset: number): BalancedArgument | undefined {
  let depth = 0;
  for (let index = openIndex; index < body.length; index += 1) {
    const char = body[index];
    const escaped = index > 0 && body[index - 1] === '\\';
    if (char === '{' && !escaped) depth += 1;
    if (char === '}' && !escaped) depth -= 1;
    if (depth === 0) {
      return {
        text: body.slice(openIndex + 1, index),
        start: offset + openIndex + 1,
        end: offset + index,
      };
    }
  }
  return undefined;
}

function isCommented(body: string, index: number): boolean {
  const lineStart = body.lastIndexOf('\n', index - 1) + 1;
  return body.slice(lineStart, index).trimStart().startsWith('%');
}

export function applyLatexTexPatches(
  latex: string,
  manifest: LatexTexPatchManifest,
): { latex: string; patchedCount: number } {
  const byId = new Map(manifest.slots.map((slot) => [slot.id, slot]));
  const replacements = manifest.patches.map((patch) => {
    const target = byId.get(patch.id);
    if (!target) throw new Error(`Patch references unknown LaTeX slot '${patch.id}'.`);
    return { ...target, text: escapeLatexText(patch.text) };
  });

  let patched = latex;
  for (const replacement of replacements.sort((left, right) => right.start - left.start)) {
    patched =
      patched.slice(0, replacement.start) + replacement.text + patched.slice(replacement.end);
  }

  return { latex: patched, patchedCount: replacements.length };
}

export function escapeLatexText(text: string): string {
  return text
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/([#$%&_{}])/g, '\\$1')
    .replace(/\^/g, '\\textasciicircum{}')
    .replace(/~/g, '\\textasciitilde{}');
}
