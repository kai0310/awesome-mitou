import { describe, expect, it } from 'vitest';
import { decideExclusion } from '../../src/core/exclusion.js';
import type { RepoFullName } from '../../src/core/types.js';
import { normalizeLists } from '../../src/infra/lists-store.js';
import { fullName, makeRepo } from '../support/factory.js';

const emptyCtx = () => ({
  listedRepos: new Set<RepoFullName>(),
  lists: normalizeLists({ blockedOwners: [], blockedRepos: [], acceptedRepos: [] }),
  selfRepos: new Set<RepoFullName>(),
});

describe('decideExclusion', () => {
  it('除外要因がなければ null', () => {
    expect(decideExclusion(makeRepo({ fullName: 'a/b' }), emptyCtx())).toBeNull();
  });

  it('self を最優先で除外する', () => {
    const ctx = emptyCtx();
    (ctx.selfRepos as Set<RepoFullName>).add(fullName('kai0310/awesome-mitou'));
    expect(decideExclusion(makeRepo({ fullName: 'Kai0310/Awesome-Mitou' }), ctx)).toEqual({
      kind: 'self',
    });
  });

  it('README 掲載済みを除外する（大文字小文字非依存）', () => {
    const ctx = emptyCtx();
    (ctx.listedRepos as Set<RepoFullName>).add(fullName('foo/bar'));
    expect(decideExclusion(makeRepo({ fullName: 'Foo/Bar' }), ctx)).toEqual({
      kind: 'already-listed',
    });
  });

  it('accepted / blocked-repo / blocked-owner を判定する', () => {
    const ctx = {
      listedRepos: new Set<RepoFullName>(),
      lists: normalizeLists({
        blockedOwners: ['EvilOrg'],
        blockedRepos: ['bad/repo'],
        acceptedRepos: ['ok/repo'],
      }),
      selfRepos: new Set<RepoFullName>(),
    };
    expect(decideExclusion(makeRepo({ fullName: 'ok/repo' }), ctx)).toEqual({ kind: 'accepted' });
    expect(decideExclusion(makeRepo({ fullName: 'bad/repo' }), ctx)).toEqual({
      kind: 'blocked-repo',
    });
    expect(decideExclusion(makeRepo({ fullName: 'evilorg/anything' }), ctx)).toEqual({
      kind: 'blocked-owner',
      owner: 'evilorg',
    });
  });
});
