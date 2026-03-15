import {SocksClientError} from './util.js';
import type {
  SocksProxy,
  NormalizedSocksProxy,
  SocksProxyType,
  SocksClientOptions,
  SocksClientChainOptions,
  SocksRemoteHost} from './constants.js';
import {
  ERRORS,
  SOCKS5_CUSTOM_AUTH_END,
  SOCKS5_CUSTOM_AUTH_START,
  SocksCommand,
  SocksErrorCode
} from './constants.js';
import * as stream from 'node:stream';
import {Address4, Address6} from 'ip-address';
import * as net from 'node:net';

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
    throw new SocksClientError(ERRORS.InvalidSocksCommand, {
      code: SocksErrorCode.InvalidSocksCommand,
      options,
    });
  }

  // Check SocksCommand for acceptable command.
  if (!acceptedCommands.includes(options.command)) {
    throw new SocksClientError(ERRORS.InvalidSocksCommandForOperation, {
      code: SocksErrorCode.InvalidSocksCommandForOperation,
      options,
    });
  }

  // Check destination
  if (!isValidSocksRemoteHost(options.destination)) {
    throw new SocksClientError(ERRORS.InvalidSocksClientOptionsDestination, {
      code: SocksErrorCode.InvalidSocksClientOptionsDestination,
      options,
    });
  }

  // Check SOCKS proxy to use
  if (!isValidSocksProxy(options.proxy)) {
    throw new SocksClientError(ERRORS.InvalidSocksClientOptionsProxy, {
      code: SocksErrorCode.InvalidSocksClientOptionsProxy,
      options,
    });
  }

  // SOCKS4 does not support IPv6 destinations
  if (resolveProxyType(options.proxy.type) === 4 && net.isIPv6(options.destination.host)) {
    throw new SocksClientError(ERRORS.InvalidSocks4DestinationIPv6, {
      code: SocksErrorCode.InvalidSocks4DestinationIPv6,
      options,
    });
  }

  // SOCKS4 does not support UDP ASSOCIATE
  if (resolveProxyType(options.proxy.type) === 4 && options.command === 'associate') {
    throw new SocksClientError(ERRORS.InvalidSocks4CommandAssociate, {
      code: SocksErrorCode.InvalidSocks4CommandAssociate,
      options,
    });
  }

  // Validate credential lengths (RFC 1929: max 255 bytes each)
  validateCredentialLengths(options.proxy, options);

  // Validate custom auth (if set)
  validateCustomProxyAuth(options.proxy, options);

  // Check timeout
  if (options.timeout && !isValidTimeoutValue(options.timeout)) {
    throw new SocksClientError(ERRORS.InvalidSocksClientOptionsTimeout, {
      code: SocksErrorCode.InvalidSocksClientOptionsTimeout,
      options,
    });
  }

  // Check existing_socket / existingSocket (if provided)
  const existingSocket = options.existingSocket ?? options.existing_socket;
  if (
    existingSocket &&
    !(existingSocket instanceof stream.Duplex)
  ) {
    throw new SocksClientError(ERRORS.InvalidSocksClientOptionsExistingSocket, {
      code: SocksErrorCode.InvalidSocksClientOptionsExistingSocket,
      options,
    });
  }
}

/**
 * Validates the SocksClientChainOptions
 * @param options { SocksClientChainOptions }
 */
function validateSocksClientChainOptions(options: SocksClientChainOptions) {
  // Only connect is supported when chaining.
  if (options.command !== 'connect') {
    throw new SocksClientError(ERRORS.InvalidSocksCommandChain, {
      code: SocksErrorCode.InvalidSocksCommandChain,
      options,
    });
  }

  // Check destination
  if (!isValidSocksRemoteHost(options.destination)) {
    throw new SocksClientError(ERRORS.InvalidSocksClientOptionsDestination, {
      code: SocksErrorCode.InvalidSocksClientOptionsDestination,
      options,
    });
  }

  // Validate proxies (length)
  if (
    !(
      options.proxies &&
      Array.isArray(options.proxies) &&
      options.proxies.length >= 1
    )
  ) {
    throw new SocksClientError(ERRORS.InvalidSocksClientOptionsProxiesLength, {
      code: SocksErrorCode.InvalidSocksClientOptionsProxiesLength,
      options,
    });
  }

  // Validate proxies
  options.proxies.forEach((proxy: SocksProxy) => {
    if (!isValidSocksProxy(proxy)) {
      throw new SocksClientError(ERRORS.InvalidSocksClientOptionsProxy, {
        code: SocksErrorCode.InvalidSocksClientOptionsProxy,
        options,
      });
    }

    // Validate credential lengths (RFC 1929)
    validateCredentialLengths(proxy, options);

    // Validate custom auth (if set)
    validateCustomProxyAuth(proxy, options);
  });

  // Check timeout
  if (options.timeout && !isValidTimeoutValue(options.timeout)) {
    throw new SocksClientError(ERRORS.InvalidSocksClientOptionsTimeout, {
      code: SocksErrorCode.InvalidSocksClientOptionsTimeout,
      options,
    });
  }
}

function validateCredentialLengths(
  proxy: SocksProxy,
  options: SocksClientOptions | SocksClientChainOptions,
) {
  if (
    proxy.userId !== undefined &&
    Buffer.byteLength(proxy.userId) > 255
  ) {
    throw new SocksClientError(
      ERRORS.InvalidSocksClientOptionsCredentialLength,
      {
        code: SocksErrorCode.InvalidSocksClientOptionsCredentialLength,
        options,
      },
    );
  }
  if (
    proxy.password !== undefined &&
    Buffer.byteLength(proxy.password) > 255
  ) {
    throw new SocksClientError(
      ERRORS.InvalidSocksClientOptionsCredentialLength,
      {
        code: SocksErrorCode.InvalidSocksClientOptionsCredentialLength,
        options,
      },
    );
  }
}

function validateCustomProxyAuth(
  proxy: SocksProxy,
  options: SocksClientOptions | SocksClientChainOptions,
) {
  // Support both camelCase and snake_case field names
  const authMethod = proxy.custom_auth_method ?? proxy.customAuthMethod;
  const requestHandler = proxy.custom_auth_request_handler ?? proxy.customAuthRequestHandler;
  const responseSize = proxy.custom_auth_response_size ?? proxy.customAuthResponseSize;
  const responseHandler = proxy.custom_auth_response_handler ?? proxy.customAuthResponseHandler;

  if (authMethod !== undefined) {
    // Invalid auth method range
    if (
      authMethod < SOCKS5_CUSTOM_AUTH_START ||
      authMethod > SOCKS5_CUSTOM_AUTH_END
    ) {
      throw new SocksClientError(
        ERRORS.InvalidSocksClientOptionsCustomAuthRange,
        {
          code: SocksErrorCode.InvalidSocksClientOptionsCustomAuthRange,
          options,
        },
      );
    }

    // Missing custom_auth_request_handler
    if (
      requestHandler === undefined ||
      typeof requestHandler !== 'function'
    ) {
      throw new SocksClientError(
        ERRORS.InvalidSocksClientOptionsCustomAuthOptions,
        {
          code: SocksErrorCode.InvalidSocksClientOptionsCustomAuthOptions,
          options,
        },
      );
    }

    // Missing/invalid custom_auth_response_size
    if (responseSize === undefined || !Number.isInteger(responseSize) || responseSize < 1) {
      throw new SocksClientError(
        ERRORS.InvalidSocksClientOptionsCustomAuthOptions,
        {
          code: SocksErrorCode.InvalidSocksClientOptionsCustomAuthOptions,
          options,
        },
      );
    }

    // Missing/invalid custom_auth_response_handler
    if (
      responseHandler === undefined ||
      typeof responseHandler !== 'function'
    ) {
      throw new SocksClientError(
        ERRORS.InvalidSocksClientOptionsCustomAuthOptions,
        {
          code: SocksErrorCode.InvalidSocksClientOptionsCustomAuthOptions,
          options,
        },
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
    remoteHost.host.length > 0 &&
    !remoteHost.host.includes('\x00') &&
    Buffer.byteLength(remoteHost.host) < 256 &&
    typeof remoteHost.port === 'number' &&
    Number.isInteger(remoteHost.port) &&
    remoteHost.port >= 0 &&
    remoteHost.port <= 65535
  );
}

/**
 * Validates a SocksProxy
 * @param proxy { SocksProxy }
 */
const VALID_PROXY_TYPES: ReadonlySet<SocksProxyType> = new Set<SocksProxyType>([
  4, 5, 'socks', 'socks4', 'socks4a', 'socks5', 'socks5h',
]);

function isValidSocksProxy(proxy: SocksProxy) {
  return (
    proxy &&
    ((typeof proxy.host === 'string' && proxy.host.length > 0 && !proxy.host.includes('\x00')) ||
      (typeof proxy.ipaddress === 'string' && proxy.ipaddress.length > 0 && !proxy.ipaddress.includes('\x00'))) &&
    typeof proxy.port === 'number' &&
    Number.isInteger(proxy.port) &&
    proxy.port > 0 &&
    proxy.port <= 65535 &&
    VALID_PROXY_TYPES.has(proxy.type)
  );
}

/**
 * Validates a timeout value.
 * @param value { Number }
 */
function isValidTimeoutValue(value: number) {
  return Number.isFinite(value) && value > 0;
}

/**
 * Returns the host string from a SocksProxy, preferring `host` over deprecated `ipaddress`.
 */
function resolveProxyHost(proxy: SocksProxy): string {
  return (proxy.host || proxy.ipaddress)!;
}

/**
 * Resolves a SocksProxyType (numeric or string) to the numeric form (4 or 5).
 */
function resolveProxyType(type: SocksProxyType): 4 | 5 {
  switch (type) {
    case 4:
    case 'socks4':
    case 'socks4a':
      return 4;
    case 5:
    case 'socks':
    case 'socks5':
    case 'socks5h':
      return 5;
  }
}

/**
 * Normalizes a SocksProxy by resolving snake_case custom auth fields to camelCase.
 * CamelCase takes priority when both naming conventions are provided.
 */
function normalizeProxy(proxy: SocksProxy): NormalizedSocksProxy {
  const normalized = {...proxy} as Record<string, unknown>;
  // Normalize string type to numeric
  normalized.type = resolveProxyType(proxy.type);
  // Resolve snake_case custom auth to camelCase (camelCase takes priority when both are set)
  if (proxy.customAuthMethod === undefined && proxy.custom_auth_method !== undefined) {
    normalized.customAuthMethod = proxy.custom_auth_method;
  }
  if (proxy.customAuthRequestHandler === undefined && proxy.custom_auth_request_handler !== undefined) {
    normalized.customAuthRequestHandler = proxy.custom_auth_request_handler;
  }
  if (proxy.customAuthResponseSize === undefined && proxy.custom_auth_response_size !== undefined) {
    normalized.customAuthResponseSize = proxy.custom_auth_response_size;
  }
  if (proxy.customAuthResponseHandler === undefined && proxy.custom_auth_response_handler !== undefined) {
    normalized.customAuthResponseHandler = proxy.custom_auth_response_handler;
  }
  return normalized as unknown as NormalizedSocksProxy;
}

/**
 * Normalizes SocksClientOptions by resolving camelCase fields to their snake_case equivalents.
 * CamelCase takes priority when both are provided.
 */
function normalizeClientOptions(options: SocksClientOptions): SocksClientOptions {
  return {
    ...options,
    existingSocket: options.existingSocket ?? options.existing_socket,
    setTcpNoDelay: options.setTcpNoDelay ?? options.set_tcp_nodelay,
    socketOptions: options.socketOptions ?? options.socket_options,
    proxy: normalizeProxy(options.proxy) as SocksProxy,
  };
}

export {validateSocksClientOptions, validateSocksClientChainOptions, resolveProxyHost, resolveProxyType, normalizeClientOptions, normalizeProxy};

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
    return Buffer.from(address.toByteArray());
  } else {
    throw new SocksClientError('Invalid IP address format', {
      code: SocksErrorCode.InternalError,
    });
  }
}
