import { BlockList, isIP } from 'node:net';

// Everything a link preview must never reach: this machine, the host's private
// network (Render's, Neon's), and ranges that aren't real destinations.
const blocked = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  blocked.addSubnet(network, prefix, 'ipv4');
}
for (const [network, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  blocked.addSubnet(network, prefix, 'ipv6');
}

/** The eight 16-bit groups of an IPv6 address, a trailing dotted IPv4 included. */
function groups(address: string): number[] {
  const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(address)?.[1];
  const hex = dotted
    ? address.slice(0, -dotted.length) +
      dotted
        .split('.')
        .map(Number)
        .reduce<string[]>((pairs, byte, i) => {
          if (i % 2 === 0) pairs.push(byte.toString(16).padStart(2, '0'));
          else pairs[pairs.length - 1] += byte.toString(16).padStart(2, '0');
          return pairs;
        }, [])
        .join(':')
    : address;
  const [head = '', tail] = hex.split('::');
  const parse = (part: string) =>
    part ? part.split(':').map((group) => parseInt(group, 16)) : [];
  const front = parse(head);
  const back = tail === undefined ? [] : parse(tail);
  return [...front, ...Array(8 - front.length - back.length).fill(0), ...back];
}

/** The IPv4 address inside an IPv4-mapped or NAT64 IPv6 one, if any. */
function embeddedIPv4(address: string): string | null {
  const g = groups(address);
  const mapped = g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff;
  const nat64 =
    g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0);
  if (!mapped && !nat64) return null;
  const [high = 0, low = 0] = g.slice(6);
  return [high >> 8, high & 0xff, low >> 8, low & 0xff].join('.');
}

/** Whether an address is somewhere on the public internet. */
export function isPublicAddress(address: string): boolean {
  switch (isIP(address)) {
    case 4:
      return !blocked.check(address, 'ipv4');
    case 6: {
      const ipv4 = embeddedIPv4(address);
      return ipv4 ? isPublicAddress(ipv4) : !blocked.check(address, 'ipv6');
    }
    default:
      return false;
  }
}
