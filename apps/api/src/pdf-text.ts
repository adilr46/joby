import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const MAX_EXTRACTED_BYTES = 16 * 1024 * 1024;

export class PdfTextExtractorUnavailableError extends Error {
  constructor() {
    super('PDF import needs Poppler pdftotext. Install Poppler and ensure pdftotext is on PATH, then try again.');
    this.name = 'PdfTextExtractorUnavailableError';
  }
}

export class PdfTextExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PdfTextExtractionError';
  }
}

export type PdfTextCommand = (inputPath: string) => Promise<Buffer>;

function runPdftotext(inputPath: string): Promise<Buffer> {
  const command = process.env.PDFTOTEXT_PATH || 'pdftotext';
  return new Promise((resolve, reject) => {
    execFile(command, ['-layout', inputPath, '-'], {
      encoding: 'buffer',
      timeout: 30_000,
      maxBuffer: MAX_EXTRACTED_BYTES,
      windowsHide: true,
    }, (error, stdout) => {
      if (error) return reject(error);
      resolve(Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout));
    });
  });
}

/** Extract a born-digital PDF's existing text layer without reflowing its columns. */
export async function extractPdfText(pdf: Buffer, command: PdfTextCommand = runPdftotext): Promise<Buffer> {
  const directory = await mkdtemp(join(tmpdir(), 'joby-pdf-'));
  const inputPath = join(directory, 'source.pdf');
  try {
    await writeFile(inputPath, pdf, { mode: 0o600 });
    let text: Buffer;
    try {
      text = await command(inputPath);
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
        throw new PdfTextExtractorUnavailableError();
      }
      throw new PdfTextExtractionError('Joby could not read text from this PDF. Export a text-layer PDF and try again.');
    }
    if (text.byteLength === 0 || text.toString('utf8').trim().length === 0) {
      throw new PdfTextExtractionError('No text was found in this PDF. It may be scanned or image-only; export a text-layer PDF and try again.');
    }
    return text;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
