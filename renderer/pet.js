// The notch pet: a small cat that lives in the pill (and walks along the bottom edge when the notch is open).
// pick() turns what the notch knows into one mood; paint() puts that mood on the pet elements as a class,
// and the CSS does the animating.
(() => {
  const MOODS = ["idle", "sleep", "dance", "work", "alert", "sick"];
  const ALERT_MS = 4000, SLEEP_AFTER_MS = 120000, LOW_BATTERY = 0.2;

  // ctx: {now, battery: {level 0..1, charging}|null, toastAt, timerEnd, timerLabel, playing, quietSince}
  // first match wins: a sick cat stays sick even with music on
  function pick(ctx) {
    const b = ctx.battery;
    if (b && !b.charging && b.level < LOW_BATTERY) return "sick";
    if (ctx.toastAt && ctx.now - ctx.toastAt < ALERT_MS) return "alert";
    if (ctx.timerEnd > ctx.now && /focus/i.test(ctx.timerLabel || "")) return "work";
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
  </svg>`;

  // sets the mood class on every pet element (only touches the DOM when it changed)
  function paint(els, mood) {
    for (const el of els) {
      if (!el.firstChild) el.innerHTML = SVG;
      if (el.dataset.mood === mood) continue;
      el.dataset.mood = mood;
      el.classList.remove(...MOODS);
      el.classList.add(mood);
    }
  }

  // what the cat says when the notch opens: a hello the first time each day, then a word about its mood.
  // ctx: {hour 0..23, name, mood, firstToday}
  const MOOD_LINES = { dance: "Nice song!", sleep: "zzz… let me nap", sick: "Plug me in, please!", work: "Focus time. You got this", alert: "Ooh, something new!" };
  function line(ctx) {
    const who = ctx.name ? `, ${ctx.name}` : "";
    if (ctx.firstToday) {
      const part = ctx.hour < 5 ? "Still up" : ctx.hour < 12 ? "Good morning" : ctx.hour < 17 ? "Good afternoon" : "Good evening";
      return `${part}${who}!`;
    }
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

  const api = { MOODS, pick, paint, SVG, line, say };
  if (typeof module !== "undefined") module.exports = api;
  else window.Pet = api;
})();
