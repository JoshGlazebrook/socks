// Maximum buffer size (64KB) to prevent unbounded growth from malicious proxies.
const MAX_RECEIVE_BUFFER_SIZE = 65536;

class ReceiveBuffer {
  private buffer: Buffer;
  private offset: number;
  private originalSize: number;

  constructor(size = 4096) {
    this.buffer = Buffer.allocUnsafe(size);
    this.offset = 0;
    this.originalSize = size;
  }

  get length(): number {
    return this.offset;
  }

  append(data: Buffer | Uint8Array): number {
    if (!(data instanceof Uint8Array)) {
      throw new Error(
        'Attempted to append a non-Uint8Array instance to ReceiveBuffer.',
      );
    }

    if (this.offset + data.length > MAX_RECEIVE_BUFFER_SIZE) {
      throw new Error(
        `Receive buffer would exceed maximum size of ${MAX_RECEIVE_BUFFER_SIZE} bytes.`,
      );
    }

    if (this.offset + data.length > this.buffer.length) {
      const tmp = this.buffer;
      this.buffer = Buffer.allocUnsafe(
        Math.min(
          MAX_RECEIVE_BUFFER_SIZE,
          Math.max(
            this.buffer.length + this.originalSize,
            this.buffer.length + data.length,
          ),
        ),
      );
      tmp.copy(this.buffer);
    }

    this.buffer.set(data, this.offset);
    return (this.offset += data.length);
  }

  peek(length: number): Buffer {
    if (length > this.offset) {
      throw new Error(
        'Attempted to read beyond the bounds of the managed internal data.',
      );
    }
    return Buffer.from(this.buffer.subarray(0, length));
  }

  get(length: number): Buffer {
    if (length > this.offset) {
      throw new Error(
        'Attempted to read beyond the bounds of the managed internal data.',
      );
    }

    const value = Buffer.allocUnsafe(length);
    this.buffer.subarray(0, length).copy(value);
    this.buffer.copyWithin(0, length, this.offset);
    this.offset -= length;

    return value;
  }
}

export {ReceiveBuffer};
