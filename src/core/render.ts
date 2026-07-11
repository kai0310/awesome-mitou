import type { CandidateOutput, Confidence, Evaluation, Signal } from './types.js';

const CONFIDENCE_LABEL: Record<Confidence, string> = {
  high: '高',
  medium: '中',
  low: '低',
};

/** 単一シグナルの表示ラベルを導出する（データと表示の分離）。 */
export function signalLabel(signal: Signal): string {
  switch (signal.kind) {
    case 'keyword':
      return signal.field === 'readme' ? `${signal.label} (README)` : signal.label;
    case 'topic':
      return 'topic: mitou';
    case 'code-link':
      return signal.target === 'ipa'
        ? 'IPA 未踏ページへのリンクあり'
        : '未踏ジュニアへのリンクあり';
    case 'official-link': {
      const y = signal.fiscalYear === null ? '' : ` ${signal.fiscalYear}`;
      const v =
        signal.verified === 'alive' ? '実在確認済' : signal.verified === 'dead' ? '404' : '未確認';
      return `公式ページ(${signal.category}${y}, ${v})`;
    }
    case 'doc-file':
      return `資料ファイル: ${signal.docKind}`;
    case 'penalty':
      return `⚠ ${signal.label}`;
  }
}

/** 後方互換の reasons 配列（重複排除・出現順）。 */
export function reasonsOf(ev: Evaluation): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of ev.signals) {
    const label = signalLabel(s);
    if (seen.has(label)) continue;
    seen.add(label);
    out.push(label);
  }
  return out;
}

function normalizeDescription(desc: string): string {
  return desc.replace(/\s+/g, ' ').trim();
}

/** Evaluation を candidates.json の 1 要素（snake_case 契約）へ変換する。 */
export function toCandidateOutput(ev: Evaluation): CandidateOutput {
  return {
    full_name: ev.repo.displayName,
    url: ev.repo.url,
    description: normalizeDescription(ev.repo.description),
    stars: ev.repo.stars,
    score: ev.score,
    reasons: reasonsOf(ev),
    confidence: ev.confidence,
    category: ev.classification.category,
    fiscal_year: ev.classification.fiscalYear,
  };
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** 候補一覧を Markdown テーブルで整形する。 */
export function renderCandidatesMarkdown(evals: readonly Evaluation[]): string {
  if (evals.length === 0) {
    return '新しい未踏関連リポジトリの候補は見つかりませんでした。';
  }
  const lines: string[] = [];
  lines.push(`# 未踏関連リポジトリ 候補 (${evals.length}件)`);
  lines.push('');
  lines.push('| Score | 確度 | ★ | リポジトリ | 区分/年度 | 説明 | 判定理由 |');
  lines.push('| ---: | :---: | ---: | --- | --- | --- | --- |');
  for (const ev of evals) {
    const out = toCandidateOutput(ev);
    const desc = truncate(out.description, 60) || '—';
    const cat = out.category ?? '—';
    const year = out.fiscal_year ?? '—';
    lines.push(
      `| ${out.score} | ${CONFIDENCE_LABEL[out.confidence]} | ${out.stars} | ` +
        `[${out.full_name}](${out.url}) | ${cat}/${year} | ${desc} | ${out.reasons.join(', ')} |`,
    );
  }
  return lines.join('\n');
}

/** 除外・スコア内訳を含む --explain 用のテキストを整形する。 */
export function renderExplain(ev: Evaluation): string {
  const lines: string[] = [];
  lines.push(`# ${ev.repo.fullName}  score=${ev.score}  confidence=${ev.confidence}`);
  for (const s of ev.signals) {
    const sign = s.weight >= 0 ? '+' : '';
    lines.push(`  ${sign}${s.weight}  ${signalLabel(s)}`);
  }
  return lines.join('\n');
}
