const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const BOLT11_SIGNATURE_BITS = 520;
const BOLT11_TIMESTAMP_BITS = 35;
const BOLT11_TAG_EXPIRY_TYPE = 6;
const DEFAULT_BOLT11_EXPIRY_SECONDS = 3600;

function bech32Polymod(values: number[]): number {
  const generator = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const value of values) {
    const top = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ value;
    for (let i = 0; i < 5; i += 1) {
      if ((top >> i) & 1) {
        chk ^= generator[i];
      }
    }
  }
  return chk;
}

function bech32HrpExpand(hrp: string): number[] {
  const ret: number[] = [];
  for (const char of hrp) {
    ret.push(char.charCodeAt(0) >> 5);
  }
  ret.push(0);
  for (const char of hrp) {
    ret.push(char.charCodeAt(0) & 31);
  }
  return ret;
}

function bech32DecodeWords(bech: string): number[] {
  const separator = bech.lastIndexOf('1');
  if (separator < 1 || separator + 7 > bech.length || bech.length > 2000) {
    throw new Error('invalid_bech32');
  }

  const hrp = bech.slice(0, separator);
  const data = bech.slice(separator + 1);
  const words: number[] = [];
  for (const char of data) {
    const index = BECH32_CHARSET.indexOf(char);
    if (index === -1) {
      throw new Error('invalid_bech32_char');
    }
    words.push(index);
  }

  if (bech32Polymod([...bech32HrpExpand(hrp), ...words]) !== 1) {
    throw new Error('invalid_bech32_checksum');
  }

  return words.slice(0, -6);
}

class BitReader {
  private readonly bits: number[];
  private offset = 0;

  constructor(words: number[]) {
    this.bits = [];
    for (const word of words) {
      for (let shift = 4; shift >= 0; shift -= 1) {
        this.bits.push((word >> shift) & 1);
      }
    }
  }

  get remaining(): number {
    return this.bits.length - this.offset;
  }

  read(n: number): number {
    if (n <= 0 || this.offset + n > this.bits.length) {
      throw new Error('invalid_bit_read');
    }
    let value = 0;
    for (let i = 0; i < n; i += 1) {
      value = (value << 1) | this.bits[this.offset];
      this.offset += 1;
    }
    return value;
  }

  skip(n: number): void {
    this.offset += n;
  }
}

function parseBolt11Payload(words: number[]): { timestamp: number; expirySeconds: number } | null {
  if (words.length * 5 <= BOLT11_SIGNATURE_BITS + BOLT11_TIMESTAMP_BITS) {
    return null;
  }

  const payloadWords = words.slice(0, words.length - BOLT11_SIGNATURE_BITS / 5);
  const reader = new BitReader(payloadWords);
  const timestamp = reader.read(BOLT11_TIMESTAMP_BITS);
  let expirySeconds = DEFAULT_BOLT11_EXPIRY_SECONDS;

  while (reader.remaining > 15) {
    const type = reader.read(5);
    const length = reader.read(10);
    if (length === 0) {
      continue;
    }

    if (type === BOLT11_TAG_EXPIRY_TYPE) {
      let expiry = 0;
      for (let i = 0; i < length; i += 1) {
        expiry = (expiry << 8) | reader.read(8);
      }
      expirySeconds = expiry;
      continue;
    }

    reader.skip(length * 8);
  }

  return { timestamp, expirySeconds };
}

/** Returns invoice expiry as epoch milliseconds, or null when decoding fails. */
export function decodeBolt11ExpiresAt(prOrUri: string): number | null {
  try {
    const bolt11 = prOrUri.trim().replace(/^lightning:/i, '').toLowerCase();
    const words = bech32DecodeWords(bolt11);
    const parsed = parseBolt11Payload(words);
    if (!parsed) {
      return null;
    }
    return (parsed.timestamp + parsed.expirySeconds) * 1000;
  } catch {
    return null;
  }
}
