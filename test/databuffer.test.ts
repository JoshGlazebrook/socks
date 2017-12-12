import { DataBuffer } from '../src/common/databuffer';
import { assert } from 'chai';

describe('DataBuffer constructor', () => {
  const defaultDataBuffer = new DataBuffer();
  const dataBufferFlexible = new DataBuffer(1024, 8192);

  it('should have an internal buffer size of the default size', () => {
    assert.strictEqual(defaultDataBuffer.internalSize, DataBuffer.DEFAULT_SIZE);
  });

  it('should have an internal maxsize that is the same as its initial size.', () => {
    assert.strictEqual(defaultDataBuffer.internalMaxSize, defaultDataBuffer.internalSize);
  })

  it('should have an initial tracked length of zero', () => {
    assert.strictEqual(defaultDataBuffer.length, 0);
  });

  it('should have an internal buffer size of the specified initial size (1024)', () => {
    assert.strictEqual(dataBufferFlexible.internalSize, 1024);
  });

  it('should have an internal max size of the specified max size (8192)', () => {
    assert.strictEqual(dataBufferFlexible.internalMaxSize, 8192);
  });
});

describe('DataBuffer usage with strict size', () => {
  const testBuff1 = Buffer.from('hello');

  it('should append the given buffer to its internal buffer', () => {
    const buffStrict = new DataBuffer(1024);
    buffStrict.append(testBuff1);

    assert.strictEqual(buffStrict.length, testBuff1.length);
  });

  it('should throw and error if attempting to append data that cannot fit in internal buffer.', () => {
    const buffStrict = new DataBuffer(1024);
    const largerBuff = Buffer.allocUnsafe(1025);

    assert.throws(() => {
      buffStrict.append(largerBuff);
    }, Error)
  });

  it('peek should return a slice of the internal buffer and not remove the data itself.', () => {
    const buffStrict = new DataBuffer(1024);
    buffStrict.append(testBuff1);

    assert.strictEqual(buffStrict.length, 5);
    assert.deepEqual(buffStrict.peek(5), testBuff1);
    assert.strictEqual(buffStrict.length, 5);
  });

  it('should throw an error if attempting to peek too much data.', () => {
    const buffStrict = new DataBuffer(1024);
    buffStrict.append(testBuff1);

    assert.throws(() => {
      buffStrict.peek(10);
    }, Error);
  });

  it('should return the data from the internal buffer if it is available.', () => {
    const buffStrict = new DataBuffer(1024);
    const dataSet1 = Buffer.from([1, 2, 3]);
    const dataSet2 = Buffer.from([4, 5]);
    const dataSet3 = Buffer.from([6, 7, 8]);
    buffStrict.append(dataSet1);
    buffStrict.append(dataSet2);

    const data = buffStrict.get(3);
    assert.deepEqual(data, dataSet1);
    assert.strictEqual(buffStrict.length, 2);

    const moreData = buffStrict.get(2);
    assert.deepEqual(moreData, dataSet2);
    assert.strictEqual(buffStrict.length, 0);

    buffStrict.append(dataSet3);
    const evenMoreData = buffStrict.get(3);
    assert.deepEqual(evenMoreData, dataSet3);
    assert.strictEqual(buffStrict.length, 0);
  });

  it('should throw an error if attemping to read too much data.', () => {
    const buffStrict = new DataBuffer(1024);
    buffStrict.append(testBuff1);

    assert.throws(() => {
      buffStrict.get(10);
    }, Error);
  });

  it('should reset the internal tracked data length when clear is called', () => {
    const buffStrict = new DataBuffer(1024);
    buffStrict.append(testBuff1);

    assert.strictEqual(buffStrict.length, testBuff1.length);
    buffStrict.clear();
    assert.strictEqual(buffStrict.length, 0);
  });
});

describe('DataBuffer usage with initial and max size', () => {

  it('should add the given data without expanding the internal buffer size', () => {
    const buffFlexible = new DataBuffer(1024, 8192);
    buffFlexible.append(Buffer.allocUnsafe(1024));
    assert.strictEqual(buffFlexible.internalSize, 1024);
  });

  it('should expand the internal buffer size when adding more data than the initial size can hold', () => {
    const buffFlexible = new DataBuffer(1024, 8192);
    buffFlexible.append(Buffer.allocUnsafe(2100));

    assert.isTrue(buffFlexible.internalSize >= 2100);

    buffFlexible.append(Buffer.allocUnsafe(400));

    assert.isTrue(buffFlexible.length >= 2500);
  });
});
