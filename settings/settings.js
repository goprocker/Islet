// Settings form: every change is saved straight away.
const form = document.querySelector("main");
const field = n => form.querySelector(`[name="${n}"]`);
const status = document.getElementById("status");
let saved;

function fill(s) {
  for (const el of form.querySelectorAll("[name]")) {
    const v = s[el.name];
    if (el.type === "checkbox") el.checked = !!v;
    else if (el.type !== "radio" && v !== undefined && v !== null) el.value = v;
  }
  const fixed = /^#[0-9a-f]{6}$/i.test(s.accent);
  field("accentColor").value = fixed ? s.accent : "#bf8cff";
  form.querySelector(`[name="accentMode"][value="${fixed ? "fixed" : "album"}"]`).checked = true;
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

form.addEventListener("change", async () => {
  try {
    saved = await window.settings.save(collect());
    fill(saved);
    status.textContent = "Saved.";
  } catch (e) {
    status.textContent = `Couldn't save: ${e.message}`;
  }
  clearTimeout(form._t);
  form._t = setTimeout(() => (status.textContent = ""), 2000);
});
// picking a colour means using it
field("accentColor").addEventListener("input", () => { form.querySelector('[name="accentMode"][value="fixed"]').checked = true; });

window.settings.load().then(s => { saved = s; fill(s); });
