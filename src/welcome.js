const fs = require("fs");
const path = require("path");

const DONE = "welcome-done";
// flags left by versions before the welcome window: these people already set Islet up
const EARLIER = ["hooks-set", "login-set", "login-set-installed"];

const needsWelcome = dir => ![DONE, ...EARLIER].some(f => fs.existsSync(path.join(dir, f)));
// the old first-run flags go too, so a choice made here is never redone at the next start
const finishWelcome = dir => { for (const f of [...EARLIER, "codex-hooks-set", DONE]) fs.writeFileSync(path.join(dir, f), "1"); };

module.exports = { needsWelcome, finishWelcome };
