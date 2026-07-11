import { z } from 'zod';
import { parseRepoFullName } from '../../core/repo-name.js';
import type { RepoFullName, RepoSummary } from '../../core/types.js';

/** GitHub API アクセスの port。実装は gh-cli-client、テストは in-memory fake。 */
export interface GitHubClient {
  searchRepositories(query: string, opts?: { pages?: number }): Promise<RepoSummary[]>;
  searchCode(query: string): Promise<RepoFullName[]>;
  getRepository(name: RepoFullName): Promise<RepoSummary | null>;
  /** /repos/{o}/{r}/readme を base64 デコードして返す。存在しなければ null。 */
  getReadmeText(name: RepoFullName): Promise<string | null>;
  /** /git/trees/HEAD?recursive=1 のパス一覧（truncated 許容）。取得不可なら null。 */
  listTreePaths(name: RepoFullName): Promise<string[] | null>;
}

// ---- zod スキーマ（API レスポンス境界）----

export const ghRepoSchema = z.object({
  full_name: z.string(),
  html_url: z.string(),
  description: z.string().nullish(),
  topics: z.array(z.string()).nullish(),
  stargazers_count: z.number().nullish(),
  fork: z.boolean().nullish(),
  archived: z.boolean().nullish(),
  pushed_at: z.string().nullish(),
});
export type GhRepo = z.infer<typeof ghRepoSchema>;

export const searchReposResponseSchema = z.object({
  items: z.array(ghRepoSchema),
});

export const searchCodeResponseSchema = z.object({
  items: z.array(
    z.object({
      repository: z.object({ full_name: z.string() }),
    }),
  ),
});

export const readmeResponseSchema = z.object({
  content: z.string(),
  encoding: z.string(),
});

export const treeResponseSchema = z.object({
  tree: z.array(z.object({ path: z.string(), type: z.string() })),
  truncated: z.boolean().nullish(),
});

/** API 由来の repo オブジェクトを RepoSummary へ変換。full_name が不正なら null。 */
export function toRepoSummary(raw: GhRepo): RepoSummary | null {
  const fullName = parseRepoFullName(raw.full_name);
  if (fullName === null) return null;
  return {
    fullName,
    displayName: raw.full_name,
    url: raw.html_url,
    description: raw.description ?? '',
    topics: raw.topics ?? [],
    stars: raw.stargazers_count ?? 0,
    isFork: raw.fork ?? false,
    isArchived: raw.archived ?? false,
    pushedAt: raw.pushed_at ?? '',
  };
}

/** GitHub API 呼び出しで発生したエラー。retry 判定に status を使う。 */
export class GitHubApiError extends Error {
  readonly status: number | null;
  readonly retryAfterSeconds: number | null;
  readonly context: string;

  constructor(
    message: string,
    opts: { status?: number | null; retryAfterSeconds?: number | null; context?: string } = {},
  ) {
    super(message);
    this.name = 'GitHubApiError';
    this.status = opts.status ?? null;
    this.retryAfterSeconds = opts.retryAfterSeconds ?? null;
    this.context = opts.context ?? '';
  }
}
