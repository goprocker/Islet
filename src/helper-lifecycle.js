// Keeps the background helper running only while it's useful: not while Windows is locked
// or asleep. Those can overlap and repeat, so each is a separate reason to stay paused.
function helperLifecycle(start, retryMs = 2000) {
  const pausedFor = new Set();
  let child = null, retry = null, quitting = false;
  const wanted = () => !quitting && !pausedFor.size;

  function run() {
    clearTimeout(retry);
    if (child || !wanted()) return;
    const mine = child = start();
    // a failed launch emits "error" and maybe no "exit"; either one ends it, and only once
    const ended = () => {
      if (child !== mine) return; // one we stopped on purpose, or already ended
      child = null;
      if (wanted()) retry = setTimeout(run, retryMs);
    };
    mine.on("exit", ended);
    mine.on("error", e => { console.warn("helper", e.message); ended(); });
  }
  function halt() {
    clearTimeout(retry);
    const old = child;
    child = null;
    old?.kill();
  }
  return {
    start: run,
    pause(reason) { pausedFor.add(reason); halt(); },
    resume(reason) { pausedFor.delete(reason); run(); },
    quit() { quitting = true; halt(); },
    current: () => child,
  };
}

module.exports = { helperLifecycle };
