/**
 * PDF compilation (UC09), behind a port.
 *
 *   CVDocument -> LaTeX -> **PDF**
 *
 * A port for the same reason extraction and GitHub have one: the toolchain is external, slow and
 * absent on most machines, and everything upstream of it — the document, the template, the escaping —
 * must stay testable without it. A missing compiler is a reported, recoverable condition; the `.tex`
 * is always available regardless.
 *
 * **Shell escape is disabled explicitly.** `escapeLatex` already makes it impossible for user content
 * to become a command, and this makes it impossible for a missed call site there to become remote
 * code execution. Two independent barriers, because one of them is a regular expression.
 */

import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

export class CvCompilerUnavailableError extends Error {
  constructor(readonly command: string) {
    super(
      `No LaTeX toolchain: '${command}' is not available. ` +
        'The CV document and its LaTeX source are still retrievable.',
    );
    this.name = 'CvCompilerUnavailableError';
  }
}

export class CvCompilationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CvCompilationError';
  }
}

/** Turns the rendered template into PDF bytes. Implementations are a runtime's choice. */
export interface CvCompiler {
  compile(latex: string): Promise<Uint8Array>;
}

export interface PdfLatexCompilerOptions {
  /** `pdflatex` by default; `tectonic` and `xelatex` take the same arguments closely enough. */
  readonly command?: string;
  readonly timeoutMs?: number;
}

/**
 * Compile with a local LaTeX installation.
 *
 * Runs in a fresh temporary directory that is removed afterwards: a compilation leaves `.aux`,
 * `.log` and `.out` files, and none of them is Joby's state or anyone's to keep.
 */
export class PdfLatexCompiler implements CvCompiler {
  readonly #command: string;
  readonly #timeoutMs: number;

  constructor(options: PdfLatexCompilerOptions = {}) {
    this.#command = options.command ?? 'pdflatex';
    this.#timeoutMs = options.timeoutMs ?? 30_000;
  }

  async compile(latex: string): Promise<Uint8Array> {
    const directory = await mkdtemp(join(tmpdir(), 'joby-cv-'));
    const source = join(directory, 'cv.tex');

    try {
      await writeFile(source, latex, 'utf8');
      await run(
        this.#command,
        [
          '-interaction=nonstopmode',
          '-halt-on-error',
          // Never let a document run a shell command, whatever went wrong upstream.
          '-no-shell-escape',
          `-output-directory=${directory}`,
          source,
        ],
        { timeout: this.#timeoutMs, windowsHide: true },
      );
      return await readFile(join(directory, 'cv.pdf'));
    } catch (error) {
      if ((error as { code?: string }).code === 'ENOENT') {
        throw new CvCompilerUnavailableError(this.#command);
      }
      // The compiler is noisy on failure; the first error line is the useful part.
      const output = String((error as { stdout?: string }).stdout ?? (error as Error).message);
      const first = output.split('\n').find((line) => line.startsWith('!')) ?? output.slice(0, 300);
      throw new CvCompilationError(`LaTeX compilation failed: ${first.trim()}`);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
}
