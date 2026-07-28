import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * نگهبان رگرسیون برای باگ «تصویر نواحی سر در نسخهٔ بسته‌بندی‌شده خراب می‌شود».
 *
 * ریشهٔ باگ: مسیر مطلق به فایل‌های public، مثل
 *     <image href="/scalp-regions-vector.svg" />
 * در حالت dev صفحه از http://localhost:5173 لود می‌شود و «/» یعنی ریشهٔ سرور،
 * پس فایل پیدا می‌شود. اما در نسخهٔ بسته‌بندی‌شده صفحه با loadFile و پروتکل
 * file:// باز می‌شود و همان «/» یعنی ریشهٔ درایو (file:///D:/...) — فایل پیدا
 * نمی‌شود و تصویر خالی می‌ماند.
 *
 * راه درست: ایمپورت به‌عنوان asset تا Vite مسیر را با
 * new URL(..., import.meta.url) بازنویسی کند.
 */

const SRC = join(process.cwd(), 'src');

/** پسوندهایی که باید ایمپورت شوند نه با مسیر مطلق ارجاع داده شوند */
const ASSET_EXT = 'svg|png|jpg|jpeg|webp|gif|avif|ico|mp4|webm|woff2?|ttf';

/** href="/x.svg" یا src='/img/y.png' — مسیر مطلق به یک فایل asset */
const ABSOLUTE_ASSET_REF = new RegExp(
  `(?:href|src)\\s*=\\s*["'](/[^"']*\\.(?:${ASSET_EXT}))["']`,
  'gi',
);

/** نسخهٔ JSX با آکولاد: href={"/x.svg"} */
const ABSOLUTE_ASSET_REF_JSX = new RegExp(
  `(?:href|src)\\s*=\\s*\\{\\s*["'](/[^"']*\\.(?:${ASSET_EXT}))["']\\s*\\}`,
  'gi',
);

function collectSourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'assets' || entry === 'node_modules') continue;
      collectSourceFiles(full, acc);
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      acc.push(full);
    }
  }
  return acc;
}

describe('مسیر فایل‌های استاتیک (سازگاری با نسخهٔ بسته‌بندی‌شده)', () => {
  it('هیچ ارجاع مطلقی به فایل asset در src وجود ندارد', () => {
    const offenders: string[] = [];

    for (const file of collectSourceFiles(SRC)) {
      const code = readFileSync(file, 'utf8');
      for (const re of [ABSOLUTE_ASSET_REF, ABSOLUTE_ASSET_REF_JSX]) {
        re.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = re.exec(code)) !== null) {
          const line = code.slice(0, m.index).split('\n').length;
          const rel = file.slice(process.cwd().length + 1).replace(/\\/g, '/');
          offenders.push(`${rel}:${line} → ${m[1]}`);
        }
      }
    }

    expect(
      offenders,
      'مسیر مطلق در نسخهٔ بسته‌بندی‌شده (file://) به ریشهٔ درایو اشاره می‌کند و ' +
        'فایل پیدا نمی‌شود. به‌جای آن فایل را در src/assets بگذارید و import کنید:\n' +
        "  import x from '../assets/x.svg';  <image href={x} />\n\n" +
        `موارد یافت‌شده:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });
});
