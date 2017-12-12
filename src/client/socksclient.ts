import { EventEmitter } from 'events';
import * as net from 'net';
import * as ip from 'ip';
import { SmartBuffer } from 'smart-buffer';
import {
  DEFAULT_TIMEOUT,
  SocksCommand,
  Socks4Response,
  Socks5Auth,
  Socks5HostType,
  Socks5Response,
  SocksClientOptions,
  SocksClientChainOptions,
  SocksClientState,
  SocksRemoteHost,
  SocksProxy,
  SocksClientEstablishedEvent,
  SocksUDPFrameDetails
} from '../common/constants';
import {
  validateSocksClientOptions,
  validateSocksClientChainOptions
} from '../common/helpers';
import { SocksClientError, shuffleArray } from '../common/util';

// Exposes SocksClient event types
declare interface SocksClient {
  on(event: 'close', listener: (had_error: boolean) => void): this;
  on(event: 'error', listener: (err: SocksClientError) => void): this;
  on(
    event: 'bound',
    listener: (info: SocksClientEstablishedEvent) => void
  ): this;
  on(
    event: 'established',
    listener: (info: SocksClientEstablishedEvent) => void
  ): this;

  once(event: string, listener: (...args: any[]) => void): this;
  once(event: 'close', listener: (had_error: boolean) => void): this;
  once(event: 'error', listener: (err: SocksClientError) => void): this;
  once(
    event: 'bound',
    listener: (info: SocksClientEstablishedEvent) => void
  ): this;
  once(
    event: 'established',
    listener: (info: SocksClientEstablishedEvent) => void
  ): this;

  emit(event: string | symbol, ...args: any[]): boolean;
  emit(event: 'close'): boolean;
  emit(event: 'error', err: SocksClientError): boolean;
  emit(event: 'bound', info: SocksClientEstablishedEvent): boolean;
  emit(event: 'established', info: SocksClientEstablishedEvent): boolean;
}

class SocksClient extends EventEmitter implements SocksClient {
  private _options: SocksClientOptions;
  private _socket: net.Socket;
  private _state: SocksClientState;

  // Internal Socket data handlers
  private _onDataReceived: (data: Buffer) => void;
  private _onClose: (had_error: boolean) => void;
  private _onError: (err: Error) => void;
  private _onConnect: () => void;

  constructor(options: SocksClientOptions) {
    super();
    this._options = {
      ...options
    };

    // Validate SocksClientOptions
    validateSocksClientOptions(options);

    // Default state
    this.state = SocksClientState.Created;
  }

  /**
   * Creates a
   * @param options
   * @param callback
   */
  static createConnection(
    options: SocksClientOptions,
    callback?: Function
  ): Promise<SocksClientEstablishedEvent> {
    // Validate SocksClientOptions
    validateSocksClientOptions(options);

    return new Promise<SocksClientEstablishedEvent>((resolve, reject) => {
      const client = new SocksClient(options);
      client.connect(options.existing_socket);
      client.once('established', (info: SocksClientEstablishedEvent) => {
        if (typeof callback === 'function') {
          callback(null, info);
        }
        resolve(info);
      });
      client.once('error', (err: Error) => {
        if (typeof callback === 'function') {
          callback(err);
        }
        reject(err);
      });
      client.once('close', () => {
        if (typeof callback === 'function') {
          callback();
        }
        reject();
      });
    });
  }

  // todo test this, test error handling reject() ?
  static createConnectionChain(
    options: SocksClientChainOptions,
    callback?: Function
  ): Promise<SocksClientEstablishedEvent> {
    // Validate SocksClientChainOptions
    validateSocksClientChainOptions(options);

    return new Promise<SocksClientEstablishedEvent>(async (resolve, reject) => {
      if (options.randomizeChain) {
        shuffleArray(options.proxies);
      }
      // todo
    });
  }

  /**
   * Creates a SOCKS UDP Frame.
   * @param options
   */
  static createUDPFrame(options: SocksUDPFrameDetails): Buffer {
    const buff = new SmartBuffer();
    buff.writeUInt16BE(0);
    buff.writeUInt8(options.frameNumber || 0);

    // IPv4/IPv6/Hostname
    if (net.isIPv4(options.remoteHost.host)) {
      buff.writeUInt8(Socks5HostType.IPv4);
      buff.writeUInt32BE(ip.toLong(options.remoteHost.host));
    } else if (net.isIPv6(options.remoteHost.host)) {
      buff.writeUInt8(Socks5HostType.IPv6);
      buff.writeBuffer(ip.toBuffer(options.remoteHost.host));
    } else {
      buff.writeUInt8(Socks5HostType.Hostname);
      buff.writeUInt8(Buffer.byteLength(options.remoteHost.host));
      buff.writeString(options.remoteHost.host);
    }

    // Port
    buff.writeUInt16BE(options.remoteHost.port);

    // Data
    buff.writeBuffer(options.data);

    return buff.toBuffer();
  }

  /**
   * Parses a SOCKS UDP frame.
   * @param data
   */
  static parseUDPFrame(data: Buffer): SocksUDPFrameDetails {
    const buff = SmartBuffer.fromBuffer(data);
    buff.readOffset = 2;

    const frameNumber = buff.readUInt8();
    const hostType: Socks5HostType = buff.readUInt8();
    let remoteHost;

    if (hostType === Socks5HostType.IPv4) {
      remoteHost = ip.fromLong(buff.readUInt32BE());
    } else if (hostType === Socks5HostType.IPv6) {
      remoteHost = ip.toString(buff.readBuffer(16));
    } else {
      remoteHost = buff.readString(buff.readUInt8());
    }

    const remotePort = buff.readUInt16BE();

    return {
      frameNumber,
      remoteHost: {
        host: remoteHost,
        port: remotePort
      },
      data: buff.readBuffer()
    };
  }

  /**
   * Gets the SocksClient internal state.
   */
  private get state() {
    return this._state;
  }

  /**
   * Internal state setter. If the SocksClient is in a closed or error state, it cannot be changed to a non error state.
   */
  private set state(newState: SocksClientState) {
    if (
      this._state !== SocksClientState.Closed &&
      this._state !== SocksClientState.Error
    ) {
      this._state = newState;
    }
  }

  /**
   * Starts the connection establishment to the proxy and destination.
   * @param existing_socket Connected socket to use instead of creating a new one (iternal use).
   */
  public connect(existing_socket?: net.Socket) {
    this._onDataReceived = (data: Buffer) => this.onDataReceived(data);
    this._onClose = (had_error: boolean) => this.onClose(had_error);
    this._onError = (err: Error) => this.onError(err);
    this._onConnect = () => this.onConnect();

    // Start timeout timer (defaults to 30 seconds)
    setTimeout(
      () => this.onEstablishedTimeout(),
      this._options.timeout || DEFAULT_TIMEOUT
    );

    // If an existing socket is provided, use it to negotiate SOCKS handshake. Otherwise create a new Socket.
    if (existing_socket) {
      this._socket = existing_socket;
    } else {
      this._socket = new net.Socket();
    }

    // Attach Socket error handlers.
    this._socket.once('close', this._onClose);
    this._socket.once('error', this._onError);
    this._socket.once('connect', this._onConnect);
    this._socket.on('data', this._onDataReceived);

    this.state = SocksClientState.Connecting;

    if (existing_socket) {
      this._socket.emit('connect');
    } else {
      this._socket.connect(
        this._options.proxy.port,
        this._options.proxy.ipaddress
      );
    }

    // Listens for instance 'established' event to remove internal data socket handlers.
    this.once('established', () => this.removeInternalSocketHandlers());
  }

  /**
   * Handles internal Socks timeout callback.
   * Note: If the Socks client is not BoundWaitingForConnection or Established, the connection will be closed.
   */
  private onEstablishedTimeout() {
    if (
      this.state !== SocksClientState.Established &&
      this.state !== SocksClientState.BoundWaitingForConnection
    ) {
      this._closeSocket('Proxy connection timed out');
    }
  }

  /**
   * Handles Socket connect event.
   */
  private onConnect() {
    this.state = SocksClientState.Connected;

    // Send initial handshake.
    if (this._options.proxy.type === 4) {
      this.sendSocks4InitialHandshake();
    } else {
      this.sendSocks5InitialHandshake();
    }

    this.state = SocksClientState.SentInitialHandshake;
  }

  /**
   * Handles Socket data event.
   * @param data
   */
  private onDataReceived(data: Buffer) {
    // Sent initial handshake, waiting for response.
    if (this.state === SocksClientState.SentInitialHandshake) {
      if (this._options.proxy.type === 4) {
        // Socks v4 only has one handshake response.
        this.handleSocks4FinalHandshakeResponse(data);
      } else {
        // Socks v5 has two handshakes, handle initial one here.
        this.handleInitialSocks5HandshakeResponse(data);
      }
      // Sent auth request for Socks v5, waiting for response.
    } else if (this.state === SocksClientState.SentAuthenication) {
      this.handleInitialSocks5AuthenticationHandshakeResponse(data);
      // Sent final Socks v5 handshake, waiting for final response.
    } else if (this.state === SocksClientState.SentFinalHandshake) {
      this.handleSocks5FinalHandshakeResponse(data);
      // Socks BIND established. Waiting for remote connection via proxy.
    } else if (this.state === SocksClientState.BoundWaitingForConnection) {
      if (this._options.proxy.type === 4) {
        this.handleSocks4IncomingConnectionResponse(data);
      } else {
        this.handleSocks5IncomingConnectionResponse(data);
      }
    }
  }

  /**
   * Handles Socket close event.
   * @param had_error
   */
  private onClose(had_error: boolean) {
    this._closeSocket();
  }

  /**
   * Handles Socket error event.
   * @param err
   */
  private onError(err: Error) {
    this._closeSocket(err);
  }

  /**
   * Removes internal event listeners on the underlying Socket.
   */
  private removeInternalSocketHandlers() {
    this._socket.removeListener('data', this._onDataReceived);
    this._socket.removeListener('close', this._onClose);
    this._socket.removeListener('error', this._onError);
    this._socket.removeListener('connect', this.onConnect);
  }

  /**
   * Closes and destroys the underlying Socket.
   *
   * Note: Either only the 'close' or 'error' event will be emitted in a SocksClient lifetime. Never both.
   * @param err Optional error message to include in error event.
   */
  private _closeSocket(err?: string | Error) {
    // Make sure only one of 'close' and 'error' are fired for the lifetime of this SocksClient instance.
    if (
      this.state !== SocksClientState.Error &&
      this.state !== SocksClientState.Closed
    ) {
      // Destroy Socket
      if (!this._socket.destroyed) {
        this._socket.destroy(err);
      }

      // Remove internal listeners
      this.removeInternalSocketHandlers();

      if (err) {
        this.state = SocksClientState.Error;

        if (err instanceof Error) {
          this.emit('error', new SocksClientError(err.message, this._options));
        } else {
          this.emit('error', new SocksClientError(err, this._options));
        }
      } else {
        this.state = SocksClientState.Closed;
        this.emit('close');
      }
    }
  }

  /**
   * Sends initial Socks v4 handshake request.
   */
  private sendSocks4InitialHandshake() {
    const buff = new SmartBuffer();
    buff.writeUInt8(0x04);
    buff.writeUInt8(SocksCommand[this._options.command]);
    buff.writeUInt16BE(this._options.destination.port);

    // Socks 4 (IPv4)
    if (net.isIPv4(this._options.destination.host)) {
      buff.writeBuffer(ip.toBuffer(this._options.destination.host));
      buff.writeStringNT(this._options.proxy.userId || '');
      // Socks 4a (hostname)
    } else {
      buff.writeUInt8(0x00);
      buff.writeUInt8(0x00);
      buff.writeUInt8(0x00);
      buff.writeUInt8(0x01);
      buff.writeStringNT(this._options.proxy.userId || '');
      buff.writeStringNT(this._options.destination.host);
    }

    this._socket.write(buff.toBuffer());
  }

  /**
   * Handles Socks v4 handshake response.
   * @param data
   */
  private handleSocks4FinalHandshakeResponse(data: Buffer) {
    if (data.length < 8) {
      this._closeSocket('Received invalid Socks4 handshake response');
    } else if (data[1] !== Socks4Response.Granted) {
      this._closeSocket(
        `Server rejected connection (${Socks4Response[data[1]]})`
      );
    } else {
      // Bind response
      if (SocksCommand[this._options.command] === SocksCommand.bind) {
        const buff = SmartBuffer.fromBuffer(data);
        buff.readOffset = 2;

        const remoteHostInfo: SocksRemoteHost = {
          port: buff.readUInt16BE(),
          host: ip.fromLong(buff.readUInt32BE())
        };

        // If host is 0.0.0.0, set to proxy host.
        if (remoteHostInfo.host === '0.0.0.0') {
          remoteHostInfo.host = this._options.proxy.ipaddress;
        }
        this.state = SocksClientState.BoundWaitingForConnection;
        this.emit('bound', { socket: this._socket, remoteHostInfo });

        // Connect response
      } else {
        this.state = SocksClientState.Established;
        this._socket.pause();
        this.emit('established', { socket: this._socket });
      }
    }
  }

  /**
   * Handles Socks v4 incoming connection request (BIND)
   * @param data
   */
  private handleSocks4IncomingConnectionResponse(data: Buffer) {
    if (data.length < 8) {
      this._closeSocket('Received invalid incoming connection response');
    } else if (data[1] !== Socks4Response.Granted) {
      this._closeSocket(
        `Server rejected incoming bound connection (${Socks4Response[data[1]]})`
      );
    } else {
      const buff = SmartBuffer.fromBuffer(data);
      buff.readOffset = 2;

      const remoteHostInfo: SocksRemoteHost = {
        port: buff.readUInt16BE(),
        host: ip.fromLong(buff.readUInt32BE())
      };

      this.state = SocksClientState.Established;
      this._socket.pause();
      this.emit('established', { socket: this._socket, remoteHostInfo });
    }
  }

  /**
   * Sends initial Socks v5 handshake request.
   */
  private sendSocks5InitialHandshake() {
    const buff = new SmartBuffer();
    buff.writeUInt8(0x05);
    buff.writeUInt8(2);
    buff.writeUInt8(Socks5Auth.NoAuth);
    buff.writeUInt8(Socks5Auth.UserPass);

    this._socket.write(buff.toBuffer());
    this.state = SocksClientState.SentInitialHandshake;
  }

  /**
   * Handles initial Socks v5 handshake response.
   * @param data
   */
  private handleInitialSocks5HandshakeResponse(data: Buffer) {
    if (data.length !== 2) {
      this._closeSocket('Negotiation Error');
    } else if (data[0] !== 0x05) {
      this._closeSocket('Negotiation Error (invalid socks version)');
    } else if (data[1] === 0xff) {
      this._closeSocket('Negotiation Error (no accepted authentication type)');
    } else {
      // If selected Socks v5 auth method is no auth, send final handshake request.
      if (data[1] === Socks5Auth.NoAuth) {
        this.sendSocks5CommandRequest();
        // If selected Socks v5 auth method is user/password, send auth handshake.
      } else if (data[1] === Socks5Auth.UserPass) {
        this.sendSocks5Authentication();
      } else {
        this._closeSocket('Negotiation Error (unknown authentication type)');
      }
    }
  }

  /**
   * Sends Socks v5 auth handshake.
   *
   * Note: No auth and user/pass are currently supported.
   */
  private sendSocks5Authentication() {
    const buff = new SmartBuffer();
    buff.writeUInt8(0x01);
    buff.writeUInt8(Buffer.byteLength(this._options.proxy.userId));
    buff.writeString(this._options.proxy.userId);
    buff.writeUInt8(Buffer.byteLength(this._options.proxy.password));
    buff.writeString(this._options.proxy.password);

    this._socket.write(buff.toBuffer());
    this.state = SocksClientState.SentAuthenication;
  }

  /**
   * Handles Socks v5 auth handshake response.
   * @param data
   */
  private handleInitialSocks5AuthenticationHandshakeResponse(data: Buffer) {
    this.state = SocksClientState.ReceivedAuthenticationResponse;

    if (data.length === 2 && data[1] === 0x00) {
      this.sendSocks5CommandRequest();
    } else {
      this._closeSocket('Negotiation Error (authentication failed)');
    }
  }

  /**
   * Sends Socks v5 final handshake request.
   */
  private sendSocks5CommandRequest() {
    const buff = new SmartBuffer();

    buff.writeUInt8(0x05);
    buff.writeUInt8(SocksCommand[this._options.command]);
    buff.writeUInt8(0x00);

    // ipv4, ipv6, domain?
    if (net.isIPv4(this._options.destination.host)) {
      buff.writeUInt8(Socks5HostType.IPv4);
      buff.writeBuffer(ip.toBuffer(this._options.destination.host));
    } else if (net.isIPv6(this._options.destination.host)) {
      buff.writeUInt8(Socks5HostType.IPv6);
      buff.writeBuffer(ip.toBuffer(this._options.destination.host));
    } else {
      buff.writeUInt8(Socks5HostType.Hostname);
      buff.writeUInt8(this._options.destination.host.length);
      buff.writeString(this._options.destination.host);
    }
    buff.writeUInt16BE(this._options.destination.port);

    this._socket.write(buff.toBuffer());
    this.state = SocksClientState.SentFinalHandshake;
  }

  /**
   * Handles Socks v5 final handshake response.
   * @param data
   */
  private handleSocks5FinalHandshakeResponse(data: Buffer) {
    if (data.length < 4) {
      this._closeSocket('Negotiation Error');
    } else if (data[0] !== 0x05 || data[1] !== Socks5Response.Granted) {
      this._closeSocket('Negotiation Error');
    } else {
      this.state = SocksClientState.ReceivedFinalResponse;

      if (SocksCommand[this._options.command] === SocksCommand.connect) {
        this.state = SocksClientState.Established;
        this.emit('established', { socket: this._socket });
      } else {
        // Read address type
        const buff = SmartBuffer.fromBuffer(data);
        buff.readOffset = 3;
        const addressType = buff.readUInt8();
        let remoteHostInfo: SocksRemoteHost;

        // IPv4
        if (addressType === Socks5HostType.IPv4) {
          remoteHostInfo = {
            host: ip.fromLong(buff.readUInt32BE()),
            port: buff.readUInt16BE()
          };

          // If given host is 0.0.0.0, assume remote proxy ip instead.
          if (remoteHostInfo.host === '0.0.0.0') {
            remoteHostInfo.host = this._options.proxy.ipaddress;
          }

          // Hostname
        } else if (addressType === Socks5HostType.Hostname) {
          const hostLength = buff.readUInt8();

          remoteHostInfo = {
            host: buff.readString(hostLength),
            port: buff.readUInt16BE()
          };
          // IPv6
        } else if (addressType === Socks5HostType.IPv6) {
          remoteHostInfo = {
            host: ip.toString(buff.readBuffer(16)),
            port: buff.readUInt16BE()
          };
        }

        /* If using BIND, the Socks client is now in BoundWaitingForConnection state.
           This means that the remote proxy server is waiting for a remote connection to the bound port. */
        if (SocksCommand[this._options.command] === SocksCommand.bind) {
          this.state = SocksClientState.BoundWaitingForConnection;
          this.emit('bound', { socket: this._socket, remoteHostInfo });
          /*
          If using Associate, the Socks client is now Established. And the proxy server is now accepting UDP packets at the
          given bound port. This initial Socks TCP connection must remain open for the UDP relay to continue to work.
        */
        } else if (
          SocksCommand[this._options.command] === SocksCommand.associate
        ) {
          this.state = SocksClientState.Established;
          this.emit('established', { socket: this._socket, remoteHostInfo });
        }
      }
    }
  }

  /**
   * Handles Socks v5 incoming connection request (BIND).
   * @param data
   */
  private handleSocks5IncomingConnectionResponse(data: Buffer) {
    if (data.length < 4) {
      this._closeSocket('Negotiation Error');
    } else if (data[0] !== 0x05 || data[1] !== Socks5Response.Granted) {
      this._closeSocket('Negotiation Error');
    } else {
      // <Buffer 05 00 00 01 68 ec d8 de 8b ac>
      // Read address type
      const buff = SmartBuffer.fromBuffer(data);
      buff.readOffset = 3;
      const addressType = buff.readUInt8();
      let remoteHostInfo: SocksRemoteHost;

      // IPv4
      if (addressType === Socks5HostType.IPv4) {
        remoteHostInfo = {
          host: ip.fromLong(buff.readUInt32BE()),
          port: buff.readUInt16BE()
        };

        if (remoteHostInfo.host === '0.0.0.0') {
          remoteHostInfo.host = this._options.proxy.ipaddress;
        }
        // Hostname
      } else if (addressType === Socks5HostType.Hostname) {
        const hostLength = buff.readUInt8();

        remoteHostInfo = {
          host: buff.readString(hostLength),
          port: buff.readUInt16BE()
        };
        // IPv6
      } else if (addressType === Socks5HostType.IPv6) {
        remoteHostInfo = {
          host: ip.toString(buff.readBuffer(16)),
          port: buff.readUInt16BE()
        };
      }

      this.state = SocksClientState.Established;
      this.emit('established', { socket: this._socket, remoteHostInfo });
    }
  }

  get socksClientOptions(): SocksClientOptions {
    return {
      ...this._options
    };
  }
}

export {
  SocksClient,
  SocksClientOptions,
  SocksClientChainOptions,
  SocksRemoteHost,
  SocksProxy,
  SocksUDPFrameDetails
};
