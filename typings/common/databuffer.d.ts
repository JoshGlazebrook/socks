/// <reference types="node" />
declare class DataBuffer {
    private _buff;
    private _dataLength;
    private _maxSize;
    static DEFAULT_SIZE: number;
    constructor(size?: number, maxSize?: number);
    readonly length: number;
    readonly internalSize: number;
    readonly internalMaxSize: number;
    append(data: Buffer): number;
    peek(length: number): Buffer;
    get(length: number): Buffer;
    clear(): void;
}
export { DataBuffer };
