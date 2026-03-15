import {describe, it, expect, afterEach} from 'vitest';
import {SocksClient, SocksClientError} from '../../src/client/socksclient';
import {SocksErrorCode, Socks5Response} from '../../src/common/constants';
import {MockSocksServer} from '../helpers/mock-socks-server';
import {VALID_DESTINATION} from '../helpers/constants';

describe('SOCKS5 Integration', () => {
  let server: MockSocksServer;

  afterEach(async () => {
    if (server) {
      await server.close();
      server = undefined!;
    }
  });

  it('should establish a successful SOCKS5 connect (no auth)', async () => {
    server = new MockSocksServer(5);
    server.setBehavior({commandResponse: 'success'});
    const addr = await server.listen();

    const result = await SocksClient.createConnection({
      proxy: {host: addr.host, port: addr.port, type: 5},
      command: 'connect',
      destination: VALID_DESTINATION,
      timeout: 5000,
    });

    expect(result.socket).toBeDefined();
    result.socket.destroy();
  });

  it('should establish a successful SOCKS5 connect (user/pass auth)', async () => {
    server = new MockSocksServer(5);
    server.setBehavior({
      authMethodSelection: 0x02, // UserPass
      authResponse: 'success',
      commandResponse: 'success',
    });
    const addr = await server.listen();

    const result = await SocksClient.createConnection({
      proxy: {
        host: addr.host,
        port: addr.port,
        type: 5,
        userId: 'testuser',
        password: 'testpass',
      },
      command: 'connect',
      destination: VALID_DESTINATION,
      timeout: 5000,
    });

    expect(result.socket).toBeDefined();
    result.socket.destroy();
  });

  it('should reject with ERR_SOCKS5_INVALID_VERSION when version is wrong', async () => {
    server = new MockSocksServer(5);
    server.setBehavior({invalidVersion: true});
    const addr = await server.listen();

    await expect(
      SocksClient.createConnection({
        proxy: {host: addr.host, port: addr.port, type: 5},
        command: 'connect',
        destination: VALID_DESTINATION,
        timeout: 5000,
      }),
    ).rejects.toSatisfy((err: SocksClientError) => {
      expect(err).toBeInstanceOf(SocksClientError);
      expect(err.code).toBe(
        SocksErrorCode.InvalidSocks5InitialHandshakeSocksVersion,
      );
      return true;
    });
  });

  it('should reject with ERR_SOCKS5_NO_ACCEPTED_AUTH when server returns 0xFF', async () => {
    server = new MockSocksServer(5);
    server.setBehavior({authMethodSelection: 0xff});
    const addr = await server.listen();

    await expect(
      SocksClient.createConnection({
        proxy: {host: addr.host, port: addr.port, type: 5},
        command: 'connect',
        destination: VALID_DESTINATION,
        timeout: 5000,
      }),
    ).rejects.toSatisfy((err: SocksClientError) => {
      expect(err).toBeInstanceOf(SocksClientError);
      expect(err.code).toBe(
        SocksErrorCode.InvalidSocks5InitialHandshakeNoAcceptedAuthType,
      );
      return true;
    });
  });

  it('should reject with ERR_SOCKS5_AUTH_FAILED when auth is rejected', async () => {
    server = new MockSocksServer(5);
    server.setBehavior({
      authMethodSelection: 0x02,
      authResponse: 'reject',
    });
    const addr = await server.listen();

    await expect(
      SocksClient.createConnection({
        proxy: {
          host: addr.host,
          port: addr.port,
          type: 5,
          userId: 'user',
          password: 'pass',
        },
        command: 'connect',
        destination: VALID_DESTINATION,
        timeout: 5000,
      }),
    ).rejects.toSatisfy((err: SocksClientError) => {
      expect(err).toBeInstanceOf(SocksClientError);
      expect(err.code).toBe(SocksErrorCode.Socks5AuthenticationFailed);
      return true;
    });
  });

  it('should reject with ERR_SOCKS5_PROXY_REJECTED when proxy rejects command with Failure', async () => {
    server = new MockSocksServer(5);
    server.setBehavior({
      commandResponse: Socks5Response.Failure,
    });
    const addr = await server.listen();

    await expect(
      SocksClient.createConnection({
        proxy: {host: addr.host, port: addr.port, type: 5},
        command: 'connect',
        destination: VALID_DESTINATION,
        timeout: 5000,
      }),
    ).rejects.toSatisfy((err: SocksClientError) => {
      expect(err).toBeInstanceOf(SocksClientError);
      expect(err.code).toBe(
        SocksErrorCode.InvalidSocks5FinalHandshakeRejected,
      );
      expect(err.detail).toBeDefined();
      expect(err.detail!.socks5Response).toBe(Socks5Response.Failure);
      return true;
    });
  });

  it('should reject with ERR_SOCKS5_PROXY_REJECTED with ConnectionRefused detail', async () => {
    server = new MockSocksServer(5);
    server.setBehavior({
      commandResponse: Socks5Response.ConnectionRefused,
    });
    const addr = await server.listen();

    await expect(
      SocksClient.createConnection({
        proxy: {host: addr.host, port: addr.port, type: 5},
        command: 'connect',
        destination: VALID_DESTINATION,
        timeout: 5000,
      }),
    ).rejects.toSatisfy((err: SocksClientError) => {
      expect(err).toBeInstanceOf(SocksClientError);
      expect(err.code).toBe(
        SocksErrorCode.InvalidSocks5FinalHandshakeRejected,
      );
      expect(err.detail!.socks5Response).toBe(
        Socks5Response.ConnectionRefused,
      );
      expect(err.detail!.socks5ResponseName).toBe('ConnectionRefused');
      return true;
    });
  });

  it('should reject with ERR_SOCKS5_PROXY_REJECTED with NetworkUnreachable detail', async () => {
    server = new MockSocksServer(5);
    server.setBehavior({
      commandResponse: Socks5Response.NetworkUnreachable,
    });
    const addr = await server.listen();

    await expect(
      SocksClient.createConnection({
        proxy: {host: addr.host, port: addr.port, type: 5},
        command: 'connect',
        destination: VALID_DESTINATION,
        timeout: 5000,
      }),
    ).rejects.toSatisfy((err: SocksClientError) => {
      expect(err).toBeInstanceOf(SocksClientError);
      expect(err.code).toBe(
        SocksErrorCode.InvalidSocks5FinalHandshakeRejected,
      );
      expect(err.detail!.socks5Response).toBe(
        Socks5Response.NetworkUnreachable,
      );
      return true;
    });
  });

  it('should reject with ERR_SOCKS5_PROXY_REJECTED with HostUnreachable detail', async () => {
    server = new MockSocksServer(5);
    server.setBehavior({commandResponse: Socks5Response.HostUnreachable});
    const addr = await server.listen();

    await expect(
      SocksClient.createConnection({
        proxy: {host: addr.host, port: addr.port, type: 5},
        command: 'connect',
        destination: VALID_DESTINATION,
        timeout: 5000,
      }),
    ).rejects.toSatisfy((err: SocksClientError) => {
      expect(err).toBeInstanceOf(SocksClientError);
      expect(err.code).toBe(
        SocksErrorCode.InvalidSocks5FinalHandshakeRejected,
      );
      expect(err.detail!.socks5Response).toBe(Socks5Response.HostUnreachable);
      expect(err.detail!.socks5ResponseName).toBe('HostUnreachable');
      return true;
    });
  });

  it('should reject with ERR_SOCKS5_PROXY_REJECTED with TTLExpired detail', async () => {
    server = new MockSocksServer(5);
    server.setBehavior({commandResponse: Socks5Response.TTLExpired});
    const addr = await server.listen();

    await expect(
      SocksClient.createConnection({
        proxy: {host: addr.host, port: addr.port, type: 5},
        command: 'connect',
        destination: VALID_DESTINATION,
        timeout: 5000,
      }),
    ).rejects.toSatisfy((err: SocksClientError) => {
      expect(err).toBeInstanceOf(SocksClientError);
      expect(err.code).toBe(
        SocksErrorCode.InvalidSocks5FinalHandshakeRejected,
      );
      expect(err.detail!.socks5Response).toBe(Socks5Response.TTLExpired);
      return true;
    });
  });

  it('should reject with ERR_SOCKS5_PROXY_REJECTED with CommandNotSupported detail', async () => {
    server = new MockSocksServer(5);
    server.setBehavior({commandResponse: Socks5Response.CommandNotSupported});
    const addr = await server.listen();

    await expect(
      SocksClient.createConnection({
        proxy: {host: addr.host, port: addr.port, type: 5},
        command: 'connect',
        destination: VALID_DESTINATION,
        timeout: 5000,
      }),
    ).rejects.toSatisfy((err: SocksClientError) => {
      expect(err).toBeInstanceOf(SocksClientError);
      expect(err.code).toBe(
        SocksErrorCode.InvalidSocks5FinalHandshakeRejected,
      );
      expect(err.detail!.socks5Response).toBe(
        Socks5Response.CommandNotSupported,
      );
      return true;
    });
  });

  it('should reject with ERR_SOCKS5_PROXY_REJECTED with AddressNotSupported detail', async () => {
    server = new MockSocksServer(5);
    server.setBehavior({commandResponse: Socks5Response.AddressNotSupported});
    const addr = await server.listen();

    await expect(
      SocksClient.createConnection({
        proxy: {host: addr.host, port: addr.port, type: 5},
        command: 'connect',
        destination: VALID_DESTINATION,
        timeout: 5000,
      }),
    ).rejects.toSatisfy((err: SocksClientError) => {
      expect(err).toBeInstanceOf(SocksClientError);
      expect(err.code).toBe(
        SocksErrorCode.InvalidSocks5FinalHandshakeRejected,
      );
      expect(err.detail!.socks5Response).toBe(
        Socks5Response.AddressNotSupported,
      );
      return true;
    });
  });

  it('should reject with ERR_SOCKS5_PROXY_REJECTED with NotAllowed detail', async () => {
    server = new MockSocksServer(5);
    server.setBehavior({commandResponse: Socks5Response.NotAllowed});
    const addr = await server.listen();

    await expect(
      SocksClient.createConnection({
        proxy: {host: addr.host, port: addr.port, type: 5},
        command: 'connect',
        destination: VALID_DESTINATION,
        timeout: 5000,
      }),
    ).rejects.toSatisfy((err: SocksClientError) => {
      expect(err).toBeInstanceOf(SocksClientError);
      expect(err.code).toBe(
        SocksErrorCode.InvalidSocks5FinalHandshakeRejected,
      );
      expect(err.detail!.socks5Response).toBe(Socks5Response.NotAllowed);
      expect(err.detail!.socks5ResponseName).toBe('NotAllowed');
      return true;
    });
  });

  it('should reject with ERR_SOCKS5_UNKNOWN_AUTH_TYPE when server selects unrecognized auth', async () => {
    server = new MockSocksServer(5);
    // Server selects auth method 0x03 (IANA assigned, not supported by client)
    server.setBehavior({authMethodSelection: 0x03});
    const addr = await server.listen();

    await expect(
      SocksClient.createConnection({
        proxy: {host: addr.host, port: addr.port, type: 5},
        command: 'connect',
        destination: VALID_DESTINATION,
        timeout: 5000,
      }),
    ).rejects.toSatisfy((err: SocksClientError) => {
      expect(err).toBeInstanceOf(SocksClientError);
      expect(err.code).toBe(
        SocksErrorCode.InvalidSocks5InitialHandshakeUnknownAuthType,
      );
      expect(err.detail!.authType).toBe(0x03);
      return true;
    });
  });

  it('should connect with hostname destination', async () => {
    server = new MockSocksServer(5);
    server.setBehavior({commandResponse: 'success'});
    const addr = await server.listen();

    const result = await SocksClient.createConnection({
      proxy: {host: addr.host, port: addr.port, type: 5},
      command: 'connect',
      destination: {host: 'example.com', port: 80},
      timeout: 5000,
    });

    expect(result.socket).toBeDefined();
    result.socket.destroy();
  });

  it('should connect with IPv6 destination', async () => {
    server = new MockSocksServer(5);
    server.setBehavior({commandResponse: 'success'});
    const addr = await server.listen();

    const result = await SocksClient.createConnection({
      proxy: {host: addr.host, port: addr.port, type: 5},
      command: 'connect',
      destination: {
        host: '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
        port: 80,
      },
      timeout: 5000,
    });

    expect(result.socket).toBeDefined();
    result.socket.destroy();
  });
});
