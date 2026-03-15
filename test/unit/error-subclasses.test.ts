import {describe, it, expect, afterEach} from 'vitest';
import {
  SocksClientError,
  SocksTimeoutError,
  SocksAuthenticationError,
} from '../../src/common/util';
import {SocksClient} from '../../src/client/socksclient';
import {SocksErrorCode} from '../../src/common/constants';
import {MockSocksServer} from '../helpers/mock-socks-server';
import {VALID_DESTINATION} from '../helpers/constants';

describe('Error Subclasses', () => {
  describe('SocksTimeoutError', () => {
    it('should be an instance of SocksClientError', () => {
      const error = new SocksTimeoutError('timeout', {
        code: SocksErrorCode.ProxyConnectionTimedOut,
        options: {
          proxy: {host: '127.0.0.1', port: 1080, type: 5},
          command: 'connect',
          destination: {host: '1.2.3.4', port: 80},
        },
      });

      expect(error).toBeInstanceOf(SocksClientError);
    });

    it('should be an instance of Error', () => {
      const error = new SocksTimeoutError('timeout', {
        code: SocksErrorCode.ProxyConnectionTimedOut,
        options: {
          proxy: {host: '127.0.0.1', port: 1080, type: 5},
          command: 'connect',
          destination: {host: '1.2.3.4', port: 80},
        },
      });

      expect(error).toBeInstanceOf(Error);
    });

    it('should have name SocksTimeoutError', () => {
      const error = new SocksTimeoutError('timeout', {
        code: SocksErrorCode.ProxyConnectionTimedOut,
        options: {
          proxy: {host: '127.0.0.1', port: 1080, type: 5},
          command: 'connect',
          destination: {host: '1.2.3.4', port: 80},
        },
      });

      expect(error.name).toBe('SocksTimeoutError');
    });
  });

  describe('SocksAuthenticationError', () => {
    it('should be an instance of SocksClientError', () => {
      const error = new SocksAuthenticationError('auth failed', {
        code: SocksErrorCode.Socks5AuthenticationFailed,
        options: {
          proxy: {host: '127.0.0.1', port: 1080, type: 5},
          command: 'connect',
          destination: {host: '1.2.3.4', port: 80},
        },
      });

      expect(error).toBeInstanceOf(SocksClientError);
    });

    it('should be an instance of Error', () => {
      const error = new SocksAuthenticationError('auth failed', {
        code: SocksErrorCode.Socks5AuthenticationFailed,
        options: {
          proxy: {host: '127.0.0.1', port: 1080, type: 5},
          command: 'connect',
          destination: {host: '1.2.3.4', port: 80},
        },
      });

      expect(error).toBeInstanceOf(Error);
    });

    it('should have name SocksAuthenticationError', () => {
      const error = new SocksAuthenticationError('auth failed', {
        code: SocksErrorCode.Socks5AuthenticationFailed,
        options: {
          proxy: {host: '127.0.0.1', port: 1080, type: 5},
          command: 'connect',
          destination: {host: '1.2.3.4', port: 80},
        },
      });

      expect(error.name).toBe('SocksAuthenticationError');
    });
  });

  describe('Integration: timeout emits SocksTimeoutError', () => {
    let server: MockSocksServer;

    afterEach(async () => {
      if (server) {
        await server.close();
        server = undefined!;
      }
    });

    it('should emit SocksTimeoutError on connection timeout', async () => {
      server = new MockSocksServer(5);
      // Set a long response delay so the connection times out
      server.setBehavior({responseDelay: 10000});
      const addr = await server.listen();

      await expect(
        SocksClient.createConnection({
          proxy: {host: addr.host, port: addr.port, type: 5},
          command: 'connect',
          destination: VALID_DESTINATION,
          timeout: 200,
        }),
      ).rejects.toSatisfy((err: SocksTimeoutError) => {
        expect(err).toBeInstanceOf(SocksTimeoutError);
        expect(err).toBeInstanceOf(SocksClientError);
        expect(err.name).toBe('SocksTimeoutError');
        expect(err.code).toBe(SocksErrorCode.ProxyConnectionTimedOut);
        return true;
      });
    });
  });

  describe('Integration: auth failure emits SocksAuthenticationError', () => {
    let server: MockSocksServer;

    afterEach(async () => {
      if (server) {
        await server.close();
        server = undefined!;
      }
    });

    it('should emit SocksAuthenticationError when auth is rejected', async () => {
      server = new MockSocksServer(5);
      server.setBehavior({
        authMethodSelection: 0x02,
        authResponse: 'reject',
      });
      const addr = await server.listen();

      await expect(
        SocksClient.createConnection({
          proxy: {
            host: addr.host,
            port: addr.port,
            type: 5,
            userId: 'user',
            password: 'pass',
          },
          command: 'connect',
          destination: VALID_DESTINATION,
          timeout: 5000,
        }),
      ).rejects.toSatisfy((err: SocksAuthenticationError) => {
        expect(err).toBeInstanceOf(SocksAuthenticationError);
        expect(err).toBeInstanceOf(SocksClientError);
        expect(err.name).toBe('SocksAuthenticationError');
        expect(err.code).toBe(SocksErrorCode.Socks5AuthenticationFailed);
        return true;
      });
    });
  });
});
