import {describe, it, expect, afterEach} from 'vitest';
import * as net from 'node:net';
import {SocksClient} from '../../src/client/socksclient';
import {MockSocksServer} from '../helpers/mock-socks-server';
import {VALID_DESTINATION} from '../helpers/constants';

describe('SOCKS5 Existing Socket', () => {
  let server: MockSocksServer;

  afterEach(async () => {
    if (server) {
      await server.close();
      server = undefined!;
    }
  });

  it('should establish connection using an existing socket', async () => {
    server = new MockSocksServer(5);
    server.setBehavior({commandResponse: 'success'});
    const addr = await server.listen();

    // Manually connect a net.Socket to the mock server
    const existingSocket = await new Promise<net.Socket>((resolve, reject) => {
      const sock = net.createConnection(
        {host: addr.host, port: addr.port},
        () => {
          resolve(sock);
        },
      );
      sock.on('error', reject);
    });

    // Pass the already-connected socket as existing_socket
    const result = await SocksClient.createConnection({
      proxy: {host: addr.host, port: addr.port, type: 5},
      command: 'connect',
      destination: VALID_DESTINATION,
      timeout: 5000,
      existing_socket: existingSocket,
    });

    expect(result.socket).toBeDefined();
    // The returned socket should be the same socket we passed in
    expect(result.socket).toBe(existingSocket);
    result.socket.destroy();
  });
});
