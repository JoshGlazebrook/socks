import {
  SocksClientOptions,
  SocksClientChainOptions,
  SocksRemoteHost,
} from '../client/socksclient';
import {SocksClientError} from './util';
import {
  ERRORS,
  SOCKS5_CUSTOM_AUTH_END,
  SOCKS5_CUSTOM_AUTH_START,
  SocksCommand,
  SocksProxy,
} from './constants';
import * as stream from 'stream';
import {Address4, Address6} from 'ip-address';
import * as net from 'net';

/**
 * Validates the provided SocksClientOptions
 * @param options { SocksClientOptions }
 * @param acceptedCommands { string[] } A list of accepted SocksProxy commands.
 */
function validateSocksClientOptions(
  options: SocksClientOptions,
  acceptedCommands = ['connect', 'bind', 'associate'],
) {
  // Check SOCKs command option.
  if (!SocksCommand[options.command]) {
    throw new SocksClientError(ERRORS.InvalidSocksCommand, options);
  }

  // Check SocksCommand for acceptable command.
  if (acceptedCommands.indexOf(options.command) === -1) {
    throw new SocksClientError(ERRORS.InvalidSocksCommandForOperation, options);
  }

  // Check destination
  if (!isValidSocksRemoteHost(options.destination)) {
    throw new SocksClientError(
      ERRORS.InvalidSocksClientOptionsDestination,
      options,
    );
  }

  // Check SOCKS proxy to use
  if (!isValidSocksProxy(options.proxy)) {
    throw new SocksClientError(ERRORS.InvalidSocksClientOptionsProxy, options);
  }

  // Validate custom auth (if set)
  validateCustomProxyAuth(options.proxy, options);

  // Check timeout
  if (options.timeout && !isValidTimeoutValue(options.timeout)) {
    throw new SocksClientError(
      ERRORS.InvalidSocksClientOptionsTimeout,
      options,
    );
  }

  // Check existing_socket (if provided)
  if (
    options.existing_socket &&
    !(options.existing_socket instanceof stream.Duplex)
  ) {
    throw new SocksClientError(
      ERRORS.InvalidSocksClientOptionsExistingSocket,
      options,
    );
  }
}

/**
 * Validates the SocksClientChainOptions
 * @param options { SocksClientChainOptions }
 */
function validateSocksClientChainOptions(options: SocksClientChainOptions) {
  // Only connect is supported when chaining.
  if (options.command !== 'connect') {
    throw new SocksClientError(ERRORS.InvalidSocksCommandChain, options);
  }

  // Check destination
  if (!isValidSocksRemoteHost(options.destination)) {
    throw new SocksClientError(
      ERRORS.InvalidSocksClientOptionsDestination,
      options,
    );
  }

  // Validate proxies (length)
  if (
    !(
      options.proxies &&
      Array.isArray(options.proxies) &&
      options.proxies.length >= 2
    )
  ) {
    throw new SocksClientError(
      ERRORS.InvalidSocksClientOptionsProxiesLength,
      options,
    );
  }

  // Validate proxies
  options.proxies.forEach((proxy: SocksProxy) => {
    if (!isValidSocksProxy(proxy)) {
      throw new SocksClientError(
        ERRORS.InvalidSocksClientOptionsProxy,
        options,
      );
    }

    // Validate custom auth (if set)
    validateCustomProxyAuth(proxy, options);
  });

  // Check timeout
  if (options.timeout && !isValidTimeoutValue(options.timeout)) {
    throw new SocksClientError(
      ERRORS.InvalidSocksClientOptionsTimeout,
      options,
    );
  }
}

function validateCustomProxyAuth(
  proxy: SocksProxy,
  options: SocksClientOptions | SocksClientChainOptions,
) {
  if (proxy.custom_auth_method !== undefined) {
    // Invalid auth method range
    if (
      proxy.custom_auth_method < SOCKS5_CUSTOM_AUTH_START ||
      proxy.custom_auth_method > SOCKS5_CUSTOM_AUTH_END
    ) {
      throw new SocksClientError(
        ERRORS.InvalidSocksClientOptionsCustomAuthRange,
        options,
      );
    }

    // Missing custom_auth_request_handler
    if (
      proxy.custom_auth_request_handler === undefined ||
      typeof proxy.custom_auth_request_handler !== 'function'
    ) {
      throw new SocksClientError(
        ERRORS.InvalidSocksClientOptionsCustomAuthOptions,
        options,
      );
    }

    // Missing custom_auth_response_size
    if (proxy.custom_auth_response_size === undefined) {
      throw new SocksClientError(
        ERRORS.InvalidSocksClientOptionsCustomAuthOptions,
        options,
      );
    }

    // Missing/invalid custom_auth_response_handler
    if (
      proxy.custom_auth_response_handler === undefined ||
      typeof proxy.custom_auth_response_handler !== 'function'
    ) {
      throw new SocksClientError(
        ERRORS.InvalidSocksClientOptionsCustomAuthOptions,
        options,
      );
    }
  }
}

/**
 * Validates a SocksRemoteHost
 * @param remoteHost { SocksRemoteHost }
 */
function isValidSocksRemoteHost(remoteHost: SocksRemoteHost) {
  return (
    remoteHost &&
    typeof remoteHost.host === 'string' &&
    Buffer.byteLength(remoteHost.host) < 256 &&
    typeof remoteHost.port === 'number' &&
    remoteHost.port >= 0 &&
    remoteHost.port <= 65535
  );
}

/**
 * Validates a SocksProxy
 * @param proxy { SocksProxy }
 */
function isValidSocksProxy(proxy: SocksProxy) {
  return (
    proxy &&
    (typeof proxy.host === 'string' || typeof proxy.ipaddress === 'string') &&
    typeof proxy.port === 'number' &&
    proxy.port >= 0 &&
    proxy.port <= 65535 &&
    (proxy.type === 4 || proxy.type === 5)
  );
}

/**
 * Validates a timeout value.
 * @param value { Number }
 */
function isValidTimeoutValue(value: number) {
  return typeof value === 'number' && value > 0;
}

export {validateSocksClientOptions, validateSocksClientChainOptions};

export function ipv4ToInt32(ip: string): number {
  const address = new Address4(ip);
  // Convert the IPv4 address parts to an integer
  return address.toArray().reduce((acc, part) => (acc << 8) + part, 0) >>> 0;
}

export function int32ToIpv4(int32: number): string {
  // Extract each byte (octet) from the 32-bit integer
  const octet1 = (int32 >>> 24) & 0xff;
  const octet2 = (int32 >>> 16) & 0xff;
  const octet3 = (int32 >>> 8) & 0xff;
  const octet4 = int32 & 0xff;

  // Combine the octets into a string in IPv4 format
  return [octet1, octet2, octet3, octet4].join('.');
}

export function ipToBuffer(ip: string): Buffer {
  if (net.isIPv4(ip)) {
    // Handle IPv4 addresses
    const address = new Address4(ip);
    return Buffer.from(address.toArray());
  } else if (net.isIPv6(ip)) {
    // Handle IPv6 addresses
    const address = new Address6(ip);
    return Buffer.from(
      address
        .canonicalForm()
        .split(':')
        .map((segment) => segment.padStart(4, '0'))
        .join(''),
      'hex',
    );
  } else {
    throw new Error('Invalid IP address format');
  }
}
