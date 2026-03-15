import {describe, it, expect} from 'vitest';
import * as socks from '../../src/index';

describe('public API exports', () => {
  it('should export SocksClient', () => {
    expect(socks.SocksClient).toBeDefined();
    expect(typeof socks.SocksClient).toBe('function');
  });

  it('should export error classes', () => {
    expect(socks.SocksClientError).toBeDefined();
    expect(socks.SocksTimeoutError).toBeDefined();
    expect(socks.SocksAuthenticationError).toBeDefined();
  });

  it('should export isSocksError type guard', () => {
    expect(typeof socks.isSocksError).toBe('function');
  });

  it('should export SocksErrorCode', () => {
    expect(socks.SocksErrorCode).toBeDefined();
    expect(socks.SocksErrorCode.InternalError).toBe('ERR_SOCKS_INTERNAL');
  });

  it('should export enums', () => {
    expect(socks.SocksCommand).toBeDefined();
    expect(socks.Socks4Response).toBeDefined();
    expect(socks.Socks5Auth).toBeDefined();
    expect(socks.Socks5HostType).toBeDefined();
    expect(socks.Socks5Response).toBeDefined();
  });

  it('should export Socks4ResponseName reverse lookup map', () => {
    expect(socks.Socks4ResponseName).toBeDefined();
    expect(socks.Socks4ResponseName[0x5a]).toBe('Granted');
    expect(socks.Socks4ResponseName[0x5b]).toBe('Failed');
  });

  it('should export Socks5ResponseName reverse lookup map', () => {
    expect(socks.Socks5ResponseName).toBeDefined();
    expect(socks.Socks5ResponseName[0x00]).toBe('Granted');
    expect(socks.Socks5ResponseName[0x01]).toBe('Failure');
  });
});
