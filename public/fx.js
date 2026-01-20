// ===============================
// FX: AUDIO AMBIENTE + PARALLAX
// ===============================
window.addEventListener("DOMContentLoaded", () => {

  // ---------- AUDIO AMBIENTE ----------
  const ambienceIntro = document.getElementById("ambience-intro");
  const ambienceLoop = document.getElementById("ambience-loop");

  if (ambienceIntro) {
    ambienceIntro.volume = 0;
    ambienceIntro.play().then(() => fadeIn(ambienceIntro, 0.12));

    ambienceIntro.onended = () => {
      if (!ambienceLoop) return;
      ambienceLoop.volume = 0;
      ambienceLoop.play();
      fadeIn(ambienceLoop, 0.18);
    };
  }

  function fadeIn(audio, target) {
    let v = 0;
    const interval = setInterval(() => {
      v += 0.02;
      audio.volume = Math.min(v, target);
      if (v >= target) clearInterval(interval);
    }, 80);
  }

  // ---------- PARALLAX (solo desktop) ----------
  if (window.innerWidth > 768) {
    document.addEventListener("mousemove", (e) => {
      const wood = document.querySelector(".layer-wood");
      const shoji = document.querySelector(".layer-shoji");
      const pattern = document.querySelector(".layer-pattern");

      if (!wood && !shoji && !pattern) return;

      const x = (e.clientX / window.innerWidth - 0.5) * 20;
      const y = (e.clientY / window.innerHeight - 0.5) * 20;

      if (wood) wood.style.transform = `translate(${x}px, ${y}px)`;
      if (shoji) shoji.style.transform = `translate(${x * 0.6}px, ${y * 0.6}px)`;
      if (pattern) pattern.style.transform = `translate(${x * 0.3}px, ${y * 0.3}px)`;
    });
  }
});
