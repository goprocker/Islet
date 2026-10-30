// Time-synced lyrics from lrclib.net (free, no key). Only title, artist and
// duration are sent. Results are cached per song for the session.
const UA = { "User-Agent": "Islet (https://github.com/goprocker/Islet)" };
const cache = new Map();

// "[01:02.50] words" -> { t: 62.5, line: "words" }; a repeated line can carry several
// stamps ("[00:10.00][00:20.00] words"), one entry each. Sorted: the page stops scanning
// at the first line still to come.
function parse(lrc) {
  const out = [];
  for (const row of lrc.split("\n")) {
    const stamps = row.match(/^(?:\[\d+:\d+(?:\.\d+)?\]\s*)+/);
    if (!stamps) continue;
    const line = row.slice(stamps[0].length).trim();
    for (const m of stamps[0].matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)) out.push({ t: Number(m[1]) * 60 + Number(m[2]), line });
  }
  return out.length ? out.sort((a, b) => a.t - b.t) : null;
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

module.exports = { get, parse };
