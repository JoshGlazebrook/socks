import { Socket } from 'net';

const DEFAULT_TIMEOUT = 30000;

type SocksProxyType = 4 | 5;

// prettier-ignore
const ERRORS = {
  InvalidSocksCommand: 'An invalid SOCKS command was provided. Valid options are connect, bind, and associate.',
  InvalidSocksCommandChain: 'An invalid SOCKS command was provided. Chaining currently only supports the connect command.',
  InvalidSocksClientOptionsDestination: 'An invalid destination host was provided.',
  InvalidSocksClientOptionsExistingSocket: 'An invalid existing socket was provided. This should be an instance of net.Socket.',
  InvalidSocksClientOptionsProxy: 'Invalid SOCKS proxy details were provided.',
  InvalidSocksClientOptionsTimeout: 'An invalid timeout value was provided. Please enter a value above 0 (in ms).',
  InvalidSocksClientOptionsProxiesLength: 'At least two socks proxies must be provided for chaining.'
};

type SocksCommandOption = 'connect' | 'bind' | 'associate';

enum SocksCommand {
  connect = 0x01,
  bind = 0x02,
  associate = 0x03
}

enum Socks4Response {
  Granted = 0x5a,
  Failed = 0x5b,
  Rejected = 0x5c,
  RejectedIdent = 0x5d
}

enum Socks5Auth {
  NoAuth = 0x00,
  GSSApi = 0x01,
  UserPass = 0x02
}

enum Socks5Response {
  Granted = 0x00,
  Failure = 0x01,
  NotAllowed = 0x02,
  NetworkUnreachable = 0x03,
  HostUnreachable = 0x04,
  ConnectionRefused = 0x05,
  TTLExpired = 0x06,
  CommandNotSupported = 0x07,
  AddressNotSupported = 0x08
}

enum Socks5HostType {
  IPv4 = 0x01,
  Hostname = 0x03,
  IPv6 = 0x04
}

enum SocksClientState {
  Created = 0,
  Connecting = 1,
  Connected = 2,
  SentInitialHandshake = 3,
  ReceivedInitialHandshakeResponse = 4,
  SentAuthenication = 5,
  ReceivedAuthenticationResponse = 6,
  SentFinalHandshake = 7,
  ReceivedFinalResponse = 8,
  BoundWaitingForConnection = 9,
  Established = 10,
  Disconnected = 11,
  Error = 99,
  Closed = 100
}

interface SocksProxy {
  ipaddress: string;
  port: number;
  type: SocksProxyType;
  userId?: string;
  password?: string;
}

interface SocksRemoteHost {
  host: string;
  port: number;
}

interface SocksClientOptions {
  command?: SocksCommandOption;
  destination: SocksRemoteHost;

  proxy: SocksProxy;
  timeout?: number;
  existing_socket?: Socket;
}

interface SocksClientChainOptions {
  command: 'connect';
  destination: SocksRemoteHost;

  proxies: SocksProxy[];
  timeout?: number;
  randomizeChain?: false;
}

interface SocksClientEstablishedEvent {
  socket: Socket;
  remoteHostInfo?: SocksRemoteHost;
}

interface SocksUDPFrameDetails {
  frameNumber?: number;
  remoteHost: SocksRemoteHost;
  data: Buffer;
}

export {
  DEFAULT_TIMEOUT,
  ERRORS,
  SocksProxyType,
  SocksCommand,
  Socks4Response,
  Socks5Auth,
  Socks5HostType,
  Socks5Response,
  SocksClientState,
  SocksProxy,
  SocksRemoteHost,
  SocksCommandOption,
  SocksClientOptions,
  SocksClientChainOptions,
  SocksClientEstablishedEvent,
  SocksUDPFrameDetails
};
