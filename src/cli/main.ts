import { readFileSync } from 'node:fs';
import { argv } from 'node:process';
import { pathToFileURL } from 'node:url';
import { LISTS_PATH, README_PATH } from '../config.js';
import { renderCandidatesMarkdown, renderExplain, toCandidateOutput } from '../core/render.js';
import type { LinkVerification } from '../core/types.js';
import { SystemClock } from '../infra/clock.js';
import { GitHubApiError } from '../infra/github/client.js';
import { GhCliClient } from '../infra/github/gh-cli-client.js';
import { JsonFileListsStore } from '../infra/lists-store.js';
import { StderrLogger } from '../infra/logger.js';
import { DISCOVER_USAGE, UsageError, parseDiscoverArgs } from './args.js';
import { type DiscoverDeps, runDiscover } from './discover.js';

const TOP_USAGE = `usage: mitou <discover> [options]
  discover   未踏関連リポジトリの候補を検出する

${DISCOVER_USAGE}`;

/** stdout はデータ専用、ログは stderr。exit code を返す。 */
export async function runMain(argv: readonly string[]): Promise<number> {
  const command = argv[0];
  const rest = argv.slice(1);

  if (command === undefined || command === '--help' || command === '-h') {
    process.stdout.write(`${TOP_USAGE}\n`);
    return 0;
  }
  if (command !== 'discover') {
    process.stderr.write(`error: 未知のサブコマンド: ${command}\n${TOP_USAGE}\n`);
    return 2;
  }

  let opts: ReturnType<typeof parseDiscoverArgs>;
  try {
    opts = parseDiscoverArgs(rest);
  } catch (err) {
    if (err instanceof UsageError) {
      process.stderr.write(`error: ${err.message}\n${DISCOVER_USAGE}\n`);
      return 2;
    }
    throw err;
  }

  const logger = new StderrLogger({ verbose: opts.verbose, quiet: opts.quiet });
  const clock = new SystemClock();
  const deps: DiscoverDeps = {
    github: new GhCliClient({ clock, logger }),
    lists: new JsonFileListsStore(LISTS_PATH),
    clock,
    logger,
    readReadme: () => readReadmeSafe(),
    verifyOfficialLink: defaultVerifyOfficialLink,
    currentYear: new Date().getFullYear(),
  };

  try {
    const result = await runDiscover(deps, {
      minScore: opts.minScore,
      limit: opts.limit,
      enrich: opts.enrich,
    });

    if (opts.explain) {
      for (const ev of result.candidates) process.stderr.write(`${renderExplain(ev)}\n`);
      for (const ex of result.excluded) {
        process.stderr.write(`除外 ${ex.repo.fullName}: ${ex.reason.kind}\n`);
      }
    }

    if (opts.json) {
      const out = result.candidates.map(toCandidateOutput);
      process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
    } else {
      process.stdout.write(`${renderCandidatesMarkdown(result.candidates)}\n`);
    }
    return 0;
  } catch (err) {
    if (err instanceof GitHubApiError) {
      logger.error(`GitHub API 障害: ${err.message}`);
      return 3;
    }
    logger.error(err instanceof Error ? err.message : String(err));
    return 3;
  }
}

function readReadmeSafe(): string {
  try {
    return readFileSync(README_PATH, 'utf8');
  } catch {
    return '';
  }
}

const OFFICIAL_HOSTS = new Set(['www.ipa.go.jp', 'ipa.go.jp', 'jr.mitou.org']);
const VERIFY_TIMEOUT_MS = 10_000;

/** 公式リンクの実在確認（IPA / 未踏ジュニアのみ）。失敗しても 'unverified'。 */
async function defaultVerifyOfficialLink(url: string): Promise<LinkVerification> {
  let host: string;
  try {
    host = new URL(url).host;
  } catch {
    return 'unverified';
  }
  if (!OFFICIAL_HOSTS.has(host)) return 'unverified';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: controller.signal });
    if (res.status === 404 || res.status === 410) return 'dead';
    if (res.status < 400) return 'alive';
    return 'unverified';
  } catch {
    return 'unverified';
  } finally {
    clearTimeout(timer);
  }
}

// tsx で直接実行された場合のみエントリを起動する（import 時の副作用を避ける）。
const invokedPath = argv[1];
if (invokedPath !== undefined && import.meta.url === pathToFileURL(invokedPath).href) {
  runMain(argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((err) => {
      process.stderr.write(
        `fatal: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`,
      );
      process.exitCode = 3;
    });
}
