import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parseRepoFullName } from '../../core/repo-name.js';
import type { RepoFullName, RepoSummary } from '../../core/types.js';
import type { Clock } from '../clock.js';
import { SystemClock } from '../clock.js';
import type { Logger } from '../logger.js';
import { StderrLogger } from '../logger.js';
import {
  GitHubApiError,
  type GitHubClient,
  ghRepoSchema,
  readmeResponseSchema,
  searchCodeResponseSchema,
  searchReposResponseSchema,
  toRepoSummary,
  treeResponseSchema,
} from './client.js';
import { withRetry } from './retry.js';

const MAX_BUFFER = 20 * 1024 * 1024;
const README_MAX_CHARS = 100 * 1024;

export interface CommandRunner {
  /** 成功時は stdout を返す。非ゼロ終了時は stderr/code を持つエラーを throw する。 */
  run(file: string, args: readonly string[], opts?: { maxBuffer?: number }): Promise<string>;
}

const execFileAsync = promisify(execFile);

/** execFile による本番用 CommandRunner。 */
export class ExecFileCommandRunner implements CommandRunner {
  async run(
    file: string,
    args: readonly string[],
    opts: { maxBuffer?: number } = {},
  ): Promise<string> {
    const { stdout } = await execFileAsync(file, [...args], {
      encoding: 'utf8',
      maxBuffer: opts.maxBuffer ?? MAX_BUFFER,
    });
    return stdout;
  }
}

interface GhApiParams {
  [key: string]: string | number;
}

export interface GhCliClientDeps {
  runner?: CommandRunner;
  clock?: Clock;
  logger?: Logger;
}

/** gh CLI（gh api）経由で GitHub API を叩く GitHubClient 実装。 */
export class GhCliClient implements GitHubClient {
  private readonly runner: CommandRunner;
  private readonly clock: Clock;
  private readonly logger: Logger;

  constructor(deps: GhCliClientDeps = {}) {
    this.runner = deps.runner ?? new ExecFileCommandRunner();
    this.clock = deps.clock ?? new SystemClock();
    this.logger = deps.logger ?? new StderrLogger();
  }

  private toApiError(err: unknown, context: string): GitHubApiError {
    const stderr = extractStderr(err);
    const statusMatch = /HTTP (\d{3})/.exec(stderr);
    const status = statusMatch?.[1] ? Number(statusMatch[1]) : null;
    const retryAfterMatch = /retry-after:\s*(\d+)/i.exec(stderr);
    const retryAfterSeconds = retryAfterMatch?.[1] ? Number(retryAfterMatch[1]) : null;
    return new GitHubApiError(`gh api ${context} 失敗: ${stderr.trim() || 'unknown error'}`, {
      status,
      retryAfterSeconds,
      context,
    });
  }

  private async ghApiGet(
    path: string,
    params: GhApiParams,
    cacheTtl: string | null,
  ): Promise<unknown> {
    const args = ['api', '-X', 'GET', path, '-H', 'Accept: application/vnd.github+json'];
    if (cacheTtl) args.push('--cache', cacheTtl);
    for (const [k, v] of Object.entries(params)) {
      args.push(typeof v === 'number' ? '-F' : '-f', `${k}=${v}`);
    }
    const stdout = await withRetry(
      async () => {
        try {
          return await this.runner.run('gh', args, { maxBuffer: MAX_BUFFER });
        } catch (err) {
          throw this.toApiError(err, path);
        }
      },
      { clock: this.clock },
    );
    return JSON.parse(stdout);
  }

  async searchRepositories(query: string, opts: { pages?: number } = {}): Promise<RepoSummary[]> {
    const pages = Math.max(1, opts.pages ?? 1);
    const byName = new Map<RepoFullName, RepoSummary>();
    for (let page = 1; page <= pages; page++) {
      const raw = await this.ghApiGet(
        'search/repositories',
        { q: query, per_page: 100, page, sort: 'stars', order: 'desc' },
        '30m',
      );
      const parsed = searchReposResponseSchema.parse(raw);
      for (const item of parsed.items) {
        const summary = toRepoSummary(item);
        if (summary && !byName.has(summary.fullName)) byName.set(summary.fullName, summary);
      }
      if (parsed.items.length < 100) break;
    }
    return [...byName.values()];
  }

  async searchCode(query: string): Promise<RepoFullName[]> {
    let raw: unknown;
    try {
      raw = await this.ghApiGet('search/code', { q: query, per_page: 50 }, '30m');
    } catch (err) {
      // code search は認証必須・制限が厳しいため失敗しても握って続行（現行踏襲）。
      this.logger.warn(`code search 失敗（続行）: ${errMessage(err)}`);
      return [];
    }
    const parsed = searchCodeResponseSchema.parse(raw);
    const out: RepoFullName[] = [];
    const seen = new Set<RepoFullName>();
    for (const item of parsed.items) {
      const full = parseRepoFullName(item.repository.full_name);
      if (full && !seen.has(full)) {
        seen.add(full);
        out.push(full);
      }
    }
    return out;
  }

  async getRepository(name: RepoFullName): Promise<RepoSummary | null> {
    const raw = await this.getOrNull(`repos/${name}`, {}, '24h');
    if (raw === null) return null;
    const parsed = ghRepoSchema.parse(raw);
    return toRepoSummary(parsed);
  }

  async getReadmeText(name: RepoFullName): Promise<string | null> {
    const raw = await this.getOrNull(`repos/${name}/readme`, {}, '24h');
    if (raw === null) return null;
    const parsed = readmeResponseSchema.parse(raw);
    const text =
      parsed.encoding === 'base64'
        ? Buffer.from(parsed.content, 'base64').toString('utf8')
        : parsed.content;
    return text.length > README_MAX_CHARS ? text.slice(0, README_MAX_CHARS) : text;
  }

  async listTreePaths(name: RepoFullName): Promise<string[] | null> {
    const raw = await this.getOrNull(`repos/${name}/git/trees/HEAD`, { recursive: 1 }, '24h');
    if (raw === null) return null;
    const parsed = treeResponseSchema.parse(raw);
    return parsed.tree.map((t) => t.path);
  }

  /** 404 を null に変換する GET。それ以外のエラーは再 throw。 */
  private async getOrNull(path: string, params: GhApiParams, cacheTtl: string): Promise<unknown> {
    try {
      return await this.ghApiGet(path, params, cacheTtl);
    } catch (err) {
      if (err instanceof GitHubApiError && (err.status === 404 || err.status === 409)) {
        return null;
      }
      throw err;
    }
  }
}

function extractStderr(err: unknown): string {
  if (err && typeof err === 'object' && 'stderr' in err) {
    const s = (err as { stderr?: unknown }).stderr;
    if (typeof s === 'string') return s;
  }
  return errMessage(err);
}

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
