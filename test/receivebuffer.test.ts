import {assert} from 'chai';
import 'mocha';
import {ReceiveBuffer} from '../src/common/receivebuffer';

describe('Creating ReceiveBuffers', () => {
  it('should default to 4096 internal buffer size', () => {
    const buff: any = new ReceiveBuffer();
    assert.strictEqual(buff.buffer.length, 4096);
    assert.strictEqual(buff.originalSize, 4096);
  });

  it('should create an internal buffer with the specificed size', () => {
    const size = 1024;
    const buff: any = new ReceiveBuffer(size);
    assert.strictEqual(buff.buffer.length, size);
    assert.strictEqual(buff.originalSize, size);
  });

  it('should have an internal offset of zero after creation', () => {
    const buff = new ReceiveBuffer();
    assert.strictEqual(buff.length, 0);
  });
});

describe('Using ReceiveBuffers', () => {
  it('should throw an error if attempting to call peek on an empty instance', () => {
    const buff = new ReceiveBuffer();
    assert.throws(() => {
      buff.peek(10);
    });
  });

  it('should throw an error if attempting to call get on an empty instance', () => {
    const buff = new ReceiveBuffer();
    assert.throws(() => {
      buff.get(10);
    });
  });

  it('should append the correct data to the internal buffer', () => {
    const buff: any = new ReceiveBuffer();
    const data = Buffer.from('hello');
    buff.append(data);

    assert.deepEqual(buff.buffer.slice(0, data.length), data);
  });

  it('should peek internal buffer data and not remove it', () => {
    const buff: any = new ReceiveBuffer();
    const data = Buffer.from('hello');
    buff.append(data);

    assert.deepEqual(buff.peek(data.length), data);
    assert.deepEqual(buff.buffer.slice(0, data.length), data);
  });

  it('should get internal buffer data and remove it properly', () => {
    const buff = new ReceiveBuffer();
    const data = Buffer.from('hello');
    buff.append(data);

    assert.strictEqual(buff.length, data.length);
    const readData = buff.get(data.length);
    assert.deepEqual(readData, data);
    assert.strictEqual(buff.length, 0);
  });

  it('should grow in size if the buffer is full and we are trying to write more data', () => {
    const buff: any = new ReceiveBuffer(10);
    const longData = Buffer.from('heeeeeeeeellllllllllooooooooooo');
    assert(buff.buffer.length < longData.length);
    buff.append(longData);
    assert(buff.buffer.length >= longData.length);

    const readData = buff.get(longData.length);
    assert.deepEqual(readData, longData);
  });

  it('should throw an error if attemping to append something that is not a Buffer', () => {
    const buff = new ReceiveBuffer();
    const notABuffer: any = 'kjsfkjhdsfkjsdhfd';

    assert.throws(() => {
      buff.append(notABuffer);
    });
  });
});
