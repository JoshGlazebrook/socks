import type {
  SocksClientOptions,
  SocksClientChainOptions,
  SocksErrorCode,
} from './constants.js';

interface SocksClientErrorOptions {
  code: SocksErrorCode;
  options?: SocksClientOptions | SocksClientChainOptions;
  detail?: Record<string, unknown>;
  cause?: Error;
}

/**
 * Error wrapper for SocksClient
 */
class SocksClientError extends Error {
  readonly code: SocksErrorCode;
  readonly options?: SocksClientOptions | SocksClientChainOptions;
  readonly detail?: Record<string, unknown>;

  constructor(message: string, errorOptions: SocksClientErrorOptions) {
    super(message, {cause: errorOptions.cause});
    this.name = 'SocksClientError';
    this.code = errorOptions.code;
    this.options = errorOptions.options
      ? SocksClientError.redactOptions(errorOptions.options)
      : undefined;
    this.detail = errorOptions.detail;
  }

  /**
   * Returns a JSON-serializable representation of this error.
   * Useful for structured logging systems where Error properties
   * are not enumerable by default.
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      detail: this.detail,
    };
  }

  /**
   * Returns a copy of the options with credentials redacted to prevent leaking
   * sensitive information in logs or error-tracking services.
   */
  private static redactOptions(
    options: SocksClientOptions | SocksClientChainOptions,
  ): SocksClientOptions | SocksClientChainOptions {
    const redacted = {...options};
    if ('proxy' in redacted && redacted.proxy) {
      const proxy = {...redacted.proxy};
      if (proxy.userId !== undefined) proxy.userId = '[redacted]';
      if (proxy.password !== undefined) proxy.password = '[redacted]';
      redacted.proxy = proxy;
    }
    if ('proxies' in redacted && Array.isArray(redacted.proxies)) {
      redacted.proxies = redacted.proxies.map((p) => {
        const proxy = {...p};
        if (proxy.userId !== undefined) proxy.userId = '[redacted]';
        if (proxy.password !== undefined) proxy.password = '[redacted]';
        return proxy;
      });
    }
    return redacted;
  }
}

class SocksTimeoutError extends SocksClientError {
  constructor(message: string, errorOptions: SocksClientErrorOptions) {
    super(message, errorOptions);
    this.name = 'SocksTimeoutError';
  }
}

class SocksAuthenticationError extends SocksClientError {
  constructor(message: string, errorOptions: SocksClientErrorOptions) {
    super(message, errorOptions);
    this.name = 'SocksAuthenticationError';
  }
}

/**
 * Shuffles a given array.
 * @param array The array to shuffle.
 */
function shuffleArray<T>(array: T[]): void {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

/**
 * Type guard for SocksClientError instances.
 * Useful for narrowing caught errors in try/catch blocks.
 */
function isSocksError(err: unknown): err is SocksClientError {
  return err instanceof SocksClientError;
}

export {
  SocksClientError,
  SocksTimeoutError,
  SocksAuthenticationError,
  shuffleArray,
  isSocksError,
};

export type {SocksClientErrorOptions};
