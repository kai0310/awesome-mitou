import type { Clock } from '../clock.js';
import { GitHubApiError } from './client.js';

export interface RetryPolicy {
  /** 最大リトライ回数（初回実行を除く）。 */
  maxRetries: number;
  /** 指数バックオフの基準遅延（ミリ秒）。 */
  baseDelayMs: number;
  /** バックオフの上限（ミリ秒）。 */
  maxDelayMs: number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30_000,
};

/** 403(secondary rate limit) / 429 / 5xx はリトライ対象。404 等は非対象。 */
export function isRetryableStatus(status: number | null): boolean {
  if (status === null) return false;
  return status === 403 || status === 429 || (status >= 500 && status < 600);
}

export interface WithRetryDeps {
  clock: Clock;
  policy?: RetryPolicy;
  /** [0,1) の乱数。テストで固定注入可能。 */
  random?: () => number;
}

/**
 * fn を実行し、リトライ可能な GitHubApiError なら指数バックオフ + フルジッタで再試行する。
 * Retry-After（秒）があればそれを優先。最大 policy.maxRetries 回。
 */
export async function withRetry<T>(fn: () => Promise<T>, deps: WithRetryDeps): Promise<T> {
  const policy = deps.policy ?? DEFAULT_RETRY_POLICY;
  const random = deps.random ?? Math.random;
  let attempt = 0;

  for (;;) {
    try {
      return await fn();
    } catch (err) {
      const status = err instanceof GitHubApiError ? err.status : null;
      if (attempt >= policy.maxRetries || !isRetryableStatus(status)) {
        throw err;
      }
      const delay = computeDelay(err, attempt, policy, random);
      attempt += 1;
      await deps.clock.sleep(delay);
    }
  }
}

function computeDelay(
  err: unknown,
  attempt: number,
  policy: RetryPolicy,
  random: () => number,
): number {
  if (err instanceof GitHubApiError && err.retryAfterSeconds !== null) {
    return Math.min(err.retryAfterSeconds * 1000, policy.maxDelayMs);
  }
  const exp = Math.min(policy.baseDelayMs * 2 ** attempt, policy.maxDelayMs);
  // フルジッタ: [0, exp)
  return Math.floor(random() * exp);
}
