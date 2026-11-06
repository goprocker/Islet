// run by the Netlify build: bakes the GitHub counts into public/stats.json so visitors never hit the API rate limit
// on any failure no file is written and stats.js falls back to asking GitHub directly
import fs from "node:fs";
const api = p => fetch("https://api.github.com/repos/goprocker/Islet" + p, { headers: { "User-Agent": "islet-site-build" } }).then(r => r.ok ? r.json() : Promise.reject(new Error(p + " " + r.status)));

(async () => {
  try {
    const [repo, rels] = await Promise.all([api(""), api("/releases?per_page=100")]);
    const downloads = rels.flatMap(r => r.assets).filter(a => a.name.endsWith(".exe")).reduce((n, a) => n + a.download_count, 0);
    fs.mkdirSync("public", { recursive: true });
    fs.writeFileSync("public/stats.json", JSON.stringify({ downloads, stars: repo.stargazers_count, forks: repo.forks_count }));
    console.log("stats baked:", downloads, "downloads,", repo.stargazers_count, "stars,", repo.forks_count, "forks");
  } catch (e) {
    console.warn("stats not baked:", e.message);
  }
})();
