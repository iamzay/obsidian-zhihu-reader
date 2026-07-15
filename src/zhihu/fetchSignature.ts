export const ZHIHU_WEB_ZSE93 = "101_3_3.0";
export const ZHIHU_DESKTOP_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36";

const ROUND_KEYS = [
  1170614578, 1024848638, 1413669199, 3951632832, 3528873006,
  2921909214, 4151847688, 3997739139, 1933479194, 3323781115,
  3888513386, 460404854, 3747539722, 2403641034, 2615871395,
  2119585428, 2265697227, 2035090028, 2773447226, 4289380121,
  4217216195, 2200601443, 3051914490, 1579901135, 1321810770,
  456816404, 2903323407, 4065664991, 330002838, 3506006750,
  363569021, 2347096187,
] as const;

const SUBSTITUTION_BOX = [
  20, 223, 245, 7, 248, 2, 194, 209, 87, 6, 227, 253, 240, 128, 222,
  91, 237, 9, 125, 157, 230, 93, 252, 205, 90, 79, 144, 199, 159, 197,
  186, 167, 39, 37, 156, 198, 38, 42, 43, 168, 217, 153, 15, 103, 80,
  189, 71, 191, 97, 84, 247, 95, 36, 69, 14, 35, 12, 171, 28, 114, 178,
  148, 86, 182, 32, 83, 158, 109, 22, 255, 94, 238, 151, 85, 77, 124,
  254, 18, 4, 26, 123, 176, 232, 193, 131, 172, 143, 142, 150, 30, 10,
  146, 162, 62, 224, 218, 196, 229, 1, 192, 213, 27, 110, 56, 231, 180,
  138, 107, 242, 187, 54, 120, 19, 44, 117, 228, 215, 203, 53, 239, 251,
  127, 81, 11, 133, 96, 204, 132, 41, 115, 73, 55, 249, 147, 102, 48,
  122, 145, 106, 118, 74, 190, 29, 16, 174, 5, 177, 129, 63, 113, 99,
  31, 161, 76, 246, 34, 211, 13, 60, 68, 207, 160, 65, 111, 82, 165, 67,
  169, 225, 57, 112, 244, 155, 51, 236, 200, 233, 58, 61, 47, 100, 137,
  185, 64, 17, 70, 234, 163, 219, 108, 170, 166, 59, 149, 52, 105, 24,
  212, 78, 173, 45, 0, 116, 226, 119, 136, 206, 135, 175, 195, 25, 92,
  121, 208, 126, 139, 3, 75, 141, 21, 130, 98, 241, 40, 154, 66, 184, 49,
  181, 46, 243, 88, 101, 183, 8, 23, 72, 188, 104, 179, 210, 134, 250,
  201, 164, 89, 216, 202, 220, 50, 221, 152, 140, 33, 235, 214,
] as const;

const CUSTOM_ALPHABET =
  "6fpLRqJO8M/c3jnYxFkUVC4ZIG12SiH=5v0mXDazWBTsuw7QetbKdoPyAl+hN9rgE";
const CIPHER_KEY = new TextEncoder().encode("059053f7d15e01d7");
const MD5_SHIFTS = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
] as const;
const MD5_CONSTANTS = Array.from({ length: 64 }, (_, index) =>
  Math.floor(Math.abs(Math.sin(index + 1)) * 4_294_967_296) | 0,
);
const HEX = "0123456789abcdef";

export function authenticatedFetchHeaders(
  url: string,
  cookieHeader: string,
  body?: string,
): Readonly<Record<string, string>> {
  const dc0 = cookieValue(cookieHeader, "d_c0");
  if (dc0 === undefined || dc0.length === 0) {
    return {};
  }
  return {
    "x-zse-93": ZHIHU_WEB_ZSE93,
    "x-zse-96": createZse96Header(url, dc0, body),
    "x-requested-with": "fetch",
  };
}

export function createZse96Header(
  url: string,
  dc0: string,
  body?: string,
): string {
  const parsed = new URL(url);
  const signSource = [
    ZHIHU_WEB_ZSE93,
    `${parsed.pathname}${parsed.search}`,
    dc0,
    ...(body === undefined ? [] : [body]),
  ].join("+");
  return `2.0_${encryptZseV4(md5Hex(signSource))}`;
}

export function md5Hex(input: string): string {
  const message = new TextEncoder().encode(input);
  const bitLength = message.length * 8;
  const paddedLength = (Math.floor((message.length + 8) / 64) + 1) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(message);
  padded[message.length] = 0x80;
  for (let index = 0; index < 8; index += 1) {
    padded[paddedLength - 8 + index] =
      Math.floor(bitLength / 2 ** (8 * index)) & 0xff;
  }

  let a0 = 0x67452301;
  let b0 = 0xefcdab89 | 0;
  let c0 = 0x98badcfe | 0;
  let d0 = 0x10325476;
  const words = new Int32Array(16);

  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      const wordOffset = offset + index * 4;
      words[index] =
        byteAt(padded, wordOffset) |
        (byteAt(padded, wordOffset + 1) << 8) |
        (byteAt(padded, wordOffset + 2) << 16) |
        (byteAt(padded, wordOffset + 3) << 24);
    }

    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;
    for (let index = 0; index < 64; index += 1) {
      let f: number;
      let wordIndex: number;
      if (index < 16) {
        f = (b & c) | (~b & d);
        wordIndex = index;
      } else if (index < 32) {
        f = (d & b) | (~d & c);
        wordIndex = (5 * index + 1) % 16;
      } else if (index < 48) {
        f = b ^ c ^ d;
        wordIndex = (3 * index + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        wordIndex = (7 * index) % 16;
      }

      const nextD = c;
      c = b;
      const sum =
        (a +
          f +
          (MD5_CONSTANTS[index] ?? 0) +
          (words[wordIndex] ?? 0)) |
        0;
      b = (b + rotateLeft(sum, MD5_SHIFTS[index] ?? 0)) | 0;
      a = d;
      d = nextD;
    }
    a0 = (a0 + a) | 0;
    b0 = (b0 + b) | 0;
    c0 = (c0 + c) | 0;
    d0 = (d0 + d) | 0;
  }

  return [a0, b0, c0, d0].map(littleEndianHex).join("");
}

function encryptZseV4(input: string): string {
  const inputBytes = new TextEncoder().encode(input);
  const unpaddedLength = inputBytes.length + 2;
  const padding = 16 - (unpaddedLength % 16);
  const plain = new Uint8Array(unpaddedLength + padding);
  plain[0] = 210;
  plain[1] = 0;
  plain.set(inputBytes, 2);
  plain.fill(padding, unpaddedLength);

  const first = new Uint8Array(16);
  for (let index = 0; index < first.length; index += 1) {
    first[index] =
      byteAt(plain, index) ^ byteAt(CIPHER_KEY, index) ^ 42;
  }

  const firstCipherBlock = encryptBlock(first);
  const cipher = new Uint8Array(plain.length);
  cipher.set(firstCipherBlock);
  let previousBlock = firstCipherBlock;
  for (let offset = 16; offset < plain.length; offset += 16) {
    const mixed = new Uint8Array(16);
    for (let index = 0; index < mixed.length; index += 1) {
      mixed[index] =
        byteAt(plain, offset + index) ^ byteAt(previousBlock, index);
    }
    previousBlock = encryptBlock(mixed);
    cipher.set(previousBlock, offset);
  }
  return customEncode(cipher);
}

function encryptBlock(input: Uint8Array): Uint8Array {
  const state = new Int32Array(36);
  state[0] = readU32Be(input, 0);
  state[1] = readU32Be(input, 4);
  state[2] = readU32Be(input, 8);
  state[3] = readU32Be(input, 12);
  for (let index = 0; index < 32; index += 1) {
    const mixed =
      (state[index + 1] ?? 0) ^
      (state[index + 2] ?? 0) ^
      (state[index + 3] ?? 0) ^
      (ROUND_KEYS[index] ?? 0);
    state[index + 4] = (state[index] ?? 0) ^ transformWord(mixed);
  }
  const output = new Uint8Array(16);
  writeU32Be(state[35] ?? 0, output, 0);
  writeU32Be(state[34] ?? 0, output, 4);
  writeU32Be(state[33] ?? 0, output, 8);
  writeU32Be(state[32] ?? 0, output, 12);
  return output;
}

function transformWord(word: number): number {
  const substituted =
    ((SUBSTITUTION_BOX[(word >>> 24) & 0xff] ?? 0) << 24) |
    ((SUBSTITUTION_BOX[(word >>> 16) & 0xff] ?? 0) << 16) |
    ((SUBSTITUTION_BOX[(word >>> 8) & 0xff] ?? 0) << 8) |
    (SUBSTITUTION_BOX[word & 0xff] ?? 0);
  return (
    substituted ^
    rotateLeft(substituted, 2) ^
    rotateLeft(substituted, 10) ^
    rotateLeft(substituted, 18) ^
    rotateLeft(substituted, 24)
  );
}

function customEncode(input: Uint8Array): string {
  const paddedLength = Math.ceil(input.length / 3) * 3;
  const bytes = new Uint8Array(paddedLength);
  bytes.set(input);
  let maskIndex = 0;
  let output = "";
  for (let position = bytes.length - 1; position >= 2; position -= 3) {
    let value = 0;
    for (let byteIndex = 0; byteIndex < 3; byteIndex += 1) {
      const mask = (58 >>> (8 * (maskIndex % 4))) & 0xff;
      maskIndex += 1;
      value |=
        ((byteAt(bytes, position - byteIndex) ^ mask) & 0xff) <<
        (8 * byteIndex);
    }
    output += CUSTOM_ALPHABET[value & 63] ?? "";
    output += CUSTOM_ALPHABET[(value >>> 6) & 63] ?? "";
    output += CUSTOM_ALPHABET[(value >>> 12) & 63] ?? "";
    output += CUSTOM_ALPHABET[(value >>> 18) & 63] ?? "";
  }
  return output;
}

function cookieValue(header: string, name: string): string | undefined {
  for (const item of header.split(";")) {
    const separator = item.indexOf("=");
    if (separator < 0 || item.slice(0, separator).trim() !== name) {
      continue;
    }
    const value = item.slice(separator + 1).trim();
    return value.startsWith('"') && value.endsWith('"')
      ? value.slice(1, -1)
      : value;
  }
  return undefined;
}

function readU32Be(bytes: Uint8Array, offset: number): number {
  return (
    (byteAt(bytes, offset) << 24) |
    (byteAt(bytes, offset + 1) << 16) |
    (byteAt(bytes, offset + 2) << 8) |
    byteAt(bytes, offset + 3)
  );
}

function writeU32Be(value: number, output: Uint8Array, offset: number): void {
  output[offset] = value >>> 24;
  output[offset + 1] = value >>> 16;
  output[offset + 2] = value >>> 8;
  output[offset + 3] = value;
}

function littleEndianHex(value: number): string {
  let output = "";
  for (let index = 0; index < 4; index += 1) {
    const byte = (value >>> (8 * index)) & 0xff;
    output += `${HEX[byte >>> 4] ?? ""}${HEX[byte & 0x0f] ?? ""}`;
  }
  return output;
}

function rotateLeft(value: number, bits: number): number {
  return (value << bits) | (value >>> (32 - bits));
}

function byteAt(bytes: Uint8Array, index: number): number {
  return bytes[index] ?? 0;
}
