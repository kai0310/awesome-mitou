import { ownerOf } from './repo-name.js';
import type { ExclusionReason, NormalizedLists, RepoFullName, RepoSummary } from './types.js';

export interface ExclusionContext {
  /** README に掲載済みのリポジトリ。 */
  listedRepos: ReadonlySet<RepoFullName>;
  /** ブロック・受理リスト（正規化済み）。 */
  lists: NormalizedLists;
  /** このリポジトリ自身。 */
  selfRepos: ReadonlySet<RepoFullName>;
}

/**
 * 候補を除外すべきか判定する。除外する場合は理由（discriminated union）、
 * しない場合は null を返す。判定順は self → 掲載済み → 受理 → repo ブロック → owner ブロック。
 */
export function decideExclusion(repo: RepoSummary, ctx: ExclusionContext): ExclusionReason | null {
  const key = repo.fullName;
  if (ctx.selfRepos.has(key)) return { kind: 'self' };
  if (ctx.listedRepos.has(key)) return { kind: 'already-listed' };
  if (ctx.lists.acceptedRepos.has(key)) return { kind: 'accepted' };
  if (ctx.lists.blockedRepos.has(key)) return { kind: 'blocked-repo' };
  const owner = ownerOf(key);
  if (ctx.lists.blockedOwners.has(owner)) return { kind: 'blocked-owner', owner };
  return null;
}
