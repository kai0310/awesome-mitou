#!/usr/bin/env node
// find-mitou-repos.mjs --json の出力を読み、新規候補ごとに PR を作成する(GitHub Actions 用)。
//
// 各 PR は scripts/mitou-lists.json の acceptedRepos に対象リポジトリを追加する差分を持つ。
//   - マージされる  → acceptedRepos に入り、以降は再検出されない
//   - close される  → blocklist-on-pr-close ワークフローが blockedRepos に追加する
// PR 本文にはマシン可読なマーカー `<!-- mitou-candidate: owner/repo -->` を埋め込む。
//
// 使い方: node scripts/open-candidate-prs.mjs candidates.json
// 環境変数: MAX_PRS(1回の実行で作る PR 上限, 既定 5), GITHUB_TOKEN(gh 用)

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const MAX_PRS = Number(process.env.MAX_PRS || 5);
const LABEL = 'mitou-auto-discovery';

function run(cmd, cmdArgs) {
  return execFileSync(cmd, cmdArgs, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}
const git = (a) => run('git', a);
const gh = (a) => run('gh', a);

function branchFor(fullName) {
  return 'discover/' + fullName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function openPrExists(branch) {
  try {
    return JSON.parse(gh(['pr', 'list', '--state', 'open', '--head', branch, '--json', 'number'])).length > 0;
  } catch {
    return false;
  }
}

function buildBody(c) {
  return [
    `<!-- mitou-candidate: ${c.full_name} -->`,
    '未踏関連リポジトリの候補を自動検出しました。内容を確認のうえ、',
    '**適切であればマージ**(= 追跡対象に登録)、**誤検知であれば close**(= ブラックリストへ自動追加)してください。',
    '',
    `- リポジトリ: [${c.full_name}](${c.url})`,
    `- スコア: ${c.score} / ★${c.stars}`,
    `- 説明: ${c.description || '—'}`,
    `- 判定理由: ${(c.reasons || []).join(', ')}`,
    '',
    'この PR は `scripts/mitou-lists.json` の `acceptedRepos` に上記リポジトリを追加します。',
    'README への具体的な追記(年度・事業区分の分類)は、マージ後に手動で行ってください。',
  ].join('\n');
}

function main() {
  const file = process.argv[2] || 'candidates.json';
  let candidates = [];
  try {
    candidates = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    process.stderr.write(`候補ファイルを読めませんでした: ${file}\n`);
    return;
  }
  if (candidates.length === 0) {
    process.stdout.write('新規候補はありません。\n');
    return;
  }

  git(['config', 'user.name', 'github-actions[bot]']);
  git(['config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com']);
  git(['fetch', 'origin', 'main']);
  try {
    gh(['label', 'create', LABEL, '-c', '0e8a16', '-d', '自動検出された未踏候補', '--force']);
  } catch {
    /* ラベルは無くても続行 */
  }

  let created = 0;
  for (const c of candidates) {
    if (created >= MAX_PRS) break;
    const branch = branchFor(c.full_name);
    if (openPrExists(branch)) {
      process.stdout.write(`skip(既存PRあり): ${c.full_name}\n`);
      continue;
    }
    try {
      git(['checkout', '-B', branch, 'origin/main']);
      const added = run('node', ['scripts/lists.mjs', 'add', 'acceptedRepos', c.full_name]);
      git(['add', 'scripts/mitou-lists.json']);
      git(['commit', '-m', `chore: 未踏候補 ${c.full_name} を追跡対象に追加`]);
      git(['push', '--force', 'origin', branch]);
      gh([
        'pr', 'create',
        '--base', 'main',
        '--head', branch,
        '--title', `候補: ${c.full_name} を追加`,
        '--body', buildBody(c),
        '--label', LABEL,
      ]);
      created++;
      process.stdout.write(`PR作成: ${c.full_name} (${added.trim()})\n`);
    } catch (err) {
      process.stderr.write(`PR作成失敗 ${c.full_name}: ${(err.stderr || err.message || '').toString().trim()}\n`);
    }
  }
  process.stdout.write(`作成した PR: ${created} 件\n`);
}

main();
