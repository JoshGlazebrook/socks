import {EventEmitter} from 'node:events';
import * as net from 'node:net';
import type {
  SocksClientOptions,
  SocksClientChainOptions,
  SocksRemoteHost,
  SocksProxy,
  SocksProxyType,
  SocksCommandOption,
  SocksClientBoundEvent,
  SocksClientEstablishedEvent,
  SocksUDPFrameDetails} from '../common/constants.js';
import {
  DEFAULT_TIMEOUT,
  SocksCommand,
  Socks4Response,
  Socks4ResponseName,
  Socks5Auth,
  Socks5HostType,
  Socks5Response,
  Socks5ResponseName,
  SocksClientState,
  SocksErrorCode,
  ERRORS,
  SOCKS_INCOMING_PACKET_SIZES,
  SOCKS5_NO_ACCEPTABLE_AUTH,
} from '../common/constants.js';
import {
  validateSocksClientOptions,
  validateSocksClientChainOptions,
  ipv4ToInt32,
  ipToBuffer,
  int32ToIpv4,
  resolveProxyHost,
  resolveProxyType,
  normalizeClientOptions,
  normalizeProxy,
} from '../common/helpers.js';
import {ReceiveBuffer} from '../common/receivebuffer.js';
import {
  SocksClientError,
  SocksTimeoutError,
  SocksAuthenticationError,
  shuffleArray,
  isSocksError,
} from '../common/util.js';
import type {SocksClientErrorOptions} from '../common/util.js';
import type {Duplex} from 'node:stream';
import {Address6} from 'ip-address';

interface SocksClientEventMap {
  /**
   * Emitted when an unrecoverable error occurs during the SOCKS handshake.
   * The underlying socket is destroyed before this event fires.
   */
  error: [err: SocksClientError];

  /**
   * Emitted when a BIND command succeeds and the proxy has allocated a port.
   * The proxy is now waiting for an incoming connection on the bound address.
   * An `established` event will follow when the remote host connects.
   */
  bound: [info: SocksClientBoundEvent];

  /**
   * Emitted when the SOCKS handshake completes successfully.
   * For CONNECT: the proxied TCP connection is ready for use.
   * For ASSOCIATE: the UDP relay is ready; the TCP connection must remain open.
   * For BIND: the remote host has connected to the bound port.
   */
  established: [info: SocksClientEstablishedEvent];
}

class SocksClient extends EventEmitter<SocksClientEventMap> {
  private options: SocksClientOptions;
  private socket!: Duplex;
  private state!: SocksClientState;
  // This is an internal ReceiveBuffer that holds all received data while we wait for enough data to process.
  private receiveBuffer!: ReceiveBuffer;
  // This is the amount of data we need to receive before we can continue processing SOCKS handshake packets.
  private nextRequiredPacketBufferSize = Infinity;
  private socks5ChosenAuthType = 0;
  // This is a flag to indicate if we are currently processing data. Prevents re-entry while awaiting async handlers.
  private onDataReceivedTriggered = false;
  // Timer for connection timeout.
  private connectionTimer: ReturnType<typeof setTimeout> | null = null;
  // Abort handler for AbortSignal support.
  private onAbort: (() => void) | null = null;

  // Internal Socket data handlers
  private onDataReceived = (data: Buffer) => this.onDataReceivedHandler(data);
  private onClose = () => this.onCloseHandler();
  private onError = (err: Error) => this.onErrorHandler(err);
  private onConnect = () => this.onConnectHandler();

  constructor(options: SocksClientOptions) {
    super();
    // Normalize camelCase options to snake_case for internal use
    this.options = normalizeClientOptions(options);

    // Validate SocksClientOptions
    validateSocksClientOptions(this.options);

    // Default state
    this.setState(SocksClientState.Created);
  }

  /**
   * Creates a new SOCKS connection.
   *
   * Note: Only supports the connect command.
   * @param options { SocksClientOptions } Options.
   * @returns { Promise }
   */
  static createConnection(
    options: SocksClientOptions,
  ): Promise<SocksClientEstablishedEvent> {
    return new Promise<SocksClientEstablishedEvent>((resolve, reject) => {
      const client = new SocksClient(options);
      client.connect(options.existingSocket ?? options.existing_socket);

      const onEstablished = (info: SocksClientEstablishedEvent) => {
        client.removeListener('error', onError);
        resolve(info);
      };

      const onError = (err: SocksClientError) => {
        client.removeListener('established', onEstablished);
        reject(err);
      };

      client.once('established', onEstablished);
      client.once('error', onError);
    });
  }

  /**
   * Convenience method for creating a SOCKS CONNECT connection.
   * Equivalent to calling createConnection with command: 'connect'.
   *
   * @param proxy The proxy server to connect through.
   * @param destination The remote host to connect to.
   * @param options Additional connection options (timeout, signal, etc.).
   * @returns A promise that resolves with the established connection info.
   */
  static connect(
    proxy: SocksProxy,
    destination: SocksRemoteHost,
    options?: Omit<SocksClientOptions, 'command' | 'proxy' | 'destination'>,
  ): Promise<SocksClientEstablishedEvent> {
    return SocksClient.createConnection({
      ...options,
      command: 'connect',
      proxy,
      destination,
    });
  }

  /**
   * Convenience method for creating a SOCKS CONNECT connection from a proxy URL.
   * Combines parseProxyUrl() and connect() in a single call.
   *
   * @param proxyUrl The proxy URL string (e.g., 'socks5://user:pass@host:port').
   * @param destination The remote host to connect to.
   * @param options Additional connection options (timeout, signal, etc.).
   * @returns A promise that resolves with the established connection info.
   */
  static connectFromUrl(
    proxyUrl: string,
    destination: SocksRemoteHost,
    options?: Omit<SocksClientOptions, 'command' | 'proxy' | 'destination'>,
  ): Promise<SocksClientEstablishedEvent> {
    const proxy = SocksClient.parseProxyUrl(proxyUrl);
    return SocksClient.connect(proxy, destination, options);
  }

  /**
   * Parses a SOCKS proxy URL into a SocksProxy object.
   *
   * Supported formats:
   *   - socks4://host:port
   *   - socks5://host:port
   *   - socks4://user@host:port
   *   - socks5://user:password@host:port
   *   - socks://host:port (defaults to SOCKS5)
   *   - socks5h://host:port (same as socks5, for compatibility)
   *   - socks4a://host:port (same as socks4)
   *
   * @param url The proxy URL string.
   * @returns A SocksProxy object.
   */
  static parseProxyUrl(url: string): SocksProxy {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch (err) {
      throw new SocksClientError(
        `Invalid proxy URL: ${url}`,
        {
          code: SocksErrorCode.InvalidSocksClientOptionsProxy,
          cause: err instanceof Error ? err : undefined,
        },
      );
    }
    const protocol = parsed.protocol.replace(':', '');

    let type: SocksProxyType;
    switch (protocol) {
      case 'socks4':
      case 'socks4a':
        type = 4;
        break;
      case 'socks':
      case 'socks5':
      case 'socks5h':
        type = 5;
        break;
      default:
        throw new SocksClientError(
          `Unsupported SOCKS protocol: "${protocol}". Use socks4, socks4a, socks5, socks5h, or socks.`,
          {code: SocksErrorCode.InvalidSocksClientOptionsProxy},
        );
    }

    const port = parsed.port ? parseInt(parsed.port, 10) : 1080;

    if (!Number.isFinite(port) || port < 1 || port > 65535) {
      throw new SocksClientError(
        `Invalid port in proxy URL: "${parsed.port}"`,
        {code: SocksErrorCode.InvalidSocksClientOptionsProxy},
      );
    }

    const proxy: SocksProxy = {
      host: parsed.hostname,
      port,
      type,
    };

    if (parsed.username) {
      proxy.userId = decodeURIComponent(parsed.username);
    }
    if (parsed.password) {
      proxy.password = decodeURIComponent(parsed.password);
    }

    return proxy;
  }

  /**
   * Tests whether a SOCKS proxy is reachable by connecting to a destination through it
   * and immediately destroying the socket on success.
   *
   * @param proxy The proxy server to test.
   * @param destination The remote host to connect to through the proxy.
   * @param options Additional connection options (timeout, signal, etc.).
   */
  static async testConnection(
    proxy: SocksProxy,
    destination: SocksRemoteHost,
    options?: Omit<SocksClientOptions, 'command' | 'proxy' | 'destination'>,
  ): Promise<void> {
    const info = await SocksClient.connect(proxy, destination, options);
    info.socket.destroy();
  }

  /**
   * Reads a SOCKS proxy URL from environment variables.
   *
   * Checks (in order): SOCKS_PROXY, socks_proxy, ALL_PROXY, all_proxy.
   * Returns null if no proxy is configured in the environment.
   *
   * @returns A SocksProxy object, or null if no proxy environment variable is set.
   */
  static proxyFromEnvironment(): SocksProxy | null {
    const url =
      process.env.SOCKS_PROXY ||
      process.env.socks_proxy ||
      process.env.ALL_PROXY ||
      process.env.all_proxy;
    if (!url) return null;
    return SocksClient.parseProxyUrl(url);
  }

  /**
   * Creates a new SOCKS connection chain to a destination host through 2 or more SOCKS proxies.
   *
   * Note: Only supports the connect command.
   * Note: Implemented via createConnection() factory function.
   * @param options { SocksClientChainOptions } Options
   * @returns { Promise }
   */
  static createConnectionChain(
    options: SocksClientChainOptions,
  ): Promise<SocksClientEstablishedEvent> {
    return SocksClient._createConnectionChain(options);
  }

  private static async _createConnectionChain(
    options: SocksClientChainOptions,
  ): Promise<SocksClientEstablishedEvent> {
    validateSocksClientChainOptions(options);

    // Defensive copy and normalize camelCase proxy options
    const proxies = options.proxies.map((p) => normalizeProxy({...p}) as SocksProxy);

    // Shuffle proxies
    if (options.randomizeChain) {
      shuffleArray(proxies);
    }

    let sock: net.Socket | undefined;
    let lastResult: SocksClientEstablishedEvent | undefined;

    try {
      for (let i = 0; i < proxies.length; i++) {
        // Check for abort between hops
        if (options.signal?.aborted) {
          throw new SocksClientError(ERRORS.ConnectionAborted, {
            code: SocksErrorCode.ConnectionAborted,
            options,
            cause: options.signal.reason as Error | undefined,
          });
        }

        const nextProxy = proxies[i];

        // If we've reached the last proxy in the chain, the destination is the actual destination, otherwise it's the next proxy.
        const nextDestination =
          i === proxies.length - 1
            ? options.destination
            : {
                host: resolveProxyHost(proxies[i + 1]),
                port: proxies[i + 1].port,
              };

        // Creates the next connection in the chain.
        try {
          lastResult = await SocksClient.createConnection({
            command: 'connect',
            proxy: nextProxy,
            destination: nextDestination,
            existingSocket: sock,
            timeout: options.timeout,
            signal: options.signal,
          });
        } catch (err) {
          // Enrich the error with chain hop information for debugging
          if (err instanceof SocksClientError && !err.detail?.hopIndex) {
            (err as {detail?: Record<string, unknown>}).detail = {
              ...err.detail,
              hopIndex: i,
              hopProxy: resolveProxyHost(nextProxy) + ':' + nextProxy.port,
              hopTotal: proxies.length,
            };
          }
          throw err;
        }

        // The underlying TCP socket is always the one from the first hop;
        // subsequent hops reuse it via existingSocket.
        sock = sock || lastResult.socket;
      }
    } catch (err) {
      // Clean up the socket from the previous successful hop on failure.
      if (sock) {
        sock.destroy();
      }
      throw err;
    }

    return {
      socket: sock!,
      remoteHost: lastResult?.remoteHost,
      [Symbol.dispose]: () => sock!.destroy(),
      [Symbol.asyncDispose]: () =>
        new Promise<void>((resolve) => sock!.end(() => resolve())),
    };
  }

  /**
   * Creates a SOCKS UDP Frame.
   * @param options
   */
  static createUDPFrame(options: SocksUDPFrameDetails): Buffer {
    const parts: Buffer[] = [];

    // RSV (2 bytes) + FRAG (1 byte)
    parts.push(Buffer.from([0x00, 0x00, options.frameNumber ?? 0]));

    // Address
    if (net.isIPv4(options.remoteHost.host)) {
      const addrBuf = Buffer.alloc(5);
      addrBuf[0] = Socks5HostType.IPv4;
      addrBuf.writeUInt32BE(ipv4ToInt32(options.remoteHost.host), 1);
      parts.push(addrBuf);
    } else if (net.isIPv6(options.remoteHost.host)) {
      parts.push(Buffer.from([Socks5HostType.IPv6]));
      parts.push(ipToBuffer(options.remoteHost.host));
    } else {
      const hostLength = Buffer.byteLength(options.remoteHost.host);
      if (hostLength > 255) {
        throw new SocksClientError(
          'Hostname is too long for a UDP frame (max 255 bytes).',
          {code: SocksErrorCode.InvalidUDPFrameHostnameTooLong},
        );
      }
      parts.push(Buffer.from([Socks5HostType.Hostname, hostLength]));
      parts.push(Buffer.from(options.remoteHost.host));
    }

    // Port (2 bytes, big-endian)
    const portBuf = Buffer.alloc(2);
    portBuf.writeUInt16BE(options.remoteHost.port);
    parts.push(portBuf);

    // Data
    parts.push(options.data);

    return Buffer.concat(parts);
  }

  /**
   * Parses a SOCKS UDP frame.
   *
   * Note: This implementation does not support UDP fragmentation.
   * Per RFC 1928, implementations that do not support fragmentation
   * MUST drop any datagram whose FRAG field is other than 0x00.
   * Callers should check `frameNumber` and discard non-zero values.
   *
   * @param data The raw UDP frame buffer to parse.
   * @throws {Error} If the buffer is too short to contain a valid UDP frame header.
   */
  static parseUDPFrame(data: Buffer): SocksUDPFrameDetails {
    // Minimum valid frame is IPv4: 2 RSV + 1 FRAG + 1 ATYP + 4 IPv4 + 2 PORT = 10
    if (data.length < 10) {
      throw new SocksClientError(
        'UDP frame is too short to contain a valid header (minimum 10 bytes).',
        {code: SocksErrorCode.InvalidUDPFrameTooShort},
      );
    }

    let offset = 2; // Skip RSV
    const frameNumber = data[offset++];
    const hostType = data[offset++];
    let remoteHost: string;

    if (hostType === Socks5HostType.IPv4) {
      // Already validated by minimum size check above (10 bytes)
      remoteHost = int32ToIpv4(data.readUInt32BE(offset));
      offset += 4;
    } else if (hostType === Socks5HostType.IPv6) {
      // 4 header + 16 IPv6 + 2 port = 22 bytes minimum
      if (data.length < 22) {
        throw new SocksClientError(
          'UDP frame is too short for an IPv6 address (minimum 22 bytes).',
          {code: SocksErrorCode.InvalidUDPFrameTooShort},
        );
      }
      remoteHost = Address6.fromByteArray(
        Array.from(data.subarray(offset, offset + 16)),
      ).canonicalForm();
      offset += 16;
    } else if (hostType === Socks5HostType.Hostname) {
      // 4 header + 1 length byte + hostname + 2 port
      if (data.length < 8) {
        throw new SocksClientError(
          'UDP frame is too short for a hostname address.',
          {code: SocksErrorCode.InvalidUDPFrameTooShort},
        );
      }
      const hostnameLength = data[offset++];
      if (data.length < 7 + hostnameLength) {
        throw new SocksClientError(
          `UDP frame is too short for the specified hostname length (need ${7 + hostnameLength} bytes, got ${data.length}).`,
          {code: SocksErrorCode.InvalidUDPFrameTooShort},
        );
      }
      remoteHost = data.toString('utf8', offset, offset + hostnameLength);
      offset += hostnameLength;
    } else {
      throw new SocksClientError(
        `Unsupported address type in UDP frame: 0x${hostType.toString(16).padStart(2, '0')}`,
        {code: SocksErrorCode.InvalidUDPFrameAddressType},
      );
    }

    const remotePort = data.readUInt16BE(offset);
    offset += 2;

    return {
      frameNumber,
      remoteHost: {
        host: remoteHost,
        port: remotePort,
      },
      data: Buffer.from(data.subarray(offset)),
    };
  }

  /**
   * Internal state setter. If the SocksClient is in an error state, it cannot be changed to a non error state.
   */
  private setState(newState: SocksClientState) {
    if (this.state !== SocksClientState.Error) {
      this.state = newState;
    }
  }

  /**
   * Starts the connection establishment to the proxy and destination.
   * @param existingSocket Connected socket to use instead of creating a new one (internal use).
   */
  public connect(existingSocket?: Duplex) {
    if (this.state !== SocksClientState.Created) {
      throw new SocksClientError(ERRORS.InternalError, {
        code: SocksErrorCode.InternalError,
        options: this.options,
      });
    }

    // Check if already aborted
    if (this.options.signal?.aborted) {
      queueMicrotask(() => {
        this.closeSocket({
          message: ERRORS.ConnectionAborted,
          code: SocksErrorCode.ConnectionAborted,
          cause: this.options.signal!.reason as Error | undefined,
        });
      });
      return;
    }

    // Start timeout timer (defaults to 30 seconds)
    this.connectionTimer = setTimeout(
      () => this.onEstablishedTimeout(),
      this.options.timeout || DEFAULT_TIMEOUT,
    );
    this.connectionTimer.unref();

    // Listen for abort signal
    if (this.options.signal) {
      this.onAbort = () => {
        this.closeSocket({
          message: ERRORS.ConnectionAborted,
          code: SocksErrorCode.ConnectionAborted,
          cause: this.options.signal!.reason as Error | undefined,
        });
      };
      this.options.signal.addEventListener('abort', this.onAbort, {once: true});
    }

    // If an existing socket is provided, use it to negotiate SOCKS handshake. Otherwise create a new Socket.
    if (existingSocket) {
      this.socket = existingSocket;
    } else {
      this.socket = new net.Socket();
    }

    // Attach Socket error handlers.
    this.socket.once('close', this.onClose);
    this.socket.once('end', this.onClose);
    this.socket.once('error', this.onError);
    this.socket.once('connect', this.onConnect);
    this.socket.on('data', this.onDataReceived);

    this.setState(SocksClientState.Connecting);
    this.receiveBuffer = new ReceiveBuffer();

    if (existingSocket) {
      this.onConnectHandler();
    } else {
      (this.socket as net.Socket).connect(this.getSocketOptions());

      // Enable TCP_NODELAY by default for lower-latency handshakes.
      const noDelay = this.options.setTcpNoDelay;
      (this.socket as net.Socket).setNoDelay(noDelay !== false);
    }

    // Listen for established event so we can push any excess data received during handshakes
    // back into the socket's readable stream (works with data events, pipe(), and async iteration).
    this.prependOnceListener('established', (info) => {
      setImmediate(() => {
        if (this.receiveBuffer.length > 0) {
          const excessData = this.receiveBuffer.get(this.receiveBuffer.length);
          info.socket.unshift(excessData);
        }
        info.socket.resume();
      });
    });
  }

  // Socket options (defaults host/port to options.proxy.host/options.proxy.port)
  private getSocketOptions(): net.SocketConnectOpts {
    return {
      ...this.options.socketOptions,
      host: resolveProxyHost(this.options.proxy),
      port: this.options.proxy.port,
    };
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
      this.closeSocket({
        message: ERRORS.ProxyConnectionTimedOut,
        code: SocksErrorCode.ProxyConnectionTimedOut,
      });
    }
  }

  /**
   * Handles Socket connect event.
   */
  private onConnectHandler() {
    this.setState(SocksClientState.Connected);

    // Send initial handshake (each method sets SentInitialHandshake state).
    if (this.options.proxy.type === 4) {
      this.sendSocks4InitialHandshake();
    } else {
      this.sendSocks5InitialHandshake();
    }
  }

  /**
   * Handles Socket data event.
   * @param data
   */
  private onDataReceivedHandler(data: Buffer) {
    /*
      All received data is appended to a ReceiveBuffer.
      This makes sure that all the data we need is received before we attempt to process it.
    */
    this.receiveBuffer.append(data);

    // Process data that we have.
    this.processData().catch((err) => {
      if (this.state !== SocksClientState.Error) {
        this.closeSocket({
          message: (err as Error).message || ERRORS.InternalError,
          code: SocksErrorCode.InternalError,
          cause: err instanceof Error ? err : undefined,
        });
      }
    });
  }

  /**
   * Handles processing of the data we have received.
   */
  private async processData() {
    // Guard against re-entry while awaiting async handlers (e.g. custom auth).
    if (this.onDataReceivedTriggered) {
      return;
    }
    this.onDataReceivedTriggered = true;

    try {
      // If we have enough data to process the next step in the SOCKS handshake, proceed.
      while (
        this.state !== SocksClientState.Established &&
        this.state !== SocksClientState.Error &&
        this.receiveBuffer.length >= this.nextRequiredPacketBufferSize
      ) {
        // Sent initial handshake, waiting for response.
        if (this.state === SocksClientState.SentInitialHandshake) {
          if (this.options.proxy.type === 4) {
            // Socks v4 only has one handshake response.
            this.handleSocks4FinalHandshakeResponse();
          } else {
            // Socks v5 has two handshakes, handle initial one here.
            await this.handleInitialSocks5HandshakeResponse();
          }
          // Sent auth request for Socks v5, waiting for response.
        } else if (this.state === SocksClientState.SentAuthentication) {
          await this.handleInitialSocks5AuthenticationHandshakeResponse();
          // Sent final Socks v5 handshake, waiting for final response.
        } else if (this.state === SocksClientState.SentFinalHandshake) {
          this.handleSocks5FinalHandshakeResponse();
          // Socks BIND established. Waiting for remote connection via proxy.
        } else if (
          this.state === SocksClientState.BoundWaitingForConnection
        ) {
          if (this.options.proxy.type === 4) {
            this.handleSocks4IncomingConnectionResponse();
          } else {
            this.handleSocks5IncomingConnectionResponse();
          }
        } else {
          this.closeSocket({
            message: ERRORS.InternalError,
            code: SocksErrorCode.InternalError,
          });
          break;
        }
      }
    } catch (err) {
      this.closeSocket({
        message: (err as Error).message,
        code: SocksErrorCode.InternalError,
        cause: err instanceof Error ? err : undefined,
      });
    } finally {
      this.onDataReceivedTriggered = false;
    }
  }

  /**
   * Handles Socket close event.
   * @param had_error
   */
  private onCloseHandler() {
    this.closeSocket({
      message: ERRORS.SocketClosed,
      code: SocksErrorCode.SocketClosed,
    });
  }

  /**
   * Handles Socket error event.
   * @param err
   */
  private onErrorHandler(err: Error) {
    this.closeSocket({
      message: err.message,
      code: SocksErrorCode.SocketError,
      cause: err,
    });
  }

  /**
   * Removes internal event listeners on the underlying Socket.
   */
  private removeInternalSocketHandlers() {
    // Clear the connection timer.
    if (this.connectionTimer !== null) {
      clearTimeout(this.connectionTimer);
      this.connectionTimer = null;
    }

    // Remove abort listener
    if (this.onAbort && this.options.signal) {
      this.options.signal.removeEventListener('abort', this.onAbort);
      this.onAbort = null;
    }

    // Pauses data flow of the socket (this is internally resumed after 'established' is emitted)
    this.socket.pause();
    this.socket.removeListener('data', this.onDataReceived);
    this.socket.removeListener('close', this.onClose);
    this.socket.removeListener('end', this.onClose);
    this.socket.removeListener('error', this.onError);
    this.socket.removeListener('connect', this.onConnect);
  }

  /**
   * Closes and destroys the underlying Socket. Emits an error event.
   * @param info Structured error information.
   */
  private closeSocket(info: {
    message: string;
    code: SocksErrorCode;
    detail?: Record<string, unknown>;
    cause?: Error;
  }) {
    // Make sure only one 'error' event is fired for the lifetime of this SocksClient instance.
    if (this.state !== SocksClientState.Error) {
      // Set internal state to Error.
      this.setState(SocksClientState.Error);

      // Clear the connection timer.
      if (this.connectionTimer !== null) {
        clearTimeout(this.connectionTimer);
        this.connectionTimer = null;
      }

      // Remove internal listeners before destroying to prevent re-entrant calls
      // (socket may not exist if aborted before connect created it)
      if (this.socket) {
        this.removeInternalSocketHandlers();

        // Destroy Socket
        this.socket.destroy();
      }

      // Fire 'error' event.
      const errorOptions = {
        code: info.code,
        options: this.options,
        detail: info.detail,
        cause: info.cause,
      };

      let error: SocksClientError;
      if (info.code === SocksErrorCode.ProxyConnectionTimedOut) {
        error = new SocksTimeoutError(info.message, errorOptions);
      } else if (info.code === SocksErrorCode.Socks5AuthenticationFailed) {
        error = new SocksAuthenticationError(info.message, errorOptions);
      } else {
        error = new SocksClientError(info.message, errorOptions);
      }

      this.emit('error', error);
    }
  }

  /**
   * Sends initial Socks v4 handshake request.
   */
  private sendSocks4InitialHandshake() {
    const userId = this.options.proxy.userId || '';
    const parts: Buffer[] = [];

    // VN (0x04) + CD (command)
    parts.push(Buffer.from([0x04, SocksCommand[this.options.command]]));

    // DSTPORT (2 bytes, big-endian)
    const portBuf = Buffer.alloc(2);
    portBuf.writeUInt16BE(this.options.destination.port);
    parts.push(portBuf);

    // Socks 4 (IPv4)
    if (net.isIPv4(this.options.destination.host)) {
      parts.push(ipToBuffer(this.options.destination.host));
      parts.push(Buffer.from(userId + '\0'));
      // Socks 4a (hostname)
    } else {
      parts.push(Buffer.from([0x00, 0x00, 0x00, 0x01]));
      parts.push(Buffer.from(userId + '\0'));
      parts.push(Buffer.from(this.options.destination.host + '\0'));
    }

    this.nextRequiredPacketBufferSize =
      SOCKS_INCOMING_PACKET_SIZES.Socks4Response;
    this.socket.write(Buffer.concat(parts));
    this.setState(SocksClientState.SentInitialHandshake);
  }

  /**
   * Handles Socks v4 handshake response.
   * @param data
   */
  private handleSocks4FinalHandshakeResponse() {
    const data = this.receiveBuffer.get(8);

    if (data[0] !== 0x00) {
      this.closeSocket({
        message: ERRORS.InvalidSocks4HandshakeResponse,
        code: SocksErrorCode.InvalidSocks4HandshakeResponse,
        detail: {responseByte: data[0]},
      });
    } else if (data[1] !== Socks4Response.Granted) {
      this.closeSocket({
        message: `${ERRORS.Socks4ProxyRejectedConnection} - (${Socks4ResponseName[data[1]] || `0x${data[1].toString(16).padStart(2, '0')}`})`,
        code: SocksErrorCode.Socks4ProxyRejectedConnection,
        detail: {
          responseCode: data[1],
          responseName: Socks4ResponseName[data[1]] || 'Unknown',
        },
      });
    } else {
      // Bind response
      if (this.options.command === 'bind') {
        const remoteHost: SocksRemoteHost = {
          port: data.readUInt16BE(2),
          host: int32ToIpv4(data.readUInt32BE(4)),
        };

        // If host is 0.0.0.0 (INADDR_ANY), use the proxy host.
        if (remoteHost.host === '0.0.0.0') {
          remoteHost.host = resolveProxyHost(this.options.proxy);
        }
        this.setState(SocksClientState.BoundWaitingForConnection);
        const boundSock = this.socket as net.Socket;
        this.emit('bound', {
          remoteHost,
          socket: boundSock,
          [Symbol.dispose]: () => boundSock.destroy(),
          [Symbol.asyncDispose]: () =>
            new Promise<void>((resolve) => boundSock.end(() => resolve())),
        });

        // Connect response
      } else {
        this.setState(SocksClientState.Established);
        this.removeInternalSocketHandlers();
        const sock = this.socket as net.Socket;
        this.emit('established', {
          socket: sock,
          [Symbol.dispose]: () => sock.destroy(),
          [Symbol.asyncDispose]: () =>
            new Promise<void>((resolve) => sock.end(() => resolve())),
        });
      }
    }
  }

  /**
   * Handles Socks v4 incoming connection request (BIND)
   * @param data
   */
  private handleSocks4IncomingConnectionResponse() {
    const data = this.receiveBuffer.get(8);

    if (data[0] !== 0x00) {
      this.closeSocket({
        message: ERRORS.InvalidSocks4IncomingConnectionResponse,
        code: SocksErrorCode.InvalidSocks4IncomingConnectionResponse,
        detail: {responseByte: data[0]},
      });
    } else if (data[1] !== Socks4Response.Granted) {
      this.closeSocket({
        message: `${ERRORS.Socks4ProxyRejectedIncomingBoundConnection} - (${Socks4ResponseName[data[1]] || `0x${data[1].toString(16).padStart(2, '0')}`})`,
        code: SocksErrorCode.Socks4ProxyRejectedIncomingBoundConnection,
        detail: {
          responseCode: data[1],
          responseName: Socks4ResponseName[data[1]] || 'Unknown',
        },
      });
    } else {
      const remoteHost: SocksRemoteHost = {
        port: data.readUInt16BE(2),
        host: int32ToIpv4(data.readUInt32BE(4)),
      };

      // If host is 0.0.0.0 (INADDR_ANY), use the proxy host.
      if (remoteHost.host === '0.0.0.0') {
        remoteHost.host = resolveProxyHost(this.options.proxy);
      }

      this.setState(SocksClientState.Established);
      this.removeInternalSocketHandlers();
      const sock = this.socket as net.Socket;
      this.emit('established', {
        remoteHost,
        socket: sock,
        [Symbol.dispose]: () => sock.destroy(),
        [Symbol.asyncDispose]: () =>
          new Promise<void>((resolve) => sock.end(() => resolve())),
      });
    }
  }

  /**
   * Sends initial Socks v5 handshake request.
   */
  private sendSocks5InitialHandshake() {
    // By default we always support no auth.
    const supportedAuthMethods: number[] = [Socks5Auth.NoAuth];

    // We should only tell the proxy we support user/pass auth if auth info is actually provided.
    // Note: As of Tor v0.3.5.7+, if user/pass auth is an option from the client, by default it will always take priority.
    if (this.options.proxy.userId !== undefined || this.options.proxy.password !== undefined) {
      supportedAuthMethods.push(Socks5Auth.UserPass);
    }

    // Custom auth method?
    if (this.options.proxy.customAuthMethod !== undefined) {
      supportedAuthMethods.push(this.options.proxy.customAuthMethod);
    }

    // VER (0x05) + NMETHODS + METHODS
    const buff = Buffer.alloc(2 + supportedAuthMethods.length);
    buff[0] = 0x05;
    buff[1] = supportedAuthMethods.length;
    for (let i = 0; i < supportedAuthMethods.length; i++) {
      buff[2 + i] = supportedAuthMethods[i];
    }

    this.nextRequiredPacketBufferSize =
      SOCKS_INCOMING_PACKET_SIZES.Socks5InitialHandshakeResponse;
    this.socket.write(buff);
    this.setState(SocksClientState.SentInitialHandshake);
  }

  /**
   * Handles initial Socks v5 handshake response.
   * @param data
   */
  private async handleInitialSocks5HandshakeResponse() {
    const data = this.receiveBuffer.get(2);

    if (data[0] !== 0x05) {
      this.closeSocket({
        message: ERRORS.InvalidSocks5InitialHandshakeSocksVersion,
        code: SocksErrorCode.InvalidSocks5InitialHandshakeSocksVersion,
        detail: {socksVersion: data[0]},
      });
    } else if (data[1] === SOCKS5_NO_ACCEPTABLE_AUTH) {
      this.closeSocket({
        message: ERRORS.InvalidSocks5InitialHandshakeNoAcceptedAuthType,
        code: SocksErrorCode.InvalidSocks5InitialHandshakeNoAcceptedAuthType,
      });
    } else {
      // If selected Socks v5 auth method is no auth, send final handshake request.
      if (data[1] === Socks5Auth.NoAuth) {
        this.socks5ChosenAuthType = Socks5Auth.NoAuth;
        this.sendSocks5CommandRequest();
        // If selected Socks v5 auth method is user/password, send auth handshake.
      } else if (data[1] === Socks5Auth.UserPass) {
        this.socks5ChosenAuthType = Socks5Auth.UserPass;
        this.sendSocks5UserPassAuthentication();
        // If selected Socks v5 auth method is the custom_auth_method, send custom handshake.
      } else if (data[1] === this.options.proxy.customAuthMethod) {
        this.socks5ChosenAuthType = this.options.proxy.customAuthMethod;
        await this.sendSocks5CustomAuthentication();
      } else {
        this.closeSocket({
          message: ERRORS.InvalidSocks5InitialHandshakeUnknownAuthType,
          code: SocksErrorCode.InvalidSocks5InitialHandshakeUnknownAuthType,
          detail: {authType: data[1]},
        });
      }
    }
  }

  /**
   * Sends Socks v5 user & password auth handshake.
   *
   * Note: No auth and user/pass are currently supported.
   */
  private sendSocks5UserPassAuthentication() {
    const userId = this.options.proxy.userId || '';
    const password = this.options.proxy.password || '';

    const userIdBuf = Buffer.from(userId);
    const passwordBuf = Buffer.from(password);

    // VER (0x01) + ULEN + UNAME + PLEN + PASSWD
    const buff = Buffer.alloc(3 + userIdBuf.length + passwordBuf.length);
    buff[0] = 0x01;
    buff[1] = userIdBuf.length;
    userIdBuf.copy(buff, 2);
    buff[2 + userIdBuf.length] = passwordBuf.length;
    passwordBuf.copy(buff, 3 + userIdBuf.length);

    this.nextRequiredPacketBufferSize =
      SOCKS_INCOMING_PACKET_SIZES.Socks5UserPassAuthenticationResponse;
    this.socket.write(buff);
    this.setState(SocksClientState.SentAuthentication);
  }

  private async sendSocks5CustomAuthentication() {
    this.nextRequiredPacketBufferSize =
      this.options.proxy.customAuthResponseSize!;
    const data = await this.options.proxy.customAuthRequestHandler!();
    // Check if socket was destroyed during await (e.g., by an abort signal)
    if (this.state === SocksClientState.Error) return;
    this.socket.write(data);
    this.setState(SocksClientState.SentAuthentication);
  }

  private async handleSocks5CustomAuthHandshakeResponse(data: Buffer) {
    return await this.options.proxy.customAuthResponseHandler!(data);
  }

  private handleSocks5AuthenticationUserPassHandshakeResponse(
    data: Buffer,
  ): boolean {
    return data[0] === 0x01 && data[1] === 0x00;
  }

  /**
   * Handles Socks v5 auth handshake response.
   * @param data
   */
  private async handleInitialSocks5AuthenticationHandshakeResponse() {
    this.setState(SocksClientState.ReceivedAuthenticationResponse);

    let authResult = false;

    if (this.socks5ChosenAuthType === Socks5Auth.UserPass) {
      authResult =
        this.handleSocks5AuthenticationUserPassHandshakeResponse(
          this.receiveBuffer.get(2),
        );
    } else if (
      this.socks5ChosenAuthType === this.options.proxy.customAuthMethod
    ) {
      authResult = await this.handleSocks5CustomAuthHandshakeResponse(
        this.receiveBuffer.get(this.options.proxy.customAuthResponseSize),
      );
      // Check if socket was destroyed during await (e.g., by timeout or abort signal)
      if (this.state === SocksClientState.Error) return;
    }

    if (!authResult) {
      this.closeSocket({
        message: ERRORS.Socks5AuthenticationFailed,
        code: SocksErrorCode.Socks5AuthenticationFailed,
      });
    } else {
      this.sendSocks5CommandRequest();
    }
  }

  /**
   * Sends Socks v5 final handshake request.
   */
  private sendSocks5CommandRequest() {
    const parts: Buffer[] = [];

    // VER + CMD + RSV
    parts.push(Buffer.from([0x05, SocksCommand[this.options.command], 0x00]));

    // ipv4, ipv6, domain?
    if (net.isIPv4(this.options.destination.host)) {
      parts.push(Buffer.from([Socks5HostType.IPv4]));
      parts.push(ipToBuffer(this.options.destination.host));
    } else if (net.isIPv6(this.options.destination.host)) {
      parts.push(Buffer.from([Socks5HostType.IPv6]));
      parts.push(ipToBuffer(this.options.destination.host));
    } else {
      const hostBuf = Buffer.from(this.options.destination.host);
      parts.push(Buffer.from([Socks5HostType.Hostname, hostBuf.length]));
      parts.push(hostBuf);
    }

    // Port (2 bytes, big-endian)
    const portBuf = Buffer.alloc(2);
    portBuf.writeUInt16BE(this.options.destination.port);
    parts.push(portBuf);

    this.nextRequiredPacketBufferSize =
      SOCKS_INCOMING_PACKET_SIZES.Socks5ResponseHeader;
    this.socket.write(Buffer.concat(parts));
    this.setState(SocksClientState.SentFinalHandshake);
  }

  /**
   * Parses a SOCKS5 response address from the receive buffer.
   * Shared by final handshake and incoming connection response handlers.
   * @returns The parsed remote host, or null if more data is needed.
   */
  private parseSocks5ResponseAddress(
    header: Buffer,
    errorInfo: {message: string; code: SocksErrorCode},
  ): SocksRemoteHost | null {
    const addressType = header[3] as Socks5HostType;

    // IPv4
    if (addressType === Socks5HostType.IPv4) {
      const dataNeeded = SOCKS_INCOMING_PACKET_SIZES.Socks5ResponseIPv4;
      if (this.receiveBuffer.length < dataNeeded) {
        this.nextRequiredPacketBufferSize = dataNeeded;
        return null;
      }

      const data = this.receiveBuffer.get(dataNeeded);
      const remoteHost: SocksRemoteHost = {
        host: int32ToIpv4(data.readUInt32BE(4)),
        port: data.readUInt16BE(8),
      };

      // If given host is 0.0.0.0, assume remote proxy ip instead.
      if (remoteHost.host === '0.0.0.0') {
        remoteHost.host = resolveProxyHost(this.options.proxy);
      }

      return remoteHost;

      // Hostname
    } else if (addressType === Socks5HostType.Hostname) {
      const hostLength = header[4];
      const dataNeeded =
        SOCKS_INCOMING_PACKET_SIZES.Socks5ResponseHostname(hostLength);

      if (this.receiveBuffer.length < dataNeeded) {
        this.nextRequiredPacketBufferSize = dataNeeded;
        return null;
      }

      const data = this.receiveBuffer.get(dataNeeded);
      return {
        host: data.toString('utf8', 5, 5 + hostLength),
        port: data.readUInt16BE(5 + hostLength),
      };

      // IPv6
    } else if (addressType === Socks5HostType.IPv6) {
      const dataNeeded = SOCKS_INCOMING_PACKET_SIZES.Socks5ResponseIPv6;
      if (this.receiveBuffer.length < dataNeeded) {
        this.nextRequiredPacketBufferSize = dataNeeded;
        return null;
      }

      const data = this.receiveBuffer.get(dataNeeded);
      const remoteHost: SocksRemoteHost = {
        host: Address6.fromByteArray(
          Array.from(data.subarray(4, 20)),
        ).canonicalForm(),
        port: data.readUInt16BE(20),
      };

      // If given host is all zeros (::), assume remote proxy ip instead.
      if (remoteHost.host === '0000:0000:0000:0000:0000:0000:0000:0000') {
        remoteHost.host = resolveProxyHost(this.options.proxy);
      }

      return remoteHost;
    } else {
      this.closeSocket({
        message: errorInfo.message,
        code: errorInfo.code,
      });
      return null;
    }
  }

  /**
   * Handles Socks v5 final handshake response.
   */
  private handleSocks5FinalHandshakeResponse() {
    // Peek at available data (we need at least 5 bytes to get the hostname length)
    const header = this.receiveBuffer.peek(5);

    if (header[0] !== 0x05) {
      this.closeSocket({
        message: ERRORS.InvalidSocks5FinalHandshake,
        code: SocksErrorCode.InvalidSocks5FinalHandshake,
        detail: {socksVersion: header[0]},
      });
    } else if ((header[1] as Socks5Response) !== Socks5Response.Granted) {
      this.closeSocket({
        message: `${ERRORS.InvalidSocks5FinalHandshakeRejected} - ${Socks5ResponseName[header[1]] || `0x${header[1].toString(16).padStart(2, '0')}`}`,
        code: SocksErrorCode.InvalidSocks5FinalHandshakeRejected,
        detail: {
          socks5Response: header[1],
          socks5ResponseName: Socks5ResponseName[header[1]] || 'Unknown',
        },
      });
    } else {
      const remoteHost = this.parseSocks5ResponseAddress(header, {
        message: ERRORS.InvalidSocks5FinalHandshake,
        code: SocksErrorCode.InvalidSocks5FinalHandshake,
      });

      // null means either more data needed or an error occurred.
      if (remoteHost === null) {
        return;
      }

      const sock = this.socket as net.Socket;

      // If using CONNECT, the client is now in the established state.
      if (this.options.command === 'connect') {
        this.setState(SocksClientState.Established);
        this.removeInternalSocketHandlers();
        this.emit('established', {
          remoteHost,
          socket: sock,
          [Symbol.dispose]: () => sock.destroy(),
          [Symbol.asyncDispose]: () =>
            new Promise<void>((resolve) => sock.end(() => resolve())),
        });
      } else if (this.options.command === 'bind') {
        /* If using BIND, the Socks client is now in BoundWaitingForConnection state.
           This means that the remote proxy server is waiting for a remote connection to the bound port. */
        this.setState(SocksClientState.BoundWaitingForConnection);
        this.nextRequiredPacketBufferSize =
          SOCKS_INCOMING_PACKET_SIZES.Socks5ResponseHeader;
        this.emit('bound', {
          remoteHost,
          socket: sock,
          [Symbol.dispose]: () => sock.destroy(),
          [Symbol.asyncDispose]: () =>
            new Promise<void>((resolve) => sock.end(() => resolve())),
        });
        /*
          If using Associate, the Socks client is now Established. And the proxy server is now accepting UDP packets at the
          given bound port. This initial Socks TCP connection must remain open for the UDP relay to continue to work.
        */
      } else if (this.options.command === 'associate') {
        this.setState(SocksClientState.Established);
        this.removeInternalSocketHandlers();
        this.emit('established', {
          remoteHost,
          socket: sock,
          [Symbol.dispose]: () => sock.destroy(),
          [Symbol.asyncDispose]: () =>
            new Promise<void>((resolve) => sock.end(() => resolve())),
        });
      }
    }
  }

  /**
   * Handles Socks v5 incoming connection request (BIND).
   */
  private handleSocks5IncomingConnectionResponse() {
    // Peek at available data (we need at least 5 bytes to get the hostname length)
    const header = this.receiveBuffer.peek(5);

    if (header[0] !== 0x05) {
      this.closeSocket({
        message: ERRORS.InvalidSocks5IncomingConnectionResponse,
        code: SocksErrorCode.InvalidSocks5IncomingConnectionResponse,
        detail: {socksVersion: header[0]},
      });
    } else if ((header[1] as Socks5Response) !== Socks5Response.Granted) {
      this.closeSocket({
        message: `${ERRORS.Socks5ProxyRejectedIncomingBoundConnection} - ${Socks5ResponseName[header[1]] || `0x${header[1].toString(16).padStart(2, '0')}`}`,
        code: SocksErrorCode.Socks5ProxyRejectedIncomingBoundConnection,
        detail: {
          socks5Response: header[1],
          socks5ResponseName: Socks5ResponseName[header[1]] || 'Unknown',
        },
      });
    } else {
      const remoteHost = this.parseSocks5ResponseAddress(header, {
        message: ERRORS.InvalidSocks5IncomingConnectionResponse,
        code: SocksErrorCode.InvalidSocks5IncomingConnectionResponse,
      });

      // null means either more data needed or an error occurred.
      if (remoteHost === null) {
        return;
      }

      this.setState(SocksClientState.Established);
      this.removeInternalSocketHandlers();
      const sock = this.socket as net.Socket;
      this.emit('established', {
        remoteHost,
        socket: sock,
        [Symbol.dispose]: () => sock.destroy(),
        [Symbol.asyncDispose]: () =>
          new Promise<void>((resolve) => sock.end(() => resolve())),
      });
    }
  }

  get socksClientOptions(): SocksClientOptions {
    return {
      ...this.options,
    };
  }
}

export {
  SocksClient,
  SocksClientError,
  SocksTimeoutError,
  SocksAuthenticationError,
  isSocksError,
  resolveProxyType,
  SocksErrorCode,
  SocksCommand,
  Socks4Response,
  Socks4ResponseName,
  Socks5Auth,
  Socks5HostType,
  Socks5Response,
  Socks5ResponseName,
};

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
};
