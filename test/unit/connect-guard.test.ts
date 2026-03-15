import {describe, it, expect} from 'vitest';
import {SocksClient, SocksClientError} from '../../src/client/socksclient';

describe('connect() guard against re-entry', () => {
  it('should throw if connect() is called twice', () => {
    const client = new SocksClient({
      proxy: {host: '127.0.0.1', port: 1080, type: 5},
      command: 'connect',
      destination: {host: '1.2.3.4', port: 80},
      timeout: 1000,
    });

    // First call should work (it will start connecting and eventually time out)
    client.connect();

    // Second call should throw
    expect(() => client.connect()).toThrow(SocksClientError);

    // Clean up - the client will time out on its own, but let's be explicit
    client.on('error', () => {}); // prevent unhandled error
  });
});
