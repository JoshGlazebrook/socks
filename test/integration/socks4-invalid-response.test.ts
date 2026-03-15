import {describe, it, expect, afterEach} from 'vitest';
import {SocksClient, SocksClientError} from '../../src/client/socksclient';
import {SocksErrorCode} from '../../src/common/constants';
import {MockSocksServer} from '../helpers/mock-socks-server';

describe('SOCKS4 Invalid Response First Byte', () => {
  let server: MockSocksServer;

  afterEach(async () => {
    if (server) {
      await server.close();
      server = undefined!;
    }
  });

  it('should reject when SOCKS4 response has non-zero first byte', async () => {
    server = new MockSocksServer(4);
    server.setBehavior({
      commandResponse: 'success',
      socks4ResponseFirstByte: 0x04, // Wrong — should be 0x00 per spec
    });
    const addr = await server.listen();

    await expect(
      SocksClient.createConnection({
        proxy: {host: addr.host, port: addr.port, type: 4},
        command: 'connect',
        destination: {host: '1.2.3.4', port: 80},
        timeout: 5000,
      }),
    ).rejects.toSatisfy((err: SocksClientError) => {
      expect(err).toBeInstanceOf(SocksClientError);
      expect(err.code).toBe(SocksErrorCode.InvalidSocks4HandshakeResponse);
      expect(err.detail).toBeDefined();
      expect(err.detail!.responseByte).toBe(0x04);
      return true;
    });
  });

  it('should reject when SOCKS4 response first byte is 0xFF', async () => {
    server = new MockSocksServer(4);
    server.setBehavior({
      commandResponse: 'success',
      socks4ResponseFirstByte: 0xff,
    });
    const addr = await server.listen();

    await expect(
      SocksClient.createConnection({
        proxy: {host: addr.host, port: addr.port, type: 4},
        command: 'connect',
        destination: {host: '1.2.3.4', port: 80},
        timeout: 5000,
      }),
    ).rejects.toSatisfy((err: SocksClientError) => {
      expect(err).toBeInstanceOf(SocksClientError);
      expect(err.code).toBe(SocksErrorCode.InvalidSocks4HandshakeResponse);
      return true;
    });
  });
});
