import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { extractPdfText, PdfTextExtractionError, PdfTextExtractorUnavailableError } from './pdf-text';

describe('PDF text extraction', () => {
  it('passes the original PDF through a temporary file and returns Poppler text unchanged', async () => {
    let received: Buffer | undefined;
    const text = await extractPdfText(Buffer.from('%PDF-example'), async (path) => {
      received = await readFile(path);
      return Buffer.from('Name                     Experience\nAda Lovelace             Engineer\n');
    });
    expect(received?.toString()).toBe('%PDF-example');
    expect(text.toString()).toContain('Name                     Experience');
  });

  it('fails clearly when Poppler is unavailable or a PDF has no text layer', async () => {
    const missing = Object.assign(new Error('not found'), { code: 'ENOENT' });
    await expect(extractPdfText(Buffer.from('%PDF'), async () => { throw missing; }))
      .rejects.toBeInstanceOf(PdfTextExtractorUnavailableError);
    await expect(extractPdfText(Buffer.from('%PDF'), async () => Buffer.from('   ')))
      .rejects.toBeInstanceOf(PdfTextExtractionError);
  });
});
