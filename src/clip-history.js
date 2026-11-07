// Clipboard history: newest first, pinned items stay on top and survive Clear.
// Only pins are persisted (via save); unpinned copies stay in memory.
function clipHistory({ max = 20, pins = [], save = () => {} } = {}) {
  let items = pins.map(t => ({ t, pin: true }));
  const sorted = () => [...items.filter(i => i.pin), ...items.filter(i => !i.pin)];
  const persist = () => save(items.filter(i => i.pin).map(i => i.t));
  return {
    add(t) {
      const had = items.find(i => i.t === t);
      items = [{ t, pin: !!had?.pin }, ...items.filter(i => i.t !== t)];
      const loose = items.filter(i => !i.pin);
      if (loose.length > max) items = items.filter(i => i.pin || loose.indexOf(i) < max);
    },
    // index into the view() order
    text: i => sorted()[i]?.t,
    togglePin(i) {
      const it = sorted()[i];
      if (!it) return;
      it.pin = !it.pin;
      persist();
    },
    clear() { items = items.filter(i => i.pin); },
    wipe() { items = []; persist(); },
    view: () => sorted().map(i => ({ text: i.t.replace(/\s+/g, " ").slice(0, 160), pin: i.pin })),
    size: () => items.length,
  };
}

module.exports = { clipHistory };
