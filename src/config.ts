// 検索クエリ・閾値・重み・パスなどの定数を 1 箇所に集約する。
// ここは「設定データ」のみを持ち、ロジックは持たない。

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
/** リポジトリルート（src/ の 1 つ上）。 */
export const REPO_ROOT = join(here, '..');

export const README_PATH = join(REPO_ROOT, 'README.md');
export const LISTS_PATH = join(REPO_ROOT, 'scripts', 'mitou-lists.json');

/** このリポジトリ自身（検出結果から除外）。小文字正規形で保持。 */
export const SELF_REPOS: readonly string[] = ['kai0310/awesome-mitou', 'nbtkai/awesome-mitou'];

/** GitHub リポジトリ検索クエリ。in:name,description,readme / topic を横断する。 */
export const SEARCH_QUERIES: readonly string[] = [
  'mitou in:name,description,readme',
  '未踏 in:name,description,readme',
  'topic:mitou',
  '未踏 提案書 in:readme',
  '未踏 成果報告書 in:readme',
  'mitou-docs in:name',
];

/** コード検索。IPA 未踏ページ / 未踏ジュニアへのリンクを含むリポジトリを探す。 */
export const CODE_QUERIES: readonly { query: string; target: 'ipa' | 'mitou-jr' }[] = [
  { query: 'ipa.go.jp/jinzai/mitou', target: 'ipa' },
  { query: 'jr.mitou.org', target: 'mitou-jr' },
];

/** パイプラインの閾値。 */
export const PIPELINE = {
  /** 既定のスコア下限（レポート表示）。 */
  defaultMinScore: 3,
  /** 既定の出力件数上限。 */
  defaultLimit: 50,
  /** enrichment に進む一次スコアの下限。 */
  enrichThreshold: 2,
  /** enrichment 対象の最大件数。 */
  maxEnrich: 30,
  /** 検索クエリごとの最大ページ数。 */
  maxSearchPages: 3,
  /** 検索の per_page。 */
  searchPerPage: 100,
  /** 検索クエリ間の待機（ミリ秒、secondary rate limit 予防）。 */
  searchSleepMs: 2500,
  /** doc-file シグナルの合計重み上限。 */
  docFileWeightCap: 5,
} as const;

/** 年度の妥当範囲（現在年度 + 1 まで許容）。 */
export const FISCAL_YEAR_MIN = 2000;
