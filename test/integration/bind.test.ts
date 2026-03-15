import {describe, it, expect, afterEach} from 'vitest';
import {SocksClient, SocksClientError} from '../../src/client/socksclient';
import {SocksErrorCode} from '../../src/common/constants';
import {MockSocksServer} from '../helpers/mock-socks-server';

describe('BIND Integration', () => {
  let server: MockSocksServer;

  afterEach(async () => {
    if (server) {
      await server.close();
      server = undefined!;
    }
  });

  it('should receive bound and established events for SOCKS4 BIND', async () => {
    server = new MockSocksServer(4);
    server.setBehavior({commandResponse: 'success', bindPort: 4444});
    const addr = await server.listen();

    await new Promise<void>((resolve, reject) => {
      const client = new SocksClient({
        proxy: {host: addr.host, port: addr.port, type: 4},
        command: 'bind',
        destination: {host: '1.2.3.4', port: 80},
        timeout: 5000,
      });

      let boundFired = false;

      client.on('bound', (info) => {
        boundFired = true;
        expect(info.remoteHost).toBeDefined();
        expect(info.remoteHost!.port).toBe(4444);
        expect(info.socket).toBeDefined();
      });

      client.on('established', (info) => {
        expect(boundFired).toBe(true);
        expect(info.remoteHost).toBeDefined();
        expect(info.remoteHost!.host).toBe('10.0.0.1');
        expect(info.remoteHost!.port).toBe(5555);
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

  it('should receive bound and established events for SOCKS5 BIND', async () => {
    server = new MockSocksServer(5);
    server.setBehavior({commandResponse: 'success', bindPort: 4444});
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
        expect(info.socket).toBeDefined();
      });

      client.on('established', (info) => {
        expect(boundFired).toBe(true);
        expect(info.remoteHost).toBeDefined();
        expect(info.remoteHost!.port).toBe(5555);
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

  it('should reject SOCKS4 BIND when proxy denies the request', async () => {
    server = new MockSocksServer(4);
    server.setBehavior({commandResponse: 0x5b}); // Failed
    const addr = await server.listen();

    await new Promise<void>((resolve, reject) => {
      const client = new SocksClient({
        proxy: {host: addr.host, port: addr.port, type: 4},
        command: 'bind',
        destination: {host: '1.2.3.4', port: 80},
        timeout: 5000,
      });

      client.on('bound', () => {
        reject(new Error('Should not have received bound event'));
      });

      client.on('established', () => {
        reject(new Error('Should not have received established event'));
      });

      client.on('error', (err: SocksClientError) => {
        expect(err).toBeInstanceOf(SocksClientError);
        expect(err.code).toBe(SocksErrorCode.Socks4ProxyRejectedConnection);
        resolve();
      });

      client.connect();
    });
  });

  it('should reject SOCKS5 BIND when proxy denies the request', async () => {
    server = new MockSocksServer(5);
    server.setBehavior({commandResponse: 0x05}); // ConnectionRefused
    const addr = await server.listen();

    await new Promise<void>((resolve, reject) => {
      const client = new SocksClient({
        proxy: {host: addr.host, port: addr.port, type: 5},
        command: 'bind',
        destination: {host: '1.2.3.4', port: 80},
        timeout: 5000,
      });

      client.on('bound', () => {
        reject(new Error('Should not have received bound event'));
      });

      client.on('established', () => {
        reject(new Error('Should not have received established event'));
      });

      client.on('error', (err: SocksClientError) => {
        expect(err).toBeInstanceOf(SocksClientError);
        expect(err.code).toBe(
          SocksErrorCode.InvalidSocks5FinalHandshakeRejected,
        );
        resolve();
      });

      client.connect();
    });
  });
});
