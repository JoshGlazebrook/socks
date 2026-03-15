import {describe, it, expect, afterEach} from 'vitest';
import {SocksClient, SocksClientError} from '../../src/client/socksclient';
import {SocksErrorCode} from '../../src/common/constants';
import {MockSocksServer} from '../helpers/mock-socks-server';

describe('SOCKS4 BIND Invalid Incoming First Byte', () => {
  let server: MockSocksServer;

  afterEach(async () => {
    if (server) {
      await server.close();
      server = undefined!;
    }
  });

  it('should reject when SOCKS4 BIND incoming response has invalid first byte', async () => {
    server = new MockSocksServer(4);
    server.setBehavior({
      commandResponse: 'success',
      bindPort: 4444,
      bindIncomingFirstByte: 0x04, // Invalid — should be 0x00 per spec
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
          SocksErrorCode.InvalidSocks4IncomingConnectionResponse,
        );
        expect(err.detail).toBeDefined();
        expect(err.detail!.responseByte).toBe(0x04);
        resolve();
      });

      client.connect();
    });
  });

  it('should reject when SOCKS4 BIND incoming response first byte is 0xFF', async () => {
    server = new MockSocksServer(4);
    server.setBehavior({
      commandResponse: 'success',
      bindPort: 4444,
      bindIncomingFirstByte: 0xff,
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

      client.on('bound', () => {
        boundFired = true;
      });

      client.on('established', () => {
        reject(new Error('Should not have received established event'));
      });

      client.on('error', (err: SocksClientError) => {
        expect(boundFired).toBe(true);
        expect(err).toBeInstanceOf(SocksClientError);
        expect(err.code).toBe(
          SocksErrorCode.InvalidSocks4IncomingConnectionResponse,
        );
        expect(err.detail!.responseByte).toBe(0xff);
        resolve();
      });

      client.connect();
    });
  });
});
