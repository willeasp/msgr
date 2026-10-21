/*
 * A binary range coder (LZMA's), shared by movies and sounds. Each bit is
 * coded with the odds its context has learned: every context counts the
 * zeros and ones it has seen, halving both past a limit so its odds follow
 * what's being coded as it changes.
 */

const TOP = 1 << 24;
const PROBABILITY_BITS = 12;
const ONE = 1 << PROBABILITY_BITS;

/** What each context has seen, and so the odds of its next bit. */
export interface Odds {
  /** The chance of a 0, out of 4096, never certain either way. */
  zero(context: number): number;
  saw(context: number, bit: number): void;
}

/** Odds for `contexts` contexts, each halving its counts past `limit`. */
export function adaptiveOdds(contexts: number, limit: number): Odds {
  const zeros = new Uint16Array(contexts);
  const ones = new Uint16Array(contexts);
  return {
    zero(context) {
      const z = zeros[context];
      const p = Math.floor(((2 * z + 1) * ONE) / (2 * (z + ones[context]) + 2));
      return Math.min(ONE - 1, Math.max(1, p));
    },
    saw(context, bit) {
      if (bit) ones[context]++;
      else zeros[context]++;
      if (zeros[context] + ones[context] > limit) {
        zeros[context] = (zeros[context] + 1) >> 1;
        ones[context] = (ones[context] + 1) >> 1;
      }
    },
  };
}

export interface RangeEncoder {
  /** Codes `bit` in `context`, then teaches the context it. */
  code(odds: Odds, context: number, bit: number): void;
  /** Every byte coded, once the last bits are flushed. */
  finish(): Uint8Array<ArrayBuffer>;
}

export function rangeEncoder(): RangeEncoder {
  const out: number[] = [];
  let low = 0;
  let range = 0xffffffff;
  let cache = 0;
  let pending = 1;
  // Hands on the top byte of `low` once a carry can no longer reach it.
  const shiftLow = () => {
    if (low < 0xff000000 || low >= 0x100000000) {
      const carry = low >= 0x100000000 ? 1 : 0;
      let byte = cache;
      do {
        out.push((byte + carry) & 0xff);
        byte = 0xff;
      } while (--pending !== 0);
      cache = (low >>> 24) & 0xff;
    }
    pending++;
    low = (low & 0x00ffffff) * 256;
  };
  return {
    code(odds, context, bit) {
      const bound = (range >>> PROBABILITY_BITS) * odds.zero(context);
      if (bit) {
        low += bound;
        range -= bound;
      } else {
        range = bound;
      }
      odds.saw(context, bit);
      while (range < TOP) {
        range = (range * 256) >>> 0;
        shiftLow();
      }
    },
    finish() {
      for (let i = 0; i < 5; i++) shiftLow();
      return Uint8Array.from(out);
    },
  };
}

export interface RangeDecoder {
  /** The next bit, read in `context`, which then learns it. */
  code(odds: Odds, context: number): number;
}

/** Reads `coded`; past its end, every byte reads as zero. */
export function rangeDecoder(coded: Uint8Array): RangeDecoder {
  let position = 0;
  const next = () => (position < coded.length ? coded[position++] : 0);
  let range = 0xffffffff;
  let code = 0;
  for (let i = 0; i < 5; i++) code = (code * 256 + next()) >>> 0;
  return {
    code(odds, context) {
      const bound = (range >>> PROBABILITY_BITS) * odds.zero(context);
      let bit = 0;
      if (code < bound) {
        range = bound;
      } else {
        code -= bound;
        range -= bound;
        bit = 1;
      }
      odds.saw(context, bit);
      while (range < TOP) {
        range = (range * 256) >>> 0;
        code = (code * 256 + next()) >>> 0;
      }
      return bit;
    },
  };
}
