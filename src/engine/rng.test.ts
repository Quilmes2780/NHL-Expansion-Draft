import { describe, expect, it } from 'vitest';
import { Rng, rngFor } from './rng';

describe('Rng', () => {
  it('is reproducible per seed', () => {
    const a = new Rng('abc');
    const b = new Rng('abc');
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('differs between seeds and sub-streams', () => {
    expect(new Rng('abc').next()).not.toBe(new Rng('abd').next());
    expect(rngFor('s', 'gen').next()).not.toBe(rngFor('s', 'sim').next());
  });

  it('produces values in range with sensible moments', () => {
    const r = new Rng('moments');
    let sum = 0;
    let sumN = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) {
      const x = r.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      sum += x;
      sumN += r.normal(0, 1);
      const k = r.int(3, 5);
      expect(k).toBeGreaterThanOrEqual(3);
      expect(k).toBeLessThanOrEqual(5);
    }
    expect(sum / n).toBeCloseTo(0.5, 1);
    expect(sumN / n).toBeCloseTo(0, 1);
  });

  it('poisson mean matches lambda', () => {
    const r = new Rng('poisson');
    let s = 0;
    for (let i = 0; i < 20000; i++) s += r.poisson(3);
    expect(s / 20000).toBeCloseTo(3, 1);
  });
});
