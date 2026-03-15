import {describe, it, expect, afterEach} from 'vitest';
import {SocksClient} from '../../src/client/socksclient';
import {MockSocksServer} from '../helpers/mock-socks-server';
import {VALID_DESTINATION} from '../helpers/constants';

describe('Excess Data Re-emission', () => {
  let server: MockSocksServer;

  afterEach(async () => {
    if (server) {
      await server.close();
      server = undefined!;
    }
  });

  it('should re-emit data received after the SOCKS5 handshake completes', async () => {
    const extraData = Buffer.from('HTTP/1.1 200 OK\r\n');

    server = new MockSocksServer(5);
    server.setBehavior({
      commandResponse: 'success',
      extraDataAfterHandshake: extraData,
    });
    const addr = await server.listen();

    const result = await SocksClient.createConnection({
      proxy: {host: addr.host, port: addr.port, type: 5},
      command: 'connect',
      destination: VALID_DESTINATION,
      timeout: 5000,
    });

    expect(result.socket).toBeDefined();

    // Wait for the excess data to be re-emitted
    const received = await new Promise<Buffer>((resolve) => {
      result.socket.once('data', (data: Buffer) => {
        resolve(data);
      });
    });

    expect(received.toString()).toBe('HTTP/1.1 200 OK\r\n');
    result.socket.destroy();
  });
});
