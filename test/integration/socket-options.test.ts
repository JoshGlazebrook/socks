import {describe, it, expect, afterEach} from 'vitest';
import {SocksClient} from '../../src/client/socksclient';
import {MockSocksServer} from '../helpers/mock-socks-server';
import {VALID_DESTINATION} from '../helpers/constants';

describe('SOCKS5 Socket Options', () => {
  let server: MockSocksServer;

  afterEach(async () => {
    if (server) {
      await server.close();
      server = undefined!;
    }
  });

  it('should connect successfully with set_tcp_nodelay enabled', async () => {
    server = new MockSocksServer(5);
    server.setBehavior({commandResponse: 'success'});
    const addr = await server.listen();

    const result = await SocksClient.createConnection({
      proxy: {host: addr.host, port: addr.port, type: 5},
      command: 'connect',
      destination: VALID_DESTINATION,
      timeout: 5000,
      set_tcp_nodelay: true,
    });

    expect(result.socket).toBeDefined();
    result.socket.destroy();
  });
});
