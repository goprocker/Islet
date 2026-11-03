// prints guide.html to out.pdf and reports each page's free space above its footer (px)
const { app, BrowserWindow } = require("electron"); const fs = require("fs"), path = require("path");
app.setPath("userData", fs.mkdtempSync(path.join(require("os").tmpdir(), "islet-eh-")));
app.whenReady().then(async () => {
  const w = new BrowserWindow({ show: false, width: 794 });
  await w.loadFile(path.join(__dirname, "guide.html"));
  await new Promise(r => setTimeout(r, 800));
  console.log("FREE " + await w.webContents.executeJavaScript(`[...document.querySelectorAll('.page')].map((p,i)=>{const f=p.querySelector('.foot').getBoundingClientRect().top;const last=[...p.children].filter(c=>!c.classList.contains('foot')&&!c.classList.contains('meta')).pop().getBoundingClientRect().bottom;return (i+1)+':'+Math.round(f-last)}).join(' ')`));
  console.log("BROKEN IMAGES " + await w.webContents.executeJavaScript(`[...document.images].filter(i=>!i.naturalWidth).length`));
  fs.writeFileSync(path.join(__dirname, "out.pdf"), await w.webContents.printToPDF({ pageSize: "A4", printBackground: true, margins: { marginType: "none" }, preferCSSPageSize: true }));
  app.exit(0);
});
