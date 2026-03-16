# socks  [![CI](https://github.com/JoshGlazebrook/socks/actions/workflows/nodejs.yml/badge.svg)](https://github.com/JoshGlazebrook/socks/actions/workflows/nodejs.yml)

Fully featured SOCKS proxy client supporting SOCKSv4, SOCKSv4a, and SOCKSv5. Includes Bind and Associate functionality.

> Looking for a Node.js HTTP agent? Check out [node-socks-proxy-agent](https://github.com/TooTallNate/node-socks-proxy-agent).

### Features

* Supports SOCKS v4, v4a, v5, and v5h protocols.
* Supports the CONNECT, BIND, and ASSOCIATE commands.
* Supports proxy chaining (CONNECT only) with optional chain randomization.
* Supports user/password authentication and custom authentication methods.
* Built-in UDP frame creation and parsing.
* AbortSignal support for cancellable connections.
* `Symbol.dispose` support for automatic resource cleanup with `using`.
* Structured error hierarchy with error codes and credential redaction.
* Dual ESM/CJS -- both `import` and `require` work.
* Written in TypeScript with full type definitions included.

### Requirements

* Node.js >= 20.0.0

## Installation

```
npm install socks
```

## Usage

```typescript
// ESM
import { SocksClient } from 'socks';

// CommonJS
const { SocksClient } = require('socks');
```

## Quick Start Example

Connect to github.com on port 80 through a SOCKS proxy.

```typescript
const info = await SocksClient.createConnection({
  proxy: {
    host: '159.203.75.200',
    port: 1080,
    type: 5
  },
  command: 'connect',
  destination: {
    host: 'github.com',
    port: 80
  }
});

console.log(info.socket);
// <net.Socket> -- a raw TCP socket connected to the destination through the proxy
```

Or use the convenience `connect` method:

```typescript
const info = await SocksClient.connect(
  { host: '159.203.75.200', port: 1080, type: 5 },
  { host: 'github.com', port: 80 }
);

info.socket.write('GET / HTTP/1.1\r\nHost: github.com\r\n\r\n');
```

### Connecting from a proxy URL

Use `connectFromUrl` to connect in a single call from a SOCKS proxy URL string:

```typescript
const info = await SocksClient.connectFromUrl(
  'socks5://user:pass@127.0.0.1:1080',
  { host: 'example.com', port: 443 }
);
```

Or parse the URL separately with `parseProxyUrl`:

```typescript
const proxy = SocksClient.parseProxyUrl('socks5://user:pass@127.0.0.1:1080');
// { host: '127.0.0.1', port: 1080, type: 5, userId: 'user', password: 'pass' }

const info = await SocksClient.connect(proxy, { host: 'example.com', port: 443 });
```

Supported URL schemes: `socks://`, `socks4://`, `socks4a://`, `socks5://`, `socks5h://`.

### Reading a proxy from the environment

`proxyFromEnvironment()` reads from `SOCKS_PROXY`, `socks_proxy`, `ALL_PROXY`, or `all_proxy` (checked in that order):

```typescript
const proxy = SocksClient.proxyFromEnvironment();

if (proxy) {
  const info = await SocksClient.connect(proxy, { host: 'example.com', port: 443 });
}
```

### TLS over SOCKS

After establishing a SOCKS connection, upgrade to TLS for HTTPS, SMTPS, or any TLS-secured protocol:

```typescript
import * as tls from 'node:tls';

const info = await SocksClient.connect(
  { host: '127.0.0.1', port: 1080, type: 5 },
  { host: 'example.com', port: 443 }
);

// Upgrade the raw TCP socket to TLS
const tlsSocket = tls.connect({
  socket: info.socket,
  servername: 'example.com' // Required for SNI
});

tlsSocket.on('secureConnect', () => {
  tlsSocket.write('GET / HTTP/1.1\r\nHost: example.com\r\n\r\n');
});

tlsSocket.on('data', (data) => {
  console.log(data.toString());
});
```

### Using with an HTTP agent

For HTTP/HTTPS requests through a SOCKS proxy, use [socks-proxy-agent](https://github.com/TooTallNate/node-socks-proxy-agent):

```typescript
import { SocksProxyAgent } from 'socks-proxy-agent';

const agent = new SocksProxyAgent('socks5://127.0.0.1:1080');

const res = await fetch('https://example.com', { agent } as any);
```

### AbortSignal support

```typescript
const controller = new AbortController();

// Cancel the connection after 5 seconds
setTimeout(() => controller.abort(), 5000);

try {
  const info = await SocksClient.createConnection({
    proxy: { host: '159.203.75.200', port: 1080, type: 5 },
    command: 'connect',
    destination: { host: 'example.com', port: 80 },
    signal: controller.signal
  });
} catch (err) {
  if (isSocksError(err) && err.code === SocksErrorCode.ConnectionAborted) {
    console.log('Connection was cancelled');
  }
}
```

### Automatic cleanup with `using`

The returned connection info implements `Symbol.dispose`, so you can use the `using` keyword (TypeScript 5.2+ / Node.js with `--harmony-using`) for automatic socket cleanup:

```typescript
{
  using info = await SocksClient.createConnection({
    proxy: { host: '159.203.75.200', port: 1080, type: 5 },
    command: 'connect',
    destination: { host: 'example.com', port: 80 }
  });

  info.socket.write('GET / HTTP/1.1\r\nHost: example.com\r\n\r\n');
  // Socket is automatically destroyed when `info` goes out of scope
}
```

## Chaining Proxies

Chain through one or more SOCKS proxies. Only the `connect` command is supported when chaining.

```typescript
const info = await SocksClient.createConnectionChain({
  proxies: [
    { host: '159.203.75.235', port: 1081, type: 5 },
    { host: '104.131.124.203', port: 1081, type: 5 }
  ],
  command: 'connect',
  destination: {
    host: 'ip-api.com',
    port: 80
  }
});

// The socket's remote address is the first proxy in the chain
console.log(info.socket.remoteAddress); // 159.203.75.235

info.socket.write('GET /json HTTP/1.1\r\nHost: ip-api.com\r\n\r\n');
info.socket.on('data', (data) => {
  // ip-api.com sees the last proxy (104.131.124.203) as the client
  console.log(data.toString());
});
```

Chain options also support `signal` for cancellation and `randomizeChain` to shuffle the proxy order:

```typescript
const info = await SocksClient.createConnectionChain({
  proxies: [
    { host: '159.203.75.235', port: 1081, type: 5 },
    { host: '104.131.124.203', port: 1081, type: 5 },
    { host: '192.241.165.30', port: 1081, type: 5 }
  ],
  command: 'connect',
  destination: { host: 'example.com', port: 443 },
  randomizeChain: true,
  signal: AbortSignal.timeout(10000)
});
```

**Note:** The `timeout` option applies per-hop, not to the entire chain. If you need a total chain timeout, use `signal: AbortSignal.timeout(ms)` instead.

When a chain fails, the error's `detail` includes hop information (`hopIndex`, `hopProxy`, `hopTotal`) to help identify which proxy in the chain caused the failure.

## Bind Example (TCP Relay)

When the `bind` command is sent to a SOCKS proxy, the proxy starts listening on a new TCP port for an incoming connection. Once a remote client connects, a full duplex stream is established. This is commonly used for protocols like FTP where the server needs to connect back to the client.

```typescript
const client = new SocksClient({
  proxy: {
    host: '159.203.75.235',
    port: 1081,
    type: 5
  },
  command: 'bind',
  destination: {
    host: '0.0.0.0',
    port: 0
  }
});

// The proxy has allocated a port and is listening
client.on('bound', (info) => {
  console.log(info.remoteHost);
  // { host: '159.203.75.235', port: 57362 }
});

// A remote client connected to the bound port
client.on('established', (info) => {
  console.log(info.remoteHost);
  // { host: '67.171.34.23', port: 49823 }

  console.log(info.socket);
  // <net.Socket> -- full duplex connection between you and the remote client

  info.socket.on('data', (data) => {
    console.log('received:', data);
  });
});

client.on('error', (err) => {
  console.error(err);
});

client.connect();
```

## Associate Example (UDP Relay)

When the `associate` command is sent to a SOCKS v5 proxy, it sets up a UDP relay that allows the client to send and receive UDP packets through the proxy.

```typescript
import * as dgram from 'node:dgram';

const client = new SocksClient({
  proxy: {
    host: '159.203.75.235',
    port: 1081,
    type: 5
  },
  command: 'associate',
  destination: {
    host: '0.0.0.0',
    port: 0
  }
});

const udpSocket = dgram.createSocket('udp4');
udpSocket.bind();

// Parse incoming UDP frames from the proxy
udpSocket.on('message', (message, rinfo) => {
  console.log(SocksClient.parseUDPFrame(message));
  // { frameNumber: 0, remoteHost: { host: '165.227.108.231', port: 4444 }, data: <Buffer ...> }
});

// UDP relay is established
client.on('established', (info) => {
  console.log(info.remoteHost);
  // { host: '159.203.75.235', port: 44711 }

  // Send data to 165.227.108.231:4444 through the relay
  const packet = SocksClient.createUDPFrame({
    remoteHost: { host: '165.227.108.231', port: 4444 },
    data: Buffer.from('hello')
  });
  udpSocket.send(packet, info.remoteHost.port, info.remoteHost.host);
});

client.on('error', (err) => {
  console.error(err);
});

client.connect();
```

**Note:** The TCP connection to the proxy must remain open for the UDP relay to work.

## DNS Resolution

Understanding when DNS resolution happens locally vs. on the proxy server is important for privacy and functionality:

- **SOCKS5 with hostnames:** When you provide a hostname as the destination (e.g., `host: 'example.com'`), the hostname is sent directly to the proxy server, which resolves it. This means **no local DNS lookup occurs**, which is important for privacy (e.g., when using Tor) and for accessing hosts that are only resolvable from the proxy's network.

- **SOCKS5 with IP addresses:** When you provide an IP address, it is sent directly to the proxy. No DNS is involved.

- **SOCKS4a with hostnames:** Same as SOCKS5 -- the hostname is sent to the proxy for remote resolution. Note that both `type: 4` and `type: 'socks4a'` use the SOCKS4a extension when given a hostname.

- **SOCKS4 with IP addresses:** The IP address is sent directly. SOCKS4 only supports IPv4 addresses.

- **Proxy host resolution:** The proxy's own hostname (e.g., `proxy: { host: 'proxy.example.com', ... }`) is always resolved locally by Node.js before connecting.

**For Tor users:** Always use hostnames (not IP addresses) as the destination to ensure DNS resolution happens through the Tor network. Use `.onion` addresses directly as hostnames.

```typescript
// Good -- DNS resolved by Tor
const info = await SocksClient.connect(
  { host: '127.0.0.1', port: 9050, type: 5 },
  { host: 'example.com', port: 443 }
);

// Also good -- .onion addresses work with SOCKS5
const info = await SocksClient.connect(
  { host: '127.0.0.1', port: 9050, type: 5 },
  { host: 'duckduckgogg42xjoc72x3sjasowoarfbgcmvfimaftt6twagswzczad.onion', port: 443 }
);
```

## Error Handling

v3 introduces a structured error hierarchy with error codes and type guards.

### Error classes

| Class | When |
| --- | --- |
| `SocksClientError` | Base class for all SOCKS errors |
| `SocksTimeoutError` | Connection to the proxy timed out |
| `SocksAuthenticationError` | SOCKS5 authentication failed |

All error classes extend `Error` and include:
- `code` -- a string error code from `SocksErrorCode` (e.g. `'ERR_SOCKS_PROXY_TIMEOUT'`)
- `options` -- the original connection options (with credentials redacted)
- `detail` -- additional context about the error (when available)
- `cause` -- the underlying error (when applicable)

### The `isSocksError` type guard

Use `isSocksError()` to narrow caught errors in `try`/`catch` blocks:

```typescript
import { SocksClient, isSocksError, SocksErrorCode, SocksTimeoutError, SocksAuthenticationError } from 'socks';

try {
  const info = await SocksClient.createConnection(options);
} catch (err) {
  if (isSocksError(err)) {
    console.error('SOCKS error:', err.code, err.message);

    // Check for specific error codes
    if (err.code === SocksErrorCode.ProxyConnectionTimedOut) {
      console.error('Connection timed out');
    }

    // Or use instanceof for error subclasses
    if (err instanceof SocksTimeoutError) {
      console.error('Timed out');
    }
    if (err instanceof SocksAuthenticationError) {
      console.error('Auth failed');
    }

    // Access additional context from the detail property
    if (err.detail) {
      console.error('Detail:', err.detail);
      // e.g. { socks5Response: 5, socks5ResponseName: 'ConnectionRefused' }
      // e.g. { hopIndex: 1, hopProxy: '104.131.124.203:1081', hopTotal: 3 }
    }
  }
}
```

### Error codes

All error codes are available on the `SocksErrorCode` object:

| Code | Description |
| --- | --- |
| `ERR_SOCKS_PROXY_TIMEOUT` | Proxy connection timed out |
| `ERR_SOCKS5_AUTH_FAILED` | SOCKS5 authentication failed |
| `ERR_SOCKS_CONNECTION_ABORTED` | Connection aborted via AbortSignal |
| `ERR_SOCKS_SOCKET_CLOSED` | Socket was closed unexpectedly |
| `ERR_SOCKS_SOCKET_ERROR` | Underlying socket error |
| `ERR_SOCKS4_PROXY_REJECTED` | SOCKS4 proxy rejected the connection |
| `ERR_SOCKS5_PROXY_REJECTED` | SOCKS5 proxy rejected the connection |
| `ERR_SOCKS_INVALID_COMMAND` | Invalid SOCKS command |
| `ERR_SOCKS_INVALID_DESTINATION` | Invalid destination host |
| `ERR_SOCKS_INVALID_PROXY` | Invalid proxy configuration |
| `ERR_SOCKS_INVALID_TIMEOUT` | Invalid timeout value |

See the `SocksErrorCode` export for the full list.

## API Reference

**Note:** socks includes full TypeScript definitions. These provide auto-completion and inline documentation in editors like VS Code, even in JavaScript files.

* Class: SocksClient
  * [new SocksClient(options)](#new-socksclientoptions)
  * [Static: SocksClient.createConnection(options)](#socksclientcreateconnectionoptions)
  * [Static: SocksClient.connect(proxy, destination, options?)](#socksclientconnectproxy-destination-options)
  * [Static: SocksClient.connectFromUrl(proxyUrl, destination, options?)](#socksclientconnectfromurlproxyurl-destination-options)
  * [Static: SocksClient.createConnectionChain(options)](#socksclientcreateconnectionchainoptions)
  * [Static: SocksClient.testConnection(proxy, destination, options?)](#socksclienttestconnectionproxy-destination-options)
  * [Static: SocksClient.parseProxyUrl(url)](#socksclientparseproqurlurl)
  * [Static: SocksClient.proxyFromEnvironment()](#socksclientproxyfromenvironment)
  * [Static: SocksClient.createUDPFrame(details)](#socksclientcreateudpframedetails)
  * [Static: SocksClient.parseUDPFrame(data)](#socksclientparseudpframedata)
  * [Event: 'error'](#event-error)
  * [Event: 'bound'](#event-bound)
  * [Event: 'established'](#event-established)
  * [client.connect()](#clientconnect)
  * [client.socksClientOptions](#clientsocksclientoptions)
* Utilities
  * [resolveProxyType(type)](#resolveproxytypetype)

**SOCKS Compatibility Table**

Note: When using 4a, specify `type: 4`. When using 5h, specify `type: 5`.

| SOCKS Version | TCP | UDP | IPv4 | IPv6 | Hostname |
| --- | :---: | :---: | :---: | :---: | :---: |
| SOCKS v4 | Yes | No | Yes | No | No |
| SOCKS v4a | Yes | No | Yes | No | Yes |
| SOCKS v5 (includes v5h) | Yes | Yes | Yes | Yes | Yes |

---

### new SocksClient(options)

* `options` **SocksClientOptions** -- Connection options (see below).

Creates a new SocksClient instance. Use the event-based API (`client.on(...)` / `client.connect()`) for `bind` and `associate` commands. For `connect`, prefer the static factory methods.

### SocksClientOptions

```typescript
interface SocksClientOptions {
  proxy: {
    host: string;              // IPv4, IPv6, or hostname
    port: number;
    type: 4 | 5;              // SOCKS version (use 4 for v4a, 5 for v5h)

    // Authentication (optional)
    userId?: string;           // SOCKS4 userId or SOCKS5 username
    password?: string;         // SOCKS5 password

    // Custom authentication (optional, all four must be set together)
    customAuthMethod?: number;                              // Auth type (0x80-0xFE)
    customAuthRequestHandler?: () => Promise<Buffer>;       // Returns auth payload
    customAuthResponseSize?: number;                        // Expected response size in bytes
    customAuthResponseHandler?: (data: Buffer) => Promise<boolean>;  // Returns true if auth succeeded
  };

  command: 'connect' | 'bind' | 'associate';

  destination: {
    host: string;              // IPv4, IPv6, or hostname (hostname requires v4a or v5)
    port: number;
  };

  // Optional
  timeout?: number;            // Connection timeout in ms (default: 30000)
  signal?: AbortSignal;        // AbortSignal for cancellation
  existingSocket?: Duplex;     // Use an existing socket instead of creating one
  setTcpNoDelay?: boolean;     // Set TCP_NODELAY (default: true)
  socketOptions?: SocketConnectOpts;  // Additional TCP socket options
}
```

---

### SocksClient.createConnection(options)

* `options` **SocksClientOptions**
* Returns **Promise\<SocksClientEstablishedEvent\>**

Creates a new proxied connection. Supports `connect`, `bind`, and `associate` commands.

```typescript
const info = await SocksClient.createConnection({
  proxy: { host: '159.203.75.200', port: 1080, type: 5 },
  command: 'connect',
  destination: { host: '192.30.253.113', port: 80 }
});

console.log(info.socket); // <net.Socket>
```

---

### SocksClient.connect(proxy, destination, options?)

* `proxy` **SocksProxy** -- The proxy server.
* `destination` **SocksRemoteHost** -- The remote host to connect to.
* `options` **object** (optional) -- Additional options (`timeout`, `signal`, `existingSocket`, `setTcpNoDelay`, `socketOptions`).
* Returns **Promise\<SocksClientEstablishedEvent\>**

Convenience method equivalent to calling `createConnection` with `command: 'connect'`.

```typescript
const info = await SocksClient.connect(
  { host: '159.203.75.200', port: 1080, type: 5 },
  { host: 'example.com', port: 443 },
  { timeout: 10000 }
);
```

---

### SocksClient.connectFromUrl(proxyUrl, destination, options?)

* `proxyUrl` **string** -- A SOCKS proxy URL (e.g. `'socks5://user:pass@host:port'`).
* `destination` **SocksRemoteHost** -- The remote host to connect to.
* `options` **object** (optional) -- Additional options (`timeout`, `signal`, `existingSocket`, `setTcpNoDelay`, `socketOptions`).
* Returns **Promise\<SocksClientEstablishedEvent\>**

Combines `parseProxyUrl()` and `connect()` in a single call. Useful when proxy configuration comes from a URL string (e.g., environment variables or config files).

```typescript
const info = await SocksClient.connectFromUrl(
  'socks5://user:pass@proxy.example.com:1080',
  { host: 'example.com', port: 443 }
);
```

---

### SocksClient.createConnectionChain(options)

* `options` **SocksClientChainOptions**
* Returns **Promise\<SocksClientEstablishedEvent\>**

Creates a proxied connection through a chain of one or more SOCKS proxies. Only the `connect` command is supported.

```typescript
interface SocksClientChainOptions {
  command: 'connect';
  destination: SocksRemoteHost;
  proxies: SocksProxy[];        // At least 1 proxy required
  timeout?: number;             // Per-hop timeout in ms
  signal?: AbortSignal;
  randomizeChain?: boolean;     // Shuffle proxy order (default: false)
}
```

---

### SocksClient.testConnection(proxy, destination, options?)

* `proxy` **SocksProxy** -- The proxy server to test.
* `destination` **SocksRemoteHost** -- A remote host to connect to through the proxy.
* `options` **object** (optional) -- Additional options (`timeout`, `signal`, etc.).
* Returns **Promise\<void\>**

Tests whether a proxy is reachable by connecting to a destination through it and immediately destroying the socket. Throws on failure.

```typescript
try {
  await SocksClient.testConnection(
    { host: '127.0.0.1', port: 1080, type: 5 },
    { host: 'example.com', port: 80 },
    { timeout: 5000 }
  );
  console.log('Proxy is reachable');
} catch (err) {
  console.error('Proxy test failed:', err);
}
```

---

### SocksClient.parseProxyUrl(url)

* `url` **string** -- A SOCKS proxy URL.
* Returns **SocksProxy**

Parses a URL string into a `SocksProxy` object. Supported schemes: `socks://`, `socks4://`, `socks4a://`, `socks5://`, `socks5h://`. Default port is 1080.

```typescript
const proxy = SocksClient.parseProxyUrl('socks5://user:pass@proxy.example.com:1080');
// { host: 'proxy.example.com', port: 1080, type: 5, userId: 'user', password: 'pass' }
```

---

### SocksClient.proxyFromEnvironment()

* Returns **SocksProxy | null**

Reads a SOCKS proxy URL from environment variables. Checks (in order): `SOCKS_PROXY`, `socks_proxy`, `ALL_PROXY`, `all_proxy`. Returns `null` if no proxy is configured.

```typescript
const proxy = SocksClient.proxyFromEnvironment();
if (proxy) {
  const info = await SocksClient.connect(proxy, { host: 'example.com', port: 443 });
}
```

---

### SocksClient.createUDPFrame(details)

* `details` **SocksUDPFrameDetails**
* Returns **Buffer**

Creates a SOCKS5 UDP frame for use with the `associate` command.

```typescript
interface SocksUDPFrameDetails {
  frameNumber?: number;         // Fragment number (default: 0)
  remoteHost: SocksRemoteHost;  // Target host and port
  data: Buffer;                 // Payload data
}
```

```typescript
const frame = SocksClient.createUDPFrame({
  remoteHost: { host: '1.2.3.4', port: 1234 },
  data: Buffer.from('hello')
});
```

---

### SocksClient.parseUDPFrame(data)

* `data` **Buffer** -- Raw UDP frame data.
* Returns **SocksUDPFrameDetails**

Parses a SOCKS5 UDP frame received from a proxy.

```typescript
const frame = SocksClient.parseUDPFrame(data);
// { frameNumber: 0, remoteHost: { host: '1.2.3.4', port: 1234 }, data: <Buffer ...> }
```

---

### Event: 'error'

* `err` **SocksClientError** -- Error with `code`, `options`, and optional `detail` properties.

Emitted when an unrecoverable error occurs. The underlying socket is destroyed before this event fires.

### Event: 'bound'

* `info` **SocksClientBoundEvent** -- Contains `socket` (net.Socket), `remoteHost` ({ host, port }), and `[Symbol.dispose]()`.

Emitted when a `bind` command succeeds and the proxy is listening for incoming connections.

### Event: 'established'

* `info` **SocksClientEstablishedEvent** -- Contains `socket` (net.Socket), optional `remoteHost` ({ host, port }), and `[Symbol.dispose]()`.

Emitted when the proxied connection is fully established:
- **CONNECT**: The TCP connection to the destination is ready.
- **BIND**: A remote client has connected to the bound port.
- **ASSOCIATE**: The UDP relay is ready.

### client.connect()

Initiates the connection to the proxy server. Must be called after attaching event listeners.

### client.socksClientOptions

* Returns **SocksClientOptions** -- A copy of the options passed to the constructor.

---

### resolveProxyType(type)

* `type` **SocksProxyType** -- A numeric (`4`, `5`) or string (`'socks'`, `'socks4'`, `'socks4a'`, `'socks5'`, `'socks5h'`) proxy type.
* Returns **4 | 5**

Utility function that normalizes any `SocksProxyType` value to its numeric form. Useful when working with proxy type values from configuration or user input.

```typescript
import { resolveProxyType } from 'socks';

resolveProxyType('socks5h'); // 5
resolveProxyType('socks4a'); // 4
resolveProxyType(5);         // 5
```

---

## Migrating from v2

### Breaking changes

1. **Callback API removed.** All factory methods (`createConnection`, `createConnectionChain`) are now promise-only. Remove any callback arguments and use `await` or `.then()`.

   ```typescript
   // v2 (no longer works)
   SocksClient.createConnection(options, (err, info) => { ... });

   // v3
   const info = await SocksClient.createConnection(options);
   ```

2. **Node.js >= 20.0.0 required.** Older versions of Node.js are no longer supported.

3. **camelCase options preferred.** The following options have been renamed. The old snake_case names still work but are deprecated and will be removed in a future major version:

   | Deprecated (snake_case) | Preferred (camelCase) |
   | --- | --- |
   | `existing_socket` | `existingSocket` |
   | `set_tcp_nodelay` | `setTcpNoDelay` |
   | `socket_options` | `socketOptions` |
   | `custom_auth_method` | `customAuthMethod` |
   | `custom_auth_request_handler` | `customAuthRequestHandler` |
   | `custom_auth_response_size` | `customAuthResponseSize` |
   | `custom_auth_response_handler` | `customAuthResponseHandler` |

4. **Structured errors.** Errors now include a `code` property (string) from `SocksErrorCode`, an optional `detail` object, and credentials are automatically redacted from the `options` property. The error classes are `SocksClientError`, `SocksTimeoutError`, and `SocksAuthenticationError`.

5. **TCP_NODELAY on by default.** The `setTcpNoDelay` option now defaults to `true` for lower-latency handshakes. Set it to `false` to restore the old behavior.

### New features in v3

- **`SocksClient.connect(proxy, destination, options?)`** -- Convenience method for CONNECT.
- **`SocksClient.connectFromUrl(proxyUrl, destination, options?)`** -- Connect using a SOCKS proxy URL string.
- **`SocksClient.testConnection(proxy, destination, options?)`** -- Test whether a proxy is reachable.
- **`SocksClient.parseProxyUrl(url)`** -- Parse `socks5://user:pass@host:port` URLs.
- **`SocksClient.proxyFromEnvironment()`** -- Read proxy config from environment variables.
- **`resolveProxyType(type)`** -- Normalize proxy type strings to numeric values.
- **`signal` option** -- Pass an `AbortSignal` to cancel connections.
- **`Symbol.dispose` support** -- Use `using` for automatic socket cleanup.
- **`isSocksError(err)` type guard** -- Narrow caught errors safely.
- **`randomizeChain` option** -- Shuffle proxy order in `createConnectionChain`.
- **Single-proxy chains** -- `createConnectionChain` now accepts 1 or more proxies.
- **Chain error hop info** -- Chain errors include `hopIndex`, `hopProxy`, and `hopTotal` in `detail`.
- **Dual ESM/CJS package** -- Both `import` and `require` work out of the box.

## Further Reading

- [CHANGELOG](./CHANGELOG.md)
- [SOCKS5 specification (RFC 1928)](https://www.rfc-editor.org/rfc/rfc1928)

## License

This work is licensed under the [MIT license](http://en.wikipedia.org/wiki/MIT_License).
