import { describe, expect, it } from 'vitest';
import { isPublicAddress } from './public-address.js';

describe('isPublicAddress', () => {
  it('refuses every private, local and reserved IPv4 range', () => {
    for (const address of [
      '0.1.2.3',
      '10.0.0.1',
      '100.64.0.1',
      '127.0.0.1',
      '169.254.169.254',
      '172.16.0.1',
      '172.31.255.255',
      '192.0.0.1',
      '192.0.2.1',
      '192.168.1.1',
      '198.18.0.1',
      '198.51.100.1',
      '203.0.113.1',
      '224.0.0.1',
      '240.0.0.1',
      '255.255.255.255',
    ]) {
      expect(isPublicAddress(address), address).toBe(false);
    }
  });

  it('refuses local IPv6, and private IPv4 hidden in IPv6', () => {
    for (const address of [
      '::',
      '::1',
      'fc00::1',
      'fd12:3456::1',
      'fe80::1',
      'ff02::1',
      '::ffff:127.0.0.1',
      '::ffff:7f00:1',
      '64:ff9b::a00:1',
    ]) {
      expect(isPublicAddress(address), address).toBe(false);
    }
  });

  it('allows public addresses, and refuses anything that is not an address', () => {
    for (const address of [
      '8.8.8.8',
      '1.1.1.1',
      '172.32.0.1',
      '2606:4700:4700::1111',
      '::ffff:8.8.8.8',
    ]) {
      expect(isPublicAddress(address), address).toBe(true);
    }
    expect(isPublicAddress('example.com')).toBe(false);
    expect(isPublicAddress('')).toBe(false);
  });
});
