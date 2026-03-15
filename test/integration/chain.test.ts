import {describe, it, expect, afterEach} from 'vitest';
import {SocksClient, SocksClientError} from '../../src/client/socksclient';
import {MockSocksServer} from '../helpers/mock-socks-server';
import {VALID_DESTINATION} from '../helpers/constants';

describe('SOCKS Chain Integration', () => {
  const servers: MockSocksServer[] = [];

  afterEach(async () => {
    for (const server of servers) {
      await server.close();
    }
    servers.length = 0;
  });

  it('should chain through 2 SOCKS5 proxies successfully', async () => {
    const server1 = new MockSocksServer(5);
    const server2 = new MockSocksServer(5);
    // First proxy needs to forward data to the second proxy
    server1.setBehavior({commandResponse: 'success', forwardAfterSuccess: true});
    server2.setBehavior({commandResponse: 'success'});
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
    });

    expect(result.socket).toBeDefined();
    result.socket.destroy();
  }, 15000);

  it('should fail when the second proxy in chain rejects', async () => {
    const server1 = new MockSocksServer(5);
    const server2 = new MockSocksServer(5);
    server1.setBehavior({commandResponse: 'success', forwardAfterSuccess: true});
    server2.setBehavior({commandResponse: 0x05}); // ConnectionRefused
    servers.push(server1, server2);

    const addr1 = await server1.listen();
    const addr2 = await server2.listen();

    await expect(
      SocksClient.createConnectionChain({
        proxies: [
          {host: addr1.host, port: addr1.port, type: 5},
          {host: addr2.host, port: addr2.port, type: 5},
        ],
        command: 'connect',
        destination: VALID_DESTINATION,
        timeout: 10000,
      }),
    ).rejects.toThrow(SocksClientError);
  }, 15000);
});
