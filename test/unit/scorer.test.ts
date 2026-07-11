import { describe, expect, it } from 'vitest';
import { evaluateRepo } from '../../src/core/scoring/scorer.js';
import type { Signal } from '../../src/core/types.js';
import { makeRepo } from '../support/factory.js';

const YEAR = 2025;

function hasPenalty(signals: readonly Signal[], reason: string): boolean {
  return signals.some((s) => s.kind === 'penalty' && s.reason === reason);
}

describe('evaluateRepo — 陽性（README 掲載相当）', () => {
  it('資料リポジトリ名 + 未踏 + topic で高スコア', () => {
    const ev = evaluateRepo({
      repo: makeRepo({
        fullName: 'example/mitou-docs',
        description: '未踏IT 2024年度 提案書 成果報告書',
        topics: ['mitou'],
      }),
      codeHitTargets: [],
      currentYear: YEAR,
    });
    expect(ev.score).toBeGreaterThanOrEqual(6);
    expect(ev.confidence).not.toBe('low');
  });

  it('alive な公式リンクがあれば confidence=high', () => {
    const ev = evaluateRepo({
      repo: makeRepo({ fullName: 'example/mitou-report', description: '未踏 成果報告' }),
      codeHitTargets: [],
      currentYear: YEAR,
      enrichment: {
        readmeText: 'https://www.ipa.go.jp/jinzai/mitou/it/2024/gaiyou-ok-3.html',
        treePaths: null,
        officialLinks: [
          {
            url: 'https://www.ipa.go.jp/jinzai/mitou/it/2024/gaiyou-ok-3.html',
            category: 'it',
            fiscalYear: 2024,
            verified: 'alive',
          },
        ],
      },
    });
    expect(ev.confidence).toBe('high');
    expect(ev.classification).toEqual({ category: 'it', fiscalYear: 2024, basis: 'official-url' });
    expect(ev.enriched).toBe(true);
  });

  it('提案書ファイル + 未踏キーワードで confidence=high', () => {
    const ev = evaluateRepo({
      repo: makeRepo({ fullName: 'example/repo', description: '未踏プロジェクト' }),
      codeHitTargets: [],
      currentYear: YEAR,
      enrichment: {
        readmeText: null,
        treePaths: ['docs/提案書.pdf'],
        officialLinks: [],
      },
    });
    expect(ev.confidence).toBe('high');
  });
});

describe('evaluateRepo — confidence 境界', () => {
  it('score>=6 かつ 2 種類以上のシグナルで medium', () => {
    const ev = evaluateRepo({
      repo: makeRepo({ fullName: 'a/b', description: '未踏' }),
      codeHitTargets: ['ipa', 'mitou-jr'],
      currentYear: YEAR,
    });
    // 未踏(+3) + code-link ipa(+2) + code-link mitou-jr(+2) = 7、種別 {keyword, code-link}
    expect(ev.score).toBe(7);
    expect(ev.confidence).toBe('medium');
  });

  it('score<6 では 2 種類あっても low（境界 6）', () => {
    const ev = evaluateRepo({
      repo: makeRepo({ fullName: 'a/b', description: '未踏' }),
      codeHitTargets: ['ipa'],
      currentYear: YEAR,
    });
    expect(ev.score).toBe(5);
    expect(ev.confidence).toBe('low');
  });

  it('単一種類のキーワード偏重は score が高くても low', () => {
    const ev = evaluateRepo({
      repo: makeRepo({ fullName: 'a/b', description: '未踏 提案書 成果報告書' }),
      codeHitTargets: [],
      currentYear: YEAR,
    });
    expect(ev.score).toBeGreaterThanOrEqual(6);
    expect(ev.confidence).toBe('low');
  });
});

describe('evaluateRepo — 陰性（誤検知）', () => {
  it('水戸(mito) 地名の衝突に penalty が付き閾値未満', () => {
    const ev = evaluateRepo({
      repo: makeRepo({ fullName: 'mito-lab/mito-city', description: '水戸市のオープンデータ' }),
      codeHitTargets: [],
      currentYear: YEAR,
    });
    expect(hasPenalty(ev.signals, 'romaji-collision')).toBe(true);
    expect(ev.score).toBeLessThan(3);
  });

  it('前人未踏の慣用句に idiom penalty が付く', () => {
    const ev = evaluateRepo({
      repo: makeRepo({ fullName: 'x/challenge', description: '前人未踏のチャレンジ記録' }),
      codeHitTargets: [],
      currentYear: YEAR,
    });
    expect(hasPenalty(ev.signals, 'idiom-mitou')).toBe(true);
    expect(ev.score).toBeLessThan(3);
  });

  it('fork には fork penalty', () => {
    const ev = evaluateRepo({
      repo: makeRepo({ fullName: 'x/mitou-docs', description: '未踏', isFork: true }),
      codeHitTargets: [],
      currentYear: YEAR,
    });
    expect(hasPenalty(ev.signals, 'fork')).toBe(true);
  });

  it('まとめ系リポジトリに aggregation penalty', () => {
    const ev = evaluateRepo({
      repo: makeRepo({ fullName: 'x/awesome-mitou', description: '未踏まとめ' }),
      codeHitTargets: [],
      currentYear: YEAR,
    });
    expect(hasPenalty(ev.signals, 'aggregation-list')).toBe(true);
  });

  it('archived かつ未踏語なしで archived-stale penalty', () => {
    const ev = evaluateRepo({
      repo: makeRepo({ fullName: 'x/oldtool', description: 'legacy tool', isArchived: true }),
      codeHitTargets: [],
      currentYear: YEAR,
    });
    expect(hasPenalty(ev.signals, 'archived-stale')).toBe(true);
  });
});

describe('evaluateRepo — シグナル種別', () => {
  it('code-link と topic を反映する', () => {
    const ev = evaluateRepo({
      repo: makeRepo({ fullName: 'x/repo', topics: ['mitou'] }),
      codeHitTargets: ['ipa', 'mitou-jr'],
      currentYear: YEAR,
    });
    expect(ev.signals.some((s) => s.kind === 'code-link' && s.target === 'ipa')).toBe(true);
    expect(ev.signals.some((s) => s.kind === 'code-link' && s.target === 'mitou-jr')).toBe(true);
    expect(ev.signals.some((s) => s.kind === 'topic')).toBe(true);
  });

  it('dead な公式リンクは重み 0', () => {
    const ev = evaluateRepo({
      repo: makeRepo({ fullName: 'x/repo', description: '未踏' }),
      codeHitTargets: [],
      currentYear: YEAR,
      enrichment: {
        readmeText: null,
        treePaths: null,
        officialLinks: [
          {
            url: 'https://www.ipa.go.jp/jinzai/mitou/it/2024/x.html',
            category: 'it',
            fiscalYear: 2024,
            verified: 'dead',
          },
        ],
      },
    });
    const official = ev.signals.find((s) => s.kind === 'official-link');
    expect(official?.weight).toBe(0);
  });
});
