// Notifications held back while Do Not Disturb (or a focus phase) is on, told in one line when it ends.
function missedLog() {
  let apps = new Map();
  return {
    add(app) { const a = String(app || "An app"); apps.set(a, (apps.get(a) || 0) + 1); },
    // the summary, or null when nothing came in; either way the log starts again
    take() {
      const list = [...apps].sort((x, y) => y[1] - x[1]);
      apps = new Map();
      const count = list.reduce((n, [, k]) => n + k, 0);
      if (!count) return null;
      const names = list.slice(0, 3).map(([a]) => a), more = list.length - names.length;
      return { count, apps: names, text: `${count} notification${count === 1 ? "" : "s"} from ${names.join(", ")}${more ? ` and ${more} more` : ""}` };
    },
  };
}

module.exports = { missedLog };
