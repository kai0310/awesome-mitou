import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { RepoFullName } from '../../src/core/types.js';
import { FakeClock } from '../../src/infra/clock.js';
import { type CommandRunner, GhCliClient } from '../../src/infra/github/gh-cli-client.js';
import { MemoryLogger } from '../../src/infra/logger.js';

function fixture(name: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../fixtures/github/${name}`, import.meta.url)),
    'utf8',
  );
}

/** gh api のパスに応じて記録済みフィクスチャを返す fake。ネットワーク・実 gh を一切使わない。 */
class FixtureRunner implements CommandRunner {
  readonly calls: string[][] = [];
  constructor(private readonly routes: Record<string, string>) {}

  run(_file: string, args: readonly string[]): Promise<string> {
    this.calls.push([...args]);
    const path = args[3] ?? '';
    const body = this.routes[path];
    if (body === undefined) {
      const err = Object.assign(new Error('not found'), {
        stderr: 'gh: Not Found (HTTP 404)',
        code: 1,
      });
      return Promise.reject(err);
    }
    return Promise.resolve(body);
  }
}

function makeClient(routes: Record<string, string>): {
  client: GhCliClient;
  runner: FixtureRunner;
  logger: MemoryLogger;
} {
  const runner = new FixtureRunner(routes);
  const logger = new MemoryLogger();
  const client = new GhCliClient({ runner, clock: new FakeClock(), logger });
  return { client, runner, logger };
}

const name = (s: string) => s as RepoFullName;

describe('GhCliClient', () => {
  it('searchRepositories を RepoSummary に変換する', async () => {
    const { client } = makeClient({ 'search/repositories': fixture('search-repositories.json') });
    const repos = await client.searchRepositories('mitou', { pages: 1 });
    expect(repos).toHaveLength(2);
    const first = repos[0];
    expect(first?.fullName).toBe('example-user/mitou-docs');
    expect(first?.topics).toContain('mitou');
    // description が null のリポジトリは空文字にフォールバック
    expect(repos[1]?.description).toBe('');
  });

  it('searchCode は正規化済み RepoFullName を返す', async () => {
    const { client } = makeClient({ 'search/code': fixture('search-code.json') });
    const hits = await client.searchCode('ipa.go.jp/jinzai/mitou');
    expect(hits).toEqual(['example-user/code-hit-repo']);
  });

  it('searchCode は失敗しても空配列で続行する', async () => {
    const { client, logger } = makeClient({}); // ルート無し → 404
    const hits = await client.searchCode('jr.mitou.org');
    expect(hits).toEqual([]);
    expect(logger.messages.some((m) => m.level === 'warn')).toBe(true);
  });

  it('getReadmeText は base64 をデコードする', async () => {
    const { client } = makeClient({
      'repos/example-user/code-hit-repo/readme': fixture('readme.json'),
    });
    const text = await client.getReadmeText(name('example-user/code-hit-repo'));
    expect(text).toContain('未踏IT 2024年度');
    expect(text).toContain('https://www.ipa.go.jp/jinzai/mitou/it/2024/');
  });

  it('getReadmeText は 404 で null', async () => {
    const { client } = makeClient({});
    expect(await client.getReadmeText(name('a/b'))).toBeNull();
  });

  it('listTreePaths はパス一覧を返す', async () => {
    const { client } = makeClient({
      'repos/example-user/code-hit-repo/git/trees/HEAD': fixture('tree.json'),
    });
    const paths = await client.listTreePaths(name('example-user/code-hit-repo'));
    expect(paths).toContain('docs/提案書.pdf');
  });

  it('getRepository は単一 repo を変換する', async () => {
    const { client } = makeClient({
      'repos/example-user/code-hit-repo': fixture('repo.json'),
    });
    const repo = await client.getRepository(name('example-user/code-hit-repo'));
    expect(repo?.fullName).toBe('example-user/code-hit-repo');
    expect(repo?.stars).toBe(7);
  });

  it('壊れた JSON 形状は zod エラーになる', async () => {
    const { client } = makeClient({ 'search/repositories': '{"items": [{"foo": 1}]}' });
    await expect(client.searchRepositories('x')).rejects.toThrow();
  });
});
