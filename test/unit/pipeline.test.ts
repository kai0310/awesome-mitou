import { describe, expect, it } from 'vitest';
import { rankCandidates, selectEnrichmentTargets } from '../../src/core/pipeline.js';
import type { Confidence, Evaluation } from '../../src/core/types.js';
import { makeRepo } from '../support/factory.js';

function ev(name: string, score: number, confidence: Confidence, stars = 0): Evaluation {
  return {
    repo: makeRepo({ fullName: name, stars }),
    score,
    confidence,
    signals: [],
    classification: { category: null, fiscalYear: null, basis: null },
    enriched: false,
  };
}

describe('selectEnrichmentTargets', () => {
  it('閾値未満を除外し上位 maxEnrich 件に絞る', () => {
    const evals = [ev('a/1', 5, 'low'), ev('a/2', 1, 'low'), ev('a/3', 3, 'low')];
    const selected = selectEnrichmentTargets(evals, { enrichThreshold: 2, maxEnrich: 1 });
    expect(selected).toHaveLength(1);
    expect(selected[0]?.repo.fullName).toBe('a/1');
  });
});

describe('rankCandidates', () => {
  it('confidence 降順 → score 降順 → stars 降順で並べる', () => {
    const evals = [
      ev('a/low', 10, 'low', 100),
      ev('a/high', 4, 'high', 0),
      ev('a/med1', 8, 'medium', 5),
      ev('a/med2', 8, 'medium', 50),
    ];
    const ranked = rankCandidates(evals, { minScore: 0, limit: 10 });
    expect(ranked.map((e) => e.repo.fullName)).toEqual(['a/high', 'a/med2', 'a/med1', 'a/low']);
  });

  it('minScore 未満を除外し limit で絞る', () => {
    const evals = [ev('a/1', 5, 'low'), ev('a/2', 2, 'low'), ev('a/3', 4, 'low')];
    const ranked = rankCandidates(evals, { minScore: 3, limit: 1 });
    expect(ranked).toHaveLength(1);
    expect(ranked[0]?.repo.fullName).toBe('a/1');
  });
});
