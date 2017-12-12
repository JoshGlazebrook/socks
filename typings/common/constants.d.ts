/// <reference types="node" />
import { Socket } from 'net';
declare const DEFAULT_TIMEOUT = 30000;
declare type SocksProxyType = 4 | 5;
declare const ERRORS: {
    InvalidSocksCommand: string;
    InvalidSocksCommandChain: string;
    InvalidSocksClientOptionsDestination: string;
    InvalidSocksClientOptionsExistingSocket: string;
    InvalidSocksClientOptionsProxy: string;
    InvalidSocksClientOptionsTimeout: string;
    InvalidSocksClientOptionsProxiesLength: string;
};
declare type SocksCommandOption = 'connect' | 'bind' | 'associate';
declare enum SocksCommand {
    connect = 1,
    bind = 2,
    associate = 3,
}
declare enum Socks4Response {
    Granted = 90,
    Failed = 91,
    Rejected = 92,
    RejectedIdent = 93,
}
declare enum Socks5Auth {
    NoAuth = 0,
    GSSApi = 1,
    UserPass = 2,
}
declare enum Socks5Response {
    Granted = 0,
    Failure = 1,
    NotAllowed = 2,
    NetworkUnreachable = 3,
    HostUnreachable = 4,
    ConnectionRefused = 5,
    TTLExpired = 6,
    CommandNotSupported = 7,
    AddressNotSupported = 8,
}
declare enum Socks5HostType {
    IPv4 = 1,
    Hostname = 3,
    IPv6 = 4,
}
declare enum SocksClientState {
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
    Closed = 100,
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
export { DEFAULT_TIMEOUT, ERRORS, SocksProxyType, SocksCommand, Socks4Response, Socks5Auth, Socks5HostType, Socks5Response, SocksClientState, SocksProxy, SocksRemoteHost, SocksCommandOption, SocksClientOptions, SocksClientChainOptions, SocksClientEstablishedEvent, SocksUDPFrameDetails };
