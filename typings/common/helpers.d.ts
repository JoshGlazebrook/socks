import { SocksClientOptions, SocksClientChainOptions } from '../client/socksclient';
/**
 * Validates the provided SocksClientOptions
 * @param options { SocksClientOptions }
 */
declare function validateSocksClientOptions(options: SocksClientOptions): void;
/**
 * Validates the SocksClientChainOptions
 * @param options { SocksClientChainOptions }
 */
declare function validateSocksClientChainOptions(options: SocksClientChainOptions): void;
export { validateSocksClientOptions, validateSocksClientChainOptions };
