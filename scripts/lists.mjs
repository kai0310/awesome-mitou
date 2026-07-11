// 未踏候補の管理リスト(mitou-lists.json)の読み書きを行う共通モジュール兼CLI。
//
//   blockedOwners  : このowner/orgのリポジトリは一切検出しない
//   blockedRepos   : 誤検知として検出対象から除外するリポジトリ (owner/repo)
//   acceptedRepos  : 候補PRがマージ/確認済みで、再検出しないリポジトリ (owner/repo)
//
// CLI:
//   node scripts/lists.mjs add blockedRepos owner/repo
//   node scripts/lists.mjs add blockedOwners some-org
//   node scripts/lists.mjs add acceptedRepos owner/repo

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const LISTS_PATH = join(__dirname, 'mitou-lists.json');
export const LIST_KEYS = ['blockedOwners', 'blockedRepos', 'acceptedRepos'];

export function readListsRaw() {
  try {
    const data = JSON.parse(readFileSync(LISTS_PATH, 'utf8'));
    for (const k of LIST_KEYS) if (!Array.isArray(data[k])) data[k] = [];
    return data;
  } catch {
    return { blockedOwners: [], blockedRepos: [], acceptedRepos: [] };
  }
}

// 小文字化した Set で返す(照合用)
export function loadLists() {
  const raw = readListsRaw();
  const toSet = (arr) => new Set(arr.map((s) => String(s).toLowerCase()));
  return {
    blockedOwners: toSet(raw.blockedOwners),
    blockedRepos: toSet(raw.blockedRepos),
    acceptedRepos: toSet(raw.acceptedRepos),
  };
}

// owner/repo 形式に正規化(URL・末尾スラッシュ・.git を除去)
export function normalizeRepo(value) {
  return String(value)
    .trim()
    .replace(/^https?:\/\/github\.com\//i, '')
    .replace(/\.git$/, '')
    .replace(/[/\s]+$/, '');
}

// 値を追加して保存。追加したら true、既存なら false。
export function addToList(key, value) {
  if (!LIST_KEYS.includes(key)) throw new Error(`unknown list: ${key}`);
  const raw = readListsRaw();
  const val = key === 'blockedOwners' ? String(value).trim() : normalizeRepo(value);
  if (!val) throw new Error('empty value');
  const lower = val.toLowerCase();
  if (raw[key].some((x) => String(x).toLowerCase() === lower)) return false;
  raw[key].push(val);
  raw[key].sort((a, b) => String(a).toLowerCase().localeCompare(String(b).toLowerCase()));
  writeFileSync(LISTS_PATH, JSON.stringify(raw, null, 2) + '\n');
  return true;
}

// CLI として直接実行された場合
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [cmd, key, value] = process.argv.slice(2);
  if (cmd === 'add' && key && value) {
    const added = addToList(key, value);
    process.stdout.write((added ? `added "${value}" to ${key}` : `"${value}" already in ${key}`) + '\n');
  } else {
    process.stderr.write('usage: node scripts/lists.mjs add <blockedOwners|blockedRepos|acceptedRepos> <value>\n');
    process.exit(1);
  }
}
