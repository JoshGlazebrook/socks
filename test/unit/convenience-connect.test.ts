import {describe, it, expect, afterEach} from 'vitest';
import {SocksClient} from '../../src/client/socksclient';
import {MockSocksServer} from '../helpers/mock-socks-server';

describe('SocksClient.connect() convenience method', () => {
  const servers: MockSocksServer[] = [];

  afterEach(async () => {
    for (const server of servers) {
      await server.close();
    }
    servers.length = 0;
  });

  it('should connect using the convenience method', async () => {
    const server = new MockSocksServer(5);
    server.setBehavior({commandResponse: 'success'});
    servers.push(server);

    const addr = await server.listen();

    const result = await SocksClient.connect(
      {host: addr.host, port: addr.port, type: 5},
      {host: '10.0.0.1', port: 80},
      {timeout: 5000},
    );

    expect(result.socket).toBeDefined();
    result.socket.destroy();
  });

  it('should connect without extra options', async () => {
    const server = new MockSocksServer(5);
    server.setBehavior({commandResponse: 'success'});
    servers.push(server);

    const addr = await server.listen();

    const result = await SocksClient.connect(
      {host: addr.host, port: addr.port, type: 5},
      {host: '10.0.0.1', port: 80},
    );

    expect(result.socket).toBeDefined();
    result.socket.destroy();
  });
});
