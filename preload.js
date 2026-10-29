const { contextBridge, ipcRenderer } = require("electron");

const on = ch => fn => ipcRenderer.on(ch, (_, d) => fn(d));
contextBridge.exposeInMainWorld("bridge", {
  onMedia: on("media"),
  onClaude: on("claude"),
  onToggle: on("toggle"),
  onLevels: on("levels"),
  onVolume: on("volume"),
  onSpotifyExtras: on("spotifyExtras"),
  onNotification: on("notification"),
  onCalendar: on("calendar"),
  onTimer: on("timer"),
  onSpotifyIcon: on("spotifyIcon"),
  onSystem: on("system"),
  onPermission: on("permission"),
  onPermissionGone: on("permissionGone"),
  answerPermission: (id, decision) => ipcRenderer.send("permissionAnswer", id, decision),
  control: cmd => ipcRenderer.send("control", cmd),
  hover: over => ipcRenderer.send("hover", over),
  seek: sec => ipcRenderer.send("seek", sec),
  volume: delta => ipcRenderer.send("volume", delta),
  like: () => ipcRenderer.send("like"),
  openProject: cwd => ipcRenderer.send("openProject", cwd),
});
