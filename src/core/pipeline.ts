import type { Confidence, Evaluation } from './types.js';

const CONFIDENCE_ORDER: Record<Confidence, number> = { high: 3, medium: 2, low: 1 };

export interface SelectEnrichmentOptions {
  enrichThreshold: number;
  maxEnrich: number;
}

/**
 * 一次スコア（メタデータのみ）が閾値以上の上位候補を enrichment 対象として選ぶ。
 * スコア降順 → stars 降順で安定ソートし、maxEnrich 件に絞る。
 */
export function selectEnrichmentTargets(
  evals: readonly Evaluation[],
  opts: SelectEnrichmentOptions,
): Evaluation[] {
  return evals
    .filter((e) => e.score >= opts.enrichThreshold)
    .slice()
    .sort(compareEvaluations)
    .slice(0, opts.maxEnrich);
}

export interface RankOptions {
  minScore: number;
  limit: number;
}

/**
 * 最終候補を confidence 降順 → score 降順 → stars 降順で並べ、
 * minScore 未満を除外し limit 件に絞る。
 */
export function rankCandidates(evals: readonly Evaluation[], opts: RankOptions): Evaluation[] {
  return evals
    .filter((e) => e.score >= opts.minScore)
    .slice()
    .sort(compareEvaluations)
    .slice(0, opts.limit);
}

/** confidence 降順 → score 降順 → stars 降順。 */
export function compareEvaluations(a: Evaluation, b: Evaluation): number {
  const byConfidence = CONFIDENCE_ORDER[b.confidence] - CONFIDENCE_ORDER[a.confidence];
  if (byConfidence !== 0) return byConfidence;
  const byScore = b.score - a.score;
  if (byScore !== 0) return byScore;
  return b.repo.stars - a.repo.stars;
}
