import { describe, expect, it } from 'vitest';

import {
  applyLatexTexPatches,
  extractLatexTexContent,
  resolveLatexTexSource,
} from '@joby/translation/adaptation';

describe('latex-tex adaptation surface', () => {
  it('resolves the user-owned source without making cv.md authoritative', () => {
    expect(
      resolveLatexTexSource({
        profileYaml: ['candidate: Ada', 'latex:', '  source: docs/ada.tex'].join('\n'),
        existingFiles: ['resume.tex', 'cv.tex', 'cv.md'],
      }),
    ).toEqual({ source: 'docs/ada.tex' });

    expect(resolveLatexTexSource({ existingFiles: ['cv.md', 'resume.tex'] })).toEqual({
      source: 'resume.tex',
    });

    expect(resolveLatexTexSource({ existingFiles: ['cv.md'] })).toMatchObject({
      error: 'No LaTeX CV source found.',
      hint: 'Add resume.tex, cv.tex, or set config/profile.yml latex.source.',
    });
  });

  it('extracts editable resumeSubheading prose from the body only', () => {
    const latex = String.raw`
\newcommand{\resumeItem}[1]{\item #1}
\begin{document}
\resumeSubheading{Acme}{2025}{Engineer}{Dubai}
\begin{itemize}
  \resumeItem{Built queue tooling in TypeScript for operations teams}
  % \resumeItem{Old commented bullet that must stay inert}
  \resumeItemWithoutTitle{}{Reduced manual reconciliation work}
  \textbf{Languages}{: TypeScript, SQL}
\end{itemize}
\end{document}`;

    const manifest = extractLatexTexContent(latex);

    expect(manifest.supported).toBe(true);
    expect(manifest.family).toBe('resumeSubheading');
    expect(manifest.slots.map((slot) => slot.text)).toEqual([
      'Built queue tooling in TypeScript for operations teams',
      'Reduced manual reconciliation work',
      'TypeScript, SQL',
    ]);
    expect(manifest.slots.map((slot) => slot.kind)).toEqual(['bullet', 'bullet', 'skill']);
    expect(manifest.slots.map((slot) => slot.text).join(' ')).not.toMatch(/Old commented/);
  });

  it('extracts tabularx itemize bodies when resume macros are absent', () => {
    const latex = String.raw`
\begin{document}
\begin{tabularx}{\linewidth}{X}
\begin{itemize}
\item Built a planning dashboard for support teams
\item Reworked SQL reporting for faster weekly reviews
\end{itemize}
\end{tabularx}
\end{document}`;

    const manifest = extractLatexTexContent(latex);

    expect(manifest.supported).toBe(true);
    expect(manifest.family).toBe('tabularx-itemize');
    expect(manifest.slots.map((slot) => slot.text)).toEqual([
      'Built a planning dashboard for support teams',
      'Reworked SQL reporting for faster weekly reviews',
    ]);
  });

  it('patches only slot text and escapes replacement prose', () => {
    const latex = String.raw`
\begin{document}
\resumeSubheading{Acme}{2025}{Engineer}{Dubai}
\resumeItem{Built queue tooling in TypeScript for operations teams}
\end{document}`;
    const manifest = extractLatexTexContent(latex);

    const patched = applyLatexTexPatches(latex, {
      slots: manifest.slots,
      patches: [
        {
          id: 'bullet-0',
          text: 'Built TypeScript queue tooling for risk & operations teams',
        },
      ],
    });

    expect(patched.patchedCount).toBe(1);
    expect(patched.latex).toContain('Acme');
    expect(patched.latex).toContain('risk \\& operations');
    expect(patched.latex).not.toContain('Built queue tooling in TypeScript for operations teams');
  });

  it('stops on unsupported layouts with the career-ops latex fallback hint', () => {
    const manifest = extractLatexTexContent(String.raw`
\begin{document}
\section{Experience}
Plain prose without supported bullet slots.
\end{document}`);

    expect(manifest).toMatchObject({
      supported: false,
      error: 'Unsupported LaTeX CV layout.',
      hint: 'Use /career-ops latex to render from cv.md through the career-ops template.',
    });
  });
});
