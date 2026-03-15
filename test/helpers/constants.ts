import type {SocksRemoteHost, SocksProxy} from '../../src/common/constants';

export const VALID_DESTINATION: SocksRemoteHost = {
  host: '1.2.3.4',
  port: 80,
};

export const VALID_PROXY_V4: SocksProxy = {
  host: '127.0.0.1',
  port: 1080,
  type: 4,
};

export const VALID_PROXY_V5: SocksProxy = {
  host: '127.0.0.1',
  port: 1080,
  type: 5,
};

export const VALID_PROXY_V5_WITH_AUTH: SocksProxy = {
  host: '127.0.0.1',
  port: 1080,
  type: 5,
  userId: 'testuser',
  password: 'testpass',
};
