const test = require("node:test");
const assert = require("node:assert");
const { runs, prChecks, deployment, diff, collect } = require("../src/gh-activity");

test("runs map status and conclusion", () => {
  const r = runs([
    { databaseId: 1, status: "in_progress", workflowName: "CI", displayTitle: "fix x", url: "https://github.com/a/b/actions/runs/1" },
    { databaseId: 2, status: "completed", conclusion: "success", workflowName: "Release" },
    { databaseId: 3, status: "completed", conclusion: "failure", workflowName: "CI" },
    { databaseId: 4, status: "queued", workflowName: "CI" },
  ], "a/b");
  assert.deepStrictEqual(r.map(x => x.state), ["running", "pass", "fail", "running"]);
  assert.strictEqual(r[0].id, "run:a/b:1");
  assert.deepStrictEqual(runs(null, "a/b"), []);
});

test("PR checks roll up CheckRuns and StatusContexts", () => {
  const pr = { number: 7, title: "t", url: "u", statusCheckRollup: [
    { __typename: "CheckRun", status: "COMPLETED", conclusion: "SUCCESS" },
    { __typename: "StatusContext", state: "PENDING" },
  ] };
  assert.strictEqual(prChecks(pr, "a/b").state, "running");
  assert.match(prChecks(pr, "a/b").label, /1\/2 checks/);
  pr.statusCheckRollup[1].state = "FAILURE";
  assert.strictEqual(prChecks(pr, "a/b").state, "fail");
  pr.statusCheckRollup[1].state = "SUCCESS";
  assert.strictEqual(prChecks(pr, "a/b").state, "pass");
  assert.strictEqual(prChecks({ number: 1, statusCheckRollup: [] }, "a/b"), null);
  assert.strictEqual(prChecks(null, "a/b"), null);
});

test("deployment state comes from its latest status", () => {
  const d = { id: 9, environment: "production", ref: "main" };
  assert.strictEqual(deployment(d, [{ state: "in_progress" }], "a/b").state, "running");
  assert.strictEqual(deployment(d, [], "a/b").state, "running");
  assert.strictEqual(deployment(d, [{ state: "success", environment_url: "https://x" }], "a/b").url, "https://x");
  assert.strictEqual(deployment(d, [{ state: "error" }], "a/b").state, "fail");
  assert.strictEqual(deployment(null, [], "a/b"), null);
});

test("diff reports only runs that finished while watched", () => {
  const prev = new Map();
  let u = diff(prev, [{ id: "a", state: "running" }, { id: "b", state: "pass" }]);
  assert.deepStrictEqual(u.live.map(x => x.id), ["a"]);
  assert.deepStrictEqual(u.finished, []); // b was already done when first seen
  u = diff(prev, [{ id: "a", state: "fail" }, { id: "b", state: "pass" }]);
  assert.deepStrictEqual(u.finished.map(x => x.id), ["a"]);
  assert.deepStrictEqual(u.live, []);
  diff(prev, []);
  assert.strictEqual(prev.size, 0);
});

test("collect asks gh once for the repo, then runs, PR and deployments", async () => {
  const calls = [];
  const call = async args => {
    calls.push(args.slice(0, 2).join(" "));
    if (args[0] === "repo") return { nameWithOwner: "a/b" };
    if (args[0] === "run") return [{ databaseId: 1, status: "in_progress", workflowName: "CI" }];
    if (args[0] === "pr") return null; // no PR for this branch
    if (args[1].endsWith("deployments?per_page=1")) return [{ id: 5, environment: "prod" }];
    return [{ state: "success" }];
  };
  const cache = new Map();
  const out = await collect("C:\p", cache, call);
  assert.deepStrictEqual(out.map(a => a.kind), ["run", "deploy"]);
  await collect("C:\p", cache, call);
  assert.strictEqual(calls.filter(c => c === "repo view").length, 1);
  assert.deepStrictEqual(await collect("C:\q", new Map([["C:\q", null]]), call), []);
});

// a gh stand-in: the repo, then whatever runs() returns for the current stage (null = gh failed)
const fakeGh = runsNow => async args => args[0] === "repo" ? { nameWithOwner: "o/r" } : args[0] === "run" ? runsNow() : null;
const run1 = (status, conclusion = null) => [{ databaseId: 1, status, conclusion, workflowName: "CI" }];

test("a failed poll keeps a watched run, and its result comes when gh answers again (#257)", async () => {
  const prev = new Map(), cache = new Map();
  let now = run1("in_progress");
  const call = fakeGh(() => now);
  let u = diff(prev, await collect("p", cache, call));
  assert.deepStrictEqual(u.live.map(a => a.id), ["run:o/r:1"]);
  now = null;                                   // gh fails (timeout, network, signed out)
  u = diff(prev, await collect("p", cache, call));
  assert.deepStrictEqual(u.live.map(a => a.id), ["run:o/r:1"], "still shown as running");
  assert.deepStrictEqual(u.finished, []);
  now = run1("completed", "failure");           // gh is back and the run is done
  u = diff(prev, await collect("p", cache, call));
  assert.deepStrictEqual(u.finished.map(a => [a.id, a.state]), [["run:o/r:1", "fail"]], "reported exactly once");
  u = diff(prev, await collect("p", cache, call));
  assert.deepStrictEqual(u.finished, []);
});

test("repeated failed polls give no false result, and a watched run expires after a bounded time (#257)", async () => {
  const prev = new Map(), cache = new Map();
  let now = run1("in_progress");
  const call = fakeGh(() => now);
  diff(prev, await collect("p", cache, call));
  now = null;
  for (let i = 0; i < 5; i++) {
    const u = diff(prev, await collect("p", cache, call));
    assert.deepStrictEqual(u.finished, []);
    assert.strictEqual(u.live.length, 1);
  }
  const u = diff(prev, await collect("p", cache, call));
  assert.deepStrictEqual(u.live, [], "dropped after too many failures");
  assert.strictEqual(prev.size, 0);
});

test("a successful empty answer still removes, and one failed source leaves the others alone (#257)", () => {
  const prev = new Map();
  diff(prev, [{ id: "run:o/r:1", state: "running" }, { id: "pr:o/r:7", state: "running" }]);
  // the run list failed, the PR answered and finished
  const list = [{ id: "pr:o/r:7", state: "pass" }]; list.failed = ["run:o/r:"];
  let u = diff(prev, list);
  assert.deepStrictEqual(u.finished.map(a => a.id), ["pr:o/r:7"]);
  assert.deepStrictEqual(u.live.map(a => a.id), ["run:o/r:1"]);
  // now everything answers, with the run gone: it is removed
  u = diff(prev, []);
  assert.deepStrictEqual(u.live, []);
  assert.strictEqual(prev.size, 0);
});
