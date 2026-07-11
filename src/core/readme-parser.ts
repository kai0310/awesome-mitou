import { parseRepoFullName } from './repo-name.js';
import type { RepoFullName } from './types.js';

const GITHUB_REPO_RE = /github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/g;

/**
 * README(Markdown) から掲載済みの GitHub リポジトリ(owner/repo) を抽出し、
 * 正規化した RepoFullName の Set で返す。照合キーが最初から正規化されるため
 * 呼び出し側の O(n^2) 照合が不要になる。
 */
export function extractListedRepos(markdown: string): Set<RepoFullName> {
  const set = new Set<RepoFullName>();
  for (const m of markdown.matchAll(GITHUB_REPO_RE)) {
    const owner = m[1];
    const repo = m[2];
    if (owner === undefined || repo === undefined) continue;
    const full = parseRepoFullName(`${owner}/${repo}`);
    if (full !== null) set.add(full);
  }
  return set;
}
