// Screenshots of the running Islet over its local debug port (start it with --remote-debugging-port=9333).
// Opens the notch and each dock tool, saves PNGs to the output folder, then closes the notch again.
// usage: node liveshot.js <outDir>
const fs = require("fs"), path = require("path");
const out = process.argv[2];
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const page = (await (await fetch("http://127.0.0.1:9333/json")).json()).find(t => t.type === "page" && /renderer\/index\.html/.test(t.url));
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r => (ws.onopen = r));
  let id = 0; const pending = new Map();
  ws.onmessage = m => { const d = JSON.parse(m.data); pending.get(d.id)?.(d.result); pending.delete(d.id); };
  const cmd = (method, params = {}) => new Promise(r => { pending.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
  const js = async e => (await cmd("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true })).result?.value;
  await cmd("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
  const shot = async name => {
    const r = await js(`(({x,width,height}) => ({x,width,height}))(document.getElementById("notch").getBoundingClientRect())`);
    const { data } = await cmd("Page.captureScreenshot", { format: "png", clip: { x: r.x - 16, y: 0, width: r.width + 32, height: r.height + 16, scale: 2 } });
    fs.writeFileSync(path.join(out, name + ".png"), Buffer.from(data, "base64"));
    console.log(name);
  };
  await js(`window.bridge.hover(true); 1`); // the window takes the mouse while we drive it
  await shot("pill");
  await js(`setOpen(true); 1`); await wait(1200); await shot("open");
  for (const p of ["dashPanel", "phonePanel", "linksPanel", "clockPanel", "clipPanel", "notesPanel", "timerPanel", "shelfPanel", "weatherPanel", "unitsPanel", "sysPanel", "aiPanel"]) {
    await js(`showPanel("${p}", false); 1`); await wait(p === "phonePanel" || p === "sysPanel" ? 1500 : 800);
    await shot("tool-" + p.replace("Panel", ""));
  }
  await js(`showPanel(null); setOpen(false); window.bridge.hover(false); 1`);
  ws.close();
})();
