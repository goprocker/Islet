// Time-synced lyrics from lrclib.net (free, no key). Only title, artist and
// duration are sent. Results are cached per song for the session.
const UA = { "User-Agent": "Islet (https://github.com/goprocker/Islet)" };
const cache = new Map();

// "[01:02.50] words" -> { t: 62.5, line: "words" }
function parse(lrc) {
  const out = [];
  for (const row of lrc.split("\n")) {
    const m = row.match(/^\[(\d+):(\d+(?:\.\d+)?)\]\s*(.*)$/);
    if (m) out.push({ t: Number(m[1]) * 60 + Number(m[2]), line: m[3].trim() });
  }
  return out.length ? out : null;
}

// Spotify titles often carry '(From "Movie")' or '- Remastered 2011'
const clean = s => s.replace(/\s*[([].*?[)\]]/g, "").replace(/\s+-\s+.*$/, "").trim();

async function json(url) {
  const r = await fetch(url, { headers: UA });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`lrclib ${r.status}`);
  return r.json();
}

async function lookup(title, artist, duration) {
  const q = new URLSearchParams({ track_name: title, artist_name: artist });
  if (duration) q.set("duration", Math.round(duration));
  try {
    const hit = await json(`https://lrclib.net/api/get?${q}`);
    if (hit?.syncedLyrics) return parse(hit.syncedLyrics);
  } catch {}
  // fall back to search; prefer synced lyrics whose length matches the song
  const list = await json(`https://lrclib.net/api/search?${new URLSearchParams({ q: `${clean(title)} ${artist.split(",")[0]}` })}`) || [];
  const synced = list.filter(x => x.syncedLyrics);
  const best = synced.find(x => !duration || Math.abs(x.duration - duration) < 4) || synced[0];
  return best ? parse(best.syncedLyrics) : null;
}

function get(title, artist, duration) {
  const key = `${title}|${artist}`;
  if (!cache.has(key)) cache.set(key, lookup(title, artist, duration).catch(() => { cache.delete(key); return null; }));
  return cache.get(key);
}

// What the page should show follows the song: update() asks once per song (null = no song
// or lyrics turned off), resend() fills a page that reloaded and lost them. An answer for
// a song that's no longer current is dropped; one still on its way reaches the new page.
function follower(send, fetchLines = get) {
  let asked = "", lines = null;
  return {
    update(song) {
      const key = song ? `${song.title}|${song.artist}` : "";
      if (key === asked) return;
      asked = key;
      lines = null;
      send(null);
      if (song) fetchLines(song.title, song.artist || "", song.duration).then(l => { if (asked === key) { lines = l; send(l); } });
    },
    resend() { send(lines); },
  };
}

module.exports = { get, parse, follower };
