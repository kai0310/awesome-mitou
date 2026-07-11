import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { README_PATH } from '../../src/config.js';
import { extractListedRepos } from '../../src/core/readme-parser.js';

describe('extractListedRepos', () => {
  it('owner/repo を正規化した Set で返す', () => {
    const set = extractListedRepos(
      '[a](https://github.com/Foo/Bar) [b](https://github.com/baz/qux.git)',
    );
    expect(set.has('foo/bar' as never)).toBe(true);
    expect(set.has('baz/qux' as never)).toBe(true);
    expect(set.size).toBe(2);
  });

  it('GitHub 以外の URL は無視する', () => {
    const set = extractListedRepos('https://example.com/foo/bar');
    expect(set.size).toBe(0);
  });

  it('実 README の既知リポジトリを過不足なく含む（回帰）', () => {
    const text = readFileSync(README_PATH, 'utf8');
    const set = extractListedRepos(text);
    for (const known of [
      'nyanko3141592/mitou_docs',
      'horizon2038/mitou-documentation',
      'mtshiba/mitou-docs',
      'noxy3301/mitou23_docs',
      'ut-ashiki-engineering/mitou',
    ]) {
      expect(set.has(known as never)).toBe(true);
    }
  });
});
