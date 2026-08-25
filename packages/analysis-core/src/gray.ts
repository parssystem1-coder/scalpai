/** Raw grayscale image plane + dimensions — the shared currency of analysis. */
export interface GrayImage {
  data: Float32Array; // 0..255
  width: number;
  height: number;
}

type RgbaView = Uint8ClampedArray | Uint8Array;

/** Convert a raw RGBA plane (ImageData.data / sharp raw) to luma grayscale.
 *  Accepts any RGBA typed-array view so the same code runs in Node and browser. */
export function rgbaToGray(rgba: RgbaView, width: number, height: number): GrayImage {
  const expected = width * height * 4;
  if (rgba.length < expected) throw new Error(`rgba buffer too small: ${rgba.length} < ${expected}`);
  const data = new Float32Array(width * height);
  for (let i = 0, p = 0; i < data.length; i++, p += 4) {
    // Rec.709 luma
    data[i] = 0.2126 * rgba[p]! + 0.7152 * rgba[p + 1]! + 0.0722 * rgba[p + 2]!;
  }
  return { data, width, height };
}
