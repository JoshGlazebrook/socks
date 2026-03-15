import {describe, it, expect, afterEach} from 'vitest';
import {SocksClient, SocksClientError} from '../../src/client/socksclient';
import {SocksErrorCode} from '../../src/common/constants';
import {MockSocksServer} from '../helpers/mock-socks-server';
import {VALID_DESTINATION} from '../helpers/constants';

describe('Timeout and Socket Close Integration', () => {
  let server: MockSocksServer;

  afterEach(async () => {
    if (server) {
      await server.close();
      server = undefined!;
    }
  });

  it('should emit ERR_SOCKS_PROXY_TIMEOUT when connection times out', async () => {
    server = new MockSocksServer(5);
    // Delay response longer than the timeout
    server.setBehavior({responseDelay: 5000});
    const addr = await server.listen();

    await expect(
      SocksClient.createConnection({
        proxy: {host: addr.host, port: addr.port, type: 5},
        command: 'connect',
        destination: VALID_DESTINATION,
        timeout: 500,
      }),
    ).rejects.toSatisfy((err: SocksClientError) => {
      expect(err).toBeInstanceOf(SocksClientError);
      expect(err.code).toBe(SocksErrorCode.ProxyConnectionTimedOut);
      return true;
    });
  }, 10000);

  it('should emit ERR_SOCKS_SOCKET_CLOSED when server closes connection', async () => {
    server = new MockSocksServer(5);
    server.setBehavior({closeOnConnect: true});
    const addr = await server.listen();

    await expect(
      SocksClient.createConnection({
        proxy: {host: addr.host, port: addr.port, type: 5},
        command: 'connect',
        destination: VALID_DESTINATION,
        timeout: 5000,
      }),
    ).rejects.toSatisfy((err: SocksClientError) => {
      expect(err).toBeInstanceOf(SocksClientError);
      // Could be SocketClosed or SocketError depending on timing
      expect([
        SocksErrorCode.SocketClosed,
        SocksErrorCode.SocketError,
      ]).toContain(err.code);
      return true;
    });
  });
});
