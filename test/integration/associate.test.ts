import {describe, it, expect, afterEach} from 'vitest';
import {SocksClient} from '../../src/client/socksclient';
import {MockSocksServer} from '../helpers/mock-socks-server';

describe('ASSOCIATE Integration', () => {
  let server: MockSocksServer;

  afterEach(async () => {
    if (server) {
      await server.close();
      server = undefined!;
    }
  });

  it('should establish SOCKS5 ASSOCIATE and receive remoteHost', async () => {
    server = new MockSocksServer(5);
    server.setBehavior({commandResponse: 'success', bindPort: 4444});
    const addr = await server.listen();

    await new Promise<void>((resolve, reject) => {
      const client = new SocksClient({
        proxy: {host: addr.host, port: addr.port, type: 5},
        command: 'associate',
        destination: {host: '0.0.0.0', port: 0},
        timeout: 5000,
      });

      client.on('established', (info) => {
        expect(info.remoteHost).toBeDefined();
        expect(info.remoteHost!.port).toBe(4444);
        expect(info.socket).toBeDefined();
        info.socket.destroy();
        resolve();
      });

      client.on('error', (err) => {
        reject(err);
      });

      client.connect();
    });
  });
});
