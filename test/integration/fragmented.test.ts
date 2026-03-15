import {describe, it, expect, afterEach} from 'vitest';
import {SocksClient} from '../../src/client/socksclient';
import {MockSocksServer} from '../helpers/mock-socks-server';
import {VALID_DESTINATION} from '../helpers/constants';

describe('Fragmented Response Integration', () => {
  let server: MockSocksServer;

  afterEach(async () => {
    if (server) {
      await server.close();
      server = undefined!;
    }
  });

  it('should handle SOCKS5 connect with fragmented (byte-by-byte) responses', async () => {
    server = new MockSocksServer(5);
    server.setBehavior({
      commandResponse: 'success',
      fragmentResponses: true,
    });
    const addr = await server.listen();

    const result = await SocksClient.createConnection({
      proxy: {host: addr.host, port: addr.port, type: 5},
      command: 'connect',
      destination: VALID_DESTINATION,
      timeout: 10000,
    });

    expect(result.socket).toBeDefined();
    result.socket.destroy();
  });

  it('should handle SOCKS4 connect with fragmented (byte-by-byte) responses', async () => {
    server = new MockSocksServer(4);
    server.setBehavior({
      commandResponse: 'success',
      fragmentResponses: true,
    });
    const addr = await server.listen();

    const result = await SocksClient.createConnection({
      proxy: {host: addr.host, port: addr.port, type: 4},
      command: 'connect',
      destination: VALID_DESTINATION,
      timeout: 10000,
    });

    expect(result.socket).toBeDefined();
    result.socket.destroy();
  });
});
