import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { README_PATH } from '../../src/config.js';
import { extractUrls } from '../../src/core/url-extractor.js';

describe('extractUrls', () => {
  it('末尾句読点・閉じ括弧を除去する', () => {
    expect(extractUrls('see (https://example.com/a).').map((u) => u.url)).toEqual([
      'https://example.com/a',
    ]);
    expect(extractUrls('末尾: https://example.com/b、次').map((u) => u.url)).toEqual([
      'https://example.com/b',
    ]);
  });

  it('重複を排除し出現順を保つ', () => {
    const urls = extractUrls('https://a.example https://b.example https://a.example');
    expect(urls.map((u) => u.url)).toEqual(['https://a.example', 'https://b.example']);
  });

  it('http/https 以外は拾わない', () => {
    expect(extractUrls('ftp://x mailto:y@z')).toEqual([]);
  });

  it('実 README から URL を抽出できる（回帰）', () => {
    const text = readFileSync(README_PATH, 'utf8');
    const urls = extractUrls(text).map((u) => u.url);
    expect(urls).toContain('https://www.ipa.go.jp/jinzai/mitou/it/2024/gaiyou-ok-3.html');
    expect(urls.length).toBeGreaterThan(5);
    // 末尾に句読点や閉じ括弧が残っていないこと
    for (const u of urls) expect(u).not.toMatch(/[).,;:]$/);
  });
});
