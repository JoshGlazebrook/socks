import {describe, it, expect, afterEach} from 'vitest';
import {SocksClient, SocksClientError, SocksErrorCode} from '../../src/index.js';
import {ERRORS} from '../../src/common/constants.js';
import {MockSocksServer} from '../helpers/mock-socks-server.js';
import {VALID_DESTINATION} from '../helpers/constants.js';

describe('AbortSignal Integration', () => {
  let server: MockSocksServer;

  afterEach(async () => {
    if (server) {
      await server.close();
      server = undefined!;
    }
  });

  it('should reject with ConnectionAborted when signal is already aborted', async () => {
    server = new MockSocksServer(5);
    const addr = await server.listen();

    const reason = new Error('pre-aborted');
    const signal = AbortSignal.abort(reason);

    await expect(
      SocksClient.createConnection({
        proxy: {host: addr.host, port: addr.port, type: 5},
        command: 'connect',
        destination: VALID_DESTINATION,
        signal,
      }),
    ).rejects.toSatisfy((err: SocksClientError) => {
      expect(err).toBeInstanceOf(SocksClientError);
      expect(err.code).toBe(SocksErrorCode.ConnectionAborted);
      expect(err.message).toBe(ERRORS.ConnectionAborted);
      expect(err.cause).toBe(reason);
      return true;
    });
  });

  it('should reject with ConnectionAborted when signal aborts during connection', async () => {
    server = new MockSocksServer(5);
    // Delay the server response so the abort fires while waiting
    server.setBehavior({responseDelay: 5000});
    const addr = await server.listen();

    const controller = new AbortController();

    // Abort after a short delay
    setTimeout(() => controller.abort(new Error('aborted mid-flight')), 200);

    await expect(
      SocksClient.createConnection({
        proxy: {host: addr.host, port: addr.port, type: 5},
        command: 'connect',
        destination: VALID_DESTINATION,
        timeout: 10000,
        signal: controller.signal,
      }),
    ).rejects.toSatisfy((err: SocksClientError) => {
      expect(err).toBeInstanceOf(SocksClientError);
      expect(err.code).toBe(SocksErrorCode.ConnectionAborted);
      expect(err.message).toBe(ERRORS.ConnectionAborted);
      expect(err.cause).toBeInstanceOf(Error);
      expect((err.cause as Error).message).toBe('aborted mid-flight');
      return true;
    });
  }, 10000);

  it('should reject when using AbortSignal.timeout()', async () => {
    server = new MockSocksServer(5);
    // Delay response longer than the signal timeout
    server.setBehavior({responseDelay: 10000});
    const addr = await server.listen();

    await expect(
      SocksClient.createConnection({
        proxy: {host: addr.host, port: addr.port, type: 5},
        command: 'connect',
        destination: VALID_DESTINATION,
        timeout: 30000,
        signal: AbortSignal.timeout(300),
      }),
    ).rejects.toSatisfy((err: SocksClientError) => {
      expect(err).toBeInstanceOf(SocksClientError);
      expect(err.code).toBe(SocksErrorCode.ConnectionAborted);
      expect(err.message).toBe(ERRORS.ConnectionAborted);
      // AbortSignal.timeout() sets the reason to a TimeoutError DOMException
      expect(err.cause).toBeDefined();
      return true;
    });
  }, 10000);

  it('should abort a connection chain between hops', async () => {
    // Create two proxy servers: first responds quickly, second delays
    const server1 = new MockSocksServer(5);
    server1.setBehavior({forwardAfterSuccess: true});
    const addr1 = await server1.listen();

    const server2 = new MockSocksServer(5);
    server2.setBehavior({responseDelay: 5000});
    const addr2 = await server2.listen();

    const controller = new AbortController();

    // Abort after a short delay (enough for the first hop to succeed)
    setTimeout(() => controller.abort(new Error('chain aborted')), 500);

    try {
      await expect(
        SocksClient.createConnectionChain({
          command: 'connect',
          proxies: [
            {host: addr1.host, port: addr1.port, type: 5},
            {host: addr2.host, port: addr2.port, type: 5},
          ],
          destination: VALID_DESTINATION,
          timeout: 10000,
          signal: controller.signal,
        }),
      ).rejects.toSatisfy((err: SocksClientError) => {
        expect(err).toBeInstanceOf(SocksClientError);
        expect(err.code).toBe(SocksErrorCode.ConnectionAborted);
        expect(err.cause).toBeInstanceOf(Error);
        expect((err.cause as Error).message).toBe('chain aborted');
        return true;
      });
    } finally {
      await server1.close();
      await server2.close();
    }
  }, 15000);

  it('should abort a connection chain when signal is already aborted before first hop', async () => {
    const server1 = new MockSocksServer(5);
    const addr1 = await server1.listen();

    const server2 = new MockSocksServer(5);
    const addr2 = await server2.listen();

    const reason = new Error('pre-aborted chain');
    const signal = AbortSignal.abort(reason);

    try {
      await expect(
        SocksClient.createConnectionChain({
          command: 'connect',
          proxies: [
            {host: addr1.host, port: addr1.port, type: 5},
            {host: addr2.host, port: addr2.port, type: 5},
          ],
          destination: VALID_DESTINATION,
          signal,
        }),
      ).rejects.toSatisfy((err: SocksClientError) => {
        expect(err).toBeInstanceOf(SocksClientError);
        expect(err.code).toBe(SocksErrorCode.ConnectionAborted);
        expect(err.cause).toBe(reason);
        return true;
      });
    } finally {
      await server1.close();
      await server2.close();
    }
  });

  it('should clean up abort listener after successful connection', async () => {
    server = new MockSocksServer(5);
    const addr = await server.listen();

    const controller = new AbortController();

    const result = await SocksClient.createConnection({
      proxy: {host: addr.host, port: addr.port, type: 5},
      command: 'connect',
      destination: VALID_DESTINATION,
      signal: controller.signal,
    });

    expect(result.socket).toBeDefined();

    // After successful connection, aborting should NOT cause an error
    // on the established connection (the listener should have been removed).
    // We verify this by aborting and checking that the socket is still open.
    controller.abort(new Error('late abort'));

    // Give a tick for any potential abort handler to fire
    await new Promise((resolve) => setTimeout(resolve, 50));

    // The socket should still be writable (not destroyed by the abort handler)
    expect(result.socket.destroyed).toBe(false);

    result.socket.destroy();
  });

  it('should have correct error code string value', async () => {
    server = new MockSocksServer(5);
    const addr = await server.listen();

    const signal = AbortSignal.abort(new Error('test'));

    await expect(
      SocksClient.createConnection({
        proxy: {host: addr.host, port: addr.port, type: 5},
        command: 'connect',
        destination: VALID_DESTINATION,
        signal,
      }),
    ).rejects.toSatisfy((err: SocksClientError) => {
      expect(err.code).toBe('ERR_SOCKS_CONNECTION_ABORTED');
      return true;
    });
  });

  it('should preserve the abort reason as the error cause', async () => {
    server = new MockSocksServer(5);
    const addr = await server.listen();

    const customReason = new TypeError('custom abort reason');
    const signal = AbortSignal.abort(customReason);

    await expect(
      SocksClient.createConnection({
        proxy: {host: addr.host, port: addr.port, type: 5},
        command: 'connect',
        destination: VALID_DESTINATION,
        signal,
      }),
    ).rejects.toSatisfy((err: SocksClientError) => {
      expect(err).toBeInstanceOf(SocksClientError);
      expect(err.code).toBe(SocksErrorCode.ConnectionAborted);
      // The cause should be the exact reason object passed to abort()
      expect(err.cause).toBe(customReason);
      expect(err.cause).toBeInstanceOf(TypeError);
      return true;
    });
  });

  it('should work with SOCKS4 proxy when signal is already aborted', async () => {
    server = new MockSocksServer(4);
    const addr = await server.listen();

    const reason = new Error('socks4 aborted');
    const signal = AbortSignal.abort(reason);

    await expect(
      SocksClient.createConnection({
        proxy: {host: addr.host, port: addr.port, type: 4},
        command: 'connect',
        destination: VALID_DESTINATION,
        signal,
      }),
    ).rejects.toSatisfy((err: SocksClientError) => {
      expect(err).toBeInstanceOf(SocksClientError);
      expect(err.code).toBe(SocksErrorCode.ConnectionAborted);
      expect(err.cause).toBe(reason);
      return true;
    });
  });
});
