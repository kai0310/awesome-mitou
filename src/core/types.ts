// ドメイン型の単一ソース。「理由」「結果」「除外」はすべて discriminated union にし、
// 文字列配列（旧 reasons: string[]）を内部表現から排除する。表示文字列は render.ts が導出する。

// ---- 基本 ----

/** 小文字 "owner/repo" 正規形。生成は repo-name.ts の parseRepoFullName のみ。 */
export type RepoFullName = string & { readonly __brand: 'RepoFullName' };

export interface RepoSummary {
  fullName: RepoFullName;
  /** 元表記（PR タイトル等の表示用） */
  displayName: string;
  url: string;
  description: string;
  topics: readonly string[];
  stars: number;
  isFork: boolean;
  isArchived: boolean;
  /** ISO8601。取得できない場合は空文字。 */
  pushedAt: string;
}

export type MitouCategory = 'it' | 'junior' | 'target' | 'advanced';

// ---- スコアリング ----

export type PenaltyReason =
  | 'fork'
  | 'idiom-mitou'
  | 'aggregation-list'
  | 'archived-stale'
  | 'romaji-collision';

export type LinkVerification = 'alive' | 'unverified' | 'dead';

export type DocKind = 'proposal' | 'final-report' | 'slide' | 'generic-doc';

export type Signal =
  | {
      kind: 'keyword';
      ruleId: string;
      field: 'metadata' | 'readme';
      label: string;
      weight: number;
    }
  | { kind: 'topic'; topic: 'mitou'; weight: number }
  | { kind: 'code-link'; target: 'ipa' | 'mitou-jr'; weight: number }
  | {
      kind: 'official-link';
      category: MitouCategory;
      fiscalYear: number | null;
      url: string;
      verified: LinkVerification;
      weight: number;
    }
  | { kind: 'doc-file'; path: string; docKind: DocKind; weight: number }
  | { kind: 'penalty'; reason: PenaltyReason; label: string; weight: number };

export type Confidence = 'high' | 'medium' | 'low';

export interface Classification {
  category: MitouCategory | null;
  /** 例 2024 */
  fiscalYear: number | null;
  basis: 'official-url' | 'text-pattern' | null;
}

export interface Evaluation {
  repo: RepoSummary;
  /** Σ weight（下限 0 でクランプしない。負値も情報として保持）。 */
  score: number;
  confidence: Confidence;
  signals: readonly Signal[];
  classification: Classification;
  /** README/tree まで見たか。 */
  enriched: boolean;
}

// ---- 除外 ----

export type ExclusionReason =
  | { kind: 'already-listed' }
  | { kind: 'accepted' }
  | { kind: 'blocked-repo' }
  | { kind: 'blocked-owner'; owner: string }
  | { kind: 'self' };

// ---- リスト ----

export type ListKey = 'blockedOwners' | 'blockedRepos' | 'acceptedRepos';

export interface RawLists {
  blockedOwners: string[];
  blockedRepos: string[];
  acceptedRepos: string[];
}

export interface NormalizedLists {
  blockedOwners: ReadonlySet<string>;
  blockedRepos: ReadonlySet<RepoFullName>;
  acceptedRepos: ReadonlySet<RepoFullName>;
}

// ---- JSON 出力契約（candidates.json / Action 連携）----
// 既存 open-candidate-prs.mjs が snake_case を読むため互換維持。confidence/category/fiscal_year は追加のみ。

export interface CandidateOutput {
  full_name: string;
  url: string;
  description: string;
  stars: number;
  score: number;
  reasons: string[];
  confidence: Confidence;
  category: MitouCategory | null;
  fiscal_year: number | null;
}
