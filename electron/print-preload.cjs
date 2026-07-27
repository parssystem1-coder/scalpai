/**
 * Preload مخصوص پنجرهٔ پیش‌نمایش چاپ
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('printPreview', {
  print: () => ipcRenderer.invoke('print-preview:print'),
  savePdf: (defaultPath) => ipcRenderer.invoke('print-preview:save-pdf', { defaultPath }),
  close: () => ipcRenderer.invoke('print-preview:close'),
});
