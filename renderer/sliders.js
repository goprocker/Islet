// Keyboard behaviour and screen-reader values for the seek and volume sliders.
(() => {
  // how far a key moves a slider; null for any other key
  function sliderDelta(key, step, page, span) {
    return {
      ArrowRight: step, ArrowUp: step, ArrowLeft: -step, ArrowDown: -step,
      PageUp: page, PageDown: -page, End: span, Home: -span,
    }[key] ?? null;
  }
  const clock = s => {
    const whole = Math.floor(s);
    return `${Math.floor(whole / 60)} minutes ${whole % 60} seconds`;
  };
  function enable(el, on) {
    el.tabIndex = on ? 0 : -1;
    el.setAttribute("aria-disabled", String(!on));
  }
  function syncSeek(el, pos, duration) {
    enable(el, duration > 0);
    el.setAttribute("aria-valuemax", String(Math.round(duration || 0)));
    el.setAttribute("aria-valuenow", String(Math.round(pos || 0)));
    el.setAttribute("aria-valuetext", duration > 0 ? `${clock(pos)} of ${clock(duration)}` : "Nothing playing");
  }
  function syncVolume(el, volume, available) {
    enable(el, available);
    if (volume === null) { el.removeAttribute("aria-valuenow"); el.removeAttribute("aria-valuetext"); }
    else {
      el.setAttribute("aria-valuenow", String(Math.round(volume * 100)));
      el.setAttribute("aria-valuetext", `${Math.round(volume * 100)} percent`);
    }
    el.title = available ? "Spotify volume" : "Volume only works for Spotify";
  }
  const api = { sliderDelta, syncSeek, syncVolume };
  if (typeof module !== "undefined") module.exports = api;
  else window.Sliders = api;
})();
