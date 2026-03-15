import {describe, it, expect, afterEach} from 'vitest';
import {SocksClient} from '../../src/client/socksclient';
import {MockSocksServer} from '../helpers/mock-socks-server';
import {VALID_DESTINATION} from '../helpers/constants';

describe('SOCKS5 IPv6 Response Address', () => {
  let server: MockSocksServer;

  afterEach(async () => {
    if (server) {
      await server.close();
      server = undefined!;
    }
  });

  it('should handle SOCKS5 response with IPv6 address type', async () => {
    server = new MockSocksServer(5);
    server.setBehavior({
      commandResponse: 'success',
      responseAddressType: 'ipv6',
    });
    const addr = await server.listen();

    const result = await SocksClient.createConnection({
      proxy: {host: addr.host, port: addr.port, type: 5},
      command: 'connect',
      destination: VALID_DESTINATION,
      timeout: 5000,
    });

    expect(result.socket).toBeDefined();
    // The mock server sends all-zero IPv6, which should be substituted with proxy host
    expect(result.remoteHost).toBeDefined();
    expect(result.remoteHost!.host).toBe(addr.host);
    result.socket.destroy();
  });

  it('should handle SOCKS5 BIND with IPv6 response address type', async () => {
    server = new MockSocksServer(5);
    server.setBehavior({
      commandResponse: 'success',
      bindPort: 4444,
      responseAddressType: 'ipv6',
    });
    const addr = await server.listen();

    await new Promise<void>((resolve, reject) => {
      const client = new SocksClient({
        proxy: {host: addr.host, port: addr.port, type: 5},
        command: 'bind',
        destination: {host: '1.2.3.4', port: 80},
        timeout: 5000,
      });

      let boundFired = false;

      client.on('bound', (info) => {
        boundFired = true;
        expect(info.remoteHost).toBeDefined();
        expect(info.remoteHost!.port).toBe(4444);
      });

      client.on('established', (info) => {
        expect(boundFired).toBe(true);
        expect(info.remoteHost).toBeDefined();
        expect(info.remoteHost!.port).toBe(5555);
        info.socket.destroy();
        resolve();
      });

      client.on('error', reject);
      client.connect();
    });
  });
});
