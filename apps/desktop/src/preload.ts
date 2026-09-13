import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('healthManagerDesktop', {
  exportPdf: (filename: string) => ipcRenderer.invoke('healthmanager:export-pdf', filename),
});
