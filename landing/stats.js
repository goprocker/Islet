// counts baked into stats.json at deploy time; falls back to GitHub straight from the visitor's browser; any failure leaves the line hidden
(async () => {
  const els = document.querySelectorAll("[data-stats]");
  if (!els.length) return;
  try {
    let s;
    try {
      const r = await fetch("stats.json");
      if (!r.ok) throw 0;
      s = await r.json();
    } catch {
      const [repo, rels] = await Promise.all(["", "/releases"].map(p => fetch("https://api.github.com/repos/goprocker/Islet" + p).then(r => r.ok ? r.json() : Promise.reject())));
      s = { downloads: rels.flatMap(r => r.assets).filter(a => a.name.endsWith(".exe")).reduce((n, a) => n + a.download_count, 0), stars: repo.stargazers_count, forks: repo.forks_count };
    }
    const n = (v, one, many) => v.toLocaleString() + " " + (v === 1 ? one : many);
    const text = [n(s.downloads, "download", "downloads"), n(s.stars, "GitHub star", "GitHub stars"), n(s.forks, "fork", "forks")].join(" · ");
    els.forEach(el => { el.textContent = text; el.hidden = false; });
  } catch {}
})();
