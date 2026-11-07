// download, star and fork counts, live from GitHub; falls back to stats.json baked at deploy time; any failure leaves the line hidden
(async () => {
  const els = document.querySelectorAll("[data-stats]");
  if (!els.length) return;
  try {
    // live from GitHub first, so the count is current; the deploy-time stats.json covers the API's rate limit
    let s;
    try {
      const [repo, rels] = await Promise.all(["", "/releases?per_page=100"].map(p => fetch("https://api.github.com/repos/goprocker/Islet" + p).then(r => r.ok ? r.json() : Promise.reject())));
      s = { downloads: rels.flatMap(r => r.assets).filter(a => a.name.endsWith(".exe")).reduce((n, a) => n + a.download_count, 0), stars: repo.stargazers_count, forks: repo.forks_count };
    } catch {
      const r = await fetch("stats.json");
      if (!r.ok) throw 0;
      s = await r.json();
    }
    const n = (v, one, many) => v.toLocaleString() + " " + (v === 1 ? one : many);
    const text = [n(s.downloads, "download", "downloads"), n(s.stars, "GitHub star", "GitHub stars"), n(s.forks, "fork", "forks")].join(" · ");
    els.forEach(el => { el.textContent = text; el.hidden = false; });
  } catch {}
})();
