/** ログ出力の port。stdout を汚さないため既定実装は stderr へ書く。 */
export interface Logger {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export interface LoggerOptions {
  /** true で debug/info も出力。 */
  verbose?: boolean;
  /** true で warn 以下を抑制。 */
  quiet?: boolean;
}

/** stderr に出力する Logger。stdout はデータ専用に保つ。 */
export class StderrLogger implements Logger {
  private readonly verbose: boolean;
  private readonly quiet: boolean;

  constructor(opts: LoggerOptions = {}) {
    this.verbose = opts.verbose ?? false;
    this.quiet = opts.quiet ?? false;
  }

  private write(prefix: string, message: string): void {
    process.stderr.write(`${prefix}${message}\n`);
  }

  debug(message: string): void {
    if (this.verbose) this.write('debug: ', message);
  }
  info(message: string): void {
    if (this.verbose && !this.quiet) this.write('', message);
  }
  warn(message: string): void {
    if (!this.quiet) this.write('warning: ', message);
  }
  error(message: string): void {
    this.write('error: ', message);
  }
}

/** テスト用のログ収集 Logger。 */
export class MemoryLogger implements Logger {
  readonly messages: { level: string; message: string }[] = [];
  debug(message: string): void {
    this.messages.push({ level: 'debug', message });
  }
  info(message: string): void {
    this.messages.push({ level: 'info', message });
  }
  warn(message: string): void {
    this.messages.push({ level: 'warn', message });
  }
  error(message: string): void {
    this.messages.push({ level: 'error', message });
  }
}
