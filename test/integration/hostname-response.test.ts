import {describe, it, expect, afterEach} from 'vitest';
import * as net from 'node:net';
import {SocksClient} from '../../src/client/socksclient';
import {VALID_DESTINATION} from '../helpers/constants';

describe('SOCKS5 Hostname Response', () => {
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

  it('should handle SOCKS5 response with hostname address type (0x03)', async () => {
    server = net.createServer((socket) => {
      // Handle initial handshake
      socket.once('data', () => {
        socket.write(Buffer.from([0x05, 0x00])); // NoAuth selected

        // Handle command request
        socket.once('data', () => {
          // Send response with hostname address type
          const host = Buffer.from('localhost');
          const response = Buffer.alloc(5 + host.length + 2);
          response[0] = 0x05; // Version
          response[1] = 0x00; // Success
          response[2] = 0x00; // Reserved
          response[3] = 0x03; // Hostname
          response[4] = host.length;
          host.copy(response, 5);
          response.writeUInt16BE(1234, 5 + host.length);
          socket.write(response);
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
      proxy: {host: addr.host, port: addr.port, type: 5},
      command: 'connect',
      destination: VALID_DESTINATION,
      timeout: 5000,
    });

    expect(result.socket).toBeDefined();
    expect(result.remoteHost).toBeDefined();
    expect(result.remoteHost!.host).toBe('localhost');
    expect(result.remoteHost!.port).toBe(1234);
    result.socket.destroy();
  });
});
