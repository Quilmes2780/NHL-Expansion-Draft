import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** The engine must stay UI-free and deterministic. */
function engineFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return engineFiles(p);
    return p.endsWith('.ts') && !p.endsWith('.test.ts') ? [p] : [];
  });
}

describe('engine architecture', () => {
  const files = engineFiles(join(process.cwd(), 'src', 'engine'));

  it('has source files', () => expect(files.length).toBeGreaterThan(5));

  for (const forbidden of [/from ['"]react/, /from ['"]zustand/, /from ['"]\.\.\/\.\.\/ui/, /from ['"]\.\.\/store/]) {
    it(`does not import ${forbidden}`, () => {
      for (const f of files) expect(readFileSync(f, 'utf8'), f).not.toMatch(forbidden);
    });
  }

  it('does not use unseeded randomness, wall-clock time or the DOM', () => {
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/Math\.random|Date\.now|new Date\(|\bwindow\.|\bdocument\.|localStorage/);
    }
  });
});
