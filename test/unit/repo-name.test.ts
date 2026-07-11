import { describe, expect, it } from 'vitest';
import { ownerOf, parseRepoFullName } from '../../src/core/repo-name.js';

describe('parseRepoFullName', () => {
  it('小文字 owner/repo に正規化する', () => {
    expect(parseRepoFullName('Owner/Repo')).toBe('owner/repo');
  });

  it('github.com プレフィックス（スキーム有無）を除去する', () => {
    expect(parseRepoFullName('https://github.com/Foo/Bar')).toBe('foo/bar');
    expect(parseRepoFullName('github.com/Foo/Bar')).toBe('foo/bar');
  });

  it('.git 末尾を除去する', () => {
    expect(parseRepoFullName('owner/repo.git')).toBe('owner/repo');
  });

  it('クエリ・フラグメントを除去する', () => {
    expect(parseRepoFullName('Noxy3301/mitou23_docs?tab=readme-ov-file')).toBe(
      'noxy3301/mitou23_docs',
    );
    expect(parseRepoFullName('owner/repo#readme')).toBe('owner/repo');
  });

  it('末尾スラッシュ・句読点・閉じ括弧を除去する', () => {
    expect(parseRepoFullName('owner/repo/')).toBe('owner/repo');
    expect(parseRepoFullName('owner/repo).')).toBe('owner/repo');
    expect(parseRepoFullName('owner/repo,')).toBe('owner/repo');
  });

  it('サブパス付きは owner/repo のみ取り出す', () => {
    expect(parseRepoFullName('owner/repo/tree/main/docs')).toBe('owner/repo');
  });

  it('不正な入力は null', () => {
    expect(parseRepoFullName('')).toBeNull();
    expect(parseRepoFullName('   ')).toBeNull();
    expect(parseRepoFullName('single')).toBeNull();
    expect(parseRepoFullName('/repo')).toBeNull();
    expect(parseRepoFullName('owner/')).toBeNull();
  });
});

describe('ownerOf', () => {
  it('owner を返す', () => {
    const n = parseRepoFullName('owner/repo');
    expect(n).not.toBeNull();
    if (n) expect(ownerOf(n)).toBe('owner');
  });
});
