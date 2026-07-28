/// <reference types="vite/client" />

// File System Access API — هنوز در lib.dom استاندارد TypeScript نیست
interface Window {
  showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
}
