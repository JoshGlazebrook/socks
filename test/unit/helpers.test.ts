import {describe, it, expect} from 'vitest';
import {shuffleArray} from '../../src/common/util';
import {ipv4ToInt32, int32ToIpv4, ipToBuffer} from '../../src/common/helpers';
import {Address4, Address6} from 'ip-address';
import {ReceiveBuffer} from '../../src/common/receivebuffer';

describe('utils', () => {
  it('should shuffle an array', () => {
    const arr = [1, 2, 3, 4, 5, 6];
    const arrCopy = [...arr];

    shuffleArray(arrCopy);

    expect(arrCopy.sort()).toStrictEqual(arr);
  });

  it('should convert between int32 and ipv4 string', () => {
    const ipAddr = '1.2.3.4';
    const ipLong = ipv4ToInt32(ipAddr);
    expect(int32ToIpv4(ipLong)).toBe(ipAddr);
  });

  it('converts a valid IPv4 address to a Buffer correctly', () => {
    const ip = '192.168.1.1';
    const expectedBuffer = Buffer.from(new Address4(ip).toArray());
    expect(ipToBuffer(ip)).toStrictEqual(expectedBuffer);
  });

  it('converts a valid IPv6 address to a Buffer correctly', () => {
    const ip = '2001:0db8:85a3:0000:0000:8a2e:0370:7334';
    const expectedBuffer = Buffer.from(new Address6(ip).toByteArray());
    expect(ipToBuffer(ip)).toStrictEqual(expectedBuffer);
  });

  it('throws on invalid IP address', () => {
    expect(() => ipToBuffer('not-an-ip')).toThrow('Invalid IP address format');
  });
});

describe('ReceiveBuffer', () => {
  it('should default to 4096 internal buffer size', () => {
    const buff: any = new ReceiveBuffer();
    expect(buff.buffer.length).toBe(4096);
    expect(buff.originalSize).toBe(4096);
  });

  it('should create an internal buffer with the specified size', () => {
    const size = 1024;
    const buff: any = new ReceiveBuffer(size);
    expect(buff.buffer.length).toBe(size);
    expect(buff.originalSize).toBe(size);
  });

  it('should have an internal offset of zero after creation', () => {
    const buff = new ReceiveBuffer();
    expect(buff.length).toBe(0);
  });

  it('should throw an error if attempting to call peek on an empty instance', () => {
    const buff = new ReceiveBuffer();
    expect(() => buff.peek(10)).toThrow();
  });

  it('should throw an error if attempting to call get on an empty instance', () => {
    const buff = new ReceiveBuffer();
    expect(() => buff.get(10)).toThrow();
  });

  it('should append the correct data to the internal buffer', () => {
    const buff: any = new ReceiveBuffer();
    const data = Buffer.from('hello');
    buff.append(data);

    expect(buff.buffer.slice(0, data.length)).toStrictEqual(data);
  });

  it('should peek internal buffer data and not remove it', () => {
    const buff: any = new ReceiveBuffer();
    const data = Buffer.from('hello');
    buff.append(data);

    expect(buff.peek(data.length)).toStrictEqual(data);
    expect(buff.buffer.slice(0, data.length)).toStrictEqual(data);
  });

  it('should get internal buffer data and remove it properly', () => {
    const buff = new ReceiveBuffer();
    const data = Buffer.from('hello');
    buff.append(data);

    expect(buff.length).toBe(data.length);
    const readData = buff.get(data.length);
    expect(readData).toStrictEqual(data);
    expect(buff.length).toBe(0);
  });

  it('should grow in size if the buffer is full and we are trying to write more data', () => {
    const buff: any = new ReceiveBuffer(10);
    const longData = Buffer.from('heeeeeeeeellllllllllooooooooooo');
    expect(buff.buffer.length).toBeLessThan(longData.length);
    buff.append(longData);
    expect(buff.buffer.length).toBeGreaterThanOrEqual(longData.length);

    const readData = buff.get(longData.length);
    expect(readData).toStrictEqual(longData);
  });

  it('should throw an error if attempting to append something that is not a Buffer', () => {
    const buff = new ReceiveBuffer();
    const notABuffer: any = 'kjsfkjhdsfkjsdhfd';

    expect(() => buff.append(notABuffer)).toThrow();
  });

  it('should not grow when appending data that fits exactly at buffer boundary', () => {
    const size = 10;
    const buff: any = new ReceiveBuffer(size);
    const exactFit = Buffer.from('0123456789'); // exactly 10 bytes
    expect(exactFit.length).toBe(size);

    buff.append(exactFit);

    // Buffer should NOT have grown since the data fits exactly
    expect(buff.buffer.length).toBe(size);
    expect(buff.length).toBe(size);

    const readData = buff.get(size);
    expect(readData).toStrictEqual(exactFit);
  });

  it('should correctly shift remaining data with get() using copyWithin', () => {
    const buff = new ReceiveBuffer(32);
    const part1 = Buffer.from('hello');
    const part2 = Buffer.from('world');
    buff.append(part1);
    buff.append(part2);

    expect(buff.length).toBe(10);

    // Read the first part
    const result1 = buff.get(5);
    expect(result1).toStrictEqual(part1);
    expect(buff.length).toBe(5);

    // The remaining data should be 'world'
    const result2 = buff.get(5);
    expect(result2).toStrictEqual(part2);
    expect(buff.length).toBe(0);
  });

  it('should correctly handle multiple get() calls shifting data via copyWithin', () => {
    const buff = new ReceiveBuffer(32);
    buff.append(Buffer.from('AABBCCDD'));

    // Read 2 bytes at a time
    expect(buff.get(2)).toStrictEqual(Buffer.from('AA'));
    expect(buff.length).toBe(6);
    expect(buff.get(2)).toStrictEqual(Buffer.from('BB'));
    expect(buff.length).toBe(4);
    expect(buff.get(2)).toStrictEqual(Buffer.from('CC'));
    expect(buff.length).toBe(2);
    expect(buff.get(2)).toStrictEqual(Buffer.from('DD'));
    expect(buff.length).toBe(0);
  });

  it('should throw when appending data that exceeds the maximum buffer size', () => {
    const buff = new ReceiveBuffer(1024);
    // Append up to near the max
    const largeChunk = Buffer.alloc(60000);
    buff.append(largeChunk);

    // This should push it over the 65536 limit
    const overflow = Buffer.alloc(6000);
    expect(() => buff.append(overflow)).toThrow(
      'Receive buffer would exceed maximum size of 65536 bytes.',
    );
  });

  it('should accept Uint8Array via append', () => {
    const buff = new ReceiveBuffer();
    const data = new Uint8Array([1, 2, 3]);
    buff.append(data);

    expect(buff.length).toBe(3);
  });

  it('should read back Uint8Array data correctly with get()', () => {
    const buff = new ReceiveBuffer();
    const data = new Uint8Array([1, 2, 3]);
    buff.append(data);

    const result = buff.get(3);
    expect(result).toStrictEqual(Buffer.from([1, 2, 3]));
    expect(buff.length).toBe(0);
  });

  it('should throw when appending a non-Uint8Array value', () => {
    const buff = new ReceiveBuffer();
    const notABuffer: any = 'not a buffer';

    expect(() => buff.append(notABuffer)).toThrow(
      'Attempted to append a non-Uint8Array instance to ReceiveBuffer.',
    );
  });
});
