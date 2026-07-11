import { CODE_QUERIES, PIPELINE, SEARCH_QUERIES, SELF_REPOS } from '../config.js';
import { decideExclusion } from '../core/exclusion.js';
import { rankCandidates, selectEnrichmentTargets } from '../core/pipeline.js';
import { extractListedRepos } from '../core/readme-parser.js';
import { parseRepoFullName } from '../core/repo-name.js';
import { type EvaluateInput, evaluateRepo } from '../core/scoring/scorer.js';
import { extractOfficialUrls } from '../core/scoring/signals.js';
import type {
  Evaluation,
  ExclusionReason,
  LinkVerification,
  RepoFullName,
  RepoSummary,
} from '../core/types.js';
import type { Clock } from '../infra/clock.js';
import type { GitHubClient } from '../infra/github/client.js';
import type { ListsStore } from '../infra/lists-store.js';
import type { Logger } from '../infra/logger.js';

export interface DiscoverDeps {
  github: GitHubClient;
  lists: ListsStore;
  clock: Clock;
  logger: Logger;
  /** README テキストの供給。 */
  readReadme: () => string;
  /** 公式リンク実在確認。省略時は常に 'unverified'。 */
  verifyOfficialLink?: (url: string) => Promise<LinkVerification>;
  /** 現在年度（年度範囲チェック用）。 */
  currentYear: number;
}

export interface DiscoverOpts {
  minScore: number;
  limit: number;
  enrich: boolean;
}

export interface ExcludedEntry {
  repo: RepoSummary;
  reason: ExclusionReason;
}

export interface DiscoverResult {
  candidates: Evaluation[];
  excluded: ExcludedEntry[];
}

type CodeTarget = 'ipa' | 'mitou-jr';

/** discover パイプライン本体。すべての副作用は deps の port 越しに行う。 */
export async function runDiscover(deps: DiscoverDeps, opts: DiscoverOpts): Promise<DiscoverResult> {
  const listedRepos = extractListedRepos(deps.readReadme());
  const lists = deps.lists.loadNormalized();
  const selfRepos = buildSelfRepos();

  const codeHits = await collectCodeHits(deps);
  const repos = await collectRepos(deps, codeHits);

  // 除外
  const excluded: ExcludedEntry[] = [];
  const kept: RepoSummary[] = [];
  for (const repo of repos.values()) {
    const reason = decideExclusion(repo, { listedRepos, lists, selfRepos });
    if (reason) excluded.push({ repo, reason });
    else kept.push(repo);
  }

  // 一次スコア（メタデータのみ）
  const primary = kept.map((repo) => evaluateRepo(baseInput(repo, codeHits, deps.currentYear)));

  let finalEvals = primary;
  if (opts.enrich) {
    finalEvals = await enrichCandidates(deps, primary, codeHits);
  }

  const candidates = rankCandidates(finalEvals, { minScore: opts.minScore, limit: opts.limit });
  return { candidates, excluded };
}

function baseInput(
  repo: RepoSummary,
  codeHits: Map<RepoFullName, Set<CodeTarget>>,
  currentYear: number,
): EvaluateInput {
  return {
    repo,
    codeHitTargets: [...(codeHits.get(repo.fullName) ?? [])],
    currentYear,
  };
}

function buildSelfRepos(): Set<RepoFullName> {
  const set = new Set<RepoFullName>();
  for (const s of SELF_REPOS) {
    const full = parseRepoFullName(s);
    if (full) set.add(full);
  }
  return set;
}

async function collectCodeHits(deps: DiscoverDeps): Promise<Map<RepoFullName, Set<CodeTarget>>> {
  const hits = new Map<RepoFullName, Set<CodeTarget>>();
  for (const { query, target } of CODE_QUERIES) {
    const names = await deps.github.searchCode(query);
    for (const name of names) {
      const set = hits.get(name) ?? new Set<CodeTarget>();
      set.add(target);
      hits.set(name, set);
    }
  }
  return hits;
}

async function collectRepos(
  deps: DiscoverDeps,
  codeHits: Map<RepoFullName, Set<CodeTarget>>,
): Promise<Map<RepoFullName, RepoSummary>> {
  const byName = new Map<RepoFullName, RepoSummary>();
  let first = true;
  for (const query of SEARCH_QUERIES) {
    if (!first) await deps.clock.sleep(PIPELINE.searchSleepMs);
    first = false;
    deps.logger.debug(`search: ${query}`);
    const summaries = await deps.github.searchRepositories(query, {
      pages: PIPELINE.maxSearchPages,
    });
    for (const s of summaries) {
      if (!byName.has(s.fullName)) byName.set(s.fullName, s);
    }
  }
  // コード検索でしか出ないリポジトリのメタ情報を補完する。
  for (const name of codeHits.keys()) {
    if (byName.has(name)) continue;
    const meta = await deps.github.getRepository(name);
    if (meta) byName.set(meta.fullName, meta);
  }
  return byName;
}

async function enrichCandidates(
  deps: DiscoverDeps,
  primary: readonly Evaluation[],
  codeHits: Map<RepoFullName, Set<CodeTarget>>,
): Promise<Evaluation[]> {
  const targets = selectEnrichmentTargets(primary, {
    enrichThreshold: PIPELINE.enrichThreshold,
    maxEnrich: PIPELINE.maxEnrich,
  });
  const targetNames = new Set(targets.map((e) => e.repo.fullName));

  const enrichedByName = new Map<RepoFullName, Evaluation>();
  await runPool(targets, 4, async (ev) => {
    const enriched = await enrichOne(deps, ev.repo, codeHits);
    enrichedByName.set(ev.repo.fullName, enriched);
  });

  // enrichment 対象は差し替え、それ以外は一次評価のまま。
  return primary.map((ev) =>
    targetNames.has(ev.repo.fullName) ? (enrichedByName.get(ev.repo.fullName) ?? ev) : ev,
  );
}

async function enrichOne(
  deps: DiscoverDeps,
  repo: RepoSummary,
  codeHits: Map<RepoFullName, Set<CodeTarget>>,
): Promise<Evaluation> {
  const readmeText = await safeCall(deps, () => deps.github.getReadmeText(repo.fullName), null);
  const treePaths = await safeCall(deps, () => deps.github.listTreePaths(repo.fullName), null);

  const officialFindings = readmeText ? extractOfficialUrls(readmeText, deps.currentYear) : [];
  const first = officialFindings[0];
  const officialLinks = first
    ? [
        {
          url: first.url,
          category: first.category,
          fiscalYear: first.fiscalYear,
          verified: await verify(deps, first.url),
        },
      ]
    : [];

  return evaluateRepo({
    ...baseInput(repo, codeHits, deps.currentYear),
    enrichment: { readmeText, treePaths, officialLinks },
  });
}

async function verify(deps: DiscoverDeps, url: string): Promise<LinkVerification> {
  if (!deps.verifyOfficialLink) return 'unverified';
  try {
    return await deps.verifyOfficialLink(url);
  } catch {
    return 'unverified';
  }
}

/** enrichment の個別 API 失敗は握って続行（可用性がスコアを壊さない）。 */
async function safeCall<T>(deps: DiscoverDeps, fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    deps.logger.warn(
      `enrichment 失敗（続行）: ${err instanceof Error ? err.message : String(err)}`,
    );
    return fallback;
  }
}

/** 並列度 size でタスクを処理する簡易プール。 */
async function runPool<T>(
  items: readonly T[],
  size: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let i = 0;
  const runners = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      const item = items[idx];
      if (item !== undefined) await worker(item);
    }
  });
  await Promise.all(runners);
}
