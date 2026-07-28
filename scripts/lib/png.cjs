/**
 * png.cjs — رمزگشا/رمزگذار کمینهٔ PNG + تغییر اندازهٔ دو‌خطی، فقط با zlib داخلی Node.
 * -----------------------------------------------------------------------
 * چرا دست‌ساز و بدون کتابخانه؟
 *  - این اسکریپت در `prebuild` و در CI اجرا می‌شود؛ افزودن وابستگی سنگین
 *    (sharp/jimp) به devDependencies برای ساخت چند آیکون، هزینهٔ نصب و
 *    ریسک باینری native را بی‌دلیل بالا می‌برد.
 *  - ImageMagick روی همهٔ ماشین‌های توسعه/CI موجود نیست، پس نمی‌توان به آن
 *    تکیه کرد (تلهٔ «روی سیستم من کار می‌کرد»).
 *
 * دامنهٔ پشتیبانی عمداً محدود است: فقط چیزی که `public/icon.png` لازم دارد —
 * PNG با عمق بیت ۸، نوع رنگ ۲ (RGB) یا ۶ (RGBA)، بدون interlace.
 * اگر ورودی خارج از این دامنه باشد، صریحاً خطا می‌دهد و سکوت نمی‌کند.
 */

const zlib = require('zlib');

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * PNG را به یک بیت‌مپ RGBA خام رمزگشایی می‌کند.
 * @param {Buffer} buffer
 * @returns {{ width: number, height: number, data: Buffer }} data به‌صورت RGBA (۴ بایت به ازای هر پیکسل)
 */
function decodePng(buffer) {
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('فایل ورودی PNG معتبر نیست (امضای فایل نادرست است).');
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idatChunks = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;

    if (type === 'IHDR') {
      width = buffer.readUInt32BE(dataStart);
      height = buffer.readUInt32BE(dataStart + 4);
      bitDepth = buffer[dataStart + 8];
      colorType = buffer[dataStart + 9];
      interlace = buffer[dataStart + 12];
    } else if (type === 'IDAT') {
      idatChunks.push(buffer.subarray(dataStart, dataStart + length));
    } else if (type === 'IEND') {
      break;
    }

    offset = dataStart + length + 4; // +4 برای CRC
  }

  if (bitDepth !== 8) {
    throw new Error(`فقط PNG با عمق بیت ۸ پشتیبانی می‌شود (دریافت شد: ${bitDepth}).`);
  }
  if (colorType !== 2 && colorType !== 6) {
    throw new Error(`فقط PNG از نوع RGB یا RGBA پشتیبانی می‌شود (نوع رنگ دریافتی: ${colorType}).`);
  }
  if (interlace !== 0) {
    throw new Error('PNG با interlace پشتیبانی نمی‌شود.');
  }

  const channels = colorType === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idatChunks));
  const stride = width * channels;
  const out = Buffer.alloc(width * height * 4);
  let prevLine = Buffer.alloc(stride);

  for (let y = 0; y < height; y++) {
    const filterType = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride));

    // بازگردانی فیلترهای استاندارد PNG (بخش ۹ از مشخصات فرمت)
    for (let i = 0; i < stride; i++) {
      const left = i >= channels ? line[i - channels] : 0;
      const up = prevLine[i];
      const upLeft = i >= channels ? prevLine[i - channels] : 0;

      switch (filterType) {
        case 0: break;                                            // None
        case 1: line[i] = (line[i] + left) & 0xff; break;         // Sub
        case 2: line[i] = (line[i] + up) & 0xff; break;           // Up
        case 3: line[i] = (line[i] + ((left + up) >> 1)) & 0xff; break; // Average
        case 4: {                                                 // Paeth
          const p = left + up - upLeft;
          const pa = Math.abs(p - left);
          const pb = Math.abs(p - up);
          const pc = Math.abs(p - upLeft);
          const pred = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
          line[i] = (line[i] + pred) & 0xff;
          break;
        }
        default:
          throw new Error(`نوع فیلتر ناشناختهٔ PNG: ${filterType}`);
      }
    }

    for (let x = 0; x < width; x++) {
      const src = x * channels;
      const dst = (y * width + x) * 4;
      out[dst] = line[src];
      out[dst + 1] = line[src + 1];
      out[dst + 2] = line[src + 2];
      out[dst + 3] = channels === 4 ? line[src + 3] : 255;
    }

    prevLine = line;
  }

  return { width, height, data: out };
}

/** CRC32 مطابق مشخصات PNG */
let crcTable = null;
function crc32(buf) {
  if (!crcTable) {
    crcTable = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([len, typeAndData, crc]);
}

/**
 * بیت‌مپ RGBA را به بافر PNG (رنگ نوع ۶، عمق ۸) رمزگذاری می‌کند.
 * @param {{ width: number, height: number, data: Buffer }} image
 * @returns {Buffer}
 */
function encodePng({ width, height, data }) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // فیلتر None — سادگی مهم‌تر از چند کیلوبایت است
    data.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * تغییر اندازهٔ دو‌خطی (bilinear) با پیش‌میانگین‌گیری جعبه‌ای هنگام کوچک‌سازی.
 * بدون پیش‌میانگین‌گیری، کوچک کردن ۱۰۲۴ به ۱۶ باعث aliasing شدید و آیکون
 * «نقطه‌نقطه» می‌شود چون فقط چند پیکسل پراکنده نمونه‌برداری می‌شوند.
 * @param {{ width: number, height: number, data: Buffer }} image
 * @param {number} targetW
 * @param {number} targetH
 */
function resize(image, targetW, targetH) {
  let src = image;

  // کوچک‌سازی مرحله‌ای: تا وقتی مقصد کمتر از نصف مبدأ است، نصف کن (box filter)
  while (src.width >= targetW * 2 && src.height >= targetH * 2 && src.width > 1 && src.height > 1) {
    const hw = Math.max(1, Math.floor(src.width / 2));
    const hh = Math.max(1, Math.floor(src.height / 2));
    const half = Buffer.alloc(hw * hh * 4);
    for (let y = 0; y < hh; y++) {
      for (let x = 0; x < hw; x++) {
        for (let c = 0; c < 4; c++) {
          const a = src.data[((y * 2) * src.width + x * 2) * 4 + c];
          const b = src.data[((y * 2) * src.width + Math.min(x * 2 + 1, src.width - 1)) * 4 + c];
          const d = src.data[(Math.min(y * 2 + 1, src.height - 1) * src.width + x * 2) * 4 + c];
          const e = src.data[(Math.min(y * 2 + 1, src.height - 1) * src.width + Math.min(x * 2 + 1, src.width - 1)) * 4 + c];
          half[(y * hw + x) * 4 + c] = (a + b + d + e + 2) >> 2;
        }
      }
    }
    src = { width: hw, height: hh, data: half };
  }

  if (src.width === targetW && src.height === targetH) return src;

  const out = Buffer.alloc(targetW * targetH * 4);
  const xRatio = src.width / targetW;
  const yRatio = src.height / targetH;

  for (let y = 0; y < targetH; y++) {
    const sy = Math.min(src.height - 1, (y + 0.5) * yRatio - 0.5);
    const y0 = Math.max(0, Math.floor(sy));
    const y1 = Math.min(src.height - 1, y0 + 1);
    const wy = sy - y0;

    for (let x = 0; x < targetW; x++) {
      const sx = Math.min(src.width - 1, (x + 0.5) * xRatio - 0.5);
      const x0 = Math.max(0, Math.floor(sx));
      const x1 = Math.min(src.width - 1, x0 + 1);
      const wx = sx - x0;

      for (let c = 0; c < 4; c++) {
        const p00 = src.data[(y0 * src.width + x0) * 4 + c];
        const p01 = src.data[(y0 * src.width + x1) * 4 + c];
        const p10 = src.data[(y1 * src.width + x0) * 4 + c];
        const p11 = src.data[(y1 * src.width + x1) * 4 + c];
        const top = p00 + (p01 - p00) * wx;
        const bottom = p10 + (p11 - p10) * wx;
        out[(y * targetW + x) * 4 + c] = Math.round(top + (bottom - top) * wy);
      }
    }
  }

  return { width: targetW, height: targetH, data: out };
}

module.exports = { decodePng, encodePng, resize };
