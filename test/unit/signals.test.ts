import { describe, expect, it } from 'vitest';
import { PIPELINE } from '../../src/config.js';
import {
  extractDocSignals,
  extractKeywordSignals,
  extractOfficialUrls,
  extractPenalties,
} from '../../src/core/scoring/signals.js';
import { makeRepo } from '../support/factory.js';

describe('extractKeywordSignals', () => {
  it('README 由来は重みが半分（切り上げ）', () => {
    const meta = extractKeywordSignals('未踏', 'metadata');
    const readme = extractKeywordSignals('未踏', 'readme');
    expect(meta[0]?.weight).toBe(3);
    const r = readme[0];
    expect(r?.weight).toBe(2); // ceil(3/2)
    expect(r?.kind === 'keyword' && r.field === 'readme').toBe(true);
  });
});

describe('extractDocSignals', () => {
  it('合計重みを docFileWeightCap でキャップする', () => {
    const paths = [
      'a/提案書.pdf',
      'b/成果報告書.pdf',
      'c/二次面接スライド.pdf',
      'd/extra.pdf',
      'e/more.pptx',
    ];
    const signals = extractDocSignals(paths);
    const total = signals.reduce((s, x) => s + x.weight, 0);
    expect(total).toBeLessThanOrEqual(PIPELINE.docFileWeightCap);
  });

  it('資料でないパスは無視する', () => {
    expect(extractDocSignals(['src/index.ts', 'README.md'])).toEqual([]);
  });
});

describe('extractOfficialUrls', () => {
  it('README 本文から公式 URL を抽出し区分・年度を付与', () => {
    const found = extractOfficialUrls(
      'ref https://www.ipa.go.jp/jinzai/mitou/it/2024/gaiyou-ok-3.html end',
      2025,
    );
    expect(found).toEqual([
      {
        url: 'https://www.ipa.go.jp/jinzai/mitou/it/2024/gaiyou-ok-3.html',
        category: 'it',
        fiscalYear: 2024,
      },
    ]);
  });

  it('非公式 URL は含めない', () => {
    expect(extractOfficialUrls('https://example.com/foo', 2025)).toEqual([]);
  });
});

describe('extractPenalties', () => {
  it('公式語があれば idiom penalty を付けない', () => {
    const repo = makeRepo({ fullName: 'x/y', description: '前人未踏 提案書' });
    const penalties = extractPenalties({
      repo,
      metadataText: 'x/y\n前人未踏 提案書\n',
      readmeText: null,
    });
    expect(penalties.some((p) => p.kind === 'penalty' && p.reason === 'idiom-mitou')).toBe(false);
  });
});
