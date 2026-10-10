(() => {
  // Temporarily off; set to true to restore the scroll-scrubbing background.
  const BG_ANIMATION_ENABLED = true;
  if (!BG_ANIMATION_ENABLED) return;

  const FRAME_COUNT = 300;
  const FRAME_PATH = (i) =>
    `frames/frame-${String(i).padStart(3, "0")}.webp`;

  const canvas = document.getElementById("frame-canvas");
  const ctx = canvas.getContext("2d");

  const images = new Array(FRAME_COUNT);
  let loadedCount = 0;

  let targetProgress = 0;   // 0..1, driven by scroll position
  let currentProgress = 0;  // 0..1, eased toward targetProgress every frame
  let lastDrawnFrame = -1;

  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // resizing resets context state, so re-apply the high-quality upscale each time
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
  }

  function drawFrame(index) {
    const img = images[index];
    if (!img || !img.complete || img.naturalWidth === 0) return;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const imgRatio = img.naturalWidth / img.naturalHeight;
    const viewRatio = vw / vh;

    let drawW, drawH, offsetX, offsetY;
    if (imgRatio > viewRatio) {
      drawH = vh;
      drawW = drawH * imgRatio;
      offsetX = (vw - drawW) / 2;
      offsetY = 0;
    } else {
      drawW = vw;
      drawH = drawW / imgRatio;
      offsetX = 0;
      offsetY = (vh - drawH) / 2;
    }

    ctx.clearRect(0, 0, vw, vh);
    ctx.drawImage(img, offsetX, offsetY, drawW, drawH);
  }

  function updateTargetProgress() {
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    targetProgress = scrollable > 0
      ? Math.min(1, Math.max(0, window.scrollY / scrollable))
      : 0;
  }

  function tick() {
    currentProgress += (targetProgress - currentProgress) * 0.12;
    if (Math.abs(targetProgress - currentProgress) < 0.0005) {
      currentProgress = targetProgress;
    }

    const frameIndex = Math.round(currentProgress * (FRAME_COUNT - 1));
    if (frameIndex !== lastDrawnFrame) {
      drawFrame(frameIndex);
      lastDrawnFrame = frameIndex;
    }

    requestAnimationFrame(tick);
  }

  function preloadImages() {
    for (let i = 1; i <= FRAME_COUNT; i++) {
      const img = new Image();
      img.src = FRAME_PATH(i);
      img.onload = () => {
        loadedCount++;
        if (i === 1) {
          drawFrame(0);
          canvas.classList.add("ready");
        }
      };
      images[i - 1] = img;
    }
  }

  window.addEventListener("scroll", updateTargetProgress, { passive: true });
  window.addEventListener("resize", () => {
    resizeCanvas();
    updateTargetProgress();
    drawFrame(lastDrawnFrame >= 0 ? lastDrawnFrame : 0);
  });

  resizeCanvas();
  preloadImages();
  updateTargetProgress();
  requestAnimationFrame(tick);
})();

(() => {
  const container = document.querySelector(".steps");
  if (!container) return;
  const steps = [...container.querySelectorAll(".step")];
  const TRIGGER = 0.6; // fraction of viewport height where a step "activates"
  let queued = false;

  function update() {
    queued = false;
    const vh = window.innerHeight;
    const maxScroll = document.documentElement.scrollHeight - vh;
    const rect = container.getBoundingClientRect();
    const top = rect.top + window.scrollY;
    const start = top - vh * TRIGGER;
    // The steps sit at the end of the page, so the last one may never reach the
    // trigger line; finish the sequence at max scroll in that case.
    const end = Math.min(top + rect.height - vh * TRIGGER, maxScroll);
    const p = end > start ? Math.min(1, Math.max(0, (window.scrollY - start) / (end - start))) : 1;
    const n = steps.length;
    const active = Math.min(n - 1, Math.floor(p * n));

    steps.forEach((step, i) => {
      step.style.setProperty("--fill", Math.min(1, Math.max(0, p * n - i)).toFixed(3));
      step.classList.toggle("is-active", i === active);
    });
  }

  function queue() {
    if (!queued) {
      queued = true;
      requestAnimationFrame(update);
    }
  }

  window.addEventListener("scroll", queue, { passive: true });
  window.addEventListener("resize", queue);
  update();
})();

// Calendly: paste your public booking link (e.g. https://calendly.com/<username>/30min).
// While empty, the "Book a Call" / "Start a Project" buttons fall back to their email link.
const CALENDLY_URL = "https://calendly.com/rk8679629280/30min";

document.querySelectorAll("[data-calendly]").forEach((link) => {
  link.addEventListener("click", (e) => {
    if (!CALENDLY_URL) return;
    e.preventDefault();
    if (window.Calendly) Calendly.initPopupWidget({ url: CALENDLY_URL });
    else window.open(CALENDLY_URL, "_blank", "noopener");
  });
});
