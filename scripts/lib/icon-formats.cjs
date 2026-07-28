/**
 * icon-formats.cjs — نویسندهٔ فرمت‌های ICO / ICNS / BMP3
 * -----------------------------------------------------------------------
 * تله‌های واقعی این فرمت‌ها که اینجا عمداً رعایت شده‌اند:
 *
 * ۱) ICO: electron-builder حداقل یک تصویر ۲۵۶×۲۵۶ می‌خواهد، وگرنه با خطای
 *    صریح متوقف می‌شود. همچنین در دایرکتوری ICO، اندازهٔ ۲۵۶ باید با بایت
 *    صفر کدگذاری شود (۲۵۶ در یک بایت جا نمی‌شود).
 *
 * ۲) ICNS: بعضی ابزارها (از جمله ImageMagick در برخی نسخه‌ها) بی‌سروصدا یک
 *    PNG با پسوند .icns می‌سازند که macOS آن را رد می‌کند. اینجا کانتینر
 *    واقعی ICNS با هدر `icns` و چانک‌های نوع‌دار ساخته می‌شود.
 *
 * ۳) BMP نصب‌کنندهٔ NSIS: باید BMP3 با ۲۴ بیت و **بدون** کانال آلفا باشد.
 *    ردیف‌ها از پایین به بالا ذخیره می‌شوند و هر ردیف باید به مضرب ۴ بایت
 *    padding شود. ابعاد هم دقیقاً تثبیت‌شده‌اند (۱۵۰×۵۷ و ۱۶۴×۳۱۴) — NSIS
 *    ابعاد دیگر را کش می‌دهد یا خراب نمایش می‌دهد.
 */

const { encodePng, resize } = require('./png.cjs');

/**
 * ساخت فایل ICO چندسایزی (هر تصویر به‌صورت PNG جاسازی می‌شود — ICO مدرن این را
 * پشتیبانی می‌کند و حجم را به‌شدت کم می‌کند).
 * @param {{ width: number, height: number, data: Buffer }} image
 * @param {number[]} sizes
 * @returns {Buffer}
 */
function buildIco(image, sizes) {
  const entries = sizes.map((size) => ({
    size,
    png: encodePng(resize(image, size, size)),
  }));

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: 1 = icon
  header.writeUInt16LE(entries.length, 4);

  const dirSize = 16 * entries.length;
  let offset = 6 + dirSize;
  const dirEntries = [];

  for (const entry of entries) {
    const dir = Buffer.alloc(16);
    // ۲۵۶ باید به‌صورت 0 نوشته شود — این دقیقاً جایی است که ICOهای دست‌ساز خراب می‌شوند
    dir[0] = entry.size >= 256 ? 0 : entry.size;
    dir[1] = entry.size >= 256 ? 0 : entry.size;
    dir[2] = 0;  // تعداد رنگ پالت
    dir[3] = 0;  // reserved
    dir.writeUInt16LE(1, 4);   // color planes
    dir.writeUInt16LE(32, 6);  // bits per pixel
    dir.writeUInt32BE(0, 8);
    dir.writeUInt32LE(entry.png.length, 8);
    dir.writeUInt32LE(offset, 12);
    dirEntries.push(dir);
    offset += entry.png.length;
  }

  return Buffer.concat([header, ...dirEntries, ...entries.map((e) => e.png)]);
}

/**
 * ساخت کانتینر واقعی ICNS.
 * نوع چانک‌ها مطابق مستندات Apple برای تصاویر PNG-محور انتخاب شده‌اند.
 * @param {{ width: number, height: number, data: Buffer }} image
 * @returns {Buffer}
 */
function buildIcns(image) {
  const ICNS_TYPES = [
    ['icp4', 16],
    ['icp5', 32],
    ['ic07', 128],
    ['ic08', 256],
    ['ic09', 512],
    ['ic10', 1024],
  ];

  const chunks = ICNS_TYPES.map(([type, size]) => {
    const png = encodePng(resize(image, size, size));
    const header = Buffer.alloc(8);
    header.write(type, 0, 4, 'ascii');
    header.writeUInt32BE(png.length + 8, 4);
    return Buffer.concat([header, png]);
  });

  const body = Buffer.concat(chunks);
  const fileHeader = Buffer.alloc(8);
  fileHeader.write('icns', 0, 4, 'ascii');
  fileHeader.writeUInt32BE(body.length + 8, 4);

  return Buffer.concat([fileHeader, body]);
}

/**
 * ساخت BMP3 با عمق ۲۴ بیت برای بیت‌مپ‌های نصب‌کنندهٔ NSIS.
 *
 * تصویر روی بوم مقصد «contain» می‌شود (نسبت ابعاد حفظ می‌شود و اطراف با رنگ
 * پس‌زمینه پر می‌گردد) — کشیدگی لوگو در سایدبار نصب‌کننده زشت و غیرحرفه‌ای است.
 *
 * @param {{ width: number, height: number, data: Buffer }} image
 * @param {number} targetW
 * @param {number} targetH
 * @param {[number, number, number]} background رنگ پس‌زمینه به‌صورت RGB
 * @returns {Buffer}
 */
function buildBmp24(image, targetW, targetH, background = [10, 10, 10]) {
  const scale = Math.min(targetW / image.width, targetH / image.height);
  const drawW = Math.max(1, Math.round(image.width * scale));
  const drawH = Math.max(1, Math.round(image.height * scale));
  const scaled = resize(image, drawW, drawH);
  const offsetX = Math.floor((targetW - drawW) / 2);
  const offsetY = Math.floor((targetH - drawH) / 2);

  const rowSize = Math.ceil((targetW * 3) / 4) * 4; // padding به مضرب ۴ بایت
  const pixelDataSize = rowSize * targetH;
  const fileSize = 14 + 40 + pixelDataSize;

  const buf = Buffer.alloc(fileSize);
  buf.write('BM', 0, 2, 'ascii');
  buf.writeUInt32LE(fileSize, 2);
  buf.writeUInt32LE(54, 10);      // offset دادهٔ پیکسل
  buf.writeUInt32LE(40, 14);      // اندازهٔ BITMAPINFOHEADER (BMP3)
  buf.writeInt32LE(targetW, 18);
  buf.writeInt32LE(targetH, 22);
  buf.writeUInt16LE(1, 26);       // planes
  buf.writeUInt16LE(24, 28);      // بیت بر پیکسل — بدون آلفا
  buf.writeUInt32LE(0, 30);       // بدون فشرده‌سازی
  buf.writeUInt32LE(pixelDataSize, 34);
  buf.writeInt32LE(2835, 38);     // ~72 DPI
  buf.writeInt32LE(2835, 42);

  for (let y = 0; y < targetH; y++) {
    // BMP ردیف‌ها را از پایین به بالا ذخیره می‌کند
    const rowStart = 54 + (targetH - 1 - y) * rowSize;
    for (let x = 0; x < targetW; x++) {
      let r = background[0];
      let g = background[1];
      let b = background[2];

      const sx = x - offsetX;
      const sy = y - offsetY;
      if (sx >= 0 && sx < drawW && sy >= 0 && sy < drawH) {
        const idx = (sy * drawW + sx) * 4;
        const alpha = scaled.data[idx + 3] / 255;
        // ترکیب روی پس‌زمینه چون BMP24 کانال آلفا ندارد
        r = Math.round(scaled.data[idx] * alpha + background[0] * (1 - alpha));
        g = Math.round(scaled.data[idx + 1] * alpha + background[1] * (1 - alpha));
        b = Math.round(scaled.data[idx + 2] * alpha + background[2] * (1 - alpha));
      }

      const p = rowStart + x * 3;
      buf[p] = b;      // BMP ترتیب BGR دارد
      buf[p + 1] = g;
      buf[p + 2] = r;
    }
  }

  return buf;
}

module.exports = { buildIco, buildIcns, buildBmp24 };
