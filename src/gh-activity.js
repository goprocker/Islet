// Developer live activities: GitHub Actions runs, PR checks and deployments for the repos
// the coding agents are working in. Everything goes through the GitHub CLI (`gh`), so Islet
// never stores a token; without gh, or signed out, nothing happens.
const { execFile } = require("child_process");

const FAST_MS = 20000, SLOW_MS = 90000, NO_GH_MS = 10 * 60000;

const gh = (args, cwd) => new Promise(res => execFile("gh", args, { cwd, windowsHide: true, timeout: 20000 }, (err, out) => {
  if (err) return res(null);
  try { res(JSON.parse(out)); } catch { res(null); }
}));

const done = c => c === "success" ? "pass" : c === "skipped" || c === "neutral" ? "skip" : c === "cancelled" ? "cancel" : "fail";

// Actions runs -> [{ id, kind, state, label, repo, url }]; state running / pass / fail / cancel / skip
function runs(list, repo) {
  if (!Array.isArray(list)) return [];
  return list.filter(r => r && r.databaseId != null).map(r => ({
    id: `run:${repo}:${r.databaseId}`, kind: "run", repo,
    state: r.status === "completed" ? done(r.conclusion) : "running",
    label: String(r.workflowName || r.name || "Workflow").slice(0, 40),
    detail: String(r.displayTitle || r.headBranch || "").slice(0, 80),
    url: typeof r.url === "string" ? r.url : "",
  }));
}

// a PR's statusCheckRollup -> one activity for the whole PR, or null when it has no checks
function prChecks(pr, repo) {
  const roll = Array.isArray(pr?.statusCheckRollup) ? pr.statusCheckRollup : [];
  if (!pr || !pr.number || !roll.length) return null;
  let pending = 0, failed = 0, passed = 0;
  for (const c of roll) {
    // CheckRun: status + conclusion; StatusContext (e.g. Netlify): state
    const s = c.__typename === "StatusContext" || c.state ? String(c.state || "").toUpperCase() : null;
    if (s ? s === "PENDING" || s === "EXPECTED" : c.status !== "COMPLETED") pending++;
    else if (s ? s === "SUCCESS" : ["SUCCESS", "NEUTRAL", "SKIPPED"].includes(c.conclusion)) passed++;
    else failed++;
  }
  const total = roll.length;
  return {
    id: `pr:${repo}:${pr.number}`, kind: "pr", repo,
    state: pending ? "running" : failed ? "fail" : "pass",
    label: pending ? `PR #${pr.number} · ${total - pending}/${total} checks` : failed ? `PR #${pr.number} · ${failed} failed` : `PR #${pr.number} · checks passed`,
    detail: String(pr.title || "").slice(0, 80),
    url: typeof pr.url === "string" ? pr.url : "",
  };
}

// the latest deployment and its latest status -> one activity, or null
function deployment(dep, statuses, repo) {
  if (!dep || dep.id == null) return null;
  const st = Array.isArray(statuses) && statuses[0] ? statuses[0].state : "pending";
  const state = st === "success" ? "pass" : st === "failure" || st === "error" ? "fail" : st === "inactive" ? "skip" : "running";
  return {
    id: `deploy:${repo}:${dep.id}`, kind: "deploy", repo, state,
    label: `Deploy · ${String(dep.environment || "production").slice(0, 24)}`,
    detail: String(dep.ref || "").slice(0, 60),
    url: (Array.isArray(statuses) && statuses[0]?.environment_url) || `https://github.com/${repo}/deployments`,
  };
}

// what changed since the last poll: { live: running now, finished: running before and done now }
// `prev` is a Map id -> { state, item, misses }; activities seen for the first time already finished
// are not news. `failed` lists id prefixes ("run:o/r:") whose gh call failed this time (#257): their
// activities are not taken as gone, so a run that finishes during a short outage is still reported
// when gh answers again. They stay, and a running one stays live, for up to MAX_MISSES failed polls.
const MAX_MISSES = 5;
function diff(prev, list, failed = list.failed || []) {
  const finished = [], kept = [];
  for (const a of list) {
    const was = prev.get(a.id)?.state;
    if (was === "running" && a.state !== "running") finished.push(a);
    prev.set(a.id, { state: a.state, item: a, misses: 0 });
  }
  const ids = new Set(list.map(a => a.id));
  for (const [id, e] of prev) {
    if (ids.has(id)) continue;
    if (failed.some(f => id.startsWith(f)) && ++e.misses <= MAX_MISSES) { if (e.state === "running") kept.push(e.item); }
    else prev.delete(id);
  }
  return { live: [...list.filter(a => a.state === "running"), ...kept], finished };
}

// one repo folder -> its activities
async function collect(cwd, cache, call = gh) {
  let repo = cache.get(cwd);
  if (repo === undefined) {
    const v = await call(["repo", "view", "--json", "nameWithOwner"], cwd);
    repo = typeof v?.nameWithOwner === "string" ? v.nameWithOwner : null;
    cache.set(cwd, repo);
  }
  if (!repo) return [];
  const [list, pr, deps] = await Promise.all([
    call(["run", "list", "-R", repo, "-L", "5", "--json", "databaseId,status,conclusion,workflowName,displayTitle,headBranch,url"], cwd),
    call(["pr", "view", "--json", "number,title,url,statusCheckRollup"], cwd), // the current branch's PR
    call(["api", `repos/${repo}/deployments?per_page=1`], cwd),
  ]);
  const out = runs(list, repo);
  // a failed call is not an empty answer: say which sources couldn't be read (#257). gh also fails
  // "pr view" when the branch simply has no PR, so a PR that is gone drops out after MAX_MISSES polls.
  out.failed = [];
  if (!Array.isArray(list)) out.failed.push(`run:${repo}:`);
  if (pr === null) out.failed.push(`pr:${repo}:`);
  if (!Array.isArray(deps)) out.failed.push(`deploy:${repo}:`);
  const p = prChecks(pr, repo);
  if (p) out.push(p);
  const dep = Array.isArray(deps) ? deps[0] : null;
  if (dep) {
    const statuses = await call(["api", `repos/${repo}/deployments/${dep.id}/statuses?per_page=1`], cwd);
    if (statuses === null) out.failed.push(`deploy:${repo}:`);
    else { const d = deployment(dep, statuses, repo); if (d) out.push(d); }
  }
  return out;
}

// cwds() -> the agents' project folders; onUpdate({ live, finished })
function start(cwds, onUpdate, { call = gh, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  const prev = new Map(), cache = new Map();
  let timer = null, stopped = false, lastLive = "";
  const poll = async () => {
    let next = SLOW_MS;
    try {
      const dirs = [...new Set(cwds())].slice(0, 4);
      const per = await Promise.all(dirs.map(d => collect(d, cache, call)));
      if (stopped) return;
      const all = per.flat(), failed = per.flatMap(l => l.failed || []);
      const seen = new Set();
      const list = all.filter(a => !seen.has(a.id) && seen.add(a.id)); // two folders of one repo
      const { live, finished } = diff(prev, list, failed);
      const key = JSON.stringify(live);
      if (finished.length || key !== lastLive) { lastLive = key; onUpdate({ live, finished }); }
      if (live.length) next = FAST_MS;
      if (dirs.length && [...cache.values()].every(r => r === null)) { next = NO_GH_MS; cache.clear(); } // no gh, signed out or no GitHub remote: ask again later
    } catch (e) { console.warn("gh activity", e.message); }
    if (!stopped) timer = setTimer(poll, next);
  };
  poll();
  return () => { stopped = true; clearTimer(timer); };
}

module.exports = { runs, prChecks, deployment, diff, collect, start };
