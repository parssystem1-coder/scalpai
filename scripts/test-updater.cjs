#!/usr/bin/env node
/**
 * test-updater.cjs — تست کنترلر به‌روزرسانی خودکار (موج ۳ / O1)
 * -----------------------------------------------------------------------
 * electron/updater.cjs با dependency injection نوشته شده تا این‌جا بدون Electron
 * واقعی تست شود. پوشش:
 *  ۱) dev/نامشهود: stub کامل — بدون شبکه، بدون exception
 *  ۲) رویدادها وضعیت را صحیح جلو می‌برند و notify با type فارسی‌پذیر صدا می‌شود
 *  ۳) checkNow موفق/ناموفق
 *  ۴) installNow فقط بعد از دانلود موفق جواب می‌دهد و quitAndInstall درست صدا زده می‌شود
 *  ۵) start() چک تأخیری را با unref زمان‌بندی می‌کند
 *  ۶) notify خطادار نباید کنترلر را بکشد (بنر خراب ≠ مرگ آپدیتر)
 */
const assert = require('assert');
const { EventEmitter } = require('events');
const { createAutoUpdateController, UPDATE_CHECK_DELAY_MS } = require('../electron/updater.cjs');

let failed = 0;
const fail = (msg) => { console.error(`✗ ${msg}`); failed += 1; };
const pass = (msg) => console.log(`✓ ${msg}`);

function makeFakeAutoUpdater({ checkError = null } = {}) {
  const calls = { checkForUpdates: 0, quitAndInstall: [] };
  const emitter = new EventEmitter();
  return {
    calls,
    checkForUpdates: async () => {
      calls.checkForUpdates += 1;
      if (checkError) throw checkError;
      return { updateInfo: { version: '9.9.9' } };
    },
    quitAndInstall: (isSilent, isForceRunAfter) => {
      calls.quitAndInstall.push([isSilent, isForceRunAfter]);
    },
    on: (...args) => emitter.on(...args),
    off: (...args) => emitter.off(...args),
    emit: (...args) => emitter.emit(...args),
  };
}

async function main() {
  // ۱) dev stub
  {
    const c = createAutoUpdateController({ isPackaged: false, autoUpdater: makeFakeAutoUpdater(), notify: fail.bind(null, 'notify در dev نباید صدا شود') });
    const s = c.getState();
    assert.strictEqual(s.enabled, false, 'dev: enabled=false');
    assert.strictEqual((await c.checkNow()).ok, false, 'dev: checkNow ناموفق');
    assert.strictEqual(c.installNow(), false, 'dev: installNow=false');
    c.start(); // no-op — نباید exception بدهد
    pass('dev stub: غیرفعال، بدون شبکه و بدون خطا');
  }

  // ۲) جریان رویدادها
  {
    const fake = makeFakeAutoUpdater();
    const events = [];
    const c = createAutoUpdateController({
      isPackaged: true,
      autoUpdater: fake,
      notify: (status) => events.push(status),
      log: { info: () => {}, warn: () => {}, error: () => {} },
    });
    assert.strictEqual(c.getState().enabled, true, 'packaged: enabled=true');

    fake.emit('checking-for-update');
    assert.strictEqual(c.getState().checking, true);
    assert.deepStrictEqual(events.at(-1), { type: 'checking' });

    fake.emit('update-available', { version: '1.2.0' });
    assert.strictEqual(c.getState().checking, false);
    assert.strictEqual(c.getState().updateAvailable, true);
    assert.strictEqual(c.getState().version, '1.2.0');
    assert.deepStrictEqual(events.at(-1), { type: 'available', version: '1.2.0' });

    fake.emit('update-not-available');
    assert.strictEqual(c.getState().updateAvailable, false);
    assert.deepStrictEqual(events.at(-1), { type: 'not-available' });

    fake.emit('update-downloaded', { version: '1.2.0' });
    assert.strictEqual(c.getState().updateDownloaded, true);
    assert.deepStrictEqual(events.at(-1), { type: 'downloaded', version: '1.2.0' });

    fake.emit('error', new Error('network down'));
    assert.strictEqual(c.getState().error, 'network down');
    assert.deepStrictEqual(events.at(-1), { type: 'error', error: 'network down' });
    pass('رویدادها: وضعیت و notify برای هر ۵ رویداد درست است');
  }

  // ۳) installNow گیت دانلود
  {
    const fake = makeFakeAutoUpdater();
    const c = createAutoUpdateController({ isPackaged: true, autoUpdater: fake, notify: () => {}, log: { info: () => {}, warn: () => {}, error: () => {} } });
    assert.strictEqual(c.installNow(), false, 'بدون دانلود نباید نصب کند');
    assert.strictEqual(fake.calls.quitAndInstall.length, 0, 'quitAndInstall صدا نخورده');
    fake.emit('update-downloaded', { version: '2.0.0' });
    assert.strictEqual(c.installNow(), true, 'بعد از دانلود نصب مجاز است');
    assert.deepStrictEqual(fake.calls.quitAndInstall, [[false, true]], 'quitAndInstall(false, true) برای ری‌استارت بعد از نصب');
    pass('installNow: گیت دانلود + آرگومان‌های quitAndInstall');
  }

  // ۴) checkNow موفق و ناموفق
  {
    const okFake = makeFakeAutoUpdater();
    const okCtl = createAutoUpdateController({ isPackaged: true, autoUpdater: okFake, notify: () => {}, log: { info: () => {}, warn: () => {}, error: () => {} } });
    assert.deepStrictEqual(await okCtl.checkNow(), { ok: true });

    const errors = [];
    const badFake = makeFakeAutoUpdater({ checkError: new Error('offline') });
    const badCtl = createAutoUpdateController({ isPackaged: true, autoUpdater: badFake, notify: (s) => errors.push(s), log: { info: () => {}, warn: () => {}, error: () => {} } });
    const res = await badCtl.checkNow();
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.error, 'offline');
    assert.deepStrictEqual(errors.at(-1), { type: 'error', error: 'offline' }, 'خطای چک دستی هم به بنر می‌رسد');
    pass('checkNow: موفق ok:true و ناموفق با پیام خطا + رویداد error');
  }

  // ۵) start() زمان‌بندی تأخیری + unref
  {
    const fake = makeFakeAutoUpdater();
    let scheduled = null;
    let unrefCalled = false;
    const c = createAutoUpdateController({
      isPackaged: true,
      autoUpdater: fake,
      notify: () => {},
      log: { info: () => {}, warn: () => {}, error: () => {} },
      setTimeoutFn: (fn, ms) => { scheduled = { fn, ms }; return { unref: () => { unrefCalled = true; } }; },
    });
    c.start();
    assert.strictEqual(scheduled.ms, UPDATE_CHECK_DELAY_MS, `تأخیر ${UPDATE_CHECK_DELAY_MS}ms`);
    assert.strictEqual(unrefCalled, true, 'unref صدا زده شد تا خروج اپ گیر نکند');
    assert.strictEqual(fake.calls.checkForUpdates, 0, 'بلافاصله چک نشده');
    await scheduled.fn();
    await new Promise(r => setImmediate(r));
    assert.strictEqual(fake.calls.checkForUpdates, 1, 'بعد از تأخیر، چک انجام شد');
    pass('start(): چک تأخیری با unref، نه فوری');
  }

  // ۶) notify خطادار
  {
    const fake = makeFakeAutoUpdater();
    const logs = [];
    const c = createAutoUpdateController({
      isPackaged: true,
      autoUpdater: fake,
      notify: () => { throw new Error('renderer gone'); },
      log: { info: () => {}, warn: (m) => logs.push(m), error: (m) => logs.push(m) },
    });
    fake.emit('update-available', { version: '1.0.1' }); // نباید throw کند
    assert.strictEqual(c.getState().updateAvailable, true, 'وضعیت داخلی سالم ماند');
    pass('notify خطادار: کنترلر نمی‌میرد و وضعیت صحیح می‌ماند');
  }

  if (failed) {
    console.error(`\n${failed} تست شکست خورد.`);
    process.exit(1);
  }
  console.log('\nهمهٔ تست‌های updater سبز شدند.');
}

main().catch((err) => {
  console.error('تست updater با خطای غیرمنتظره متوقف شد:', err);
  process.exit(1);
});
