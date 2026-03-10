const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("adSim", {
  realClose: () => ipcRenderer.send("real-close"),
  dodge: () => ipcRenderer.send("dodge"),
  multiply: () => ipcRenderer.send("multiply"),
});
