import {describe, it, expect, afterEach} from 'vitest';
import {SocksClient, SocksClientError} from '../../src/client/socksclient';
import {MockSocksServer} from '../helpers/mock-socks-server';
import {VALID_DESTINATION} from '../helpers/constants';

describe('SocksClient.connectFromUrl Integration', () => {
  let server: MockSocksServer;

  afterEach(async () => {
    if (server) {
      await server.close();
      server = undefined!;
    }
  });

  it('should establish a connection via socks5:// URL', async () => {
    server = new MockSocksServer(5);
    server.setBehavior({commandResponse: 'success'});
    const addr = await server.listen();

    const result = await SocksClient.connectFromUrl(
      `socks5://${addr.host}:${addr.port}`,
      VALID_DESTINATION,
      {timeout: 5000},
    );

    expect(result.socket).toBeDefined();
    expect(result.socket.destroyed).toBe(false);
    result.socket.destroy();
  });

  it('should establish a connection via socks5:// URL with auth', async () => {
    server = new MockSocksServer(5);
    server.setBehavior({
      authMethodSelection: 0x02,
      authResponse: 'success',
      commandResponse: 'success',
    });
    const addr = await server.listen();

    const result = await SocksClient.connectFromUrl(
      `socks5://user:pass@${addr.host}:${addr.port}`,
      VALID_DESTINATION,
      {timeout: 5000},
    );

    expect(result.socket).toBeDefined();
    expect(result.socket.destroyed).toBe(false);
    result.socket.destroy();
  });

  it('should throw on invalid URL format', () => {
    expect(() =>
      SocksClient.parseProxyUrl('not-a-valid-url'),
    ).toThrow(SocksClientError);
  });

  it('should throw on unsupported protocol in URL', () => {
    expect(() =>
      SocksClient.parseProxyUrl('http://127.0.0.1:1080'),
    ).toThrow(/Unsupported SOCKS protocol/);
  });
});
