import { parseArgs } from 'node:util';
import { PIPELINE } from '../config.js';

/** 使用法エラー（未知フラグ・不正引数）。exit code 2 に対応。 */
export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsageError';
  }
}

export interface DiscoverOptions {
  json: boolean;
  minScore: number;
  limit: number;
  /** enrichment を実施するか（--no-enrich で false）。 */
  enrich: boolean;
  explain: boolean;
  verbose: boolean;
  quiet: boolean;
}

function toNumber(value: string, flag: string): number {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new UsageError(`${flag} には数値を指定してください: "${value}"`);
  return n;
}

/** discover サブコマンドの引数を解析する。未知フラグは UsageError。 */
export function parseDiscoverArgs(argv: readonly string[]): DiscoverOptions {
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({
      args: [...argv],
      allowPositionals: false,
      strict: true,
      options: {
        json: { type: 'boolean', default: false },
        'min-score': { type: 'string' },
        limit: { type: 'string' },
        'no-enrich': { type: 'boolean', default: false },
        explain: { type: 'boolean', default: false },
        verbose: { type: 'boolean', default: false },
        quiet: { type: 'boolean', default: false },
      },
    });
  } catch (err) {
    throw new UsageError(err instanceof Error ? err.message : String(err));
  }
  const v = parsed.values;
  const minScoreRaw = v['min-score'];
  const limitRaw = v.limit;
  return {
    json: v.json === true,
    minScore:
      typeof minScoreRaw === 'string'
        ? toNumber(minScoreRaw, '--min-score')
        : PIPELINE.defaultMinScore,
    limit: typeof limitRaw === 'string' ? toNumber(limitRaw, '--limit') : PIPELINE.defaultLimit,
    enrich: v['no-enrich'] !== true,
    explain: v.explain === true,
    verbose: v.verbose === true,
    quiet: v.quiet === true,
  };
}

export const DISCOVER_USAGE =
  'usage: mitou discover [--json] [--min-score N] [--limit N] [--no-enrich] [--explain] [--verbose] [--quiet]';
