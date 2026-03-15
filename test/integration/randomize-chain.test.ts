import {describe, it, expect, afterEach} from 'vitest';
import {SocksClient} from '../../src/client/socksclient';
import {MockSocksServer} from '../helpers/mock-socks-server';
import {VALID_DESTINATION} from '../helpers/constants';

describe('randomizeChain option', () => {
  const servers: MockSocksServer[] = [];

  afterEach(async () => {
    for (const server of servers) {
      await server.close();
    }
    servers.length = 0;
  });

  it('should succeed with randomizeChain enabled', async () => {
    const server1 = new MockSocksServer(5);
    const server2 = new MockSocksServer(5);
    // Both need forwardAfterSuccess since order is randomized
    server1.setBehavior({commandResponse: 'success', forwardAfterSuccess: true});
    server2.setBehavior({commandResponse: 'success', forwardAfterSuccess: true});
    servers.push(server1, server2);

    const addr1 = await server1.listen();
    const addr2 = await server2.listen();

    const result = await SocksClient.createConnectionChain({
      proxies: [
        {host: addr1.host, port: addr1.port, type: 5},
        {host: addr2.host, port: addr2.port, type: 5},
      ],
      command: 'connect',
      destination: VALID_DESTINATION,
      timeout: 10000,
      randomizeChain: true,
    });

    expect(result.socket).toBeDefined();
    result.socket.destroy();
  }, 15000);

  it('should not mutate the original proxies array', async () => {
    const server1 = new MockSocksServer(5);
    const server2 = new MockSocksServer(5);
    const server3 = new MockSocksServer(5);
    server1.setBehavior({commandResponse: 'success', forwardAfterSuccess: true});
    server2.setBehavior({commandResponse: 'success', forwardAfterSuccess: true});
    server3.setBehavior({commandResponse: 'success', forwardAfterSuccess: true});
    servers.push(server1, server2, server3);

    const addr1 = await server1.listen();
    const addr2 = await server2.listen();
    const addr3 = await server3.listen();

    const proxies = [
      {host: addr1.host, port: addr1.port, type: 5 as const},
      {host: addr2.host, port: addr2.port, type: 5 as const},
      {host: addr3.host, port: addr3.port, type: 5 as const},
    ];
    const originalPorts = proxies.map((p) => p.port);

    // Even with randomization, the original array should be untouched
    try {
      await SocksClient.createConnectionChain({
        proxies,
        command: 'connect',
        destination: VALID_DESTINATION,
        timeout: 10000,
        randomizeChain: true,
      });
    } catch {
      // Connection may fail due to chain ordering, that's OK
    }

    expect(proxies.map((p) => p.port)).toEqual(originalPorts);
  }, 15000);
});
