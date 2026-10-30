// Settings form: every change is saved straight away.
const form = document.querySelector("main");
const field = n => form.querySelector(`[name="${n}"]`);
const status = document.getElementById("status");
let saved, saves = 0, loaded = false, changedEarly = false;

const read = el => (el.type === "checkbox" || el.type === "radio" ? el.checked : el.value);
const snapshot = () => new Map([...form.querySelectorAll("[name]")].map(el => [el, read(el)]));

// `since` is the form when this answer was asked for: a field that differs now holds
// newer input than the answer, so it's left alone
function fill(s, since) {
  const fresh = el => read(el) === since.get(el);
  for (const el of form.querySelectorAll("[name]")) {
    if (!fresh(el)) continue;
    const v = s[el.name];
    if (el.type === "checkbox") el.checked = !!v;
    else if (el.type !== "radio" && v !== undefined && v !== null) el.value = v;
  }
  const fixed = /^#[0-9a-f]{6}$/i.test(s.accent);
  if (fresh(field("accentColor"))) field("accentColor").value = fixed ? s.accent : "#bf8cff";
  const mode = form.querySelector(`[name="accentMode"][value="${fixed ? "fixed" : "album"}"]`);
  if (fresh(mode)) mode.checked = true;
}

function collect() {
  const out = {};
  for (const el of form.querySelectorAll("[name]")) {
    if (el.type === "radio" || el.name === "accentColor") continue;
    out[el.name] = el.type === "checkbox" ? el.checked : el.type === "number" ? Number(el.value) : el.value.trim();
  }
  out.accent = form.querySelector('[name="accentMode"]:checked').value === "fixed" ? field("accentColor").value : "album";
  return out;
}

async function save() {
  const mine = ++saves, since = snapshot();
  try {
    saved = await window.settings.save(collect());
    if (mine === saves) fill(saved, since); // a newer save's answer is still to come
    status.textContent = "Saved.";
  } catch (e) {
    status.textContent = `Couldn't save: ${e.message}`;
  }
  clearTimeout(form._t);
  form._t = setTimeout(() => (status.textContent = ""), 2000);
}
// before the settings have loaded the form is mostly empty: saving it would wipe them
form.addEventListener("change", () => { if (loaded) save(); else changedEarly = true; });
// picking a colour means using it
field("accentColor").addEventListener("input", () => { form.querySelector('[name="accentMode"][value="fixed"]').checked = true; });

const atStart = snapshot();
window.settings.load().then(s => {
  saved = s; fill(s, atStart); loaded = true;
  if (changedEarly) save();
});
