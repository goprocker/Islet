// public counts straight from GitHub, in the visitor's browser; any failure leaves the line hidden
(async () => {
  const els = document.querySelectorAll("[data-stats]");
  if (!els.length) return;
  try {
    const [repo, rels] = await Promise.all(["", "/releases"].map(p => fetch("https://api.github.com/repos/goprocker/Islet" + p).then(r => r.ok ? r.json() : Promise.reject())));
    const downloads = rels.flatMap(r => r.assets).filter(a => a.name.endsWith(".exe")).reduce((n, a) => n + a.download_count, 0);
    const n = (v, one, many) => v.toLocaleString() + " " + (v === 1 ? one : many);
    const text = [n(downloads, "download", "downloads"), n(repo.stargazers_count, "GitHub star", "GitHub stars"), n(repo.forks_count, "fork", "forks")].join(" · ");
    els.forEach(el => { el.textContent = text; el.hidden = false; });
  } catch {}
})();
