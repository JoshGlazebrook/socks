import {describe, it, expect, afterEach} from 'vitest';
import {SocksClient, SocksClientError} from '../../src/client/socksclient';
import {MockSocksServer} from '../helpers/mock-socks-server';

describe('ASSOCIATE Rejection Integration', () => {
  let server: MockSocksServer;

  afterEach(async () => {
    if (server) {
      await server.close();
      server = undefined!;
    }
  });

  it('should emit error when SOCKS5 proxy rejects ASSOCIATE command', async () => {
    server = new MockSocksServer(5);
    server.setBehavior({commandResponse: 0x02}); // NotAllowed
    const addr = await server.listen();

    await new Promise<void>((resolve, reject) => {
      const client = new SocksClient({
        proxy: {host: addr.host, port: addr.port, type: 5},
        command: 'associate',
        destination: {host: '0.0.0.0', port: 0},
        timeout: 5000,
      });

      client.on('established', () => {
        reject(new Error('Should not have established'));
      });

      client.on('error', (err) => {
        expect(err).toBeInstanceOf(SocksClientError);
        expect(err.code).toBe('ERR_SOCKS5_PROXY_REJECTED');
        resolve();
      });

      client.connect();
    });
  });

  it('should reject promise when SOCKS5 proxy rejects ASSOCIATE via createConnection', async () => {
    server = new MockSocksServer(5);
    server.setBehavior({commandResponse: 0x07}); // CommandNotSupported
    const addr = await server.listen();

    await expect(
      SocksClient.createConnection({
        proxy: {host: addr.host, port: addr.port, type: 5},
        command: 'associate',
        destination: {host: '0.0.0.0', port: 0},
        timeout: 5000,
      }),
    ).rejects.toThrow(SocksClientError);
  });
});
