// New Windows notifications, read from the system notification database.
// (The official listener API needs a packaged app identity; this file needs none.)
const path = require("path");

const DB = path.join(process.env.LOCALAPPDATA || "", "Microsoft", "Windows", "Notifications", "wpndatabase.db");

// "5319275A.WhatsAppDesktop_cv1g...!App" -> "WhatsApp"
const KNOWN = { whatsapp: "WhatsApp", yourphone: "Phone Link", chrome: "Chrome", msedge: "Edge", outlook: "Outlook", teams: "Teams", discord: "Discord", telegram: "Telegram", slack: "Slack", spotify: "Spotify" };
function appName(id) {
  const low = id.toLowerCase();
  // Phone Link mirrors phone apps: "...YourPhoneNotifications_com.whatsapp"
  const phone = low.match(/yourphonenotifications_(?:com\.)?([a-z]+)/);
  if (phone) return KNOWN[phone[1]] || phone[1];
  for (const k in KNOWN) if (low.includes(k)) return KNOWN[k];
  // plain exe ids like "{GUID}\WindowsPowerShell\v1.0\powershell.exe"
  if (/\.exe$/i.test(id)) {
    const exe = id.split("\\").pop().replace(/\.exe$/i, "");
    return exe.charAt(0).toUpperCase() + exe.slice(1);
  }
  const base = id.split("!")[0].split("_")[0].split(".").pop();
  return base.replace(/([a-z])([A-Z])/g, "$1 $2");
}
const decode = s => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
function texts(xml) {
  const out = [];
  for (const m of xml.matchAll(/<text(?![^>]*placement="attribution")[^>]*>([\s\S]*?)<\/text>/g)) {
    const t = decode(m[1]).trim();
    if (t) out.push(t);
  }
  return out;
}

function watch(onNew) {
  let db, lastId = null;
  const open = () => {
    const { DatabaseSync } = require("node:sqlite");
    db = new DatabaseSync(DB, { readOnly: true });
  };
  const poll = () => {
    try {
      if (!db) open();
      if (lastId === null) {
        lastId = db.prepare("select max(Id) m from Notification").get().m || 0;
        return;
      }
      const rows = db.prepare(
        "select n.Id id, h.PrimaryId app, cast(n.Payload as text) xml from Notification n join NotificationHandler h on h.RecordId = n.HandlerId where n.Id > ? and n.Type = 'toast' order by n.Id"
      ).all(lastId);
      for (const r of rows) {
        lastId = Math.max(lastId, r.id);
        const t = texts(r.xml || "");
        if (!t.length) continue;
        const app = appName(r.app || "");
        if (app === "Spotify") continue; // already shown as music
        onNew({ app, title: t[0], body: t.slice(1).join(" · "), aumid: r.app || "", xml: r.xml || "" });
      }
    } catch (e) {
      try { db?.close(); } catch {}
      db = null;
    }
  };
  poll();
  setInterval(poll, 2000);
}

module.exports = { watch };

// Windows' own banners (bottom right). Islet shows the pop-up instead, so it can
// turn each app's banner off; notifications still reach the notification centre.
// `saved` maps app id -> its previous ShowBanner value (null = not set), to undo exactly.
const { execFileSync } = require("child_process");
const fs = require("fs"), os = require("os");
// built with join: hand-written backslashes here were lost once already
const KEY = ["HKEY_CURRENT_USER", "Software", "Microsoft", "Windows", "CurrentVersion", "Notifications", "Settings", ""].join("\\");
// every app's current ShowBanner value, from one `reg query`
function readBanners() {
  const out = {};
  try {
    let id = null;
    const text = execFileSync("reg", ["query", KEY.slice(0, -1), "/s", "/v", "ShowBanner"], { encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
    for (const line of text.split(/\r?\n/)) {
      if (line.startsWith(KEY)) id = line.slice(KEY.length);
      const m = line.match(/^\s+ShowBanner\s+REG_DWORD\s+0x([0-9a-f]+)/i);
      if (m && id) out[id] = parseInt(m[1], 16);
    }
  } catch {}
  return out;
}
// one `reg import` for all changes (null deletes the value); false when it failed
function writeBanners(values) {
  const ids = Object.keys(values);
  if (!ids.length) return true;
  const body = ids.map(id => `[${KEY}${id}]\r\n"ShowBanner"=${values[id] === null ? "-" : "dword:" + values[id].toString(16).padStart(8, "0")}\r\n`).join("\r\n");
  const file = path.join(os.tmpdir(), `islet-banners-${process.pid}.reg`);
  let ok = true;
  try {
    fs.writeFileSync(file, "﻿Windows Registry Editor Version 5.00\r\n\r\n" + body, "utf16le");
    execFileSync("reg", ["import", file], { windowsHide: true, stdio: "ignore" });
  } catch (e) { ok = false; console.warn("banners", e.message); }
  try { fs.rmSync(file, { force: true }); } catch {}
  return ok;
}
// written to a temp file first, so a crash mid-save never leaves half a journal
function saveJournal(file, saved) {
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(saved, null, 2));
  fs.renameSync(tmp, file);
}
function hideBanners(saved, ids, persist) {
  if (!ids) {
    try {
      const { DatabaseSync } = require("node:sqlite");
      const db = new DatabaseSync(DB, { readOnly: true });
      ids = db.prepare("select PrimaryId id from NotificationHandler").all().map(r => r.id).filter(Boolean);
      db.close();
    } catch { ids = []; }
  }
  // check the registry itself, not just `saved`: an earlier write may not have landed
  const now = readBanners(), changes = {}, fresh = {};
  for (const id of ids) {
    if (now[id] === 0 || /[\]\r\n]/.test(id)) continue;
    if (!(id in saved)) fresh[id] = id in now ? now[id] : null;
    changes[id] = 0;
  }
  if (!Object.keys(changes).length) return 0;
  // the old values reach the disk before the registry changes, so a crash right after can
  // still be undone by the next run. Without that record, banners are left as they are.
  if (Object.keys(fresh).length) {
    try { persist({ ...saved, ...fresh }); } catch (e) {
      console.warn("banners: can't save the journal, leaving banners on:", e.message);
      return Object.keys(changes).length;
    }
    Object.assign(saved, fresh);
  }
  writeBanners(changes);
  const after = readBanners(), missed = Object.keys(changes).filter(id => after[id] !== 0).length;
  if (missed) console.warn(`banners: ${missed} of ${Object.keys(changes).length} apps still show Windows banners`);
  return missed; // apps whose banner is still on
}
// `saved` is the only record of the old values: an entry is dropped only once the
// registry shows it back as it was, so a failed restore is retried on a later run.
// Returns how many apps are still not restored.
function restoreBanners(saved) {
  if (!Object.keys(saved).length) return 0;
  const ok = writeBanners(saved), after = readBanners();
  for (const id of ok ? Object.keys(saved) : []) {
    const back = saved[id] === null ? !(id in after) : after[id] === saved[id];
    if (back) delete saved[id];
  }
  const left = Object.keys(saved).length;
  if (left) console.warn(`banners: ${left} apps not restored yet; will retry`);
  return left;
}

module.exports.hideBanners = hideBanners;
module.exports.restoreBanners = restoreBanners;
module.exports.saveJournal = saveJournal;
