import type { RepoFullName } from './types.js';

const OWNER_REPO_RE = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/;

/**
 * 任意の入力を小文字 "owner/repo" 正規形（RepoFullName）へ変換する。
 * URL・末尾スラッシュ・.git・クエリ/フラグメント・末尾句読点を除去する。
 * 妥当な owner/repo に解決できない場合は null。
 */
export function parseRepoFullName(raw: string): RepoFullName | null {
  if (typeof raw !== 'string') return null;
  let s = raw.trim();
  if (s === '') return null;

  // スキーム付き / スキームレスの github.com プレフィックスを除去
  s = s.replace(/^https?:\/\//i, '').replace(/^github\.com\//i, '');
  // クエリ・フラグメントを除去（?tab=readme-ov-file など）
  s = s.replace(/[?#].*$/, '');
  // 末尾スラッシュ・空白を除去
  s = s.replace(/[/\s]+$/, '');

  const parts = s.split('/');
  if (parts.length < 2) return null;
  const owner = parts[0];
  let repo = parts[1];
  if (owner === undefined || repo === undefined) return null;

  // repo の末尾から .git と句読点・閉じ括弧を除去
  repo = repo.replace(/\.git$/i, '').replace(/[).,]+$/, '');

  if (!OWNER_REPO_RE.test(owner) || !OWNER_REPO_RE.test(repo)) return null;

  return `${owner.toLowerCase()}/${repo.toLowerCase()}` as RepoFullName;
}

/** RepoFullName の owner 部分を返す。 */
export function ownerOf(fullName: RepoFullName): string {
  const idx = fullName.indexOf('/');
  return idx === -1 ? fullName : fullName.slice(0, idx);
}
