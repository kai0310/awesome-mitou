import { describe, expect, it, vi } from 'vitest';
import { type DiscoverDeps, runDiscover } from '../../src/cli/discover.js';
import { runMain } from '../../src/cli/main.js';
import { candidatesSchema } from '../../src/core/candidate-schema.js';
import { toCandidateOutput } from '../../src/core/render.js';
import type { RepoFullName, RepoSummary } from '../../src/core/types.js';
import { FakeClock } from '../../src/infra/clock.js';
import type { GitHubClient } from '../../src/infra/github/client.js';
import { normalizeLists } from '../../src/infra/lists-store.js';
import type { ListsStore } from '../../src/infra/lists-store.js';
import { MemoryLogger } from '../../src/infra/logger.js';
import { makeRepo } from '../support/factory.js';

class FakeGitHub implements GitHubClient {
  constructor(
    private readonly repos: RepoSummary[],
    private readonly codeHits: Record<string, RepoFullName[]>,
    private readonly extraRepos: Record<string, RepoSummary>,
    private readonly readmes: Record<string, string>,
    private readonly trees: Record<string, string[]>,
  ) {}

  searchRepositories(): Promise<RepoSummary[]> {
    return Promise.resolve(this.repos);
  }
  searchCode(query: string): Promise<RepoFullName[]> {
    return Promise.resolve(this.codeHits[query] ?? []);
  }
  getRepository(nameArg: RepoFullName): Promise<RepoSummary | null> {
    return Promise.resolve(this.extraRepos[nameArg] ?? null);
  }
  getReadmeText(nameArg: RepoFullName): Promise<string | null> {
    return Promise.resolve(this.readmes[nameArg] ?? null);
  }
  listTreePaths(nameArg: RepoFullName): Promise<string[] | null> {
    return Promise.resolve(this.trees[nameArg] ?? null);
  }
}

class FakeListsStore implements ListsStore {
  private readonly raw = { blockedOwners: [], blockedRepos: ['blocked/repo'], acceptedRepos: [] };
  readRaw() {
    return { ...this.raw };
  }
  loadNormalized() {
    return normalizeLists(this.raw);
  }
}

function buildDeps(): DiscoverDeps {
  const positive = makeRepo({
    fullName: 'example/mitou-docs',
    description: '未踏IT 2024年度 提案書 成果報告書',
    topics: ['mitou'],
    stars: 30,
  });
  const listed = makeRepo({
    fullName: 'listed/repo',
    description: '未踏 提案書',
    topics: ['mitou'],
  });
  const blocked = makeRepo({
    fullName: 'blocked/repo',
    description: '未踏 提案書',
    topics: ['mitou'],
  });
  const negative = makeRepo({
    fullName: 'mito-lab/mito-city',
    description: '水戸市のオープンデータ',
  });
  const codeOnly = makeRepo({ fullName: 'codeonly/repo', description: '未踏 IPA 資料' });

  const github = new FakeGitHub(
    [positive, listed, blocked, negative],
    { 'ipa.go.jp/jinzai/mitou': ['codeonly/repo' as RepoFullName] },
    { 'codeonly/repo': codeOnly },
    {
      'example/mitou-docs':
        'IPA 未踏 https://www.ipa.go.jp/jinzai/mitou/it/2024/gaiyou-ok-3.html 提案書',
    },
    { 'example/mitou-docs': ['docs/提案書.pdf', 'docs/成果報告書.pdf'] },
  );

  return {
    github,
    lists: new FakeListsStore(),
    clock: new FakeClock(),
    logger: new MemoryLogger(),
    readReadme: () => '[listed](https://github.com/listed/repo)',
    verifyOfficialLink: (url) =>
      Promise.resolve(url.includes('ipa.go.jp') ? 'alive' : 'unverified'),
    currentYear: 2025,
  };
}

describe('runDiscover (integration, all ports faked)', () => {
  it('候補を検出し snake_case JSON 契約で出力できる', async () => {
    const result = await runDiscover(buildDeps(), { minScore: 3, limit: 50, enrich: true });
    const names = result.candidates.map((c) => c.repo.fullName);

    expect(names).toContain('example/mitou-docs');
    expect(names).toContain('codeonly/repo');
    expect(names).not.toContain('listed/repo');
    expect(names).not.toContain('blocked/repo');
    expect(names).not.toContain('mito-lab/mito-city');

    const json = result.candidates.map(toCandidateOutput);
    const parsed = candidatesSchema.safeParse(json);
    expect(parsed.success).toBe(true);

    const top = result.candidates.find((c) => c.repo.fullName === 'example/mitou-docs');
    expect(top?.confidence).toBe('high');
    expect(top?.classification.category).toBe('it');
  });

  it('除外理由を返す', async () => {
    const result = await runDiscover(buildDeps(), { minScore: 3, limit: 50, enrich: true });
    const kinds = result.excluded.map((e) => e.reason.kind);
    expect(kinds).toContain('already-listed');
    expect(kinds).toContain('blocked-repo');
  });

  it('--no-enrich 相当（enrich=false）では enrichment を行わない', async () => {
    const result = await runDiscover(buildDeps(), { minScore: 3, limit: 50, enrich: false });
    const top = result.candidates.find((c) => c.repo.fullName === 'example/mitou-docs');
    expect(top?.enriched).toBe(false);
  });
});

describe('runMain exit codes', () => {
  it('--help は 0', async () => {
    const spy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    expect(await runMain(['--help'])).toBe(0);
    spy.mockRestore();
  });

  it('未知サブコマンドは 2', async () => {
    const spy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    expect(await runMain(['bogus'])).toBe(2);
    spy.mockRestore();
  });

  it('未知フラグは 2', async () => {
    const spy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    expect(await runMain(['discover', '--nope'])).toBe(2);
    spy.mockRestore();
  });

  it('不正な数値引数は 2', async () => {
    const spy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    expect(await runMain(['discover', '--min-score', 'abc'])).toBe(2);
    spy.mockRestore();
  });
});
