import {describe, it, expect} from 'vitest';
import type {SocksRemoteHost, SocksProxy} from '../../src/common/constants';
import { SocksErrorCode} from '../../src/common/constants';
import {SocksClientError} from '../../src/common/util';
import {
  validateSocksClientOptions,
  validateSocksClientChainOptions,
} from '../../src/common/helpers';
import {SocksClient} from '../../src/client/socksclient';
import * as net from 'node:net';

describe('Validating SocksProxyOptions', () => {
  const socksRemoteHostValid: SocksRemoteHost = {
    host: '1.2.3.4',
    port: 1080,
  };

  const socksRemoteHostInvalidHost: SocksRemoteHost = {
    host: undefined,
    port: 1080,
  } as any;

  const socksremoteHostInvalidPort: SocksRemoteHost = {
    host: '1.2.3.4',
    port: undefined,
  } as any;

  const socksRemoteHostMaxLengthDomain: SocksRemoteHost = {
    host: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.com',
    port: 80,
  } as any;

  const socksCommandValid = 'connect';
  const socksCommandInvalid: any = 'other';

  const socksProxyValid: SocksProxy = {
    ipaddress: '1.2.3.4',
    port: 1080,
    type: 5,
  };

  const socksProxyInvalidIPAddress: SocksProxy = {
    ipaddress: undefined,
    port: 1080,
    type: 5,
  };

  const socksProxyValidHost: SocksProxy = {
    host: 'openinternetproxyfree.com',
    port: 1080,
    type: 5,
  };

  const socksProxyValidHostInvalidIPAddress: SocksProxy = {
    host: 'openinternetproxyfree.com',
    ipaddress: undefined,
    port: 1080,
    type: 5,
  };

  const socksProxyInvalidHost: SocksProxy = {
    host: undefined,
    port: 1080,
    type: 5,
  };

  const socksProxyInvalidCustomAuthMethod: SocksProxy = {
    host: 'openinternetproxyfree.com',
    port: 1080,
    type: 5,
    custom_auth_method: 0x10,
  };

  const socksProxyCustomAuthMissingOptions: SocksProxy = {
    host: 'openinternetproxyfree.com',
    port: 1080,
    type: 5,
    custom_auth_method: 0x80,
  };

  const socksProxyCustomAuthValidOptions: SocksProxy = {
    host: 'openinternetproxyfree.com',
    port: 1080,
    type: 5,
    custom_auth_method: 0x80,
    custom_auth_request_handler: async () => Buffer.from([1, 2, 3]),
    custom_auth_response_size: 2,
    custom_auth_response_handler: async (data) => data[1] === 0x01,
  };

  const invalidProxyType: any = 9;

  const socksProxyInvalidPortBounds: SocksProxy = {
    ipaddress: '1111:2222:3333:4444:5555:6666',
    port: 90000,
    type: 4,
  };

  const socksProxyInvalidPort: SocksProxy = {
    ipaddress: '1.2.3.4',
    port: undefined,
    type: 4,
  } as any;

  const socksProxyInvalidType: SocksProxy = {
    ipaddress: '1.2.3.4',
    port: 1080,
    type: invalidProxyType,
  };

  const socketValid = new net.Socket();
  const socketInvalid: any = 'something that is not a socket';
  const socksProxiesValid: SocksProxy[] = [socksProxyValid, socksProxyValid];
  const socksProxiesInvalidLength: SocksProxy[] = [];
  const socksProxiesInvalid: any = 'not an array of proxies';
  const socksProxiesInvalidMixed: SocksProxy[] = [
    socksProxyValid,
    socksProxyInvalidIPAddress,
  ];

  it('should not throw an exception when passing valid options', () => {
    expect(() => {
      validateSocksClientOptions({
        proxy: socksProxyValid,
        command: socksCommandValid,
        destination: socksRemoteHostValid,
        timeout: 10000,
        existing_socket: socketValid,
      });
    }).not.toThrow();
  });

  it('should not throw an exception when passing valid options with proxy host property', () => {
    expect(() => {
      validateSocksClientOptions({
        proxy: socksProxyValidHost,
        command: socksCommandValid,
        destination: socksRemoteHostValid,
        timeout: 10000,
        existing_socket: socketValid,
      });
    }).not.toThrow();
  });

  it('should not throw an exception when passing valid options with proxy host property and invalid ipaddress property', () => {
    expect(() => {
      validateSocksClientOptions({
        proxy: socksProxyValidHostInvalidIPAddress,
        command: socksCommandValid,
        destination: socksRemoteHostValid,
        timeout: 10000,
        existing_socket: socketValid,
      });
    }).not.toThrow();
  });

  it('should throw an exception when given an invalid proxy ip address', () => {
    expect(() => {
      validateSocksClientOptions({
        proxy: socksProxyInvalidIPAddress,
        command: socksCommandValid,
        destination: socksRemoteHostValid,
      });
    }).toThrow(SocksClientError);
  });

  it('should throw an exception when given an invalid proxy host property', () => {
    expect(() => {
      validateSocksClientOptions({
        proxy: socksProxyInvalidHost,
        command: socksCommandValid,
        destination: socksRemoteHostValid,
      });
    }).toThrow(SocksClientError);
  });

  it('should throw an exception when given a proxy with port 0', () => {
    expect(() => {
      validateSocksClientOptions({
        proxy: {
          ipaddress: '1.2.3.4',
          port: 0,
          type: 5,
        },
        command: socksCommandValid,
        destination: socksRemoteHostValid,
      });
    }).toThrow(SocksClientError);
  });

  it('should throw an exception when given a proxy with an empty string host', () => {
    expect(() => {
      validateSocksClientOptions({
        proxy: {
          host: '',
          port: 1080,
          type: 5,
        },
        command: socksCommandValid,
        destination: socksRemoteHostValid,
      });
    }).toThrow(SocksClientError);
  });

  it('should throw an exception when given a proxy with an empty string ipaddress and no host', () => {
    expect(() => {
      validateSocksClientOptions({
        proxy: {
          ipaddress: '',
          port: 1080,
          type: 5,
        },
        command: socksCommandValid,
        destination: socksRemoteHostValid,
      });
    }).toThrow(SocksClientError);
  });

  it('should throw an exception when given an invalid proxy port (out of bounds)', () => {
    expect(() => {
      validateSocksClientOptions({
        proxy: socksProxyInvalidPortBounds,
        command: socksCommandValid,
        destination: socksRemoteHostValid,
      });
    }).toThrow(SocksClientError);
  });

  it('should throw an exception when given an invalid proxy port', () => {
    expect(() => {
      validateSocksClientOptions({
        proxy: socksProxyInvalidPort,
        command: socksCommandValid,
        destination: socksRemoteHostValid,
      });
    }).toThrow(SocksClientError);
  });

  it('should throw an exception when given an invalid proxy type', () => {
    expect(() => {
      validateSocksClientOptions({
        proxy: socksProxyInvalidType,
        command: socksCommandValid,
        destination: socksRemoteHostValid,
      });
    }).toThrow(SocksClientError);
  });

  it('should throw an exception when given a invalid command', () => {
    expect(() => {
      validateSocksClientOptions({
        proxy: socksProxyValid,
        command: socksCommandInvalid,
        destination: socksRemoteHostValid,
      });
    }).toThrow(SocksClientError);
  });

  it('should throw an exception when given a invalid command (not accepted)', () => {
    expect(() => {
      validateSocksClientOptions(
        {
          proxy: socksProxyValid,
          command: 'bind',
          destination: socksRemoteHostValid,
        },
        ['connect'],
      );
    }).toThrow(SocksClientError);
  });

  it('should throw an exception when given a invalid destination host', () => {
    expect(() => {
      validateSocksClientOptions({
        proxy: socksProxyValid,
        command: socksCommandValid,
        destination: socksRemoteHostInvalidHost,
      });
    }).toThrow(SocksClientError);
  });

  it('should throw an exception when domain length exceeds 255 bytes', () => {
    expect(() => {
      validateSocksClientOptions({
        proxy: socksProxyValid,
        command: socksCommandValid,
        destination: socksRemoteHostMaxLengthDomain,
      });
    }).toThrow(SocksClientError);
  });

  it('should throw an exception when given a invalid destination port', () => {
    expect(() => {
      validateSocksClientOptions({
        proxy: socksProxyValid,
        command: socksCommandValid,
        destination: socksremoteHostInvalidPort,
      });
    }).toThrow(SocksClientError);
  });

  it('should throw an exception when given an invalid timeout', () => {
    expect(() => {
      validateSocksClientOptions({
        proxy: socksProxyValid,
        command: socksCommandValid,
        destination: socksRemoteHostValid,
        timeout: -1,
      });
    }).toThrow(SocksClientError);
  });

  it('should throw an exception when given an invalid existing_socket', () => {
    expect(() => {
      validateSocksClientOptions({
        proxy: socksProxyValid,
        command: socksCommandValid,
        destination: socksRemoteHostValid,
        existing_socket: socketInvalid,
      });
    }).toThrow(SocksClientError);
  });

  it('should throw an exception when given a custom_auth_method with an invalid value', () => {
    expect(() => {
      validateSocksClientOptions({
        proxy: socksProxyInvalidCustomAuthMethod,
        command: socksCommandValid,
        destination: socksRemoteHostValid,
      });
    }).toThrow();
  });

  it('should throw an exception when custom_auth_method is present but not all the custom auth options are set', () => {
    expect(() => {
      validateSocksClientOptions({
        proxy: socksProxyCustomAuthMissingOptions,
        command: socksCommandValid,
        destination: socksRemoteHostValid,
      });
    }).toThrow();
  });

  it('should not throw an exception when all custom auth methods are set', () => {
    expect(() => {
      validateSocksClientOptions({
        proxy: socksProxyCustomAuthValidOptions,
        command: socksCommandValid,
        destination: socksRemoteHostValid,
      });
    }).not.toThrow();
  });

  it('should not throw an exception when given valid options (chaining)', () => {
    expect(() => {
      validateSocksClientChainOptions({
        command: socksCommandValid,
        destination: socksRemoteHostValid,
        timeout: 10000,
        proxies: socksProxiesValid,
      });
    }).not.toThrow();
  });

  it('should throw an exception when given invalid socks proxies (length)', () => {
    expect(() => {
      validateSocksClientChainOptions({
        command: socksCommandValid,
        destination: socksRemoteHostValid,
        timeout: 10000,
        proxies: socksProxiesInvalidLength,
      });
    }).toThrow(SocksClientError);
  });

  it('should throw an exception when given invalid socks proxies (invalid socks proxy mixed in)', () => {
    expect(() => {
      validateSocksClientChainOptions({
        command: socksCommandValid,
        destination: socksRemoteHostValid,
        timeout: 10000,
        proxies: socksProxiesInvalidMixed,
      });
    }).toThrow(SocksClientError);
  });

  it('should throw an exception when given invalid socks proxies (invalid)', () => {
    expect(() => {
      validateSocksClientChainOptions({
        command: socksCommandValid,
        destination: socksRemoteHostValid,
        timeout: 10000,
        proxies: socksProxiesInvalid,
      });
    }).toThrow(SocksClientError);
  });

  it('should throw an exception when given invalid socks command (non connect)', () => {
    expect(() => {
      validateSocksClientChainOptions({
        command: socksCommandInvalid,
        destination: socksRemoteHostValid,
        timeout: 10000,
        proxies: socksProxiesValid,
      });
    }).toThrow(SocksClientError);
  });

  it('should throw an exception when given invalid timeout value', () => {
    expect(() => {
      validateSocksClientChainOptions({
        command: socksCommandValid,
        destination: socksRemoteHostValid,
        timeout: -1000,
        proxies: socksProxiesValid,
      });
    }).toThrow(SocksClientError);
  });

  it('should throw an exception when given invalid socks destination', () => {
    expect(() => {
      validateSocksClientChainOptions({
        command: socksCommandValid,
        destination: socksRemoteHostInvalidHost,
        timeout: 10000,
        proxies: socksProxiesValid,
      });
    }).toThrow(SocksClientError);
  });
});

describe('Null byte injection prevention', () => {
  it('should reject a destination host containing a null byte', () => {
    expect(() => {
      validateSocksClientOptions({
        proxy: {host: '1.2.3.4', port: 1080, type: 5},
        command: 'connect',
        destination: {host: 'evil.com\x00.good.com', port: 80},
      });
    }).toThrow(SocksClientError);
  });

  it('should reject a destination host that is only a null byte', () => {
    expect(() => {
      validateSocksClientOptions({
        proxy: {host: '1.2.3.4', port: 1080, type: 5},
        command: 'connect',
        destination: {host: '\x00', port: 80},
      });
    }).toThrow(SocksClientError);
  });

  it('should reject a proxy host containing a null byte', () => {
    expect(() => {
      validateSocksClientOptions({
        proxy: {host: 'proxy\x00.evil.com', port: 1080, type: 5},
        command: 'connect',
        destination: {host: '1.2.3.4', port: 80},
      });
    }).toThrow(SocksClientError);
  });

  it('should reject a proxy ipaddress containing a null byte', () => {
    expect(() => {
      validateSocksClientOptions({
        proxy: {ipaddress: '1.2.3.4\x00evil', port: 1080, type: 5},
        command: 'connect',
        destination: {host: '1.2.3.4', port: 80},
      });
    }).toThrow(SocksClientError);
  });

  it('should accept valid hostnames without null bytes', () => {
    expect(() => {
      validateSocksClientOptions({
        proxy: {host: 'proxy.example.com', port: 1080, type: 5},
        command: 'connect',
        destination: {host: 'example.com', port: 80},
      });
    }).not.toThrow();
  });
});

describe('Validating SOCKS4 IPv6 rejection', () => {
  it('should throw an exception when using SOCKS4 with an IPv6 destination', () => {
    expect(() => {
      validateSocksClientOptions({
        proxy: {
          ipaddress: '1.2.3.4',
          port: 1080,
          type: 4,
        },
        command: 'connect',
        destination: {
          host: '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
          port: 80,
        },
      });
    }).toThrow(SocksClientError);
  });

  it('should not throw when using SOCKS5 with an IPv6 destination', () => {
    expect(() => {
      validateSocksClientOptions({
        proxy: {
          ipaddress: '1.2.3.4',
          port: 1080,
          type: 5,
        },
        command: 'connect',
        destination: {
          host: '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
          port: 80,
        },
      });
    }).not.toThrow();
  });
});

describe('Validating SOCKS4 associate rejection', () => {
  it('should throw when using associate command with SOCKS4 proxy', () => {
    expect(() => {
      validateSocksClientOptions({
        proxy: {
          ipaddress: '1.2.3.4',
          port: 1080,
          type: 4,
        },
        command: 'associate',
        destination: {
          host: '1.2.3.4',
          port: 80,
        },
      });
    }).toThrow(SocksClientError);
  });

  it('should have error code ERR_SOCKS4_ASSOCIATE_NOT_SUPPORTED', () => {
    try {
      validateSocksClientOptions({
        proxy: {
          ipaddress: '1.2.3.4',
          port: 1080,
          type: 4,
        },
        command: 'associate',
        destination: {
          host: '1.2.3.4',
          port: 80,
        },
      });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(SocksClientError);
      expect((err as SocksClientError).code).toBe(
        SocksErrorCode.InvalidSocks4CommandAssociate,
      );
    }
  });

  it('should allow associate command with SOCKS5 proxy', () => {
    expect(() => {
      validateSocksClientOptions({
        proxy: {
          ipaddress: '1.2.3.4',
          port: 1080,
          type: 5,
        },
        command: 'associate',
        destination: {
          host: '1.2.3.4',
          port: 80,
        },
      });
    }).not.toThrow();
  });

  it('should allow bind command with SOCKS4 proxy', () => {
    expect(() => {
      validateSocksClientOptions({
        proxy: {
          ipaddress: '1.2.3.4',
          port: 1080,
          type: 4,
        },
        command: 'bind',
        destination: {
          host: '1.2.3.4',
          port: 80,
        },
      });
    }).not.toThrow();
  });
});

describe('Validation error codes', () => {
  const validDest = {host: '1.2.3.4', port: 80};
  const validProxy: SocksProxy = {ipaddress: '1.2.3.4', port: 1080, type: 5};

  function getValidationError(fn: () => void): SocksClientError {
    try {
      fn();
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(SocksClientError);
      return err as SocksClientError;
    }
  }

  it('should set ERR_SOCKS_INVALID_COMMAND for invalid command', () => {
    const err = getValidationError(() =>
      validateSocksClientOptions({
        proxy: validProxy,
        command: 'fake' as any,
        destination: validDest,
      }),
    );
    expect(err.code).toBe(SocksErrorCode.InvalidSocksCommand);
  });

  it('should set ERR_SOCKS_INVALID_COMMAND_FOR_OPERATION for disallowed command', () => {
    const err = getValidationError(() =>
      validateSocksClientOptions(
        {proxy: validProxy, command: 'bind', destination: validDest},
        ['connect'],
      ),
    );
    expect(err.code).toBe(SocksErrorCode.InvalidSocksCommandForOperation);
  });

  it('should set ERR_SOCKS_INVALID_DESTINATION for bad destination', () => {
    const err = getValidationError(() =>
      validateSocksClientOptions({
        proxy: validProxy,
        command: 'connect',
        destination: {host: undefined, port: 80} as any,
      }),
    );
    expect(err.code).toBe(SocksErrorCode.InvalidSocksClientOptionsDestination);
  });

  it('should set ERR_SOCKS_INVALID_PROXY for bad proxy', () => {
    const err = getValidationError(() =>
      validateSocksClientOptions({
        proxy: {ipaddress: undefined, port: 1080, type: 5},
        command: 'connect',
        destination: validDest,
      }),
    );
    expect(err.code).toBe(SocksErrorCode.InvalidSocksClientOptionsProxy);
  });

  it('should set ERR_SOCKS4_IPV6_NOT_SUPPORTED for SOCKS4 + IPv6', () => {
    const err = getValidationError(() =>
      validateSocksClientOptions({
        proxy: {ipaddress: '1.2.3.4', port: 1080, type: 4},
        command: 'connect',
        destination: {host: '::1', port: 80},
      }),
    );
    expect(err.code).toBe(SocksErrorCode.InvalidSocks4DestinationIPv6);
  });

  it('should set ERR_SOCKS_INVALID_TIMEOUT for bad timeout', () => {
    const err = getValidationError(() =>
      validateSocksClientOptions({
        proxy: validProxy,
        command: 'connect',
        destination: validDest,
        timeout: -1,
      }),
    );
    expect(err.code).toBe(SocksErrorCode.InvalidSocksClientOptionsTimeout);
  });

  it('should set ERR_SOCKS_INVALID_EXISTING_SOCKET for bad socket', () => {
    const err = getValidationError(() =>
      validateSocksClientOptions({
        proxy: validProxy,
        command: 'connect',
        destination: validDest,
        existing_socket: 'not a socket' as any,
      }),
    );
    expect(err.code).toBe(
      SocksErrorCode.InvalidSocksClientOptionsExistingSocket,
    );
  });

  it('should set ERR_SOCKS_INVALID_CUSTOM_AUTH_RANGE for out-of-range custom auth', () => {
    const err = getValidationError(() =>
      validateSocksClientOptions({
        proxy: {...validProxy, custom_auth_method: 0x10},
        command: 'connect',
        destination: validDest,
      }),
    );
    expect(err.code).toBe(
      SocksErrorCode.InvalidSocksClientOptionsCustomAuthRange,
    );
  });

  it('should set ERR_SOCKS_INVALID_CUSTOM_AUTH_OPTIONS for missing custom auth handlers', () => {
    const err = getValidationError(() =>
      validateSocksClientOptions({
        proxy: {...validProxy, custom_auth_method: 0x80},
        command: 'connect',
        destination: validDest,
      }),
    );
    expect(err.code).toBe(
      SocksErrorCode.InvalidSocksClientOptionsCustomAuthOptions,
    );
  });

  it('should set ERR_SOCKS_INVALID_COMMAND_CHAIN for non-connect chain command', () => {
    const err = getValidationError(() =>
      validateSocksClientChainOptions({
        command: 'bind' as any,
        destination: validDest,
        proxies: [validProxy, validProxy],
      }),
    );
    expect(err.code).toBe(SocksErrorCode.InvalidSocksCommandChain);
  });

  it('should set ERR_SOCKS_INVALID_PROXIES_LENGTH for empty proxies', () => {
    const err = getValidationError(() =>
      validateSocksClientChainOptions({
        command: 'connect',
        destination: validDest,
        proxies: [],
      }),
    );
    expect(err.code).toBe(
      SocksErrorCode.InvalidSocksClientOptionsProxiesLength,
    );
  });

  it('should accept a single proxy in chain', () => {
    expect(() =>
      validateSocksClientChainOptions({
        command: 'connect',
        destination: validDest,
        proxies: [validProxy],
      }),
    ).not.toThrow();
  });
});

describe('Fractional port rejection', () => {
  it('should reject a fractional destination port', () => {
    expect(() => {
      validateSocksClientOptions({
        proxy: {ipaddress: '1.2.3.4', port: 1080, type: 5},
        command: 'connect',
        destination: {host: '1.2.3.4', port: 80.5},
      });
    }).toThrow(SocksClientError);
  });

  it('should reject a fractional proxy port', () => {
    expect(() => {
      validateSocksClientOptions({
        proxy: {ipaddress: '1.2.3.4', port: 1080.5, type: 5},
        command: 'connect',
        destination: {host: '1.2.3.4', port: 80},
      });
    }).toThrow(SocksClientError);
  });
});

describe('custom_auth_response_size validation', () => {
  const validDest = {host: '1.2.3.4', port: 80};

  const makeCustomAuthProxy = (responseSize: number): any => ({
    host: 'proxy.example.com',
    port: 1080,
    type: 5,
    custom_auth_method: 0x80,
    custom_auth_request_handler: async () => Buffer.from([1, 2, 3]),
    custom_auth_response_size: responseSize,
    custom_auth_response_handler: async (data: Buffer) => data[1] === 0x01,
  });

  it('should reject custom_auth_response_size of 0', () => {
    expect(() => {
      validateSocksClientOptions({
        proxy: makeCustomAuthProxy(0),
        command: 'connect',
        destination: validDest,
      });
    }).toThrow(SocksClientError);
  });

  it('should reject custom_auth_response_size of -1', () => {
    expect(() => {
      validateSocksClientOptions({
        proxy: makeCustomAuthProxy(-1),
        command: 'connect',
        destination: validDest,
      });
    }).toThrow(SocksClientError);
  });

  it('should reject custom_auth_response_size of 2.5 (fractional)', () => {
    expect(() => {
      validateSocksClientOptions({
        proxy: makeCustomAuthProxy(2.5),
        command: 'connect',
        destination: validDest,
      });
    }).toThrow(SocksClientError);
  });

  it('should accept custom_auth_response_size of 2 (valid positive integer)', () => {
    expect(() => {
      validateSocksClientOptions({
        proxy: makeCustomAuthProxy(2),
        command: 'connect',
        destination: validDest,
      });
    }).not.toThrow();
  });
});

describe('SocksClient', () => {
  describe('createConnection', () => {
    it('should reject promise when options validation fails', async () => {
      await expect(
        SocksClient.createConnection({
          destination: {
            host: '1.2.3.4',
            port: 1234,
          },
          proxy: {
            host: '1.2.3.4',
            port: 1080,
            type: 4,
          },
          command: 'fake' as any,
        }),
      ).rejects.toThrow(SocksClientError);
    });

  });

  describe('createConnectionChain', () => {
    it('should reject promise when options validation fails', async () => {
      await expect(
        SocksClient.createConnectionChain({
          destination: {
            host: '1.2.3.4',
            port: 1234,
          },
          proxies: [
            {
              host: '1.2.3.4',
              port: 1080,
              type: 4,
            },
            {
              host: '2.3.4.5',
              port: 1080,
              type: 4,
            },
          ],
          command: 'fake' as any,
        }),
      ).rejects.toThrow(SocksClientError);
    });

  });
});
