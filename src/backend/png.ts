import { crc32 } from "node:zlib";

export const MAX_PNG_BYTES = 256 * 1024;
export const MAX_PNG_SIDE = 512;

export type PngResult =
  { ok: true; base64: string } | { ok: false; error: string };

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
// The last chunk of every PNG: length 0, "IEND", and its fixed checksum.
const IEND = Buffer.from("0000000049454e44ae426082", "hex");
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

// Checks a base64 PNG without decoding the image: the signature, a well formed
// IHDR with a sane size, and the IEND at the end. The bytes are shown through
// <img> or a CSS mask only, so this is about rejecting junk and huge images,
// not about trusting the decoder.
export function validatePng(input: unknown): PngResult {
  if (typeof input !== "string" || input === "") {
    return { ok: false, error: "The PNG is empty" };
  }
  // Check the size before decoding, so a huge string costs nothing.
  if (input.length > Math.ceil((MAX_PNG_BYTES * 4) / 3) + 4) {
    return { ok: false, error: "The PNG is too big" };
  }
  if (input.length % 4 !== 0 || !BASE64.test(input)) {
    return { ok: false, error: "The PNG is not valid base64" };
  }
  const bytes = Buffer.from(input, "base64");
  if (bytes.length > MAX_PNG_BYTES) {
    return { ok: false, error: "The PNG is too big" };
  }
  // 8 signature + 25 IHDR chunk + 12 IEND
  if (bytes.length < 45 || !bytes.subarray(0, 8).equals(SIGNATURE)) {
    return { ok: false, error: "The file is not a PNG image" };
  }
  const length = bytes.readUInt32BE(8);
  if (length !== 13 || bytes.toString("latin1", 12, 16) !== "IHDR") {
    return { ok: false, error: "The PNG header is broken" };
  }
  if (crc32(bytes.subarray(12, 29)) !== bytes.readUInt32BE(29)) {
    return { ok: false, error: "The PNG header is broken" };
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width < 1 || height < 1) {
    return { ok: false, error: "The PNG has no size" };
  }
  if (width > MAX_PNG_SIDE || height > MAX_PNG_SIDE) {
    return {
      ok: false,
      error: `The PNG is bigger than ${MAX_PNG_SIDE} by ${MAX_PNG_SIDE} pixels`,
    };
  }
  if (!bytes.subarray(bytes.length - 12).equals(IEND)) {
    return { ok: false, error: "The PNG is cut off" };
  }
  // Written back from the bytes, so only canonical base64 is stored.
  return { ok: true, base64: bytes.toString("base64") };
}
