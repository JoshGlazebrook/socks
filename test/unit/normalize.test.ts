import {describe, it, expect} from 'vitest';
import {Duplex} from 'node:stream';
import {normalizeClientOptions, normalizeProxy} from '../../src/common/helpers';

describe('normalizeProxy', () => {
  it('should copy snake_case custom auth fields to camelCase', () => {
    const handler = async () => Buffer.from([]);
    const responseHandler = async () => true;
    const proxy = normalizeProxy({
      host: '127.0.0.1',
      port: 1080,
      type: 5,
      custom_auth_method: 0x80,
      custom_auth_request_handler: handler,
      custom_auth_response_size: 2,
      custom_auth_response_handler: responseHandler,
    });

    expect(proxy.customAuthMethod).toBe(0x80);
    expect(proxy.customAuthRequestHandler).toBe(handler);
    expect(proxy.customAuthResponseSize).toBe(2);
    expect(proxy.customAuthResponseHandler).toBe(responseHandler);
  });

  it('should prefer camelCase when both are provided', () => {
    const handler1 = async () => Buffer.from([1]);
    const handler2 = async () => Buffer.from([2]);
    const proxy = normalizeProxy({
      host: '127.0.0.1',
      port: 1080,
      type: 5,
      custom_auth_method: 0x80,
      custom_auth_request_handler: handler1,
      custom_auth_response_size: 2,
      custom_auth_response_handler: async () => true,
      customAuthMethod: 0x81,
      customAuthRequestHandler: handler2,
      customAuthResponseSize: 4,
      customAuthResponseHandler: async () => false,
    } as any);

    // camelCase takes priority
    expect(proxy.customAuthMethod).toBe(0x81);
    expect(proxy.customAuthRequestHandler).toBe(handler2);
    expect(proxy.customAuthResponseSize).toBe(4);
  });

  it('should copy camelCase custom auth fields (already in preferred form)', () => {
    const handler = async () => Buffer.from([]);
    const responseHandler = async () => true;
    const proxy = normalizeProxy({
      host: '127.0.0.1',
      port: 1080,
      type: 5,
      customAuthMethod: 0x80,
      customAuthRequestHandler: handler,
      customAuthResponseSize: 2,
      customAuthResponseHandler: responseHandler,
    });

    // camelCase fields should be preserved as-is
    expect(proxy.customAuthMethod).toBe(0x80);
    expect(proxy.customAuthRequestHandler).toBe(handler);
    expect(proxy.customAuthResponseSize).toBe(2);
    expect(proxy.customAuthResponseHandler).toBe(responseHandler);
  });

  it('should not modify proxy without custom auth', () => {
    const proxy = normalizeProxy({
      host: '127.0.0.1',
      port: 1080,
      type: 5,
    });

    expect(proxy.customAuthMethod).toBeUndefined();
    expect(proxy.customAuthRequestHandler).toBeUndefined();
  });

  it('should return a shallow copy', () => {
    const original = {host: '127.0.0.1', port: 1080, type: 5 as const};
    const result = normalizeProxy(original);
    expect(result).not.toBe(original);
    expect(result).toEqual(original);
  });
});

describe('normalizeClientOptions', () => {
  it('should resolve existingSocket from existing_socket', () => {
    const socket = new Duplex({read() {}, write() {}});
    const opts = normalizeClientOptions({
      command: 'connect',
      destination: {host: 'example.com', port: 80},
      proxy: {host: '127.0.0.1', port: 1080, type: 5},
      existing_socket: socket,
    });

    expect(opts.existingSocket).toBe(socket);
  });

  it('should resolve setTcpNoDelay from set_tcp_nodelay', () => {
    const opts = normalizeClientOptions({
      command: 'connect',
      destination: {host: 'example.com', port: 80},
      proxy: {host: '127.0.0.1', port: 1080, type: 5},
      set_tcp_nodelay: false,
    });

    expect(opts.setTcpNoDelay).toBe(false);
  });

  it('should resolve socketOptions from socket_options', () => {
    const socketOpts = {localAddress: '0.0.0.0'};
    const opts = normalizeClientOptions({
      command: 'connect',
      destination: {host: 'example.com', port: 80},
      proxy: {host: '127.0.0.1', port: 1080, type: 5},
      socket_options: socketOpts,
    });

    expect(opts.socketOptions).toBe(socketOpts);
  });

  it('should prefer camelCase when both are provided', () => {
    const opts = normalizeClientOptions({
      command: 'connect',
      destination: {host: 'example.com', port: 80},
      proxy: {host: '127.0.0.1', port: 1080, type: 5},
      setTcpNoDelay: false,
      set_tcp_nodelay: true,
    });

    expect(opts.setTcpNoDelay).toBe(false);
  });

  it('should normalize the proxy within options', () => {
    const handler = async () => Buffer.from([]);
    const opts = normalizeClientOptions({
      command: 'connect',
      destination: {host: 'example.com', port: 80},
      proxy: {
        host: '127.0.0.1',
        port: 1080,
        type: 5,
        customAuthMethod: 0x80,
        customAuthRequestHandler: handler,
        customAuthResponseSize: 2,
        customAuthResponseHandler: async () => true,
      },
    });

    expect(opts.proxy.customAuthMethod).toBe(0x80);
  });
});
