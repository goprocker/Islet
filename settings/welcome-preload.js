const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("welcome", {
  load: () => ipcRenderer.invoke("welcome:load"),
  finish: choices => ipcRenderer.invoke("welcome:finish", choices),
});
