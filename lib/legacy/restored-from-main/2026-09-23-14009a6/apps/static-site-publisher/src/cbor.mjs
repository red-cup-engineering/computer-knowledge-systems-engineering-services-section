// Deterministic CBOR encoding (RFC 8949 §4.2 core deterministic profile) for the
// value shapes VICTOR addresses: null, boolean, integer, string, array, map.
// Map keys sort bytewise by their encoded form; all lengths are definite and minimal.

import { createHash } from 'node:crypto';

function encodeHead(major, length) {
  if (length < 24) return Buffer.from([(major << 5) | length]);
  if (length < 0x100) return Buffer.from([(major << 5) | 24, length]);
  if (length < 0x10000) {
    const b = Buffer.alloc(3); b[0] = (major << 5) | 25; b.writeUInt16BE(length, 1); return b;
  }
  const b = Buffer.alloc(5); b[0] = (major << 5) | 26; b.writeUInt32BE(length, 1); return b;
}

export function encodeCbor(value) {
  if (value === null || value === undefined) return Buffer.from([0xf6]);
  if (value === false) return Buffer.from([0xf4]);
  if (value === true) return Buffer.from([0xf5]);
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) throw new TypeError('victor cbor: only integers are addressable');
    return value >= 0 ? encodeHead(0, value) : encodeHead(1, -value - 1);
  }
  if (typeof value === 'string') {
    const bytes = Buffer.from(value, 'utf8');
    return Buffer.concat([encodeHead(3, bytes.length), bytes]);
  }
  if (Array.isArray(value)) {
    const items = value.map(encodeCbor);
    return Buffer.concat([encodeHead(4, value.length), ...items]);
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [encodeCbor(k), encodeCbor(v)]);
    entries.sort(([a], [b]) => Buffer.compare(a, b));
    return Buffer.concat([encodeHead(5, entries.length), ...entries.flat()]);
  }
  throw new TypeError(`victor cbor: unencodable value of type ${typeof value}`);
}

// RFC 6920 named-information URI over the canonical form.
export function niAddress(value) {
  const digest = createHash('sha256').update(encodeCbor(value)).digest('base64url');
  return `ni:///sha-256;${digest}`;
}
