/**
 * Minimal EXIF orientation reader for JPEG payloads.
 *
 * Camera photos are usually stored with the sensor's native pixel layout and an
 * EXIF Orientation tag telling viewers how to turn them upright. Image views on
 * both platforms honour that tag, but pdf-lib embeds the raw pixels verbatim,
 * so a portrait iPhone photo (orientation 6) would land in the export lying on
 * its side unless we rotate it ourselves.
 */

/** EXIF Orientation tag values (1 is upright, 6 and 8 are the common portrait cases) */
export type ExifOrientation = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/**
 * Degrees the stored pixels must be turned clockwise to appear upright.
 * Mirrored variants (2, 4, 5, 7) map to their rotation component only; pdf-lib
 * has no flip primitive and cameras never emit them.
 */
export function orientationToClockwiseDegrees(orientation: ExifOrientation): 0 | 90 | 180 | 270 {
  switch (orientation) {
    case 3:
    case 4:
      return 180;
    case 5:
    case 6:
      return 90;
    case 7:
    case 8:
      return 270;
    default:
      return 0;
  }
}

/**
 * Walk the JPEG marker segments looking for APP1/Exif and read IFD0's Orientation
 * entry. Returns 1 (upright) for non-JPEG input, JPEGs without EXIF, or any
 * malformed structure - the caller should never have to guard against this.
 */
export function readJpegOrientation(bytes: Uint8Array): ExifOrientation {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return 1;

  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return 1;
    const marker = bytes[offset + 1];
    // Standalone markers (RSTn, SOI, EOI) carry no length; padding 0xFF bytes are skipped.
    if (marker === 0xff) { offset += 1; continue; }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) { offset += 2; continue; }
    // Start of scan / end of image: EXIF must appear before this, so give up.
    if (marker === 0xda || marker === 0xd9) return 1;

    const segmentLength = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (segmentLength < 2) return 1;
    const segmentStart = offset + 4;
    const segmentEnd = offset + 2 + segmentLength;
    if (segmentEnd > bytes.length) return 1;

    if (marker === 0xe1 && hasExifHeader(bytes, segmentStart)) {
      return readTiffOrientation(bytes, segmentStart + 6, segmentEnd);
    }
    offset = segmentEnd;
  }
  return 1;
}

function hasExifHeader(bytes: Uint8Array, at: number): boolean {
  // "Exif\0\0"
  return bytes[at] === 0x45 && bytes[at + 1] === 0x78 && bytes[at + 2] === 0x69 && bytes[at + 3] === 0x66 && bytes[at + 4] === 0 && bytes[at + 5] === 0;
}

function readTiffOrientation(bytes: Uint8Array, tiffStart: number, end: number): ExifOrientation {
  if (tiffStart + 8 > end) return 1;
  const littleEndian = bytes[tiffStart] === 0x49 && bytes[tiffStart + 1] === 0x49; // "II"
  const bigEndian = bytes[tiffStart] === 0x4d && bytes[tiffStart + 1] === 0x4d; // "MM"
  if (!littleEndian && !bigEndian) return 1;

  const u16 = (at: number) => (littleEndian ? bytes[at] | (bytes[at + 1] << 8) : (bytes[at] << 8) | bytes[at + 1]);
  const u32 = (at: number) =>
    littleEndian
      ? (bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) | (bytes[at + 3] << 24)) >>> 0
      : ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0;

  if (u16(tiffStart + 2) !== 0x002a) return 1;
  const ifdOffset = u32(tiffStart + 4);
  const ifdStart = tiffStart + ifdOffset;
  if (ifdStart + 2 > end) return 1;

  const entryCount = u16(ifdStart);
  for (let i = 0; i < entryCount; i++) {
    const entry = ifdStart + 2 + i * 12;
    if (entry + 12 > end) return 1;
    if (u16(entry) !== 0x0112) continue; // Orientation tag
    if (u16(entry + 2) !== 3) return 1; // must be SHORT
    const value = u16(entry + 8); // SHORT values are stored inline in the 4-byte value field
    return value >= 1 && value <= 8 ? (value as ExifOrientation) : 1;
  }
  return 1;
}
