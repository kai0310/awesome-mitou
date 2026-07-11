import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../src/infra/clock.js';
import { GitHubApiError } from '../../src/infra/github/client.js';
import {
  DEFAULT_RETRY_POLICY,
  isRetryableStatus,
  withRetry,
} from '../../src/infra/github/retry.js';

describe('isRetryableStatus', () => {
  it('403/429/5xx はリトライ対象、404/null は非対象', () => {
    expect(isRetryableStatus(403)).toBe(true);
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
    expect(isRetryableStatus(404)).toBe(false);
    expect(isRetryableStatus(200)).toBe(false);
    expect(isRetryableStatus(null)).toBe(false);
  });
});

describe('withRetry', () => {
  it('成功すればそのまま返す', async () => {
    const clock = new FakeClock();
    const result = await withRetry(() => Promise.resolve('ok'), { clock });
    expect(result).toBe('ok');
    expect(clock.sleeps).toEqual([]);
  });

  it('リトライ可能エラーで最大回数まで再試行し最後は throw', async () => {
    const clock = new FakeClock();
    let calls = 0;
    await expect(
      withRetry(
        () => {
          calls += 1;
          return Promise.reject(new GitHubApiError('rate', { status: 429 }));
        },
        { clock, random: () => 0.5 },
      ),
    ).rejects.toThrow('rate');
    expect(calls).toBe(DEFAULT_RETRY_POLICY.maxRetries + 1);
    expect(clock.sleeps).toHaveLength(DEFAULT_RETRY_POLICY.maxRetries);
    // 指数バックオフ: base*2^attempt * 0.5 = 500, 1000, 2000
    expect(clock.sleeps).toEqual([500, 1000, 2000]);
  });

  it('Retry-After を優先する', async () => {
    const clock = new FakeClock();
    let calls = 0;
    const result = await withRetry(
      () => {
        calls += 1;
        if (calls === 1) throw new GitHubApiError('sec', { status: 403, retryAfterSeconds: 7 });
        return Promise.resolve('done');
      },
      { clock, random: () => 0.5 },
    );
    expect(result).toBe('done');
    expect(clock.sleeps).toEqual([7000]);
  });

  it('404 は即座に throw（リトライしない）', async () => {
    const clock = new FakeClock();
    let calls = 0;
    await expect(
      withRetry(
        () => {
          calls += 1;
          return Promise.reject(new GitHubApiError('nf', { status: 404 }));
        },
        { clock },
      ),
    ).rejects.toThrow('nf');
    expect(calls).toBe(1);
    expect(clock.sleeps).toEqual([]);
  });
});
