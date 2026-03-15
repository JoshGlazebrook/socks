import {describe, it, expect} from 'vitest';
import {SocksClient} from '../../src/client/socksclient';

describe('SocksClient.parseProxyUrl', () => {
  it('should parse socks5://host:port', () => {
    const proxy = SocksClient.parseProxyUrl('socks5://192.168.1.1:1080');
    expect(proxy.type).toBe(5);
    expect(proxy.host).toBe('192.168.1.1');
    expect(proxy.port).toBe(1080);
    expect(proxy.userId).toBeUndefined();
    expect(proxy.password).toBeUndefined();
  });

  it('should parse socks4://host:port', () => {
    const proxy = SocksClient.parseProxyUrl('socks4://10.0.0.1:9050');
    expect(proxy.type).toBe(4);
    expect(proxy.host).toBe('10.0.0.1');
    expect(proxy.port).toBe(9050);
  });

  it('should parse socks5://user:pass@host:port', () => {
    const proxy = SocksClient.parseProxyUrl('socks5://myuser:mypass@proxy.example.com:1080');
    expect(proxy.type).toBe(5);
    expect(proxy.host).toBe('proxy.example.com');
    expect(proxy.port).toBe(1080);
    expect(proxy.userId).toBe('myuser');
    expect(proxy.password).toBe('mypass');
  });

  it('should parse socks4://user@host:port (userId only)', () => {
    const proxy = SocksClient.parseProxyUrl('socks4://admin@10.0.0.1:1080');
    expect(proxy.type).toBe(4);
    expect(proxy.userId).toBe('admin');
    expect(proxy.password).toBeUndefined();
  });

  it('should default to port 1080 when omitted', () => {
    const proxy = SocksClient.parseProxyUrl('socks5://proxy.example.com');
    expect(proxy.port).toBe(1080);
  });

  it('should treat socks:// as SOCKS5', () => {
    const proxy = SocksClient.parseProxyUrl('socks://proxy.example.com:9050');
    expect(proxy.type).toBe(5);
  });

  it('should treat socks5h:// as SOCKS5', () => {
    const proxy = SocksClient.parseProxyUrl('socks5h://proxy.example.com:1080');
    expect(proxy.type).toBe(5);
  });

  it('should treat socks4a:// as SOCKS4', () => {
    const proxy = SocksClient.parseProxyUrl('socks4a://proxy.example.com:1080');
    expect(proxy.type).toBe(4);
  });

  it('should decode URL-encoded credentials', () => {
    const proxy = SocksClient.parseProxyUrl('socks5://user%40domain:p%40ss%3Aword@proxy.example.com:1080');
    expect(proxy.userId).toBe('user@domain');
    expect(proxy.password).toBe('p@ss:word');
  });

  it('should throw on unsupported protocol', () => {
    expect(() => SocksClient.parseProxyUrl('http://proxy.example.com:1080')).toThrow(
      /Unsupported SOCKS protocol/,
    );
  });

  it('should parse IPv6 host', () => {
    const proxy = SocksClient.parseProxyUrl('socks5://[::1]:1080');
    // URL.hostname preserves brackets for IPv6
    expect(proxy.host).toBe('[::1]');
    expect(proxy.port).toBe(1080);
    expect(proxy.type).toBe(5);
  });
});
