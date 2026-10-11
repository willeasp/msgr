// Both platforms have these; the lib's types include neither's.
declare function atob(data: string): string;
declare function btoa(data: string): string;

// fromCharCode takes its bytes as arguments: in chunks, or big pictures
// overflow the stack.
const CHUNK = 0x8000;

export function toBase64(bytes: Uint8Array): string {
  let text = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    text += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(text);
}

/** The bytes, or null unless `text` is canonical base64: one spelling per value. */
export function fromBase64(text: string): Uint8Array | null {
  let decoded: string;
  try {
    decoded = atob(text);
  } catch {
    return null;
  }
  // atob forgives whitespace, missing padding and stray low bits.
  if (btoa(decoded) !== text) return null;
  return Uint8Array.from(decoded, (c) => c.charCodeAt(0));
}
