// The notch pet: a small cat that lives in the pill (and walks along the bottom edge when the notch is open).
// pick() turns what the notch knows into one mood; paint() puts that mood on the pet elements as a class,
// and the CSS does the animating.
(() => {
  const MOODS = ["idle", "sleep", "dance", "work", "alert", "sick", "code", "ask", "plant"];
  const ALERT_MS = 4000, SLEEP_AFTER_MS = 120000, LOW_BATTERY = 0.2;

  // the foreground app (process name, lowercase) says what you're doing: editors and terminals mean coding,
  // office and notes apps mean work; anything else (browser, games, video) doesn't change the mood
  const CODE_APPS = /^(code|code - insiders|cursor|windsurf|zed|devenv|idea64|pycharm64|webstorm64|rider64|clion64|goland64|phpstorm64|studio64|sublime_text|notepad\+\+|vim|nvim|windowsterminal|wt|powershell|pwsh|cmd|wsl|mintty|alacritty|wezterm-gui|warp|hyper|tabby|githubdesktop|fork)$/;
  const WORK_APPS = /^(winword|excel|powerpnt|onenote|outlook|olk|notion|obsidian|acrobat|acrord32|figma|photoshop|illustrator|blender|logseq)$/;
  function activity(app) {
    if (!app) return "";
    if (CODE_APPS.test(app)) return "code";
    if (WORK_APPS.test(app)) return "work";
    return "";
  }

  // ctx: {now, battery: {level 0..1, charging}|null, toastAt, timerEnd, timerLabel, playing, quietSince,
  //       agent: "waiting" | "working" | "", plantUntil, app: foreground process name}
  // first match wins: a sick cat stays sick even with music on; what you're doing beats the music
  function pick(ctx) {
    const b = ctx.battery;
    if (b && !b.charging && b.level < LOW_BATTERY) return "sick";
    if (ctx.toastAt && ctx.now - ctx.toastAt < ALERT_MS) return "alert";
    if (ctx.agent === "waiting") return "ask";
    if (ctx.plantUntil > ctx.now) return "plant";
    if (ctx.timerEnd > ctx.now && /focus/i.test(ctx.timerLabel || "")) return "work";
    if (ctx.agent === "working") return "code";
    const doing = activity(ctx.app);
    if (doing) return doing;
    if (ctx.playing) return "dance";
    if (ctx.quietSince && ctx.now - ctx.quietSince >= SLEEP_AFTER_MS) return "sleep";
    return "idle";
  }

  const SVG = `<svg viewBox="0 0 24 20" aria-hidden="true">
    <path class="tail" d="M18.5 16.5c4 0 5-4 3-8"/>
    <ellipse class="fur" cx="12" cy="15.5" rx="7.5" ry="4.2"/>
    <g class="head">
      <path class="fur" d="M6.2 8.6 6.8 2.4 11 5.6z"/>
      <path class="fur" d="M17.8 8.6 17.2 2.4 13 5.6z"/>
      <ellipse class="fur" cx="12" cy="9.4" rx="6" ry="5"/>
      <g class="eyes"><circle cx="9.5" cy="9.2" r="1.15"/><circle cx="14.5" cy="9.2" r="1.15"/></g>
      <path class="shut" d="M8.3 9.4q1.2 1 2.4 0M13.3 9.4q1.2 1 2.4 0"/>
      <path class="cross" d="M8.6 8.3l1.8 1.8M10.4 8.3 8.6 10.1M13.6 8.3l1.8 1.8M15.4 8.3l-1.8 1.8"/>
      <path class="nose" d="M11.2 10.9h1.6l-.8.9z"/>
      <path class="phones" d="M5.9 9.6a6.1 6.1 0 0 1 12.2 0"/>
      <rect class="cup" x="4.6" y="8.8" width="2.2" height="3.4" rx="1"/><rect class="cup" x="17.2" y="8.8" width="2.2" height="3.4" rx="1"/>
    </g>
    <text class="z" x="17" y="5" font-size="6">z</text>
    <text class="bang" x="17.5" y="5" font-size="7">!</text>
    <text class="ask" x="17.5" y="5" font-size="7">?</text>
    <g class="laptop"><rect class="lid" x="6.5" y="12.4" width="11" height="6.6" rx="1"/><path class="glow" d="M9.5 14.6h5M9.5 16.4h3.2"/><path class="base" d="M4.5 19.4h15"/></g>
    <g class="plant"><path class="pot" d="M25 16h6l-1 4h-4z"/><path class="stem" d="M28 16V7"/><path class="leaf l1" d="M28 14c-2 0-3-1-3-3 2 0 3 1 3 3zm0-.5c2 0 3-1 3-3-2 0-3 1-3 3z"/><path class="leaf l2" d="M28 11.5c-2 0-3-1-3-3 2 0 3 1 3 3zm0-.5c2 0 3-1 3-3-2 0-3 1-3 3z"/><path class="leaf l3" d="M28 9c-2 0-3-1-3-3 2 0 3 1 3 3zm0-.5c2 0 3-1 3-3-2 0-3 1-3 3z"/><circle class="leaf l4" cx="28" cy="5.6" r="1.4"/></g>
  </svg>`;

  // a custom pet (Codex Pets sprite sheet): which row each mood plays, and how many frames that row has
  const ROWS = { idle: [0, 6], waving: [3, 4], jumping: [4, 5], failed: [5, 8], waiting: [6, 6], running: [7, 6], review: [8, 6] };
  const MOOD_ROW = { idle: "idle", sleep: "idle", dance: "jumping", work: "review", alert: "waving", sick: "failed", code: "running", ask: "waiting", plant: "waving" };
  const FPS = 8, SLEEP_FPS = 2;

  // the sheet position for a mood at time `now`: { x, y } in percent for background-position
  function frameAt(mood, now, rows) {
    const [row, frames] = ROWS[MOOD_ROW[mood] || "idle"];
    const frame = Math.floor(now / (1000 / (mood === "sleep" ? SLEEP_FPS : FPS))) % frames;
    return { x: (frame / 7) * 100, y: (row / (rows - 1)) * 100 };
  }

  // steps every custom pet element to its current frame
  function tick(els, now) {
    for (const el of els) {
      if (el.dataset.kind !== "custom") continue;
      const f = frameAt(el.dataset.mood, now, Number(el.dataset.rows));
      el.style.backgroundPosition = `${f.x}% ${f.y}%`;
    }
  }

  // sets the mood class on every pet element (only touches the DOM when it changed);
  // custom: {id, sheet, rows} draws that sprite sheet instead of the cat
  function paint(els, mood, custom) {
    for (const el of els) {
      if (el.dataset.kind !== (custom ? "custom" : "cat") || (custom && el.dataset.petId !== custom.id)) {
        el.dataset.kind = custom ? "custom" : "cat";
        el.dataset.petId = custom ? custom.id : "";
        el.innerHTML = custom ? "" : SVG;
        if (custom) el.classList.add("custom"); else el.classList.remove("custom");
        if (el.style) {
          el.style.backgroundImage = custom ? `url("${custom.sheet}")` : "";
          el.style.backgroundSize = custom ? `800% ${custom.rows * 100}%` : "";
        }
        if (custom) el.dataset.rows = custom.rows;
        el.dataset.mood = "";
      }
      if (el.dataset.mood === mood) continue;
      el.dataset.mood = mood;
      el.classList.remove(...MOODS);
      el.classList.add(mood);
    }
  }

  // what the cat says when the notch opens: a hello the first time each day, then a word about its mood.
  // ctx: {hour 0..23, name, mood, firstToday}
  const MOOD_LINES = { dance: "Nice song!", sleep: "zzz… let me nap", sick: "Plug me in, please!", work: "Busy? Me too", alert: "Ooh, something new!", code: "Let's write some code!", ask: "Your agent needs you!", plant: "Focus done. My plant grew!" };
  // idle chat, so a quiet spell isn't just "Hello" again and again; {who} becomes ", name"
  const IDLE_LINES = ["Just hanging out here{who}", "Need a break? Stretch a bit!", "Drink some water{who}", "All quiet up here", "Psst… I'm still here", "Want to start a focus timer?", "Looking good today{who}!", "*yawn*"];
  function line(ctx) {
    const who = ctx.name ? `, ${ctx.name}` : "";
    if (ctx.firstToday) {
      const part = ctx.hour < 5 ? "Still up" : ctx.hour < 12 ? "Good morning" : ctx.hour < 17 ? "Good afternoon" : "Good evening";
      return `${part}${who}!`;
    }
    if (ctx.mood === "idle") return IDLE_LINES[Math.floor((ctx.roll ?? Math.random()) * IDLE_LINES.length)].replace("{who}", who);
    return MOOD_LINES[ctx.mood] || `Hello${who}!`;
  }

  // shows text beside the pet for a few seconds, on whichever side has more room in the notch
  function say(el, text, ms = 6000) {
    let b = el.querySelector(".say");
    if (!b) { b = document.createElement("span"); b.className = "say"; el.appendChild(b); }
    b.textContent = text;
    const box = el.parentElement?.getBoundingClientRect(), me = el.getBoundingClientRect();
    el.classList.toggle("left", !!box && me.left - box.left > box.width / 2);
    el.classList.add("talking");
    clearTimeout(el._sayT);
    el._sayT = setTimeout(() => el.classList.remove("talking"), ms);
  }

  const api = { MOODS, pick, activity, paint, tick, frameAt, SVG, line, say };
  if (typeof module !== "undefined") module.exports = api;
  else window.Pet = api;
})();
