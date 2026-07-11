import { FISCAL_YEAR_MIN } from '../../config.js';
import type { Classification, MitouCategory } from '../types.js';

// IPA 公式 URL: https://www.ipa.go.jp/(archive/)?jinzai/mitou/(it|target|advanced)/(20xx)/...
const IPA_URL_RE = /ipa\.go\.jp\/(?:archive\/)?jinzai\/mitou\/(it|target|advanced)\/(20\d{2})\//i;
// 未踏ジュニア: https://jr.mitou.org/projects/(20xx)/...
const MITOU_JR_URL_RE = /jr\.mitou\.org\/projects\/(20\d{2})\//i;

// テキストパターン（区分）
const TEXT_CATEGORY_RULES: readonly { re: RegExp; category: MitouCategory }[] = [
  { re: /未踏\s*IT/i, category: 'it' },
  { re: /未踏\s*ジュニア/, category: 'junior' },
  { re: /未踏\s*ターゲット/, category: 'target' },
  { re: /未踏\s*アドバンスト/, category: 'advanced' },
];

const TEXT_YEAR_NENDO_RE = /(20\d{2})\s*年度/;
const TEXT_YEAR_MITOU_RE = /mitou\s*(20\d{2}|\d{2})\b/i;

function isValidYear(year: number, currentYear: number): boolean {
  return year >= FISCAL_YEAR_MIN && year <= currentYear + 1;
}

export interface OfficialUrlClass {
  category: MitouCategory;
  fiscalYear: number;
}

/**
 * 単一の公式 URL から区分・年度を抽出する。IPA / 未踏ジュニアのいずれにも
 * 該当しない、または年度が妥当範囲外なら null。
 */
export function classifyFromUrl(url: string, currentYear: number): OfficialUrlClass | null {
  const ipa = IPA_URL_RE.exec(url);
  if (ipa) {
    const category = ipa[1]?.toLowerCase() as MitouCategory;
    const year = Number(ipa[2]);
    if (isValidYear(year, currentYear)) return { category, fiscalYear: year };
    return null;
  }
  const jr = MITOU_JR_URL_RE.exec(url);
  if (jr) {
    const year = Number(jr[1]);
    if (isValidYear(year, currentYear)) return { category: 'junior', fiscalYear: year };
  }
  return null;
}

function classifyYearFromText(text: string, currentYear: number): number | null {
  const nendo = TEXT_YEAR_NENDO_RE.exec(text);
  if (nendo?.[1]) {
    const y = Number(nendo[1]);
    if (isValidYear(y, currentYear)) return y;
  }
  const mitou = TEXT_YEAR_MITOU_RE.exec(text);
  if (mitou?.[1]) {
    const raw = mitou[1];
    const y = raw.length === 2 ? 2000 + Number(raw) : Number(raw);
    if (isValidYear(y, currentYear)) return y;
  }
  return null;
}

function classifyCategoryFromText(text: string): MitouCategory | null {
  for (const rule of TEXT_CATEGORY_RULES) {
    if (rule.re.test(text)) return rule.category;
  }
  return null;
}

export interface ClassifyInput {
  /** 掲載テキスト（full_name + description + topics + README 本文）。 */
  text: string;
  /** 抽出済みの公式 URL 候補（優先的に区分・年度を決める）。 */
  officialUrls: readonly string[];
  currentYear: number;
}

/**
 * 区分・年度を優先順位付きで抽出する。
 * 1. 公式 URL（最強、basis='official-url'）
 * 2. テキストパターン（basis='text-pattern'）
 * 3. どちらも無ければ null（推測で埋めない）。
 */
export function classifyCandidate(input: ClassifyInput): Classification {
  for (const url of input.officialUrls) {
    const c = classifyFromUrl(url, input.currentYear);
    if (c) {
      return { category: c.category, fiscalYear: c.fiscalYear, basis: 'official-url' };
    }
  }

  const category = classifyCategoryFromText(input.text);
  const fiscalYear = classifyYearFromText(input.text, input.currentYear);
  if (category !== null || fiscalYear !== null) {
    return { category, fiscalYear, basis: 'text-pattern' };
  }

  return { category: null, fiscalYear: null, basis: null };
}
