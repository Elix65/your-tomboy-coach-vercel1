const RUN_FRAMES = [
  "https://rlunygzxvpldfaanhxnj.supabase.co/storage/v1/object/public/cosas%20de%2021-moon/run-1.png",
  "https://rlunygzxvpldfaanhxnj.supabase.co/storage/v1/object/public/cosas%20de%2021-moon/run-2.png",
  "https://rlunygzxvpldfaanhxnj.supabase.co/storage/v1/object/public/cosas%20de%2021-moon/run-3.png",
  "https://rlunygzxvpldfaanhxnj.supabase.co/storage/v1/object/public/cosas%20de%2021-moon/run-4.png"
];

let hasPreloaded = false;
let isNavigating = false;

function preloadFrames() {
  if (hasPreloaded) return Promise.resolve();

  const loaders = RUN_FRAMES.map((src) => new Promise((resolve) => {
    const img = new Image();
    img.onload = resolve;
    img.onerror = resolve;
    img.src = src;
  }));

  return Promise.all(loaders).finally(() => {
    hasPreloaded = true;
  });
}

function playPageTransitionAndGo(url) {
  if (!url || isNavigating) return;
  isNavigating = true;

  const overlay = document.getElementById("pageTransition");
  const runner = document.getElementById("runner");

  if (!overlay || !runner) {
    window.location.href = url;
    return;
  }

  const totalMs = 1300;
  const frameRateMs = 90;

  runner.src = RUN_FRAMES[0] || runner.src;
  overlay.classList.add("is-active");
  overlay.setAttribute("aria-hidden", "false");

  let index = 0;
  const frameTimer = window.setInterval(() => {
    index = (index + 1) % RUN_FRAMES.length;
    runner.src = RUN_FRAMES[index] || RUN_FRAMES[0] || runner.src;
  }, frameRateMs);

  window.setTimeout(() => {
    overlay.classList.remove("is-active");
    overlay.setAttribute("aria-hidden", "true");
    window.clearInterval(frameTimer);
    window.location.href = url;
  }, totalMs);
}

document.addEventListener("DOMContentLoaded", () => {
  preloadFrames();
});

window.playPageTransitionAndGo = playPageTransitionAndGo;
window.preloadTransitionFrames = preloadFrames;
