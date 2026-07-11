import type { PenaltyReason } from '../types.js';

export interface KeywordRule {
  id: string;
  pattern: RegExp;
  /** メタデータ出現時の重み。README 本文出現時は ceil(weight/2)。 */
  weight: number;
  label: string;
}

// スコアリング用キーワード。既存 KEYWORD_RULES を維持しつつ id を付与しデータ化する。
export const KEYWORD_RULES: readonly KeywordRule[] = [
  {
    id: 'mitou-docs',
    pattern: /mitou[-_]?doc/i,
    weight: 5,
    label: '資料リポジトリ名 (mitou-docs)',
  },
  {
    id: 'mitou-documentation',
    pattern: /mitou[-_]?documentation/i,
    weight: 5,
    label: '資料リポジトリ名 (mitou-documentation)',
  },
  { id: 'mitou-kanji', pattern: /未踏/, weight: 3, label: '「未踏」を含む' },
  { id: 'mitou-word', pattern: /\bmitou\b/i, weight: 2, label: '「mitou」を含む' },
  { id: 'proposal', pattern: /提案書/, weight: 3, label: '「提案書」を含む' },
  { id: 'final-report', pattern: /成果報告書?/, weight: 3, label: '「成果報告」を含む' },
  { id: 'second-interview', pattern: /二次面接/, weight: 3, label: '「二次面接」を含む' },
  {
    id: 'mitou-category',
    pattern: /未踏(IT|ジュニア|ターゲット|アドバンスト|本体)/,
    weight: 3,
    label: '未踏の事業種別を含む',
  },
  { id: 'ipa', pattern: /\bIPA\b/, weight: 1, label: '「IPA」を含む' },
  {
    id: 'mitou-related',
    pattern: /未踏(事業|クリエータ|スーパークリエータ)/,
    weight: 2,
    label: '未踏関連語を含む',
  },
];

// ---- 重み定義（正）----
export const WEIGHTS = {
  topicMitou: 3,
  codeLink: 2,
  officialLinkAlive: 6,
  officialLinkUnverified: 4,
  docProposal: 3,
  docSlide: 2,
  docGeneric: 1,
} as const;

// ---- 負のシグナル ----
export interface PenaltyRule {
  reason: PenaltyReason;
  weight: number; // 負値
  label: string;
}

export const PENALTIES: Record<PenaltyReason, PenaltyRule> = {
  fork: { reason: 'fork', weight: -3, label: 'fork（原本が候補になる）' },
  'idiom-mitou': { reason: 'idiom-mitou', weight: -2, label: '慣用句「未踏」の誤検知疑い' },
  'romaji-collision': { reason: 'romaji-collision', weight: -2, label: '地名(水戸等)との衝突疑い' },
  'aggregation-list': {
    reason: 'aggregation-list',
    weight: -2,
    label: 'まとめ/リスト系リポジトリ',
  },
  'archived-stale': { reason: 'archived-stale', weight: -1, label: 'アーカイブ済みで未踏語なし' },
} as const;
