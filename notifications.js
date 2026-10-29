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
