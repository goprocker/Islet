// GitHub notifications (review requests, CI failures, mentions...) through the GitHub CLI.
// Uses `gh`'s own sign-in, so Islet never stores a token. Nothing happens without `gh`.
const { execFile } = require("child_process");

const POLL_MS = 3 * 60000;
const REASON = {
  review_requested: "Review requested", ci_activity: "CI", mention: "Mentioned", team_mention: "Team mentioned",
  assign: "Assigned", author: "Activity", comment: "Comment", state_change: "State changed", security_alert: "Security alert",
};

// gh's JSON -> new notifications only ([{ id, repo, title, reason, url }]); `seen` is a Set of ids
function fresh(list, seen) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const n of list) {
    if (!n || typeof n.id !== "string" || seen.has(n.id)) continue;
    seen.add(n.id);
    const repo = n.repository?.full_name || "";
    // API URLs point at api.github.com; turn the common ones into pages people can open
    const api = n.subject?.url || "";
    const m = api.match(/^https:\/\/api\.github\.com\/repos\/([^/]+\/[^/]+)\/(pulls|issues)\/(\d+)$/);
    const url = m ? `https://github.com/${m[1]}/${m[2] === "pulls" ? "pull" : "issues"}/${m[3]}` : repo ? `https://github.com/${repo}` : "";
    out.push({ id: n.id, repo, title: String(n.subject?.title || "").slice(0, 140), reason: REASON[n.reason] || "GitHub", url });
  }
  return out;
}

function start(onNew, run = (cb) => execFile("gh", ["api", "notifications"], { windowsHide: true, timeout: 20000 }, cb)) {
  const seen = new Set();
  let first = true, timer = null, stopped = false;
  const poll = () => {
    run((err, stdout) => {
      if (stopped) return;
      if (!err) {
        let list = null;
        try { list = JSON.parse(stdout); } catch {}
        const news = fresh(list, seen);
        // the first poll only learns what's already there
        if (!first && news.length) onNew(news);
        first = false;
      }
      // no gh or not signed in: try again much later
      timer = setTimeout(poll, err ? POLL_MS * 5 : POLL_MS);
    });
  };
  poll();
  return () => { stopped = true; clearTimeout(timer); };
}

module.exports = { fresh, start };
