import { describe, expect, it } from 'vitest';
import { candidateSchema } from '../../src/core/candidate-schema.js';
import {
  renderCandidatesMarkdown,
  renderExplain,
  toCandidateOutput,
} from '../../src/core/render.js';
import type { Evaluation } from '../../src/core/types.js';
import { makeRepo } from '../support/factory.js';

function sample(): Evaluation {
  return {
    repo: makeRepo({
      fullName: 'example/mitou-docs',
      displayName: 'example/mitou-docs',
      description: '  未踏IT   2024年度  ',
      stars: 42,
    }),
    score: 11,
    confidence: 'high',
    signals: [
      {
        kind: 'keyword',
        ruleId: 'mitou-kanji',
        field: 'metadata',
        label: '「未踏」を含む',
        weight: 3,
      },
      { kind: 'topic', topic: 'mitou', weight: 3 },
      {
        kind: 'official-link',
        category: 'it',
        fiscalYear: 2024,
        url: 'https://www.ipa.go.jp/x',
        verified: 'alive',
        weight: 6,
      },
      { kind: 'penalty', reason: 'fork', label: 'fork（原本が候補になる）', weight: -3 },
    ],
    classification: { category: 'it', fiscalYear: 2024, basis: 'official-url' },
    enriched: true,
  };
}

describe('toCandidateOutput', () => {
  it('snake_case 契約に一致し description を正規化する', () => {
    const out = toCandidateOutput(sample());
    expect(out.description).toBe('未踏IT 2024年度');
    expect(out.full_name).toBe('example/mitou-docs');
    expect(out.category).toBe('it');
    expect(out.fiscal_year).toBe(2024);
    expect(candidateSchema.safeParse(out).success).toBe(true);
  });

  it('reasons は重複排除された表示ラベル', () => {
    const out = toCandidateOutput(sample());
    expect(out.reasons).toContain('「未踏」を含む');
    expect(out.reasons).toContain('topic: mitou');
    expect(new Set(out.reasons).size).toBe(out.reasons.length);
  });
});

describe('renderCandidatesMarkdown', () => {
  it('空なら定型文', () => {
    expect(renderCandidatesMarkdown([])).toBe(
      '新しい未踏関連リポジトリの候補は見つかりませんでした。',
    );
  });

  it('候補一覧のスナップショット', () => {
    expect(renderCandidatesMarkdown([sample()])).toMatchSnapshot();
  });
});

describe('renderExplain', () => {
  it('スコア内訳を出す', () => {
    const text = renderExplain(sample());
    expect(text).toContain('example/mitou-docs');
    expect(text).toContain('+3');
    expect(text).toContain('-3');
  });
});
