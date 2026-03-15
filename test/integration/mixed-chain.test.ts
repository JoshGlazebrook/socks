import {describe, it, expect, afterEach} from 'vitest';
import {SocksClient, SocksClientError} from '../../src/client/socksclient';
import {MockSocksServer} from '../helpers/mock-socks-server';
import {VALID_DESTINATION} from '../helpers/constants';

describe('Mixed SOCKS4/5 Chain Integration', () => {
  const servers: MockSocksServer[] = [];

  afterEach(async () => {
    for (const server of servers) {
      await server.close();
    }
    servers.length = 0;
  });

  it('should chain through SOCKS5 then SOCKS4 proxies', async () => {
    const server1 = new MockSocksServer(5);
    const server2 = new MockSocksServer(4);
    server1.setBehavior({commandResponse: 'success', forwardAfterSuccess: true});
    server2.setBehavior({commandResponse: 'success'});
    servers.push(server1, server2);

    const addr1 = await server1.listen();
    const addr2 = await server2.listen();

    const result = await SocksClient.createConnectionChain({
      proxies: [
        {host: addr1.host, port: addr1.port, type: 5},
        {host: addr2.host, port: addr2.port, type: 4},
      ],
      command: 'connect',
      destination: VALID_DESTINATION,
      timeout: 10000,
    });

    expect(result.socket).toBeDefined();
    result.socket.destroy();
  }, 15000);

  it('should chain through SOCKS4 then SOCKS5 proxies', async () => {
    const server1 = new MockSocksServer(4);
    const server2 = new MockSocksServer(5);
    server1.setBehavior({commandResponse: 'success', forwardAfterSuccess: true});
    server2.setBehavior({commandResponse: 'success'});
    servers.push(server1, server2);

    const addr1 = await server1.listen();
    const addr2 = await server2.listen();

    const result = await SocksClient.createConnectionChain({
      proxies: [
        {host: addr1.host, port: addr1.port, type: 4},
        {host: addr2.host, port: addr2.port, type: 5},
      ],
      command: 'connect',
      destination: VALID_DESTINATION,
      timeout: 10000,
    });

    expect(result.socket).toBeDefined();
    result.socket.destroy();
  }, 15000);

  it('should chain through 3 proxies', async () => {
    const server1 = new MockSocksServer(5);
    const server2 = new MockSocksServer(5);
    const server3 = new MockSocksServer(5);
    server1.setBehavior({commandResponse: 'success', forwardAfterSuccess: true});
    server2.setBehavior({commandResponse: 'success', forwardAfterSuccess: true});
    server3.setBehavior({commandResponse: 'success'});
    servers.push(server1, server2, server3);

    const addr1 = await server1.listen();
    const addr2 = await server2.listen();
    const addr3 = await server3.listen();

    const result = await SocksClient.createConnectionChain({
      proxies: [
        {host: addr1.host, port: addr1.port, type: 5},
        {host: addr2.host, port: addr2.port, type: 5},
        {host: addr3.host, port: addr3.port, type: 5},
      ],
      command: 'connect',
      destination: VALID_DESTINATION,
      timeout: 10000,
    });

    expect(result.socket).toBeDefined();
    result.socket.destroy();
  }, 15000);

  it('should fail when the middle proxy in a 3-proxy chain rejects', async () => {
    const server1 = new MockSocksServer(5);
    const server2 = new MockSocksServer(5);
    const server3 = new MockSocksServer(5);
    server1.setBehavior({commandResponse: 'success', forwardAfterSuccess: true});
    server2.setBehavior({commandResponse: 0x05}); // ConnectionRefused
    server3.setBehavior({commandResponse: 'success'});
    servers.push(server1, server2, server3);

    const addr1 = await server1.listen();
    const addr2 = await server2.listen();
    const addr3 = await server3.listen();

    await expect(
      SocksClient.createConnectionChain({
        proxies: [
          {host: addr1.host, port: addr1.port, type: 5},
          {host: addr2.host, port: addr2.port, type: 5},
          {host: addr3.host, port: addr3.port, type: 5},
        ],
        command: 'connect',
        destination: VALID_DESTINATION,
        timeout: 10000,
      }),
    ).rejects.toThrow(SocksClientError);
  }, 15000);
});
