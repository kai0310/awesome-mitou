/** 時刻取得と待機を抽象化する port。テストでは FakeClock に差し替える。 */
export interface Clock {
  /** 現在時刻（ミリ秒）。 */
  now(): number;
  /** ms ミリ秒待機する。 */
  sleep(ms: number): Promise<void>;
}

export class SystemClock implements Clock {
  now(): number {
    return Date.now();
  }
  sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * テスト用の Clock。sleep は実時間を消費せず、待機要求を記録し now を進める。
 * vi.useFakeTimers と併用する必要はない（自己完結）。
 */
export class FakeClock implements Clock {
  private current: number;
  readonly sleeps: number[] = [];

  constructor(start = 0) {
    this.current = start;
  }

  now(): number {
    return this.current;
  }

  sleep(ms: number): Promise<void> {
    this.sleeps.push(ms);
    this.current += ms;
    return Promise.resolve();
  }
}
