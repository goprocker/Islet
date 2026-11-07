// sections: the list on the left shows one at a time; the last one picked opens next time
const tabs = [...document.querySelectorAll("[data-tab]")];
function showTab(id) {
  if (!tabs.some(t => t.dataset.tab === id)) id = tabs[0].dataset.tab;
  for (const t of tabs) {
    const on = t.dataset.tab === id;
    t.setAttribute("aria-selected", on);
    t.tabIndex = on ? 0 : -1;
    document.getElementById(t.dataset.tab).hidden = !on;
  }
  try { localStorage.settingsTab = id; } catch {}
}
for (const t of tabs) t.addEventListener("click", e => { e.preventDefault(); showTab(t.dataset.tab); });
// up and down arrows move between sections
document.querySelector("[role=tablist]").addEventListener("keydown", e => {
  const i = tabs.indexOf(document.activeElement);
  if (i < 0 || !["ArrowDown", "ArrowUp"].includes(e.key)) return;
  e.preventDefault();
  const next = tabs[(i + (e.key === "ArrowDown" ? 1 : tabs.length - 1)) % tabs.length];
  showTab(next.dataset.tab); next.focus();
});
let lastTab = "";
try { lastTab = localStorage.settingsTab || ""; } catch {}
showTab(lastTab);
