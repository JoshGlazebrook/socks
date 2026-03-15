import {describe, it, expect} from 'vitest';
import {SocksClientError} from '../../src/common/util';
import {SocksErrorCode} from '../../src/common/constants';

describe('Credential redaction in errors', () => {
  it('should redact userId and password from SocksClientError options', () => {
    const error = new SocksClientError('test error', {
      code: SocksErrorCode.Socks5AuthenticationFailed,
      options: {
        command: 'connect',
        destination: {host: '1.2.3.4', port: 80},
        proxy: {
          host: '127.0.0.1',
          port: 1080,
          type: 5,
          userId: 'secretuser',
          password: 'secretpass',
        },
      },
    });

    const opts = error.options as any;
    expect(opts.proxy.userId).toBe('[redacted]');
    expect(opts.proxy.password).toBe('[redacted]');
    // Other fields should be preserved
    expect(opts.proxy.host).toBe('127.0.0.1');
    expect(opts.proxy.port).toBe(1080);
    expect(opts.proxy.type).toBe(5);
  });

  it('should not add redacted fields when credentials are not set', () => {
    const error = new SocksClientError('test error', {
      code: SocksErrorCode.SocketClosed,
      options: {
        command: 'connect',
        destination: {host: '1.2.3.4', port: 80},
        proxy: {
          host: '127.0.0.1',
          port: 1080,
          type: 5,
        },
      },
    });

    const opts = error.options as any;
    expect(opts.proxy.userId).toBeUndefined();
    expect(opts.proxy.password).toBeUndefined();
  });

  it('should redact credentials in chain options proxies', () => {
    const error = new SocksClientError('test error', {
      code: SocksErrorCode.SocketClosed,
      options: {
        command: 'connect',
        destination: {host: '1.2.3.4', port: 80},
        proxies: [
          {host: '127.0.0.1', port: 1080, type: 5, userId: 'user1', password: 'pass1'},
          {host: '127.0.0.2', port: 1081, type: 5, userId: 'user2', password: 'pass2'},
        ],
      } as any,
    });

    const opts = error.options as any;
    expect(opts.proxies[0].userId).toBe('[redacted]');
    expect(opts.proxies[0].password).toBe('[redacted]');
    expect(opts.proxies[1].userId).toBe('[redacted]');
    expect(opts.proxies[1].password).toBe('[redacted]');
    // Other fields preserved
    expect(opts.proxies[0].host).toBe('127.0.0.1');
    expect(opts.proxies[1].host).toBe('127.0.0.2');
  });

  it('should not mutate original options object', () => {
    const originalOptions = {
      command: 'connect' as const,
      destination: {host: '1.2.3.4', port: 80},
      proxy: {
        host: '127.0.0.1',
        port: 1080,
        type: 5 as const,
        userId: 'secretuser',
        password: 'secretpass',
      },
    };

    new SocksClientError('test error', {
      code: SocksErrorCode.SocketClosed,
      options: originalOptions,
    });

    // Original should not be modified
    expect(originalOptions.proxy.userId).toBe('secretuser');
    expect(originalOptions.proxy.password).toBe('secretpass');
  });
});
