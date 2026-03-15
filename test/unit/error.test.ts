import {describe, it, expect} from 'vitest';
import {SocksClientError} from '../../src/common/util';
import {SocksErrorCode} from '../../src/common/constants';

describe('SocksClientError', () => {
  const baseOptions = {
    proxy: {ipaddress: '1.2.3.4' as string, port: 1080, type: 5 as const},
    command: 'connect' as const,
    destination: {host: '1.2.3.4', port: 80},
  };

  it('should have name set to SocksClientError', () => {
    const err = new SocksClientError('test', {
      code: SocksErrorCode.InvalidSocksCommand,
      options: baseOptions,
    });
    expect(err.name).toBe('SocksClientError');
  });

  it('should be an instance of SocksClientError and Error', () => {
    const err = new SocksClientError('test', {
      code: SocksErrorCode.InvalidSocksCommand,
      options: baseOptions,
    });
    expect(err).toBeInstanceOf(SocksClientError);
    expect(err).toBeInstanceOf(Error);
  });

  it('should have a code property', () => {
    const err = new SocksClientError('test', {
      code: SocksErrorCode.InvalidSocksCommand,
      options: baseOptions,
    });
    expect(err.code).toBe('ERR_SOCKS_INVALID_COMMAND');
  });

  it('should have an options property', () => {
    const err = new SocksClientError('test', {
      code: SocksErrorCode.InvalidSocksCommand,
      options: baseOptions,
    });
    expect(err.options).toStrictEqual(baseOptions);
  });

  it('should have a detail property when provided', () => {
    const detail = {responseCode: 0x5b, responseName: 'Failed'};
    const err = new SocksClientError('test', {
      code: SocksErrorCode.Socks4ProxyRejectedConnection,
      options: baseOptions,
      detail,
    });
    expect(err.detail).toStrictEqual(detail);
  });

  it('should have undefined detail when not provided', () => {
    const err = new SocksClientError('test', {
      code: SocksErrorCode.InvalidSocksCommand,
      options: baseOptions,
    });
    expect(err.detail).toBeUndefined();
  });

  it('should chain cause when provided', () => {
    const cause = new Error('original error');
    const err = new SocksClientError('wrapped', {
      code: SocksErrorCode.SocketError,
      options: baseOptions,
      cause,
    });
    expect(err.cause).toBe(cause);
  });

  it('should have undefined cause when not provided', () => {
    const err = new SocksClientError('test', {
      code: SocksErrorCode.InvalidSocksCommand,
      options: baseOptions,
    });
    expect(err.cause).toBeUndefined();
  });

  it('should preserve the message string', () => {
    const msg = 'An invalid SOCKS command was provided.';
    const err = new SocksClientError(msg, {
      code: SocksErrorCode.InvalidSocksCommand,
      options: baseOptions,
    });
    expect(err.message).toBe(msg);
  });
});

describe('SocksClientError.toJSON()', () => {
  const baseOptions = {
    proxy: {ipaddress: '1.2.3.4' as string, port: 1080, type: 5 as const},
    command: 'connect' as const,
    destination: {host: '1.2.3.4', port: 80},
  };

  it('should return an object with name, message, code, and detail', () => {
    const detail = {responseCode: 0x5b, responseName: 'Failed'};
    const err = new SocksClientError('test message', {
      code: SocksErrorCode.Socks4ProxyRejectedConnection,
      options: baseOptions,
      detail,
    });

    const json = err.toJSON();

    expect(json.name).toBe('SocksClientError');
    expect(json.message).toBe('test message');
    expect(json.code).toBe('ERR_SOCKS4_PROXY_REJECTED');
    expect(json.detail).toStrictEqual(detail);
  });

  it('should NOT include options in the JSON output (credential redaction)', () => {
    const err = new SocksClientError('test message', {
      code: SocksErrorCode.InvalidSocksCommand,
      options: {
        ...baseOptions,
        proxy: {
          ...baseOptions.proxy,
          userId: 'secretuser',
          password: 'secretpass',
        },
      },
    });

    const json = err.toJSON();

    expect(json).not.toHaveProperty('options');
    expect(json.name).toBe('SocksClientError');
    expect(json.message).toBe('test message');
    expect(json.code).toBe('ERR_SOCKS_INVALID_COMMAND');
  });

  it('should have undefined detail when not provided', () => {
    const err = new SocksClientError('no detail', {
      code: SocksErrorCode.InvalidSocksCommand,
      options: baseOptions,
    });

    const json = err.toJSON();

    expect(json.detail).toBeUndefined();
  });
});

describe('SocksErrorCode', () => {
  it('should have all unique error code values', () => {
    const values = Object.values(SocksErrorCode);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });

  it('should have all codes starting with ERR_', () => {
    for (const value of Object.values(SocksErrorCode)) {
      expect(value).toMatch(/^ERR_/);
    }
  });
});
