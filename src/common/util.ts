import { SocksClientOptions, SocksClientChainOptions } from './constants';

/**
 * Error wrapper for SocksClient
 */
class SocksClientError extends Error {
  constructor(
    message: string,
    public options: SocksClientOptions | SocksClientChainOptions
  ) {
    super(message);
  }
}

/**
 * Shuffles a given array.
 * @param array The array to shuffle.
 */
function shuffleArray(array: any[]) {
  for (let i = array.length - 1; i > 0; i--) {
    let j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

export { SocksClientError, shuffleArray };
