import type {Duplex} from 'node:stream';
import type {Socket, SocketConnectOpts} from 'node:net';

const DEFAULT_TIMEOUT = 30000;

type SocksProxyType = 4 | 5 | 'socks' | 'socks4' | 'socks4a' | 'socks5' | 'socks5h';

// prettier-ignore
const ERRORS = {
  InvalidSocksCommand: 'An invalid SOCKS command was provided. Valid options are connect, bind, and associate.',
  InvalidSocksCommandForOperation: 'An invalid SOCKS command was provided. Only a subset of commands are supported for this operation.',
  InvalidSocksCommandChain: 'An invalid SOCKS command was provided. Chaining currently only supports the connect command.',
  InvalidSocksClientOptionsDestination: 'An invalid destination host was provided.',
  InvalidSocksClientOptionsExistingSocket: 'An invalid existing socket was provided. This should be an instance of stream.Duplex.',
  InvalidSocksClientOptionsProxy: 'Invalid SOCKS proxy details were provided.',
  InvalidSocksClientOptionsTimeout: 'An invalid timeout value was provided. Please enter a value above 0 (in ms).',
  InvalidSocksClientOptionsProxiesLength: 'At least one socks proxy must be provided for chaining.',
  InvalidSocksClientOptionsCustomAuthRange: 'Custom auth must be a value between 0x80 and 0xFE.',
  InvalidSocksClientOptionsCustomAuthOptions: 'When a custom_auth_method is provided, custom_auth_request_handler, custom_auth_response_size, and custom_auth_response_handler must also be provided and valid.',
  InvalidSocksClientOptionsCredentialLength: 'userId and password must each be at most 255 bytes (RFC 1929).',
  InvalidSocks4DestinationIPv6: 'SOCKS4 does not support IPv6 destination addresses. Use SOCKS5 or provide a hostname.',
  InvalidSocks4CommandAssociate: 'SOCKS4 does not support the associate (UDP) command. Use SOCKS5 for UDP association.',
  SocketClosed: 'Socket closed',
  ProxyConnectionTimedOut: 'Proxy connection timed out',
  InternalError: 'SocksClient internal error (this should not happen)',
  InvalidSocks4HandshakeResponse: 'Received invalid Socks4 handshake response',
  Socks4ProxyRejectedConnection: 'Socks4 Proxy rejected connection',
  InvalidSocks4IncomingConnectionResponse: 'Socks4 invalid incoming connection response',
  Socks4ProxyRejectedIncomingBoundConnection: 'Socks4 Proxy rejected incoming bound connection',
  InvalidSocks5InitialHandshakeSocksVersion: 'Received invalid Socks5 initial handshake (invalid socks version)',
  InvalidSocks5InitialHandshakeNoAcceptedAuthType: 'Received invalid Socks5 initial handshake (no accepted authentication type)',
  InvalidSocks5InitialHandshakeUnknownAuthType: 'Received invalid Socks5 initial handshake (unknown authentication type)',
  Socks5AuthenticationFailed: 'Socks5 Authentication failed',
  InvalidSocks5FinalHandshake: 'Received invalid Socks5 final handshake response',
  InvalidSocks5FinalHandshakeRejected: 'Socks5 proxy rejected connection',
  InvalidSocks5IncomingConnectionResponse: 'Received invalid Socks5 incoming connection response',
  Socks5ProxyRejectedIncomingBoundConnection: 'Socks5 Proxy rejected incoming bound connection',
  ConnectionAborted: 'Connection aborted by AbortSignal',
  SocketError: 'Socket error',
  InvalidUDPFrameHostnameTooLong: 'Hostname is too long for a UDP frame (max 255 bytes)',
  InvalidUDPFrameTooShort: 'UDP frame is too short to contain a valid header (minimum 10 bytes)',
  InvalidUDPFrameAddressType: 'Unsupported address type in UDP frame',
} as const;

const SOCKS_INCOMING_PACKET_SIZES = {
  Socks5InitialHandshakeResponse: 2,
  Socks5UserPassAuthenticationResponse: 2,
  // Command response + incoming connection (bind)
  Socks5ResponseHeader: 5, // We need at least 5 to read the hostname length, then we wait for the address+port information.
  Socks5ResponseIPv4: 10, // 4 header + 4 ip + 2 port
  Socks5ResponseIPv6: 22, // 4 header + 16 ip + 2 port
  Socks5ResponseHostname: (hostNameLength: number) => hostNameLength + 7, // 4 header + 1 host length + host + 2 port
  // Command response + incoming connection (bind)
  Socks4Response: 8, // 2 header + 2 port + 4 ip
};

type SocksCommandOption = 'connect' | 'bind' | 'associate';

const SocksCommand = {
  connect: 0x01,
  bind: 0x02,
  associate: 0x03,
} as const;
type SocksCommand = (typeof SocksCommand)[keyof typeof SocksCommand];

const Socks4Response = {
  Granted: 0x5a,
  Failed: 0x5b,
  Rejected: 0x5c,
  RejectedIdent: 0x5d,
} as const;
type Socks4Response = (typeof Socks4Response)[keyof typeof Socks4Response];

const Socks4ResponseName = Object.fromEntries(
  Object.entries(Socks4Response).map(([k, v]) => [v, k])
) as Record<number, string>;

const Socks5Auth = {
  NoAuth: 0x00,
  GSSApi: 0x01,
  UserPass: 0x02,
} as const;
type Socks5Auth = (typeof Socks5Auth)[keyof typeof Socks5Auth];

const SOCKS5_CUSTOM_AUTH_START = 0x80;
const SOCKS5_CUSTOM_AUTH_END = 0xfe;

const SOCKS5_NO_ACCEPTABLE_AUTH = 0xff;

const Socks5Response = {
  Granted: 0x00,
  Failure: 0x01,
  NotAllowed: 0x02,
  NetworkUnreachable: 0x03,
  HostUnreachable: 0x04,
  ConnectionRefused: 0x05,
  TTLExpired: 0x06,
  CommandNotSupported: 0x07,
  AddressNotSupported: 0x08,
} as const;
type Socks5Response = (typeof Socks5Response)[keyof typeof Socks5Response];

const Socks5ResponseName: Record<number, string> = Object.fromEntries(
  Object.entries(Socks5Response).map(([k, v]) => [v, k])
);

const Socks5HostType = {
  IPv4: 0x01,
  Hostname: 0x03,
  IPv6: 0x04,
} as const;
type Socks5HostType = (typeof Socks5HostType)[keyof typeof Socks5HostType];

const SocksClientState = {
  Created: 0,
  Connecting: 1,
  Connected: 2,
  SentInitialHandshake: 3,
  // 4 is intentionally unused (reserved)
  SentAuthentication: 5,
  ReceivedAuthenticationResponse: 6,
  SentFinalHandshake: 7,
  // 8 is intentionally unused (reserved)
  BoundWaitingForConnection: 9,
  Established: 10,
  Error: 99,
} as const;
type SocksClientState = (typeof SocksClientState)[keyof typeof SocksClientState];

/**
 * Base properties shared by all SocksProxy configurations.
 */
interface SocksProxyBase {
  // Numeric port number of the proxy.
  port: number;
  // 4 or 5 (4 is also used for 4a).
  type: SocksProxyType;
  /* For SOCKS v4, the userId can be used for authentication.
     For SOCKS v5, userId is used as the username for username/password authentication. */
  userId?: string;
  // For SOCKS v5, this password is used in username/password authentication.
  password?: string;
}

/**
 * At least one of `host` or `ipaddress` must be provided.
 */
type SocksProxyHost =
  | {
      // The ip address (or hostname) of the proxy.
      host: string;
      /**
       * @deprecated Use `host` instead. This field will be removed in a future major version.
       */
      ipaddress?: string;
    }
  | {
      host?: string;
      /**
       * @deprecated Use `host` instead. This field will be removed in a future major version.
       */
      ipaddress: string;
    };

/**
 * Custom auth fields must be provided as a complete group, or not at all.
 * Both camelCase and snake_case naming conventions are supported.
 */
type SocksProxyCustomAuth =
  | {
      /** @deprecated Use `customAuthMethod` instead. */
      custom_auth_method?: undefined;
      /** @deprecated Use `customAuthRequestHandler` instead. */
      custom_auth_request_handler?: undefined;
      /** @deprecated Use `customAuthResponseSize` instead. */
      custom_auth_response_size?: undefined;
      /** @deprecated Use `customAuthResponseHandler` instead. */
      custom_auth_response_handler?: undefined;
      customAuthMethod?: undefined;
      customAuthRequestHandler?: undefined;
      customAuthResponseSize?: undefined;
      customAuthResponseHandler?: undefined;
    }
  | {
      /** @deprecated Use `customAuthMethod` instead. */
      custom_auth_method: number;
      /** @deprecated Use `customAuthRequestHandler` instead. */
      custom_auth_request_handler: () => Promise<Buffer>;
      /** @deprecated Use `customAuthResponseSize` instead. */
      custom_auth_response_size: number;
      /** @deprecated Use `customAuthResponseHandler` instead. */
      custom_auth_response_handler: (data: Buffer) => Promise<boolean>;
      customAuthMethod?: undefined;
      customAuthRequestHandler?: undefined;
      customAuthResponseSize?: undefined;
      customAuthResponseHandler?: undefined;
    }
  | {
      /** @deprecated Use `customAuthMethod` instead. */
      custom_auth_method?: undefined;
      /** @deprecated Use `customAuthRequestHandler` instead. */
      custom_auth_request_handler?: undefined;
      /** @deprecated Use `customAuthResponseSize` instead. */
      custom_auth_response_size?: undefined;
      /** @deprecated Use `customAuthResponseHandler` instead. */
      custom_auth_response_handler?: undefined;
      // If present, this auth method will be sent to the proxy server during the initial handshake.
      customAuthMethod: number;
      // The payload of the returned Buffer is sent during the auth handshake.
      customAuthRequestHandler: () => Promise<Buffer>;
      // The expected total response size of the data returned from the server during custom auth handshake.
      customAuthResponseSize: number;
      // The response from the server is passed to this function. Return true to continue, false to disconnect.
      customAuthResponseHandler: (data: Buffer) => Promise<boolean>;
    };

/**
 * Represents a SocksProxy
 */
type SocksProxy = SocksProxyBase & SocksProxyHost & SocksProxyCustomAuth;

/**
 * Internal normalized form of SocksProxy where the type has been resolved to numeric 4 | 5.
 * This is the result of normalizeProxy() and should be used internally after normalization.
 */
interface NormalizedSocksProxy extends Omit<SocksProxy, 'type'> {
  type: 4 | 5;
}

/**
 * Represents a remote host
 */
interface SocksRemoteHost {
  // IPv4, IPv6, or Hostname.
  host: string;
  // Numeric port number.
  port: number;
}

/**
 * SocksClient connection options.
 */
interface SocksClientOptions {
  // connect, bind, associate.
  command: SocksCommandOption;
  // The remote destination host to connect to via the proxy.
  destination: SocksRemoteHost;
  // The proxy server to use.
  proxy: SocksProxy;
  // The amount of time to wait when establishing a proxy connection (ms).
  timeout?: number;
  // An AbortSignal to cancel the connection attempt.
  signal?: AbortSignal;

  // Preferred camelCase options
  // An existing socket to use instead of creating a new one (for proxy chaining).
  existingSocket?: Duplex;
  // Whether to set TCP_NODELAY on the socket (default: true).
  setTcpNoDelay?: boolean;
  // TCP SocketConnection Options. host/port will be overridden by proxy host/port.
  socketOptions?: SocketConnectOpts;

  /** @deprecated Use `existingSocket` instead. */
  existing_socket?: Duplex;
  /** @deprecated Use `setTcpNoDelay` instead. */
  set_tcp_nodelay?: boolean;
  /** @deprecated Use `socketOptions` instead. */
  socket_options?: SocketConnectOpts;
}

/**
 * SocksClient chain connection options.
 */
interface SocksClientChainOptions {
  // Only the connect command is supported when chaining.
  command: 'connect';
  // The remote destination host to connect to via the proxy.
  destination: SocksRemoteHost;
  // The list of proxy servers to chain.
  proxies: SocksProxy[];
  // The amount of time to wait when establishing a proxy connection (ms).
  timeout?: number;
  // If true, the list of proxies will be shuffled (default: false)
  randomizeChain?: boolean;
  // An AbortSignal to cancel the connection chain.
  signal?: AbortSignal;
}

interface SocksClientEstablishedEvent {
  // The raw net.Socket that is a proxied connection through the proxy to the destination host.
  socket: Socket;
  // If provided, this is the remote host that connected to the proxy when using bind.
  remoteHost?: SocksRemoteHost;
  // Destroys the underlying socket when using explicit resource management (`using`).
  [Symbol.dispose](): void;
  // Gracefully ends the underlying socket when using async explicit resource management (`await using`).
  [Symbol.asyncDispose](): Promise<void>;
}

type SocksClientBoundEvent = SocksClientEstablishedEvent & {
  remoteHost: SocksRemoteHost;
};

interface SocksUDPFrameDetails {
  // The frame number of the packet.
  frameNumber: number;

  // The remote host.
  remoteHost: SocksRemoteHost;

  // The packet data.
  data: Buffer;
}

const SocksErrorCode = {
  // Validation
  InvalidSocksCommand: 'ERR_SOCKS_INVALID_COMMAND',
  InvalidSocksCommandForOperation: 'ERR_SOCKS_INVALID_COMMAND_FOR_OPERATION',
  InvalidSocksCommandChain: 'ERR_SOCKS_INVALID_COMMAND_CHAIN',
  InvalidSocksClientOptionsDestination: 'ERR_SOCKS_INVALID_DESTINATION',
  InvalidSocksClientOptionsProxy: 'ERR_SOCKS_INVALID_PROXY',
  InvalidSocksClientOptionsTimeout: 'ERR_SOCKS_INVALID_TIMEOUT',
  InvalidSocksClientOptionsExistingSocket: 'ERR_SOCKS_INVALID_EXISTING_SOCKET',
  InvalidSocksClientOptionsProxiesLength: 'ERR_SOCKS_INVALID_PROXIES_LENGTH',
  InvalidSocksClientOptionsCustomAuthRange:
    'ERR_SOCKS_INVALID_CUSTOM_AUTH_RANGE',
  InvalidSocksClientOptionsCustomAuthOptions:
    'ERR_SOCKS_INVALID_CUSTOM_AUTH_OPTIONS',
  InvalidSocksClientOptionsCredentialLength:
    'ERR_SOCKS_INVALID_CREDENTIAL_LENGTH',
  InvalidSocks4DestinationIPv6: 'ERR_SOCKS4_IPV6_NOT_SUPPORTED',
  InvalidSocks4CommandAssociate: 'ERR_SOCKS4_ASSOCIATE_NOT_SUPPORTED',
  // Runtime - general
  SocketClosed: 'ERR_SOCKS_SOCKET_CLOSED',
  SocketError: 'ERR_SOCKS_SOCKET_ERROR',
  ProxyConnectionTimedOut: 'ERR_SOCKS_PROXY_TIMEOUT',
  InternalError: 'ERR_SOCKS_INTERNAL',
  // Runtime - SOCKS4
  InvalidSocks4HandshakeResponse: 'ERR_SOCKS4_INVALID_RESPONSE',
  InvalidSocks4IncomingConnectionResponse:
    'ERR_SOCKS4_INVALID_INCOMING_RESPONSE',
  Socks4ProxyRejectedConnection: 'ERR_SOCKS4_PROXY_REJECTED',
  Socks4ProxyRejectedIncomingBoundConnection:
    'ERR_SOCKS4_PROXY_REJECTED_BOUND',
  // Runtime - SOCKS5
  InvalidSocks5InitialHandshakeSocksVersion: 'ERR_SOCKS5_INVALID_VERSION',
  InvalidSocks5InitialHandshakeNoAcceptedAuthType:
    'ERR_SOCKS5_NO_ACCEPTED_AUTH',
  InvalidSocks5InitialHandshakeUnknownAuthType: 'ERR_SOCKS5_UNKNOWN_AUTH_TYPE',
  Socks5AuthenticationFailed: 'ERR_SOCKS5_AUTH_FAILED',
  InvalidSocks5FinalHandshake: 'ERR_SOCKS5_INVALID_FINAL_RESPONSE',
  InvalidSocks5FinalHandshakeRejected: 'ERR_SOCKS5_PROXY_REJECTED',
  InvalidSocks5IncomingConnectionResponse:
    'ERR_SOCKS5_INVALID_INCOMING_RESPONSE',
  Socks5ProxyRejectedIncomingBoundConnection:
    'ERR_SOCKS5_PROXY_REJECTED_BOUND',
  ConnectionAborted: 'ERR_SOCKS_CONNECTION_ABORTED',
  // UDP frame errors
  InvalidUDPFrameHostnameTooLong: 'ERR_SOCKS_UDP_HOSTNAME_TOO_LONG',
  InvalidUDPFrameTooShort: 'ERR_SOCKS_UDP_FRAME_TOO_SHORT',
  InvalidUDPFrameAddressType: 'ERR_SOCKS_UDP_INVALID_ADDRESS_TYPE',
} as const;

type SocksErrorCode = (typeof SocksErrorCode)[keyof typeof SocksErrorCode];

export {
  DEFAULT_TIMEOUT,
  ERRORS,
  SocksCommand,
  Socks4Response,
  Socks4ResponseName,
  Socks5Auth,
  Socks5HostType,
  Socks5Response,
  Socks5ResponseName,
  SocksClientState,
  SOCKS_INCOMING_PACKET_SIZES,
  SOCKS5_CUSTOM_AUTH_START,
  SOCKS5_CUSTOM_AUTH_END,
  SOCKS5_NO_ACCEPTABLE_AUTH,
  SocksErrorCode,
};

export type {
  SocksProxyType,
  SocksProxy,
  SocksRemoteHost,
  SocksCommandOption,
  SocksClientOptions,
  SocksClientChainOptions,
  SocksClientEstablishedEvent,
  SocksClientBoundEvent,
  SocksUDPFrameDetails,
  NormalizedSocksProxy,
};
