/// <reference types="node" />
import { EventEmitter } from 'events';
import * as net from 'net';
import { SocksClientOptions, SocksClientChainOptions, SocksRemoteHost, SocksProxy, SocksClientEstablishedEvent, SocksUDPFrameDetails } from '../common/constants';
import { SocksClientError } from '../common/util';
interface SocksClient {
    on(event: 'close', listener: (had_error: boolean) => void): this;
    on(event: 'error', listener: (err: SocksClientError) => void): this;
    on(event: 'bound', listener: (info: SocksClientEstablishedEvent) => void): this;
    on(event: 'established', listener: (info: SocksClientEstablishedEvent) => void): this;
    once(event: string, listener: (...args: any[]) => void): this;
    once(event: 'close', listener: (had_error: boolean) => void): this;
    once(event: 'error', listener: (err: SocksClientError) => void): this;
    once(event: 'bound', listener: (info: SocksClientEstablishedEvent) => void): this;
    once(event: 'established', listener: (info: SocksClientEstablishedEvent) => void): this;
    emit(event: string | symbol, ...args: any[]): boolean;
    emit(event: 'close'): boolean;
    emit(event: 'error', err: SocksClientError): boolean;
    emit(event: 'bound', info: SocksClientEstablishedEvent): boolean;
    emit(event: 'established', info: SocksClientEstablishedEvent): boolean;
}
declare class SocksClient extends EventEmitter implements SocksClient {
    private _options;
    private _socket;
    private _state;
    private _onDataReceived;
    private _onClose;
    private _onError;
    private _onConnect;
    constructor(options: SocksClientOptions);
    /**
     * Creates a
     * @param options
     * @param callback
     */
    static createConnection(options: SocksClientOptions, callback?: Function): Promise<SocksClientEstablishedEvent>;
    static createConnectionChain(options: SocksClientChainOptions, callback?: Function): Promise<SocksClientEstablishedEvent>;
    /**
     * Creates a SOCKS UDP Frame.
     * @param options
     */
    static createUDPFrame(options: SocksUDPFrameDetails): Buffer;
    /**
     * Parses a SOCKS UDP frame.
     * @param data
     */
    static parseUDPFrame(data: Buffer): SocksUDPFrameDetails;
    /**
     * Gets the SocksClient internal state.
     */
    /**
     * Internal state setter. If the SocksClient is in a closed or error state, it cannot be changed to a non error state.
     */
    private state;
    /**
     * Starts the connection establishment to the proxy and destination.
     * @param existing_socket Connected socket to use instead of creating a new one (iternal use).
     */
    connect(existing_socket?: net.Socket): void;
    /**
     * Handles internal Socks timeout callback.
     * Note: If the Socks client is not BoundWaitingForConnection or Established, the connection will be closed.
     */
    private onEstablishedTimeout();
    /**
     * Handles Socket connect event.
     */
    private onConnect();
    /**
     * Handles Socket data event.
     * @param data
     */
    private onDataReceived(data);
    /**
     * Handles Socket close event.
     * @param had_error
     */
    private onClose(had_error);
    /**
     * Handles Socket error event.
     * @param err
     */
    private onError(err);
    /**
     * Removes internal event listeners on the underlying Socket.
     */
    private removeInternalSocketHandlers();
    /**
     * Closes and destroys the underlying Socket.
     *
     * Note: Either only the 'close' or 'error' event will be emitted in a SocksClient lifetime. Never both.
     * @param err Optional error message to include in error event.
     */
    private _closeSocket(err?);
    /**
     * Sends initial Socks v4 handshake request.
     */
    private sendSocks4InitialHandshake();
    /**
     * Handles Socks v4 handshake response.
     * @param data
     */
    private handleSocks4FinalHandshakeResponse(data);
    /**
     * Handles Socks v4 incoming connection request (BIND)
     * @param data
     */
    private handleSocks4IncomingConnectionResponse(data);
    /**
     * Sends initial Socks v5 handshake request.
     */
    private sendSocks5InitialHandshake();
    /**
     * Handles initial Socks v5 handshake response.
     * @param data
     */
    private handleInitialSocks5HandshakeResponse(data);
    /**
     * Sends Socks v5 auth handshake.
     *
     * Note: No auth and user/pass are currently supported.
     */
    private sendSocks5Authentication();
    /**
     * Handles Socks v5 auth handshake response.
     * @param data
     */
    private handleInitialSocks5AuthenticationHandshakeResponse(data);
    /**
     * Sends Socks v5 final handshake request.
     */
    private sendSocks5CommandRequest();
    /**
     * Handles Socks v5 final handshake response.
     * @param data
     */
    private handleSocks5FinalHandshakeResponse(data);
    /**
     * Handles Socks v5 incoming connection request (BIND).
     * @param data
     */
    private handleSocks5IncomingConnectionResponse(data);
    readonly socksClientOptions: SocksClientOptions;
}
export { SocksClient, SocksClientOptions, SocksClientChainOptions, SocksRemoteHost, SocksProxy, SocksUDPFrameDetails };
