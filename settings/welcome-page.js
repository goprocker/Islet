const field = id => document.getElementById(id);

window.welcome.load().then(({ agents, node }) => {
  field("login").checked = true;
  field("notifications").checked = true;
  field("hooks").checked = agents;
  if (!node) field("hooksNote").textContent += " The hooks need Node.js on your PATH, and it wasn't found.";
});

field("continue").addEventListener("click", async () => {
  field("continue").disabled = true;
  try {
    await window.welcome.finish({ login: field("login").checked, notifications: field("notifications").checked, hooks: field("hooks").checked });
  } catch (e) {
    field("status").textContent = `Couldn't connect the hooks: ${e.message}. Turn that option off to continue.`;
    field("continue").disabled = false;
  }
});
