// Renders the real notch page (real preload) with sample data and saves screenshots at 3x:
// pill, pill-talk, open, album, toast, and each dock tool in the tall view.
// Isolated userData, never loads main.js; the IPC calls the tools make are answered here with sample data.
// usage: electron shot2.js <repo> <art image> <outDir>
const { app, BrowserWindow, ipcMain } = require("electron");
const fs = require("fs"), path = require("path"), os = require("os");
const [repo, artFile, out] = process.argv.slice(-3);
const QRCode = require(path.join(repo, "node_modules", "qrcode"));
app.commandLine.appendSwitch("force-device-scale-factor", "3");
app.setPath("userData", fs.mkdtempSync(path.join(os.tmpdir(), "islet-eh-")));
const wait = ms => new Promise(r => setTimeout(r, ms));

ipcMain.handle("quickGet", () => ({ wifi: true, bluetooth: true, airplane: false, accessibility: false, saver: false, captions: false, bright: 70, vol: 0.45 }));
ipcMain.handle("quickSet", () => ({ wifi: true, bluetooth: true, airplane: false, bright: 70, vol: 0.45 }));
ipcMain.handle("linksGet", () => [
  { title: "GitHub", url: "https://github.com" }, { title: "YouTube", url: "https://youtube.com" }, { title: "Gmail", url: "https://mail.google.com" },
  { title: "Figma", url: "https://figma.com" }, { title: "Islet", url: "https://islet.loopfound.in" }, { title: "Stack Overflow", url: "https://stackoverflow.com" }]);
ipcMain.handle("linksSave", (_, l) => l);
ipcMain.handle("sysStats", () => ({ cpu: 23, cpuName: "AMD Ryzen 7 7840HS", cores: 16, mem: { free: 6.1e9, total: 16e9 }, disk: { free: 212e9, total: 512e9 }, uptime: 5 * 3600 + 42 * 60 }));
ipcMain.handle("phoneStart", async () => {
  const url = "http://192.168.1.20:52814/3f9a1c0d7e2b4a6f8c5d9e1a2b3c4d5e/";
  return { url, qr: await QRCode.toDataURL(url, { margin: 1, width: 240 }) };
});
ipcMain.handle("search", () => []);
for (const ch of ["hover", "phoneStop", "openLink", "timerStart", "stopwatchToggle", "openSettings"]) ipcMain.on(ch, () => {});

app.whenReady().then(async () => {
  const w = new BrowserWindow({ show: false, x: -3000, y: -3000, width: 672, height: 270, frame: false, transparent: true, focusable: false, skipTaskbar: true, hasShadow: false, webPreferences: { preload: path.join(repo, "preload.js"), backgroundThrottling: false } });
  const cdp = w.webContents.debugger;
  cdp.attach("1.3");
  await cdp.sendCommand("Page.enable");
  await cdp.sendCommand("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
  await cdp.sendCommand("Page.addScriptToEvaluateOnNewDocument", { source: `navigator.getBattery = () => Promise.resolve({ level: 0.82, charging: false, addEventListener() {} }); try { localStorage.setItem("clocks", JSON.stringify(["London", "New York", "Tokyo", "Dubai", "San Francisco"])) } catch {}` });
  await w.loadFile(path.join(repo, "renderer", "index.html"));
  // stays hidden: nothing appears on screen
  await wait(300);
  const send = (c, d) => w.webContents.send(c, d);
  const js = c => w.webContents.executeJavaScript(c);
  const art = "data:image/jpeg;base64," + fs.readFileSync(artFile).toString("base64");
  const now = Date.now();
  send("theme", { accent: "album", idleHide: false, pet: true, name: "Gopinath", powerAnim: true, powerAnimStyle: "cinematic" });
  send("media", { active: true, title: "Midnight Drive", artist: "Loopfound Sessions", playing: true, position: 98, duration: 214, updated: now, art, source: "Spotify.exe" });
  const hours = ["14:00", "15:00", "16:00", "17:00", "18:00", "19:00"].map((time, i) => ({ time, temp: [31, 31, 30, 29, 28, 27][i], icon: i < 4 ? "🌤️" : "☁️" }));
  const days = [0, 1, 2, 3, 4].map(i => ({ date: new Date(now + i * 864e5).toISOString().slice(0, 10), hi: [32, 31, 30, 31, 33][i], lo: [25, 24, 24, 25, 26][i], icon: ["🌤️", "🌦️", "🌧️", "🌤️", "☀️"][i] }));
  send("weather", { place: "Chennai", temp: 30, unit: "C", icon: "🌤️", label: "Partly cloudy", humidity: 68, wind: 14, hours, days });
  send("clipboard", [{ text: "npm run build", pinned: true }, { text: "https://islet.loopfound.in" }, { text: "Meeting moved to 4 PM with design" }, { text: "git push origin main" }, { text: "Gopinath · Loopfound" }]);
  send("notes", "Ship the dock\nUpdate the guide screenshots\nCall Asha about the launch");
  send("claude", [
    { id: "a", key: "codex:islet", agent: "codex", project: "islet", cwd: "C:\\islet", status: "working", time: now, actions: [{ action: "Edited notch.css, notch.js", time: now }, { action: "Ran npm test", time: now }, { action: "You: add a weather slot", time: now }] },
    { id: "b", key: "claude:landing", agent: "claude", project: "landing", cwd: "C:\\landing", status: "waiting", time: now - 20000, actions: [{ action: "Wants to run: npm run deploy", time: now - 20000 }] },
    { id: "c", key: "claude:api", agent: "claude", project: "api", cwd: "C:\\api", status: "done", time: now - 600000, actions: [{ action: "Edited routes.js", time: now - 600000 }, { action: "Replied", time: now - 600000 }] },
  ]);
  const levels = Array.from({ length: 24 }, (_, i) => Math.round(70 + 170 * Math.abs(Math.sin(i * 0.9)) * (1 - i / 34)));
  const feed = setInterval(() => send("levels", levels), 33);
  const shot = async name => {
    const r = JSON.parse(await js(`JSON.stringify((({x,width,height}) => ({x,width,height}))(document.getElementById("notch").getBoundingClientRect()))`));
    const clip = { x: r.x - 16, y: 0, width: r.width + 32, height: r.height + 16, scale: 1 };
    const { data } = await cdp.sendCommand("Page.captureScreenshot", { format: "png", clip, captureBeyondViewport: false });
    fs.writeFileSync(path.join(out, name + ".png"), Buffer.from(data, "base64"));
    console.log(name, Math.round(clip.width), "x", Math.round(clip.height));
  };
  await wait(1500);
  await shot("pill-talk");            // the hello on start
  await js(`notch.classList.remove("talking"); render(); 1`);
  await wait(600);
  await shot("pill");
  await js(`setOpen(true); 1`);
  await wait(1200);
  await shot("open");
  await js(`document.getElementById("artBtn").click(); 1`);
  await wait(800);
  await shot("album");
  await js(`document.getElementById("albumv").hidden = true; 1`);
  for (const p of ["dashPanel", "phonePanel", "linksPanel", "clockPanel", "clipPanel", "notesPanel", "timerPanel", "shelfPanel", "weatherPanel", "unitsPanel", "sysPanel", "aiPanel"]) {
    await js(`showPanel("${p}", false); 1`);
    await wait(p === "phonePanel" ? 900 : 700);
    await shot("tool-" + p.replace("Panel", ""));
  }
  await js(`showPanel(null); setOpen(false); 1`);
  await wait(800);
  send("notification", { id: 1, app: "WhatsApp", title: "Arun", body: "Lunch at 1? The new place near the office has a table free, and I can book it if you're in." });
  await wait(1000);
  await shot("toast");
  clearInterval(feed);
  app.exit(0);
}).catch(e => { console.error(e); app.exit(1); });
