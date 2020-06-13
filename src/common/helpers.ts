import {SocksClientOptions, SocksClientChainOptions, SocksRemoteHost} from '../client/socksclient';
import {SocksClientError} from './util';
import {ERRORS, SocksCommand, SocksProxy} from './constants';
import * as stream from 'stream';

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
    throw new SocksClientError(ERRORS.InvalidSocksClientOptionsDestination, options);
  }

  // Check SOCKS proxy to use
  if (!isValidSocksProxy(options.proxy)) {
    throw new SocksClientError(ERRORS.InvalidSocksClientOptionsProxy, options);
  }

  // Check timeout
  if (options.timeout && !isValidTimeoutValue(options.timeout)) {
    throw new SocksClientError(ERRORS.InvalidSocksClientOptionsTimeout, options);
  }

  // Check existing_socket (if provided)
  if (options.existing_socket && !(options.existing_socket instanceof stream.Duplex)) {
    throw new SocksClientError(ERRORS.InvalidSocksClientOptionsExistingSocket, options);
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
    throw new SocksClientError(ERRORS.InvalidSocksClientOptionsDestination, options);
  }

  // Validate proxies (length)
  if (!(options.proxies && Array.isArray(options.proxies) && options.proxies.length >= 2)) {
    throw new SocksClientError(ERRORS.InvalidSocksClientOptionsProxiesLength, options);
  }

  // Validate proxies
  options.proxies.forEach((proxy: SocksProxy) => {
    if (!isValidSocksProxy(proxy)) {
      throw new SocksClientError(ERRORS.InvalidSocksClientOptionsProxy, options);
    }
  });

  // Check timeout
  if (options.timeout && !isValidTimeoutValue(options.timeout)) {
    throw new SocksClientError(ERRORS.InvalidSocksClientOptionsTimeout, options);
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
