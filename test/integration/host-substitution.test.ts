import {describe, it, expect, afterEach} from 'vitest';
import {SocksClient} from '../../src/client/socksclient';
import {MockSocksServer} from '../helpers/mock-socks-server';
import {VALID_DESTINATION} from '../helpers/constants';

describe('Host Substitution (0.0.0.0 and :: replacement)', () => {
  let server: MockSocksServer;

  afterEach(async () => {
    if (server) {
      await server.close();
      server = undefined!;
    }
  });

  it('should substitute 0.0.0.0 response with proxy host for SOCKS5 connect', async () => {
    server = new MockSocksServer(5);
    // Default responseAddressType is 'ipv4' which sends 0.0.0.0
    server.setBehavior({commandResponse: 'success'});
    const addr = await server.listen();

    const result = await SocksClient.createConnection({
      proxy: {host: addr.host, port: addr.port, type: 5},
      command: 'connect',
      destination: VALID_DESTINATION,
      timeout: 5000,
    });

    expect(result.socket).toBeDefined();
    expect(result.remoteHost).toBeDefined();
    expect(result.remoteHost!.host).toBe(addr.host);
    result.socket.destroy();
  });

  it('should substitute all-zeros IPv6 response with proxy host for SOCKS5 connect', async () => {
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
    expect(result.remoteHost).toBeDefined();
    // All-zeros IPv6 should be replaced with proxy host
    expect(result.remoteHost!.host).toBe(addr.host);
    result.socket.destroy();
  });

  it('should substitute 0.0.0.0 response with proxy host for SOCKS4 BIND', async () => {
    server = new MockSocksServer(4);
    server.setBehavior({
      commandResponse: 'success',
      bindPort: 4444,
      bindHost: '0.0.0.0',
    });
    const addr = await server.listen();

    await new Promise<void>((resolve, reject) => {
      const client = new SocksClient({
        proxy: {host: addr.host, port: addr.port, type: 4},
        command: 'bind',
        destination: {host: '1.2.3.4', port: 80},
        timeout: 5000,
      });

      client.on('bound', (info) => {
        expect(info.remoteHost).toBeDefined();
        // 0.0.0.0 should be replaced with proxy host
        expect(info.remoteHost!.host).toBe(addr.host);
        expect(info.remoteHost!.port).toBe(4444);
      });

      client.on('established', (info) => {
        info.socket.destroy();
        resolve();
      });

      client.on('error', reject);
      client.connect();
    });
  });
});
