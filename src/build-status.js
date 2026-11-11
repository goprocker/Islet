// Build and test runs an agent starts in its shell (Claude Code / Codex "Bash" tool):
// kind() says whether a command is a test or a build, result() reads pass/fail from its output.
// Pure functions, so they're tested without a running agent.

const TEST = /\b(npm|pnpm|yarn|bun)\s+(run\s+)?test\b|\bnode\s+--test\b|\b(jest|vitest|mocha|ava|pytest|tox|phpunit|rspec)\b|\bcargo\s+(test|nextest)\b|\bgo\s+test\b|\bdotnet\s+test\b|\b(mvn|gradlew?)\b.*\btest\b|\bpython3?\s+-m\s+(pytest|unittest)\b|\bctest\b/i;
const BUILD = /\b(npm|pnpm|yarn|bun)\s+(run\s+)?build\b|\bcargo\s+(build|check|clippy)\b|\bgo\s+build\b|\bdotnet\s+build\b|\b(tsc|webpack|vite\s+build|next\s+build|make|cmake\s+--build|msbuild|gradlew?\s+(build|assemble))\b|\bmvn\b.*\b(package|compile|install)\b/i;

function kind(command) {
  if (typeof command !== "string" || !command.trim()) return "";
  if (TEST.test(command)) return "test";
  if (BUILD.test(command)) return "build";
  return "";
}

// first pattern that matches wins; each returns [passed, failed]
const COUNTS = [
  // node --test (TAP summary)
  [/^# pass (\d+)[\s\S]*?^# fail (\d+)/m, m => [+m[1], +m[2]]],
  // cargo
  [/test result: \w+\. (\d+) passed; (\d+) failed/, m => [+m[1], +m[2]]],
  // jest: "Tests:       1 failed, 12 passed, 13 total"
  [/Tests:\s+(?:(\d+) failed, )?(?:\d+ \w+, )*(\d+) passed/, m => [+m[2], +(m[1] || 0)]],
  // vitest: "Tests  2 failed | 10 passed (12)"
  [/Tests\s+(?:(\d+) failed \| )?(\d+) passed/, m => [+m[2], +(m[1] || 0)]],
  // pytest: "=== 3 failed, 40 passed in 1.2s ===" or "=== 40 passed in ..."
  [/=+ (?:(\d+) failed, )?(\d+) passed/, m => [+m[2], +(m[1] || 0)]],
  [/=+ (\d+) failed/, m => [0, +m[1]]],
  // mocha
  [/(\d+) passing(?:[\s\S]*?(\d+) failing)?/, m => [+m[1], +(m[2] || 0)]],
  // go test
  [/^(ok|FAIL)\s+\S+/m, m => (m[1] === "ok" ? [1, 0] : [0, 1])],
  // dotnet: "Failed: 1, Passed: 20"
  [/Failed:\s+(\d+), Passed:\s+(\d+)/, m => [+m[2], +m[1]]],
];
const BROKE = /\b(error(\[E\d+\])?:|error [A-Z]+\d+:|ERR!|FAILED|BUILD FAILED|failed to compile|Build failed|exit code [1-9])/i;

// output: what the command printed; failedTool: the agent marked the call as failed.
// -> { ok, passed, failed } (counts are null when the output doesn't say)
function result(output, failedTool = false) {
  const text = typeof output === "string" ? output : "";
  for (const [re, get] of COUNTS) {
    const m = text.match(re);
    if (m) {
      const [passed, failed] = get(m);
      return { ok: failed === 0 && !failedTool, passed, failed };
    }
  }
  return { ok: !failedTool && !BROKE.test(text), passed: null, failed: null };
}

// "12 passed" / "2 of 14 failed" / "Build passed" / "Tests failed"
function label(k, r) {
  if (r.passed !== null && r.failed !== null) {
    return r.failed ? `${r.failed} of ${r.passed + r.failed} failed` : `${r.passed} passed`;
  }
  return `${k === "test" ? "Tests" : "Build"} ${r.ok ? "passed" : "failed"}`;
}

module.exports = { kind, result, label };
