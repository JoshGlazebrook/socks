/// <reference types="node" />
/**
 * Utility class for buffering data received via a net.Socket.
 */
declare class DataBuffer {
    private _buff;
    private _dataLength;
    private _maxSize;
    static DEFAULT_SIZE: number;
    /**
     * Creates a new DataBuffer
     * @param size { Number } The initial size to use for the internal Buffer.
     * @param maxSize { Number } The maximum size the internal Buffer can expand to.
     */
    constructor(size?: number, maxSize?: number);
    /**
     * Gets the amount of data in the DataBuffer.
     */
    readonly length: number;
    /**
     * Gets the internal Buffer size.
     */
    readonly internalSize: number;
    /**
     * Gets the maximum internal Buffer size.
     */
    readonly internalMaxSize: number;
    /**
     * Appends data into the DataBuffer.
     * @param data The data to append.
     */
    append(data: Buffer): number;
    /**
     * Peeks at the internal Buffer data.
     * @param length { Number } The number of bytes to peek.
     */
    peek(length: number): Buffer;
    /**
     * Gets the next n internal Buffer data.
     * @param length { Number } The number of bytes to read.
     */
    get(length: number): Buffer;
    /**
     * Resets the DataBuffer.
     */
    clear(): void;
}
export { DataBuffer };
