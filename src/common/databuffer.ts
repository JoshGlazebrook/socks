/**
 * Utility class for buffering data received via a net.Socket.
 */
class DataBuffer {
  private _buff: Buffer;
  private _dataLength: number;
  private _maxSize: number;

  public static DEFAULT_SIZE = 4096;

  /**
   * Creates a new DataBuffer
   * @param size { Number } The initial size to use for the internal Buffer.
   * @param maxSize { Number } The maximum size the internal Buffer can expand to.
   */
  constructor(size: number = DataBuffer.DEFAULT_SIZE, maxSize?: number) {
    this._buff = Buffer.allocUnsafe(size);
    this._dataLength = 0;
    this._maxSize = maxSize || size;
  }

  /**
   * Gets the amount of data in the DataBuffer.
   */
  get length() {
    return this._dataLength;
  }

  /**
   * Gets the internal Buffer size.
   */
  get internalSize() {
    return this._buff.length;
  }

  /**
   * Gets the maximum internal Buffer size.
   */
  get internalMaxSize() {
    return this._maxSize;
  }

  /**
   * Appends data into the DataBuffer.
   * @param data The data to append.
   */
  append(data: Buffer): number {
    // If new data can't fit in internal buffer, check if we can expand it.
    if (this._dataLength + data.length > this._buff.length) {
      // If the internal buffer can't be expanded, throw an error.
      if (this._dataLength + data.length > this._maxSize) {
        throw new Error('DataBuffer is unable to hold this data.');
      } else {
        // Create new internal buffer, copy existing data.
        const newSize = Math.max(
          this._buff.length * 2,
          this._dataLength + data.length
        );
        const newBuff = Buffer.allocUnsafe(newSize);
        this._buff.copy(newBuff, 0, this._dataLength);
        this._buff = newBuff;
      }
    }

    // Append new data to internal buffer.
    data.copy(this._buff, this._dataLength);

    // Rreturn new internal buffer length.
    return (this._dataLength += data.length);
  }

  /**
   * Peeks at the internal Buffer data.
   * @param length { Number } The number of bytes to peek.
   */
  peek(length: number): Buffer {
    if (length > this._dataLength) {
      throw new Error(
        'Attempted to read beyond the data currently inside the DataBuffer.'
      );
    }

    return this._buff.slice(0, length);
  }

  /**
   * Gets the next n internal Buffer data.
   * @param length { Number } The number of bytes to read.
   */
  get(length: number): Buffer {
    if (length > this._dataLength) {
      throw new Error(
        'Attempted to read beyond the data currently inside the DataBuffer.'
      );
    }

    // Allocate new Buffer and copy requested contents into it.
    const data = Buffer.allocUnsafe(length);
    this._buff.copy(data, 0, 0, length);

    // Shift remaining data to the left.
    this._buff = this._buff.copyWithin(0, length, this._dataLength);
    this._dataLength = this._dataLength - length;

    return data;
  }

  /**
   * Resets the DataBuffer.
   */
  clear() {
    this._dataLength = 0;
  }
}

export { DataBuffer };
