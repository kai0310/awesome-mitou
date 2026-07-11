#!/usr/bin/env node
// Markdown 内のリンク切れを検出する。外部サービス・LLM は使わず Node の fetch のみを使う。
//
// 使い方:
//   node scripts/check-links.mjs                 # README.md をチェックし、切れているものを表示
//   node scripts/check-links.mjs README.md ...   # 対象ファイルを指定
//   node scripts/check-links.mjs --json          # JSON 出力(Action 用)
//
// 判定: HTTP 4xx/5xx、接続エラー、タイムアウトを「切れ(broken)」とみなす。
// 一部サイトは Bot に 403 を返すため、ステータスコードを併記して人が判断できるようにする。

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_FILE = join(__dirname, '..', 'README.md');

const TIMEOUT_MS = 15000;
const CONCURRENCY = 8;
const UA = 'awesome-mitou-link-checker (+https://github.com/kai0310/awesome-mitou)';

function parseArgs(argv) {
  const args = { json: false, files: [] };
  for (const a of argv) {
    if (a === '--json') args.json = true;
    else args.files.push(a);
  }
  if (args.files.length === 0) args.files = [DEFAULT_FILE];
  return args;
}

// Markdown から http(s) URL を抽出(末尾の閉じ括弧・句読点は除去)
function extractUrls(files) {
  const urls = new Map(); // url -> Set(file)
  const re = /(https?:\/\/[^\s)>\]"'`]+)/g;
  for (const file of files) {
    let text = '';
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    let m;
    while ((m = re.exec(text)) !== null) {
      const url = m[1].replace(/[.,;:)]+$/, '');
      if (!urls.has(url)) urls.set(url, new Set());
      urls.get(url).add(file);
    }
  }
  return urls;
}

async function checkUrl(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': UA, Accept: '*/*' },
    });
    return { url, status: res.status, ok: res.status < 400 };
  } catch (err) {
    const reason = err.name === 'AbortError' ? 'timeout' : err.cause?.code || err.message;
    return { url, status: 0, ok: false, error: String(reason) };
  } finally {
    clearTimeout(timer);
  }
}

// 簡易並列プール
async function runPool(items, worker, size) {
  const results = [];
  let i = 0;
  const runners = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await worker(items[idx]);
    }
  });
  await Promise.all(runners);
  return results;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const urlMap = extractUrls(args.files);
  const urls = [...urlMap.keys()];
  const results = await runPool(urls, checkUrl, CONCURRENCY);
  const broken = results
    .filter((r) => !r.ok)
    .map((r) => ({ ...r, sources: [...urlMap.get(r.url)].map((f) => f.replace(/^.*\//, '')) }))
    .sort((a, b) => b.status - a.status);

  if (args.json) {
    process.stdout.write(JSON.stringify(broken, null, 2) + '\n');
    return;
  }

  process.stdout.write(`チェック件数: ${urls.length} / リンク切れ候補: ${broken.length}\n`);
  if (broken.length === 0) {
    process.stdout.write('リンク切れは見つかりませんでした。\n');
    return;
  }
  const lines = [];
  lines.push('');
  lines.push('| 状態 | URL | 出現ファイル |');
  lines.push('| --- | --- | --- |');
  for (const b of broken) {
    const state = b.status > 0 ? `HTTP ${b.status}` : `error: ${b.error}`;
    lines.push(`| ${state} | ${b.url} | ${b.sources.join(', ')} |`);
  }
  process.stdout.write(lines.join('\n') + '\n');
  // リンク切れがある場合は非0で終了(CI/Action 側で検知しやすくする)
  process.exitCode = 1;
}

main();
