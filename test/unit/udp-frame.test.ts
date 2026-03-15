import {describe, it, expect} from 'vitest';
import {SocksClient} from '../../src/client/socksclient';

describe('Creating and parsing Socks UDP frames', () => {
  const packetData = Buffer.from([10, 12, 14, 16, 18, 20]);
  // prettier-ignore
  const validIPv4Frame = Buffer.from([0x0, 0x0, 0x0, 0x1, 0x1, 0x2, 0x3, 0x4, 0x0, 0x50, 0xa, 0xc, 0xe, 0x10, 0x12, 0x14]);
  // prettier-ignore
  const validIPv6Frame = Buffer.from([0x0, 0x0, 0x4, 0x4, 0x20, 0x1, 0xd, 0xb8, 0x85, 0xa3, 0x12, 0x34, 0x8a, 0x2e, 0x3,
                                      0x70, 0x73, 0x34, 0x18, 0x40, 0x0, 0x50, 0xa, 0xc, 0xe, 0x10, 0x12, 0x14]);
  // prettier-ignore
  const validHostnameFrame = Buffer.from([0x0, 0x0, 0x0, 0x3, 0xe, 0x77, 0x77, 0x77, 0x2e, 0x67, 0x6f, 0x6f, 0x67, 0x6c,
                                          0x65, 0x2e, 0x63, 0x6f, 0x6d, 0x0, 0x50, 0xa, 0xc, 0xe, 0x10, 0x12, 0x14]);

  const ipv4HostInfo = {
    host: '1.2.3.4',
    port: 80,
  };

  const ipv6HostInfo = {
    host: '2001:0db8:85a3:1234:8a2e:0370:7334:1840',
    port: 80,
  };

  const hostHostInfo = {
    host: 'www.google.com',
    port: 80,
  };

  const ipv4UDPFrame = SocksClient.createUDPFrame({
    remoteHost: ipv4HostInfo,
    data: packetData,
  });
  const ipv6UDPFrame = SocksClient.createUDPFrame({
    remoteHost: ipv6HostInfo,
    data: packetData,
    frameNumber: 4,
  });
  const hostnameUDPFrame = SocksClient.createUDPFrame({
    remoteHost: hostHostInfo,
    data: packetData,
  });

  it('should generate valid UDP frames', () => {
    expect(ipv4UDPFrame).toStrictEqual(validIPv4Frame);
    expect(ipv6UDPFrame).toStrictEqual(validIPv6Frame);
    expect(hostnameUDPFrame).toStrictEqual(validHostnameFrame);
  });

  it('should parse generated UDP frames back to input values', () => {
    const parsedIPv4UDPFrame = SocksClient.parseUDPFrame(ipv4UDPFrame);
    const parsedIPv6UDPFrame = SocksClient.parseUDPFrame(ipv6UDPFrame);
    const parsedHostnameUDPFrame = SocksClient.parseUDPFrame(hostnameUDPFrame);

    // IPv4
    expect(parsedIPv4UDPFrame.remoteHost).toStrictEqual(ipv4HostInfo);
    expect(parsedIPv4UDPFrame.frameNumber).toBe(0);
    expect(parsedIPv4UDPFrame.data).toStrictEqual(packetData);

    // IPv6
    expect(parsedIPv6UDPFrame.remoteHost).toStrictEqual(ipv6HostInfo);
    expect(parsedIPv6UDPFrame.frameNumber).toBe(4);
    expect(parsedIPv6UDPFrame.data).toStrictEqual(packetData);

    // Hostname
    expect(parsedHostnameUDPFrame.remoteHost).toStrictEqual(hostHostInfo);
    expect(parsedHostnameUDPFrame.frameNumber).toBe(0);
    expect(parsedHostnameUDPFrame.data).toStrictEqual(packetData);
  });

  it('should throw when parseUDPFrame receives a buffer shorter than 10 bytes', () => {
    const tooShort = Buffer.from([0x0, 0x0, 0x0, 0x1, 0x1, 0x2, 0x3, 0x4, 0x0]);
    expect(() => SocksClient.parseUDPFrame(tooShort)).toThrow(
      'UDP frame is too short to contain a valid header (minimum 10 bytes).',
    );
  });

  it('should throw when createUDPFrame receives a hostname longer than 255 bytes', () => {
    const longHostname = 'a'.repeat(256);
    expect(() =>
      SocksClient.createUDPFrame({
        remoteHost: {host: longHostname, port: 80},
        data: packetData,
      }),
    ).toThrow('Hostname is too long for a UDP frame (max 255 bytes).');
  });

  it('should parse a UDP frame with an IPv6 address correctly', () => {
    const parsed = SocksClient.parseUDPFrame(validIPv6Frame);
    expect(parsed.remoteHost.host).toBe(ipv6HostInfo.host);
    expect(parsed.remoteHost.port).toBe(ipv6HostInfo.port);
    expect(parsed.data).toStrictEqual(packetData);
  });

  it('should throw when parseUDPFrame encounters an unsupported address type', () => {
    // Build a frame with address type 0x02 (invalid)
    // prettier-ignore
    const invalidFrame = Buffer.from([
      0x00, 0x00,       // RSV
      0x00,             // FRAG
      0x02,             // Invalid address type
      0x01, 0x02, 0x03, 0x04, // Some data
      0x00, 0x50,       // Port
    ]);
    expect(() => SocksClient.parseUDPFrame(invalidFrame)).toThrow(
      'Unsupported address type in UDP frame: 0x02',
    );
  });

  it('should throw when parseUDPFrame receives an IPv6 frame shorter than 22 bytes', () => {
    // Build a frame with IPv6 address type but only 15 bytes of data (needs 22)
    // prettier-ignore
    const tooShortIPv6 = Buffer.from([
      0x00, 0x00,       // RSV
      0x00,             // FRAG
      0x04,             // ATYP = IPv6
      0x20, 0x01, 0x0d, 0xb8, 0x85, 0xa3, // Truncated IPv6
    ]);
    expect(() => SocksClient.parseUDPFrame(tooShortIPv6)).toThrow(
      'UDP frame is too short for an IPv6 address (minimum 22 bytes).',
    );
  });

  it('should throw when parseUDPFrame receives a hostname frame shorter than needed', () => {
    // Frame has hostname type with length=14 but only contains 4 hostname bytes + 2 port = 11 total
    // Needs 7 + 14 = 21 bytes total, only has 11
    // prettier-ignore
    const tooShortHostname = Buffer.from([
      0x00, 0x00,             // RSV
      0x00,                   // FRAG
      0x03,                   // ATYP = Hostname
      0x0e,                   // hostname length = 14
      0x77, 0x77, 0x77, 0x77, // Only 4 bytes of hostname (need 14 + 2 port)
      0x00, 0x50,             // Port (but hostname is incomplete)
    ]);
    expect(() => SocksClient.parseUDPFrame(tooShortHostname)).toThrow(
      /UDP frame is too short for the specified hostname length/,
    );
  });

  it('should return the correct frameNumber for non-zero FRAG values', () => {
    // Create a frame with frameNumber=7
    const frame = SocksClient.createUDPFrame({
      remoteHost: ipv4HostInfo,
      data: packetData,
      frameNumber: 7,
    });
    const parsed = SocksClient.parseUDPFrame(frame);
    expect(parsed.frameNumber).toBe(7);
  });
});
