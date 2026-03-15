import {describe, it, expect, afterEach} from 'vitest';
import * as net from 'node:net';
import {SocksClient} from '../../src/client/socksclient';
import {SocksAuthenticationError} from '../../src/common/util';
import {SocksErrorCode} from '../../src/common/constants';
import {VALID_DESTINATION} from '../helpers/constants';

describe('SOCKS5 Custom Authentication', () => {
  let server: net.Server;

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      server = undefined!;
    }
  });

  it('should succeed with custom auth handshake (method 0x80)', async () => {
    server = net.createServer((socket) => {
      // Handle initial SOCKS5 handshake
      socket.once('data', () => {
        // Select custom auth method 0x80
        socket.write(Buffer.from([0x05, 0x80]));

        // Handle custom auth request
        socket.once('data', () => {
          // Respond with 2-byte success response
          socket.write(Buffer.from([0x01, 0x00]));

          // Handle command request
          socket.once('data', () => {
            // Send successful command response (IPv4)
            const response = Buffer.from([
              0x05, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            ]);
            socket.write(response);
          });
        });
      });
    });

    const addr = await new Promise<{port: number; host: string}>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const a = server.address() as net.AddressInfo;
        resolve({port: a.port, host: a.address});
      });
    });

    const result = await SocksClient.createConnection({
      proxy: {
        host: addr.host,
        port: addr.port,
        type: 5,
        custom_auth_method: 0x80,
        custom_auth_request_handler: async () => Buffer.from([0x01, 0x02]),
        custom_auth_response_size: 2,
        custom_auth_response_handler: async (data) => {
          return data[0] === 0x01 && data[1] === 0x00;
        },
      },
      command: 'connect',
      destination: VALID_DESTINATION,
      timeout: 5000,
    });

    expect(result.socket).toBeDefined();
    result.socket.destroy();
  });

  it('should throw SocksAuthenticationError when custom auth is rejected', async () => {
    server = net.createServer((socket) => {
      // Handle initial SOCKS5 handshake
      socket.once('data', () => {
        // Select custom auth method 0x80
        socket.write(Buffer.from([0x05, 0x80]));

        // Handle custom auth request
        socket.once('data', () => {
          // Respond with 2-byte failure response
          socket.write(Buffer.from([0x01, 0x01]));
        });
      });
    });

    const addr = await new Promise<{port: number; host: string}>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const a = server.address() as net.AddressInfo;
        resolve({port: a.port, host: a.address});
      });
    });

    await expect(
      SocksClient.createConnection({
        proxy: {
          host: addr.host,
          port: addr.port,
          type: 5,
          custom_auth_method: 0x80,
          custom_auth_request_handler: async () => Buffer.from([0x01, 0x02]),
          custom_auth_response_size: 2,
          custom_auth_response_handler: async () => false,
        },
        command: 'connect',
        destination: VALID_DESTINATION,
        timeout: 5000,
      }),
    ).rejects.toSatisfy((err: SocksAuthenticationError) => {
      expect(err).toBeInstanceOf(SocksAuthenticationError);
      expect(err.code).toBe(SocksErrorCode.Socks5AuthenticationFailed);
      return true;
    });
  });
});
