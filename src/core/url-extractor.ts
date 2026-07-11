export interface ExtractedUrl {
  /** 正規化後の URL（末尾句読点・閉じ括弧を除去）。 */
  url: string;
}

// URL 本文は空白・閉じ括弧・引用符に加え、全角句読点でも停止する（CJK 文中の URL 対策）。
const URL_RE = /(https?:\/\/[^\s)>\]"'`、。（）「」『』　]+)/g;

/**
 * Markdown / テキストから http(s) URL を抽出する。
 * 末尾の閉じ括弧・句読点は除去し、重複を排除して出現順に返す。
 */
export function extractUrls(text: string): ExtractedUrl[] {
  const seen = new Set<string>();
  const out: ExtractedUrl[] = [];
  for (const m of text.matchAll(URL_RE)) {
    const raw = m[1];
    if (raw === undefined) continue;
    const url = raw.replace(/[.,;:)\]、。）」』]+$/, '');
    if (url === '' || seen.has(url)) continue;
    seen.add(url);
    out.push({ url });
  }
  return out;
}
