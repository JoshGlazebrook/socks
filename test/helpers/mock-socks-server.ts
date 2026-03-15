import * as net from 'node:net';
import {SmartBuffer} from 'smart-buffer';

interface MockServerBehavior {
  // SOCKS5 initial handshake: which auth method to select (default: 0x00 NoAuth)
  authMethodSelection?: number;
  // SOCKS5 auth response: success (0x00) or fail (0x01)
  authResponse?: 'success' | 'reject';
  // Command response: 'success' or a specific SOCKS4/5 response code
  commandResponse?: 'success' | number;
  // Delay before responding (ms)
  responseDelay?: number;
  // Close socket immediately on connect
  closeOnConnect?: boolean;
  // Send invalid SOCKS version in response
  invalidVersion?: boolean;
  // Forward data to the requested destination after success (for chain testing)
  forwardAfterSuccess?: boolean;
  // BIND: port to report as the bound port (default: 4444)
  bindPort?: number;
  // BIND: host to report as the bound host (default: '0.0.0.0')
  bindHost?: string;
  // Custom auth: response buffer to send back during custom auth handshake
  customAuthResponse?: Buffer;
  // Fragment responses: send response bytes one at a time with 5ms delays
  fragmentResponses?: boolean;
  // Response address type for SOCKS5 command responses (default: 'ipv4')
  responseAddressType?: 'ipv4' | 'ipv6' | 'hostname';
  // SOCKS4: override the first response byte (normally 0x00)
  socks4ResponseFirstByte?: number;
  // BIND: response code for the second (incoming connection) response
  bindIncomingResponse?: 'success' | number;
  // BIND: override the first byte of the incoming connection response (normally 0x00)
  bindIncomingFirstByte?: number;
  // Extra data to send after a successful handshake (for excess data re-emission tests)
  extraDataAfterHandshake?: Buffer;
}

class MockSocksServer {
  private server: net.Server;
  private type: 4 | 5;
  private behavior: MockServerBehavior = {};
  private connections: net.Socket[] = [];
  private closed = false;

  constructor(type: 4 | 5) {
    this.type = type;
    this.server = net.createServer((socket) => {
      this.connections.push(socket);
      this.handleConnection(socket);
    });
  }

  setBehavior(behavior: MockServerBehavior): void {
    this.behavior = behavior;
  }

  async listen(): Promise<{port: number; host: string}> {
    return new Promise((resolve) => {
      this.server.listen(0, '127.0.0.1', () => {
        const addr = this.server.address() as net.AddressInfo;
        resolve({port: addr.port, host: addr.address});
      });
    });
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    // Destroy all active connections first
    for (const conn of this.connections) {
      conn.destroy();
    }
    this.connections = [];
    return new Promise((resolve, reject) => {
      this.server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * Writes a buffer to the socket, optionally fragmenting it byte-by-byte.
   */
  private writeResponse(socket: net.Socket, data: Buffer): void {
    if (this.behavior.fragmentResponses) {
      let i = 0;
      const sendNext = () => {
        if (i < data.length && !socket.destroyed) {
          socket.write(Buffer.from([data[i]]));
          i++;
          setTimeout(sendNext, 5);
        }
      };
      sendNext();
    } else {
      socket.write(data);
    }
  }

  private handleConnection(socket: net.Socket) {
    if (this.behavior.closeOnConnect) {
      socket.destroy();
      return;
    }

    if (this.type === 4) {
      this.handleSocks4(socket);
    } else {
      this.handleSocks5(socket);
    }
  }

  private parseSocks4Destination(data: Buffer): {host: string; port: number} | null {
    try {
      const port = (data[2] << 8) | data[3];
      const ip = `${data[4]}.${data[5]}.${data[6]}.${data[7]}`;

      // SOCKS4a: if IP is 0.0.0.x (x != 0), hostname follows after userId
      if (data[4] === 0 && data[5] === 0 && data[6] === 0 && data[7] !== 0) {
        // Skip past userId (null-terminated)
        let offset = 8;
        while (offset < data.length && data[offset] !== 0x00) offset++;
        offset++; // skip null
        // Read hostname (null-terminated)
        const hostStart = offset;
        while (offset < data.length && data[offset] !== 0x00) offset++;
        const host = data.slice(hostStart, offset).toString();
        return {host, port};
      }

      return {host: ip, port};
    } catch {
      return null;
    }
  }

  private handleSocks4(socket: net.Socket) {
    socket.once('data', (data) => {
      const command = data[1]; // 0x01 = connect, 0x02 = bind

      const isSuccess =
        this.behavior.commandResponse === 'success' ||
        this.behavior.commandResponse === undefined;

      const respond = () => {
        const response = Buffer.alloc(8);
        response[0] = this.behavior.socks4ResponseFirstByte ?? 0x00; // Null byte

        if (isSuccess) {
          response[1] = 0x5a; // Granted
        } else if (typeof this.behavior.commandResponse === 'number') {
          response[1] = this.behavior.commandResponse;
        }

        // Port (echo back destination port from request)
        response[2] = data[2];
        response[3] = data[3];
        // IP (echo back destination IP or zeros)
        response[4] = 0x00;
        response[5] = 0x00;
        response[6] = 0x00;
        response[7] = 0x00;

        if (command === 0x02) {
          // BIND command
          // First response: bound address (where proxy is listening)
          const bindPort = this.behavior.bindPort ?? 4444;
          const bindHost = this.behavior.bindHost ?? '0.0.0.0';

          response[2] = (bindPort >> 8) & 0xff;
          response[3] = bindPort & 0xff;

          const hostParts = bindHost.split('.').map(Number);
          response[4] = hostParts[0] || 0;
          response[5] = hostParts[1] || 0;
          response[6] = hostParts[2] || 0;
          response[7] = hostParts[3] || 0;

          this.writeResponse(socket, response);

          // If the first response was a success, send a second response after a delay
          // to simulate an incoming connection
          if (response[1] === 0x5a) {
            setTimeout(() => {
              const incomingResponse = Buffer.alloc(8);
              incomingResponse[0] = this.behavior.bindIncomingFirstByte ?? 0x00; // Null byte

              const bindIncoming = this.behavior.bindIncomingResponse;
              if (typeof bindIncoming === 'number') {
                incomingResponse[1] = bindIncoming;
              } else {
                incomingResponse[1] = 0x5a; // Granted
              }

              // Incoming connection details
              const incomingPort = 5555;
              incomingResponse[2] = (incomingPort >> 8) & 0xff;
              incomingResponse[3] = incomingPort & 0xff;
              incomingResponse[4] = 10;
              incomingResponse[5] = 0;
              incomingResponse[6] = 0;
              incomingResponse[7] = 1;

              this.writeResponse(socket, incomingResponse);
            }, 50);
          }
        } else {
          // CONNECT command
          this.writeResponse(socket, response);

          // If success and forwarding is enabled, pipe data to the actual destination
          if (isSuccess && this.behavior.forwardAfterSuccess) {
            const dest = this.parseSocks4Destination(data);
            if (dest) {
              const upstream = net.createConnection(dest.port, dest.host, () => {
                socket.pipe(upstream);
                upstream.pipe(socket);
              });
              this.connections.push(upstream);
              upstream.on('error', () => socket.destroy());
              socket.on('error', () => upstream.destroy());
              socket.on('close', () => upstream.destroy());
              upstream.on('close', () => socket.destroy());
            }
          }
        }
      };

      if (this.behavior.responseDelay) {
        setTimeout(respond, this.behavior.responseDelay);
      } else {
        respond();
      }
    });
  }

  private handleSocks5(socket: net.Socket) {
    let state: 'initial' | 'auth' | 'command' = 'initial';

    const onData = (data: Buffer) => {
      if (state === 'initial') {
        this.handleSocks5Initial(
          socket,
          data,
          () => {
            state = 'auth';
          },
          () => {
            state = 'command';
          },
        );
      } else if (state === 'auth') {
        this.handleSocks5Auth(socket, data);
        state = 'command';
      } else if (state === 'command') {
        socket.removeListener('data', onData);
        this.handleSocks5Command(socket, data);
      }
    };

    socket.on('data', onData);
  }

  private handleSocks5Initial(
    socket: net.Socket,
    _data: Buffer,
    onNeedAuth: () => void,
    onNoAuth: () => void,
  ) {
    const respond = () => {
      const response = Buffer.alloc(2);

      if (this.behavior.invalidVersion) {
        response[0] = 0x04; // Wrong version
      } else {
        response[0] = 0x05; // SOCKS5
      }

      if (this.behavior.authMethodSelection !== undefined) {
        response[1] = this.behavior.authMethodSelection;
      } else {
        response[1] = 0x00; // No auth
      }

      this.writeResponse(socket, response);

      // Determine if auth is needed
      if (response[1] === 0x02 || response[1] >= 0x80) {
        // UserPass auth or custom auth required
        onNeedAuth();
      } else {
        onNoAuth();
      }
    };

    if (this.behavior.responseDelay) {
      setTimeout(respond, this.behavior.responseDelay);
    } else {
      respond();
    }
  }

  private handleSocks5Auth(socket: net.Socket, _data: Buffer) {
    // Custom auth method (>= 0x80)
    if (
      this.behavior.authMethodSelection !== undefined &&
      this.behavior.authMethodSelection >= 0x80
    ) {
      if (this.behavior.customAuthResponse) {
        this.writeResponse(socket, this.behavior.customAuthResponse);
      } else {
        // Default custom auth response: 2 bytes, version + success
        this.writeResponse(socket, Buffer.from([0x01, 0x00]));
      }
      return;
    }

    // Standard user/pass auth
    const response = Buffer.alloc(2);
    response[0] = 0x01; // Auth version

    if (this.behavior.authResponse === 'reject') {
      response[1] = 0x01; // Failure
    } else {
      response[1] = 0x00; // Success
    }

    this.writeResponse(socket, response);
  }

  private parseDestination(data: Buffer): {host: string; port: number} | null {
    try {
      const addressType = data[3];
      let host: string;
      let portOffset: number;

      if (addressType === 0x01) {
        // IPv4
        host = `${data[4]}.${data[5]}.${data[6]}.${data[7]}`;
        portOffset = 8;
      } else if (addressType === 0x03) {
        // Hostname
        const hostLen = data[4];
        host = data.slice(5, 5 + hostLen).toString();
        portOffset = 5 + hostLen;
      } else if (addressType === 0x04) {
        // IPv6
        const parts: string[] = [];
        for (let i = 0; i < 16; i += 2) {
          parts.push(data.readUInt16BE(4 + i).toString(16));
        }
        host = parts.join(':');
        portOffset = 20;
      } else {
        return null;
      }

      const port = data.readUInt16BE(portOffset);
      return {host, port};
    } catch {
      return null;
    }
  }

  /**
   * Build a SOCKS5 response buffer with the configured address type.
   */
  private buildSocks5Response(
    responseCode: number,
    port: number,
  ): Buffer {
    const buff = new SmartBuffer();
    buff.writeUInt8(0x05); // Version
    buff.writeUInt8(responseCode);
    buff.writeUInt8(0x00); // Reserved

    const addrType = this.behavior.responseAddressType ?? 'ipv4';

    if (addrType === 'ipv6') {
      buff.writeUInt8(0x04);
      buff.writeBuffer(Buffer.alloc(16)); // all zeros IPv6
      buff.writeUInt16BE(port);
    } else if (addrType === 'hostname') {
      buff.writeUInt8(0x03);
      const hostname = 'localhost';
      buff.writeUInt8(hostname.length);
      buff.writeString(hostname);
      buff.writeUInt16BE(port);
    } else {
      // Default: IPv4
      buff.writeUInt8(0x01);
      buff.writeBuffer(Buffer.from([0, 0, 0, 0]));
      buff.writeUInt16BE(port);
    }

    return buff.toBuffer();
  }

  private handleSocks5Command(socket: net.Socket, data: Buffer) {
    const command = data[1]; // 0x01=connect, 0x02=bind, 0x03=associate

    const respond = () => {
      const isSuccess =
        this.behavior.commandResponse === 'success' ||
        this.behavior.commandResponse === undefined;

      const responseCode = isSuccess
        ? 0x00
        : typeof this.behavior.commandResponse === 'number'
          ? this.behavior.commandResponse
          : 0x00;

      if (command === 0x02) {
        // BIND command
        const bindPort = this.behavior.bindPort ?? 4444;

        const firstResponse = this.buildSocks5Response(responseCode, bindPort);
        this.writeResponse(socket, firstResponse);

        // If success, send a second response after a delay to simulate incoming connection
        if (isSuccess) {
          const delay = this.behavior.fragmentResponses ? 200 : 50;
          setTimeout(() => {
            const bindIncoming = this.behavior.bindIncomingResponse;
            const incomingCode = typeof bindIncoming === 'number' ? bindIncoming : 0x00;
            const secondResponse = this.buildSocks5Response(incomingCode, 5555);
            this.writeResponse(socket, secondResponse);
          }, delay);
        }
      } else if (command === 0x03) {
        // ASSOCIATE command
        const associatePort = this.behavior.bindPort ?? 4444;
        const response = this.buildSocks5Response(responseCode, associatePort);
        this.writeResponse(socket, response);
      } else {
        // CONNECT command (default)
        // For connect, respect the request address type if no override is specified
        if (this.behavior.responseAddressType === undefined) {
          // Use the original logic that mirrors request address type
          const buff = new SmartBuffer();
          buff.writeUInt8(0x05);
          buff.writeUInt8(responseCode);
          buff.writeUInt8(0x00);

          const addressType = data[3];
          if (addressType === 0x04) {
            buff.writeUInt8(0x04);
            buff.writeBuffer(Buffer.alloc(16));
            buff.writeUInt16BE(0);
          } else {
            buff.writeUInt8(0x01);
            buff.writeBuffer(Buffer.from([0, 0, 0, 0]));
            buff.writeUInt16BE(0);
          }

          this.writeResponse(socket, buff.toBuffer());
        } else {
          const response = this.buildSocks5Response(responseCode, 0);
          this.writeResponse(socket, response);
        }

        // If success and extra data is configured, send it immediately after the response
        if (isSuccess && this.behavior.extraDataAfterHandshake) {
          socket.write(this.behavior.extraDataAfterHandshake);
        }

        // If success and forwarding is enabled, pipe data to the actual destination
        if (isSuccess && this.behavior.forwardAfterSuccess) {
          const dest = this.parseDestination(data);
          if (dest) {
            const upstream = net.createConnection(dest.port, dest.host, () => {
              socket.pipe(upstream);
              upstream.pipe(socket);
            });
            this.connections.push(upstream);
            upstream.on('error', () => socket.destroy());
            socket.on('error', () => upstream.destroy());
            socket.on('close', () => upstream.destroy());
            upstream.on('close', () => socket.destroy());
          }
        }
      }
    };

    if (this.behavior.responseDelay) {
      setTimeout(respond, this.behavior.responseDelay);
    } else {
      respond();
    }
  }
}

export {MockSocksServer, MockServerBehavior};
