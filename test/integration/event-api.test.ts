import {describe, it, expect, afterEach} from 'vitest';
import type {SocksClientOptions, SocksClientEstablishedEvent} from '../../src/client/socksclient';
import {SocksClient, SocksClientError} from '../../src/client/socksclient';
import {MockSocksServer} from '../helpers/mock-socks-server';
import {VALID_DESTINATION} from '../helpers/constants';

describe('SOCKS5 Event-based API', () => {
  let server: MockSocksServer;

  afterEach(async () => {
    if (server) {
      await server.close();
      server = undefined!;
    }
  });

  it('should emit established event on successful connect', async () => {
    server = new MockSocksServer(5);
    server.setBehavior({commandResponse: 'success'});
    const addr = await server.listen();

    const options: SocksClientOptions = {
      proxy: {host: addr.host, port: addr.port, type: 5},
      command: 'connect',
      destination: VALID_DESTINATION,
      timeout: 5000,
    };

    const result = await new Promise<SocksClientEstablishedEvent>(
      (resolve, reject) => {
        const client = new SocksClient(options);
        client.connect();

        client.on('established', (info) => {
          resolve(info);
        });

        client.on('error', (err) => {
          reject(err);
        });
      },
    );

    expect(result.socket).toBeDefined();
    result.socket.destroy();
  });

  it('should emit error event with invalid proxy version', async () => {
    const options: SocksClientOptions = {
      proxy: {host: '127.0.0.1', port: 1, type: 5},
      command: 'connect',
      destination: VALID_DESTINATION,
      timeout: 1000,
    };

    const err = await new Promise<SocksClientError>((resolve, reject) => {
      const client = new SocksClient(options);
      client.connect();

      client.on('error', (error) => {
        resolve(error);
      });

      client.on('established', () => {
        reject(new Error('Should not have established'));
      });
    });

    expect(err).toBeInstanceOf(SocksClientError);
  });

  it('should return a copy of options from socksClientOptions getter', () => {
    const options: SocksClientOptions = {
      proxy: {host: '127.0.0.1', port: 1080, type: 5},
      command: 'connect',
      destination: VALID_DESTINATION,
      timeout: 5000,
    };

    const client = new SocksClient(options);
    const returnedOptions = client.socksClientOptions;

    // Should be a copy, not the same reference
    expect(returnedOptions).not.toBe(options);
    // But values should match
    expect(returnedOptions.proxy.host).toBe(options.proxy.host);
    expect(returnedOptions.proxy.port).toBe(options.proxy.port);
    expect(returnedOptions.proxy.type).toBe(options.proxy.type);
    expect(returnedOptions.command).toBe(options.command);
    expect(returnedOptions.destination.host).toBe(options.destination.host);
    expect(returnedOptions.destination.port).toBe(options.destination.port);
  });
});
