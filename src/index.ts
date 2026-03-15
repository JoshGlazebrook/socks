export {
  SocksClient,
  SocksClientError,
  SocksTimeoutError,
  SocksAuthenticationError,
  isSocksError,
  SocksErrorCode,
  SocksCommand,
  Socks4Response,
  Socks4ResponseName,
  Socks5Auth,
  Socks5HostType,
  Socks5Response,
  Socks5ResponseName,
} from './client/socksclient.js';

export type {
  SocksClientOptions,
  SocksClientChainOptions,
  SocksClientEventMap,
  SocksClientEstablishedEvent,
  SocksClientBoundEvent,
  SocksRemoteHost,
  SocksProxy,
  SocksProxyType,
  SocksCommandOption,
  SocksUDPFrameDetails,
  SocksClientErrorOptions,
} from './client/socksclient.js';
