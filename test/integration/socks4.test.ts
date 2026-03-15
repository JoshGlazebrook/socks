import {describe, it, expect, afterEach} from 'vitest';
import {SocksClient, SocksClientError} from '../../src/client/socksclient';
import {SocksErrorCode} from '../../src/common/constants';
import {MockSocksServer} from '../helpers/mock-socks-server';
import {VALID_DESTINATION} from '../helpers/constants';

describe('SOCKS4 Integration', () => {
  let server: MockSocksServer;

  afterEach(async () => {
    if (server) {
      await server.close();
      server = undefined!;
    }
  });

  it('should establish a successful SOCKS4 connect', async () => {
    server = new MockSocksServer(4);
    server.setBehavior({commandResponse: 'success'});
    const addr = await server.listen();

    const result = await SocksClient.createConnection({
      proxy: {host: addr.host, port: addr.port, type: 4},
      command: 'connect',
      destination: VALID_DESTINATION,
      timeout: 5000,
    });

    expect(result.socket).toBeDefined();
    result.socket.destroy();
  });

  it('should establish a successful SOCKS4a connect with hostname', async () => {
    server = new MockSocksServer(4);
    server.setBehavior({commandResponse: 'success'});
    const addr = await server.listen();

    const result = await SocksClient.createConnection({
      proxy: {host: addr.host, port: addr.port, type: 4},
      command: 'connect',
      destination: {host: 'example.com', port: 80},
      timeout: 5000,
    });

    expect(result.socket).toBeDefined();
    result.socket.destroy();
  });

  it('should reject with ERR_SOCKS4_PROXY_REJECTED when proxy returns Failed (0x5b)', async () => {
    server = new MockSocksServer(4);
    server.setBehavior({commandResponse: 0x5b}); // Failed
    const addr = await server.listen();

    await expect(
      SocksClient.createConnection({
        proxy: {host: addr.host, port: addr.port, type: 4},
        command: 'connect',
        destination: VALID_DESTINATION,
        timeout: 5000,
      }),
    ).rejects.toSatisfy((err: SocksClientError) => {
      expect(err).toBeInstanceOf(SocksClientError);
      expect(err.code).toBe(SocksErrorCode.Socks4ProxyRejectedConnection);
      expect(err.detail).toBeDefined();
      expect(err.detail!.responseCode).toBe(0x5b);
      return true;
    });
  });

  it('should reject with ERR_SOCKS4_PROXY_REJECTED when proxy returns Rejected (0x5c)', async () => {
    server = new MockSocksServer(4);
    server.setBehavior({commandResponse: 0x5c}); // Rejected
    const addr = await server.listen();

    await expect(
      SocksClient.createConnection({
        proxy: {host: addr.host, port: addr.port, type: 4},
        command: 'connect',
        destination: VALID_DESTINATION,
        timeout: 5000,
      }),
    ).rejects.toSatisfy((err: SocksClientError) => {
      expect(err).toBeInstanceOf(SocksClientError);
      expect(err.code).toBe(SocksErrorCode.Socks4ProxyRejectedConnection);
      expect(err.detail!.responseCode).toBe(0x5c);
      return true;
    });
  });

  it('should reject with ERR_SOCKS4_PROXY_REJECTED when proxy returns RejectedIdent (0x5d)', async () => {
    server = new MockSocksServer(4);
    server.setBehavior({commandResponse: 0x5d}); // RejectedIdent
    const addr = await server.listen();

    await expect(
      SocksClient.createConnection({
        proxy: {host: addr.host, port: addr.port, type: 4},
        command: 'connect',
        destination: VALID_DESTINATION,
        timeout: 5000,
      }),
    ).rejects.toSatisfy((err: SocksClientError) => {
      expect(err).toBeInstanceOf(SocksClientError);
      expect(err.code).toBe(SocksErrorCode.Socks4ProxyRejectedConnection);
      expect(err.detail!.responseCode).toBe(0x5d);
      return true;
    });
  });

  it('should establish a successful SOCKS4 connect with userId', async () => {
    server = new MockSocksServer(4);
    server.setBehavior({commandResponse: 'success'});
    const addr = await server.listen();

    const result = await SocksClient.createConnection({
      proxy: {host: addr.host, port: addr.port, type: 4, userId: 'testuser'},
      command: 'connect',
      destination: VALID_DESTINATION,
      timeout: 5000,
    });

    expect(result.socket).toBeDefined();
    result.socket.destroy();
  });

  it('should throw validation error for SOCKS4 with associate command', () => {
    expect(() => {
      new SocksClient({
        proxy: {host: '127.0.0.1', port: 1080, type: 4},
        command: 'associate',
        destination: {host: '1.2.3.4', port: 80},
      });
    }).toThrow(SocksClientError);
  });

  it('should throw validation error for SOCKS4 with IPv6 destination', () => {
    expect(() => {
      new SocksClient({
        proxy: {host: '127.0.0.1', port: 1080, type: 4},
        command: 'connect',
        destination: {
          host: '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
          port: 80,
        },
      });
    }).toThrow(SocksClientError);
  });
});
