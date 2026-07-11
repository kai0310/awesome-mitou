import { PIPELINE } from '../../config.js';
import type { DocKind, RepoSummary, Signal } from '../types.js';
import { extractUrls } from '../url-extractor.js';
import { classifyFromUrl } from './classify.js';
import { KEYWORD_RULES, PENALTIES, WEIGHTS } from './rules.js';

/** README 本文出現時はメタデータの半分（切り上げ）の重みにする。 */
function readmeWeight(weight: number): number {
  return Math.ceil(weight / 2);
}

/** キーワードルールに一致するシグナルを抽出する。 */
export function extractKeywordSignals(text: string, field: 'metadata' | 'readme'): Signal[] {
  const out: Signal[] = [];
  for (const rule of KEYWORD_RULES) {
    if (rule.pattern.test(text)) {
      const weight = field === 'readme' ? readmeWeight(rule.weight) : rule.weight;
      out.push({ kind: 'keyword', ruleId: rule.id, field, label: rule.label, weight });
    }
  }
  return out;
}

/** topic に mitou を含む場合のシグナル。 */
export function extractTopicSignal(topics: readonly string[]): Signal | null {
  if (topics.some((t) => t.toLowerCase() === 'mitou')) {
    return { kind: 'topic', topic: 'mitou', weight: WEIGHTS.topicMitou };
  }
  return null;
}

/** コード検索ヒット（IPA / 未踏ジュニアへのリンク）のシグナル。 */
export function codeLinkSignal(target: 'ipa' | 'mitou-jr'): Signal {
  return { kind: 'code-link', target, weight: WEIGHTS.codeLink };
}

export interface OfficialUrlFinding {
  url: string;
  category: import('../types.js').MitouCategory;
  fiscalYear: number;
}

/**
 * README 本文から公式 URL 候補（IPA / 未踏ジュニア）を抽出し、区分・年度を付与する。
 * 実在確認（verified）は呼び出し側（infra）が付与する。
 */
export function extractOfficialUrls(readmeText: string, currentYear: number): OfficialUrlFinding[] {
  const out: OfficialUrlFinding[] = [];
  const seen = new Set<string>();
  for (const { url } of extractUrls(readmeText)) {
    const cls = classifyFromUrl(url, currentYear);
    if (cls === null || seen.has(url)) continue;
    seen.add(url);
    out.push({ url, category: cls.category, fiscalYear: cls.fiscalYear });
  }
  return out;
}

const DOC_EXT_RE = /\.(pdf|pptx?|key)$/i;
const DOC_PROPOSAL_RE = /提案書|proposal/i;
const DOC_FINAL_RE = /成果報告|final[-_]?report/i;
const DOC_SLIDE_RE = /二次面接|スライド|slide/i;

function docKindOf(path: string): DocKind | null {
  if (DOC_PROPOSAL_RE.test(path)) return 'proposal';
  if (DOC_FINAL_RE.test(path)) return 'final-report';
  if (DOC_SLIDE_RE.test(path) && DOC_EXT_RE.test(path)) return 'slide';
  if (DOC_EXT_RE.test(path)) return 'generic-doc';
  return null;
}

function docWeight(kind: DocKind): number {
  switch (kind) {
    case 'proposal':
    case 'final-report':
      return WEIGHTS.docProposal;
    case 'slide':
      return WEIGHTS.docSlide;
    case 'generic-doc':
      return WEIGHTS.docGeneric;
  }
}

/**
 * git tree のパス一覧から資料ファイルのシグナルを抽出する。
 * doc-file の合計重みは docFileWeightCap でキャップする（PDF 大量リポの過大評価防止）。
 */
export function extractDocSignals(treePaths: readonly string[]): Signal[] {
  const findings: { path: string; kind: DocKind; weight: number }[] = [];
  for (const path of treePaths) {
    const kind = docKindOf(path);
    if (kind === null) continue;
    findings.push({ path, kind, weight: docWeight(kind) });
  }
  // 重みの高い順に採用し、合計が cap を超えないよう打ち切る。
  findings.sort((a, b) => b.weight - a.weight);
  const out: Signal[] = [];
  let total = 0;
  for (const f of findings) {
    if (total + f.weight > PIPELINE.docFileWeightCap) continue;
    total += f.weight;
    out.push({ kind: 'doc-file', path: f.path, docKind: f.kind, weight: f.weight });
    if (total >= PIPELINE.docFileWeightCap) break;
  }
  return out;
}

const IDIOM_RE = /前人未踏|人跡未踏|未踏峰|未踏の地/;
const IDIOM_OFFICIAL_RE = /IPA|提案書|成果報告|mitou\.org/i;
const ROMAJI_COLLISION_RE = /\bmito\b|水戸|mitou?[- ]?(?:city|shi)\b/i;
const AGGREGATION_RE = /awesome|まとめ|list[- ]of/i;
const MITOU_KEYWORD_RE = /未踏|mitou/i;

export interface PenaltyContext {
  repo: RepoSummary;
  /** メタデータ由来テキスト（full_name + description + topics）。 */
  metadataText: string;
  /** README 本文（enrichment 済みなら文字列）。 */
  readmeText: string | null;
}

/** 誤検知対策の負のシグナルを抽出する。 */
export function extractPenalties(ctx: PenaltyContext): Signal[] {
  const out: Signal[] = [];
  const combined = ctx.readmeText ? `${ctx.metadataText}\n${ctx.readmeText}` : ctx.metadataText;

  if (ctx.repo.isFork) {
    out.push({ kind: 'penalty', ...toPenaltySignal('fork') });
  }
  if (IDIOM_RE.test(combined) && !IDIOM_OFFICIAL_RE.test(combined)) {
    out.push({ kind: 'penalty', ...toPenaltySignal('idiom-mitou') });
  }
  if (ROMAJI_COLLISION_RE.test(combined)) {
    out.push({ kind: 'penalty', ...toPenaltySignal('romaji-collision') });
  }
  if (AGGREGATION_RE.test(ctx.repo.fullName) || AGGREGATION_RE.test(ctx.repo.displayName)) {
    out.push({ kind: 'penalty', ...toPenaltySignal('aggregation-list') });
  }
  if (ctx.repo.isArchived && !MITOU_KEYWORD_RE.test(ctx.metadataText)) {
    out.push({ kind: 'penalty', ...toPenaltySignal('archived-stale') });
  }
  return out;
}

function toPenaltySignal(reason: import('../types.js').PenaltyReason): {
  reason: import('../types.js').PenaltyReason;
  label: string;
  weight: number;
} {
  const rule = PENALTIES[reason];
  return { reason: rule.reason, label: rule.label, weight: rule.weight };
}
