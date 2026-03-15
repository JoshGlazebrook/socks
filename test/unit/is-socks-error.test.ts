import {describe, it, expect} from 'vitest';
import {
  SocksClientError,
  SocksTimeoutError,
  SocksAuthenticationError,
  isSocksError,
  SocksErrorCode,
} from '../../src/client/socksclient';

describe('isSocksError', () => {
  it('should return true for SocksClientError', () => {
    const err = new SocksClientError('test', {code: SocksErrorCode.InternalError});
    expect(isSocksError(err)).toBe(true);
  });

  it('should return true for SocksTimeoutError', () => {
    const err = new SocksTimeoutError('timeout', {code: SocksErrorCode.ProxyConnectionTimedOut});
    expect(isSocksError(err)).toBe(true);
  });

  it('should return true for SocksAuthenticationError', () => {
    const err = new SocksAuthenticationError('auth failed', {code: SocksErrorCode.Socks5AuthenticationFailed});
    expect(isSocksError(err)).toBe(true);
  });

  it('should return false for plain Error', () => {
    expect(isSocksError(new Error('test'))).toBe(false);
  });

  it('should return false for non-error values', () => {
    expect(isSocksError('string')).toBe(false);
    expect(isSocksError(null)).toBe(false);
    expect(isSocksError(undefined)).toBe(false);
    expect(isSocksError(42)).toBe(false);
  });
});
