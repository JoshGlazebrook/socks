import {describe, it, expect, afterEach} from 'vitest';
import {
  SocksClient
} from '../../src/index.js';
import type {SocksClientEventMap,
  SocksClientOptions} from '../../src/index.js';
import type {Socket} from 'node:net';
import {MockSocksServer} from '../helpers/mock-socks-server';
import {VALID_DESTINATION} from '../helpers/constants';

const hasDispose =
  typeof Symbol !== 'undefined' && 'dispose' in Symbol;

const hasAsyncDispose =
  typeof Symbol !== 'undefined' && 'asyncDispose' in Symbol;

describe('SocksClientEventMap export', () => {
  it('should be importable as a type', () => {
    // This test verifies that SocksClientEventMap can be used as a type.
    // If it were not exported, this file would fail to compile.
    const _typeCheck: SocksClientEventMap | undefined = undefined;
    expect(_typeCheck).toBeUndefined();
  });
});

describe.skipIf(!hasDispose)('Symbol.dispose support', () => {
  let server: MockSocksServer;

  afterEach(async () => {
    if (server) {
      await server.close();
      server = undefined!;
    }
  });

  it('createConnection result has Symbol.dispose method', async () => {
    server = new MockSocksServer(5);
    server.setBehavior({commandResponse: 'success'});
    const addr = await server.listen();

    const result = await SocksClient.createConnection({
      proxy: {host: addr.host, port: addr.port, type: 5},
      command: 'connect',
      destination: VALID_DESTINATION,
      timeout: 5000,
    });

    expect(result[Symbol.dispose!]).toBeTypeOf('function');
    result.socket.destroy();
  });

  it('calling Symbol.dispose destroys the socket', async () => {
    server = new MockSocksServer(5);
    server.setBehavior({commandResponse: 'success'});
    const addr = await server.listen();

    const result = await SocksClient.createConnection({
      proxy: {host: addr.host, port: addr.port, type: 5},
      command: 'connect',
      destination: VALID_DESTINATION,
      timeout: 5000,
    });

    expect(result.socket.destroyed).toBe(false);
    result[Symbol.dispose!]();
    expect(result.socket.destroyed).toBe(true);
  });

  it('createConnectionChain result has Symbol.dispose method', async () => {
    // Set up two proxy servers to form a chain
    const server1 = new MockSocksServer(5);
    server1.setBehavior({
      commandResponse: 'success',
      forwardAfterSuccess: true,
    });
    const addr1 = await server1.listen();

    const server2 = new MockSocksServer(5);
    server2.setBehavior({commandResponse: 'success'});
    const addr2 = await server2.listen();

    try {
      const result = await SocksClient.createConnectionChain({
        proxies: [
          {host: addr1.host, port: addr1.port, type: 5},
          {host: addr2.host, port: addr2.port, type: 5},
        ],
        command: 'connect',
        destination: VALID_DESTINATION,
        timeout: 5000,
      });

      expect(result[Symbol.dispose!]).toBeTypeOf('function');
      result[Symbol.dispose!]();
      expect(result.socket.destroyed).toBe(true);
    } finally {
      await server1.close();
      await server2.close();
    }
  });

  it('bound event info has Symbol.dispose method', async () => {
    server = new MockSocksServer(5);
    server.setBehavior({commandResponse: 'success'});
    const addr = await server.listen();

    const options: SocksClientOptions = {
      proxy: {host: addr.host, port: addr.port, type: 5},
      command: 'bind',
      destination: VALID_DESTINATION,
      timeout: 5000,
    };

    const boundInfo = await new Promise<{
      socket: Socket;
      [Symbol.dispose]: () => void;
    }>((resolve, reject) => {
      const client = new SocksClient(options);
      client.connect();

      client.on('bound', (info) => {
        resolve(info as any);
      });

      client.on('error', (err) => {
        reject(err);
      });
    });

    expect(boundInfo[Symbol.dispose!]).toBeTypeOf('function');
    boundInfo.socket.destroy();
  });

  it('established event info from event API has Symbol.dispose method', async () => {
    server = new MockSocksServer(5);
    server.setBehavior({commandResponse: 'success'});
    const addr = await server.listen();

    const options: SocksClientOptions = {
      proxy: {host: addr.host, port: addr.port, type: 5},
      command: 'connect',
      destination: VALID_DESTINATION,
      timeout: 5000,
    };

    const result = await new Promise<{
      socket: Socket;
      [Symbol.dispose]: () => void;
    }>((resolve, reject) => {
      const client = new SocksClient(options);
      client.connect();

      client.on('established', (info) => {
        resolve(info as any);
      });

      client.on('error', (err) => {
        reject(err);
      });
    });

    expect(result[Symbol.dispose!]).toBeTypeOf('function');
    expect(result.socket.destroyed).toBe(false);
    result[Symbol.dispose!]();
    expect(result.socket.destroyed).toBe(true);
  });
});

describe.skipIf(!hasAsyncDispose)('Symbol.asyncDispose support', () => {
  let server: MockSocksServer;

  afterEach(async () => {
    if (server) {
      await server.close();
      server = undefined!;
    }
  });

  it('createConnection result has Symbol.asyncDispose method', async () => {
    server = new MockSocksServer(5);
    server.setBehavior({commandResponse: 'success'});
    const addr = await server.listen();

    const result = await SocksClient.createConnection({
      proxy: {host: addr.host, port: addr.port, type: 5},
      command: 'connect',
      destination: VALID_DESTINATION,
      timeout: 5000,
    });

    expect(result[Symbol.asyncDispose!]).toBeTypeOf('function');
    result.socket.destroy();
  });

  it('calling Symbol.asyncDispose gracefully ends the socket', async () => {
    server = new MockSocksServer(5);
    server.setBehavior({commandResponse: 'success'});
    const addr = await server.listen();

    const result = await SocksClient.createConnection({
      proxy: {host: addr.host, port: addr.port, type: 5},
      command: 'connect',
      destination: VALID_DESTINATION,
      timeout: 5000,
    });

    expect(result.socket.destroyed).toBe(false);
    await result[Symbol.asyncDispose!]();
    expect(result.socket.writable).toBe(false);
  });

  it('Symbol.asyncDispose resolves its promise', async () => {
    server = new MockSocksServer(5);
    server.setBehavior({commandResponse: 'success'});
    const addr = await server.listen();

    const result = await SocksClient.createConnection({
      proxy: {host: addr.host, port: addr.port, type: 5},
      command: 'connect',
      destination: VALID_DESTINATION,
      timeout: 5000,
    });

    const disposePromise = result[Symbol.asyncDispose!]();
    expect(disposePromise).toBeInstanceOf(Promise);
    await expect(disposePromise).resolves.toBeUndefined();
  });
});
