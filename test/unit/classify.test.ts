import { describe, expect, it } from 'vitest';
import { classifyCandidate, classifyFromUrl } from '../../src/core/scoring/classify.js';

const YEAR = 2025;

describe('classifyFromUrl', () => {
  it('IPA 現行 URL から区分・年度を抽出する', () => {
    expect(
      classifyFromUrl('https://www.ipa.go.jp/jinzai/mitou/it/2024/gaiyou-ok-3.html', YEAR),
    ).toEqual({ category: 'it', fiscalYear: 2024 });
  });

  it('IPA archive 形式に対応する', () => {
    expect(
      classifyFromUrl('https://www.ipa.go.jp/archive/jinzai/mitou/target/2020/index.html', YEAR),
    ).toEqual({ category: 'target', fiscalYear: 2020 });
  });

  it('未踏ジュニア URL は junior', () => {
    expect(classifyFromUrl('https://jr.mitou.org/projects/2023/foo', YEAR)).toEqual({
      category: 'junior',
      fiscalYear: 2023,
    });
  });

  it('年度が範囲外なら null', () => {
    expect(classifyFromUrl('https://www.ipa.go.jp/jinzai/mitou/it/2099/x.html', YEAR)).toBeNull();
    expect(classifyFromUrl('https://jr.mitou.org/projects/2099/x', YEAR)).toBeNull();
  });

  it('非公式 URL は null', () => {
    expect(classifyFromUrl('https://example.com/mitou/it/2024/', YEAR)).toBeNull();
  });
});

describe('classifyCandidate', () => {
  it('公式 URL を最優先（basis=official-url）', () => {
    const c = classifyCandidate({
      text: '未踏ジュニア 2019年度',
      officialUrls: ['https://www.ipa.go.jp/jinzai/mitou/it/2024/gaiyou-ok-3.html'],
      currentYear: YEAR,
    });
    expect(c).toEqual({ category: 'it', fiscalYear: 2024, basis: 'official-url' });
  });

  it('URL が無ければテキストパターン（basis=text-pattern）', () => {
    const c = classifyCandidate({
      text: '未踏ターゲット事業 2022年度 の成果',
      officialUrls: [],
      currentYear: YEAR,
    });
    expect(c).toEqual({ category: 'target', fiscalYear: 2022, basis: 'text-pattern' });
  });

  it('mitou24 形式の年度（2桁）を解釈する', () => {
    const c = classifyCandidate({ text: 'mitou24 project', officialUrls: [], currentYear: YEAR });
    expect(c.fiscalYear).toBe(2024);
    expect(c.basis).toBe('text-pattern');
  });

  it('範囲外年度（1999）は棄却しつつ区分は残る', () => {
    const c = classifyCandidate({
      text: '未踏IT 1999年度',
      officialUrls: [],
      currentYear: YEAR,
    });
    expect(c.category).toBe('it');
    expect(c.fiscalYear).toBeNull();
  });

  it('手掛かりが無ければ全て null', () => {
    expect(
      classifyCandidate({ text: 'ただのリポジトリ', officialUrls: [], currentYear: YEAR }),
    ).toEqual({
      category: null,
      fiscalYear: null,
      basis: null,
    });
  });
});
