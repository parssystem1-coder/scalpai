/**
 * ScalpAI - Preload Script
 * API های در دسترس برای renderer process
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // =============== Database ===============
  db: {
    query: (method, params) => ipcRenderer.invoke('db:query', { method, params }),
  },

  // =============== Proxy Settings ===============
  proxy: {
    set: (proxyUrl) => ipcRenderer.invoke('proxy:set', proxyUrl),
    get: () => ipcRenderer.invoke('proxy:get'),
    test: (testUrl) => ipcRenderer.invoke('proxy:test', testUrl),
  },

  // =============== Dialog ===============
  dialog: {
    selectDirectory: () => ipcRenderer.invoke('dialog:selectDirectory'),
    saveFile: (options) => ipcRenderer.invoke('dialog:saveFile', options),
    openFile: (options) => ipcRenderer.invoke('dialog:openFile', options),
  },

  // =============== File System (فقط مسیرهای مجاز از دیالوگ) ===============
  fs: {
    saveFile: (filePath, data) => ipcRenderer.invoke('fs:saveFile', { filePath, data }),
    readFile: (filePath) => ipcRenderer.invoke('fs:readFile', filePath),
  },

  // =============== Backup Package v3 (فاز ۰.۵) ===============
  // بکاپ/بازیابی پوشه‌ای استریمی — انتخاب پوشه/فایل با دیالوگ در main انجام می‌شود
  backup: {
    exportPackage: (params) => ipcRenderer.invoke('backup:export', params),
    importAuto: () => ipcRenderer.invoke('backup:import'),
  },

  // =============== App ===============
  app: {
    getPath: (name) => ipcRenderer.invoke('app:getPath', name),
    quit: () => ipcRenderer.invoke('app:quit'),
  },

  // =============== Print (رنگی) ===============
  print: {
    html: (html) => ipcRenderer.invoke('print:html', { html }),
    preview: (html) => ipcRenderer.invoke('print:preview', { html }),
    toPdf: (html, defaultPath) => ipcRenderer.invoke('print:toPdf', { html, defaultPath }),
  },

  // =============== Auth Session ===============
  auth: {
    createSession: (username, password) => ipcRenderer.invoke('auth:createSession', { username, password }),
    validateSession: (token) => ipcRenderer.invoke('auth:validateSession', { token }),
    destroySession: (token) => ipcRenderer.invoke('auth:destroySession', { token }),
    updateUsername: (token, username) => ipcRenderer.invoke('auth:updateUsername', { token, username }),
  },

  // =============== Safe Storage ===============
  // فقط وضعیت در دسترس بودن؛ encrypt/decrypt عمداً به renderer داده نمی‌شود
  // (کلید API فقط داخل main از طریق createValueCrypto رمز می‌شود).
  safeStorage: {
    isAvailable: () => ipcRenderer.invoke('safeStorage:isAvailable'),
  },

  // =============== Offline Analysis ===============
  offline: {
    analyze: (base64Image, lang) => ipcRenderer.invoke('offline:analyze', { base64Image, lang }),
    checkPython: () => ipcRenderer.invoke('offline:checkPython'),
  },

  // =============== AI Provider ===============
  ai: {
    analyze: (params) => ipcRenderer.invoke('ai:analyze', params),
    testConnection: (params) => ipcRenderer.invoke('ai:testConnection', params),
    cancel: (requestId) => ipcRenderer.invoke('ai:cancel', { requestId }),
  },

  // Platform Info
  platform: process.platform,
  isElectron: true,
});

contextBridge.exposeInMainWorld('isElectron', true);
