import { readFileSync } from 'node:fs';
import { rawListsSchema } from '../core/candidate-schema.js';
import { parseRepoFullName } from '../core/repo-name.js';
import type { NormalizedLists, RawLists, RepoFullName } from '../core/types.js';

/** 未踏候補リスト（blocklist / acceptedRepos）の読み取り port。 */
export interface ListsStore {
  /** 表記を保持した生データ。 */
  readRaw(): RawLists;
  /** 照合用に正規化した Set 群。 */
  loadNormalized(): NormalizedLists;
}

const EMPTY_RAW: RawLists = { blockedOwners: [], blockedRepos: [], acceptedRepos: [] };

/** scripts/mitou-lists.json を読む ListsStore。書き込みは当面 scripts/lists.mjs が担当。 */
export class JsonFileListsStore implements ListsStore {
  constructor(private readonly path: string) {}

  readRaw(): RawLists {
    let text: string;
    try {
      text = readFileSync(this.path, 'utf8');
    } catch {
      return { ...EMPTY_RAW };
    }
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return { ...EMPTY_RAW };
    }
    const parsed = rawListsSchema.safeParse(data);
    if (!parsed.success) return { ...EMPTY_RAW };
    return {
      blockedOwners: parsed.data.blockedOwners,
      blockedRepos: parsed.data.blockedRepos,
      acceptedRepos: parsed.data.acceptedRepos,
    };
  }

  loadNormalized(): NormalizedLists {
    return normalizeLists(this.readRaw());
  }
}

/** RawLists を照合用 Set 群へ正規化する純粋関数（テスト容易化のため公開）。 */
export function normalizeLists(raw: RawLists): NormalizedLists {
  const blockedOwners = new Set<string>();
  for (const o of raw.blockedOwners) {
    const trimmed = String(o).trim().toLowerCase();
    if (trimmed) blockedOwners.add(trimmed);
  }
  const blockedRepos = new Set<RepoFullName>();
  for (const r of raw.blockedRepos) {
    const full = parseRepoFullName(r);
    if (full) blockedRepos.add(full);
  }
  const acceptedRepos = new Set<RepoFullName>();
  for (const r of raw.acceptedRepos) {
    const full = parseRepoFullName(r);
    if (full) acceptedRepos.add(full);
  }
  return { blockedOwners, blockedRepos, acceptedRepos };
}
