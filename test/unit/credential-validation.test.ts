import {describe, it, expect} from 'vitest';
import {SocksClientError} from '../../src/common/util';
import {SocksErrorCode} from '../../src/common/constants';
import {validateSocksClientOptions} from '../../src/common/helpers';

describe('Credential length validation (RFC 1929)', () => {
  const validProxy = {ipaddress: '1.2.3.4', port: 1080, type: 5 as const};
  const validDest = {host: '1.2.3.4', port: 80};

  it('should accept userId of exactly 255 bytes', () => {
    expect(() => {
      validateSocksClientOptions({
        proxy: {...validProxy, userId: 'a'.repeat(255)},
        command: 'connect',
        destination: validDest,
      });
    }).not.toThrow();
  });

  it('should reject userId exceeding 255 bytes', () => {
    expect(() => {
      validateSocksClientOptions({
        proxy: {...validProxy, userId: 'a'.repeat(256)},
        command: 'connect',
        destination: validDest,
      });
    }).toThrow(SocksClientError);
  });

  it('should reject userId exceeding 255 bytes with correct error code', () => {
    try {
      validateSocksClientOptions({
        proxy: {...validProxy, userId: 'a'.repeat(256)},
        command: 'connect',
        destination: validDest,
      });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(SocksClientError);
      expect((err as SocksClientError).code).toBe(
        SocksErrorCode.InvalidSocksClientOptionsCredentialLength,
      );
    }
  });

  it('should accept password of exactly 255 bytes', () => {
    expect(() => {
      validateSocksClientOptions({
        proxy: {...validProxy, password: 'b'.repeat(255)},
        command: 'connect',
        destination: validDest,
      });
    }).not.toThrow();
  });

  it('should reject password exceeding 255 bytes', () => {
    expect(() => {
      validateSocksClientOptions({
        proxy: {...validProxy, password: 'b'.repeat(256)},
        command: 'connect',
        destination: validDest,
      });
    }).toThrow(SocksClientError);
  });

  it('should handle multi-byte UTF-8 characters in userId', () => {
    // Each emoji is 4 bytes, so 64 emojis = 256 bytes > 255 limit
    const longUserId = '\u{1F600}'.repeat(64);
    expect(Buffer.byteLength(longUserId)).toBeGreaterThan(255);

    expect(() => {
      validateSocksClientOptions({
        proxy: {...validProxy, userId: longUserId},
        command: 'connect',
        destination: validDest,
      });
    }).toThrow(SocksClientError);
  });
});

describe('Empty hostname validation', () => {
  const validProxy = {ipaddress: '1.2.3.4', port: 1080, type: 5 as const};

  it('should reject empty string as destination host', () => {
    expect(() => {
      validateSocksClientOptions({
        proxy: validProxy,
        command: 'connect',
        destination: {host: '', port: 80},
      });
    }).toThrow(SocksClientError);
  });
});
