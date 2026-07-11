import type {
  Confidence,
  Evaluation,
  LinkVerification,
  MitouCategory,
  RepoSummary,
  Signal,
} from '../types.js';
import { classifyCandidate } from './classify.js';
import { WEIGHTS } from './rules.js';
import {
  codeLinkSignal,
  extractDocSignals,
  extractKeywordSignals,
  extractPenalties,
  extractTopicSignal,
} from './signals.js';

export interface VerifiedOfficialLink {
  url: string;
  category: MitouCategory;
  fiscalYear: number;
  verified: LinkVerification;
}

export interface Enrichment {
  readmeText: string | null;
  treePaths: readonly string[] | null;
  /** 検証済み公式リンク（1 候補 1 URL まで）。 */
  officialLinks: readonly VerifiedOfficialLink[];
}

export interface EvaluateInput {
  repo: RepoSummary;
  /** このリポジトリでヒットしたコード検索ターゲット。 */
  codeHitTargets: readonly ('ipa' | 'mitou-jr')[];
  currentYear: number;
  /** enrichment（README/tree/公式リンク）。未実施なら省略。 */
  enrichment?: Enrichment;
}

function metadataTextOf(repo: RepoSummary): string {
  return [repo.fullName, repo.description, repo.topics.join(' ')].join('\n');
}

function officialLinkWeight(verified: LinkVerification): number {
  switch (verified) {
    case 'alive':
      return WEIGHTS.officialLinkAlive;
    case 'unverified':
      return WEIGHTS.officialLinkUnverified;
    case 'dead':
      return 0;
  }
}

function computeConfidence(signals: readonly Signal[], score: number): Confidence {
  const hasAliveOfficial = signals.some(
    (s) => s.kind === 'official-link' && s.verified === 'alive',
  );
  const hasProposalOrFinal = signals.some(
    (s) => s.kind === 'doc-file' && (s.docKind === 'proposal' || s.docKind === 'final-report'),
  );
  const hasMitouKeyword = signals.some((s) => s.kind === 'keyword' && s.ruleId.startsWith('mitou'));
  if (hasAliveOfficial || (hasProposalOrFinal && hasMitouKeyword)) return 'high';

  const positiveKinds = new Set(signals.filter((s) => s.weight > 0).map((s) => s.kind));
  if (score >= 6 && positiveKinds.size >= 2) return 'medium';
  return 'low';
}

/**
 * リポジトリを評価してスコア・シグナル・confidence・分類を算出する純粋関数。
 * I/O は一切行わず、enrichment 済みデータは呼び出し側が注入する。
 */
export function evaluateRepo(input: EvaluateInput): Evaluation {
  const { repo, currentYear, enrichment } = input;
  const metadataText = metadataTextOf(repo);
  const signals: Signal[] = [];

  // メタデータ由来
  signals.push(...extractKeywordSignals(metadataText, 'metadata'));
  const topic = extractTopicSignal(repo.topics);
  if (topic) signals.push(topic);
  for (const target of input.codeHitTargets) {
    signals.push(codeLinkSignal(target));
  }

  // enrichment 由来
  const readmeText = enrichment?.readmeText ?? null;
  if (readmeText) {
    signals.push(...extractKeywordSignals(readmeText, 'readme'));
  }
  const officialLinks = enrichment?.officialLinks ?? [];
  for (const link of officialLinks) {
    signals.push({
      kind: 'official-link',
      category: link.category,
      fiscalYear: link.fiscalYear,
      url: link.url,
      verified: link.verified,
      weight: officialLinkWeight(link.verified),
    });
  }
  if (enrichment?.treePaths) {
    signals.push(...extractDocSignals(enrichment.treePaths));
  }

  // 負のシグナル
  signals.push(...extractPenalties({ repo, metadataText, readmeText }));

  const score = signals.reduce((sum, s) => sum + s.weight, 0);
  const confidence = computeConfidence(signals, score);

  const classification = classifyCandidate({
    text: readmeText ? `${metadataText}\n${readmeText}` : metadataText,
    officialUrls: officialLinks.map((l) => l.url),
    currentYear,
  });

  return {
    repo,
    score,
    confidence,
    signals,
    classification,
    enriched: enrichment !== undefined,
  };
}
