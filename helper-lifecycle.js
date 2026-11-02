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
    mine.on("exit", () => {
      if (child !== mine) return; // one we stopped on purpose
      child = null;
      if (wanted()) retry = setTimeout(run, retryMs);
    });
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
