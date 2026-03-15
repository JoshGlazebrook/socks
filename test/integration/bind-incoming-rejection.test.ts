import {describe, it, expect, afterEach} from 'vitest';
import {SocksClient, SocksClientError} from '../../src/client/socksclient';
import {SocksErrorCode} from '../../src/common/constants';
import {MockSocksServer} from '../helpers/mock-socks-server';

describe('BIND Incoming Connection Rejection', () => {
  let server: MockSocksServer;

  afterEach(async () => {
    if (server) {
      await server.close();
      server = undefined!;
    }
  });

  it('should reject SOCKS4 BIND when incoming connection is denied (second response)', async () => {
    server = new MockSocksServer(4);
    server.setBehavior({
      commandResponse: 'success',
      bindPort: 4444,
      bindIncomingResponse: 0x5b, // Failed
    });
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
      });

      client.on('established', () => {
        reject(new Error('Should not have received established event'));
      });

      client.on('error', (err: SocksClientError) => {
        expect(boundFired).toBe(true);
        expect(err).toBeInstanceOf(SocksClientError);
        expect(err.code).toBe(
          SocksErrorCode.Socks4ProxyRejectedIncomingBoundConnection,
        );
        resolve();
      });

      client.connect();
    });
  });

  it('should reject SOCKS5 BIND when incoming connection is denied (second response)', async () => {
    server = new MockSocksServer(5);
    server.setBehavior({
      commandResponse: 'success',
      bindPort: 4444,
      bindIncomingResponse: 0x05, // ConnectionRefused
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
      });

      client.on('established', () => {
        reject(new Error('Should not have received established event'));
      });

      client.on('error', (err: SocksClientError) => {
        expect(boundFired).toBe(true);
        expect(err).toBeInstanceOf(SocksClientError);
        expect(err.code).toBe(
          SocksErrorCode.Socks5ProxyRejectedIncomingBoundConnection,
        );
        resolve();
      });

      client.connect();
    });
  });
});
