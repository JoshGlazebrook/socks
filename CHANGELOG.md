# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.0.0] - Unreleased

### Breaking Changes

- **Minimum Node.js version raised to 20.0.0**
- **Removed callback-based API** -- all async methods now return Promises
- **Removed hand-maintained typings directory** -- declarations are now auto-generated from TypeScript source
- **Replaced TypeScript enums with `as const` objects** -- values are identical but tree-shaking is improved
- **Removed `DEFAULT_TIMEOUT` and `SocksClientState` from public exports** -- these are internal implementation details
- **`SocksUDPFrameDetails.frameNumber` is now required** (was optional)
- **Removed SmartBuffer dependency** -- replaced with raw Buffer operations

### Added

- **Dual ESM/CJS support** via conditional `exports` map in package.json
- **`AbortSignal` support** for cancelling connections (`signal` option on `SocksClientOptions` and `SocksClientChainOptions`)
- **`Symbol.dispose` / `Symbol.asyncDispose`** on connection results for explicit resource management (`using` / `await using`)
- **Structured error codes** via `SocksErrorCode` const object (e.g., `ERR_SOCKS_PROXY_TIMEOUT`)
- **Custom error subclasses**: `SocksTimeoutError`, `SocksAuthenticationError`
- **`isSocksError()` type guard** for safe error narrowing in catch blocks
- **Credential redaction** in error objects (userId/password replaced with `[redacted]`)
- **`Error.cause` chaining** throughout the error hierarchy
- **`SocksClient.connect()` convenience method** -- simplified API for common use cases
- **`SocksClient.connectFromUrl()` method** -- connect using a SOCKS proxy URL string
- **`SocksClient.parseProxyUrl()` method** -- parse `socks5://user:pass@host:port` URLs
- **Typed event emitter** via `SocksClientEventMap` interface
- **`SocksClientEventMap` exported** for consumers to type their own event handlers
- **Null-byte injection prevention** in hostname validation
- **RFC 1929 credential length validation** (max 255 bytes each)
- **Custom SOCKS5 authentication** support (methods 0x80-0xFE) with async handlers
- **`Socks4ResponseName` / `Socks5ResponseName`** reverse-lookup maps for protocol response codes
- **`NormalizedSocksProxy` type** for internal use after proxy normalization
- **`ReceiveBuffer` accepts `Uint8Array`** in addition to `Buffer`
- **Publish workflow with npm provenance** for supply chain security
- **Cross-platform CI testing** (Ubuntu, macOS, Windows)
- **`publint` and `@arethetypeswrong/cli` validation** in CI

### Changed

- **`snake_case` options deprecated** in favor of `camelCase` (`existing_socket` -> `existingSocket`, `set_tcp_nodelay` -> `setTcpNoDelay`, etc.)
- **`ipaddress` field deprecated** in favor of `host` on `SocksProxy`
- **ESLint upgraded** to flat config with type-checked rules
- **Test framework** migrated from legacy setup to Vitest
- **Source maps and declaration maps** no longer shipped in published package (reduces package size)
- **ESM tsconfig** uses `moduleResolution: "node16"` instead of `"bundler"`

### Fixed

- Fractional port numbers (e.g., `80.5`) are now properly rejected in validation
- `custom_auth_response_size` is now validated as a positive integer
- Domain length validation uses byte length (not string length) per SOCKS5 spec

## [2.8.7] - 2025-03-13

- Maintenance release

## [2.8.6] - 2025-02-27

### Fixed

- Prevent RangeError by validating domain length in SOCKS5 client (#111)

## [2.8.5] - 2024-12-15

- Maintenance release
