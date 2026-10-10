const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Smooth scrolling on desktop (Lenis, loaded from CDN). Touch devices keep native
// scrolling, and the page works normally if the library didn't load.
// Off for now: layered on the background video's own easing it made slow
// scrolling feel jittery. Set to true to try it again.
const SMOOTH_SCROLL = false;
const lenis =
  SMOOTH_SCROLL && window.Lenis && !REDUCED_MOTION && window.matchMedia("(pointer: fine)").matches
    ? new window.Lenis({ lerp: 0.1 })
    : null;
if (lenis) {
  const raf = (t) => {
    lenis.raf(t);
    requestAnimationFrame(raf);
  };
  requestAnimationFrame(raf);
}

// Always open at the top: don't restore the old scroll position on refresh, and
// don't let a leftover #section in the URL jump the page to that section.
(() => {
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  if (location.hash) history.replaceState(null, "", location.pathname + location.search);
  window.scrollTo({ top: 0, behavior: "instant" });

  // In-page links scroll to their section without writing #section into the URL.
  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    const target = link.getAttribute("href").length > 1 && document.querySelector(link.getAttribute("href"));
    if (!target || target.closest("svg")) return;
    link.addEventListener("click", (e) => {
      e.preventDefault();
      if (lenis) lenis.scrollTo(target);
      else target.scrollIntoView({ behavior: REDUCED_MOTION ? "instant" : "smooth" });
    });
  });
})();

(() => {
  // Temporarily off; set to true to restore the scroll-scrubbing background.
  const BG_ANIMATION_ENABLED = true;
  if (!BG_ANIMATION_ENABLED) return;

  const FRAME_COUNT = 300;
  const FRAME_PATH = (i) =>
    `frames/frame-${String(i).padStart(3, "0")}.webp`;

  const STEP = 1; // every frame; skipping frames made slow scrolling visibly step

  const canvas = document.getElementById("frame-canvas");
  const ctx = canvas.getContext("2d");

  const images = new Array(FRAME_COUNT);

  let targetProgress = 0;   // 0..1, driven by scroll position
  let currentProgress = 0;  // 0..1, eased toward targetProgress every frame
  let lastDrawnFrame = -1;

  // Size to the canvas's CSS box (100vw x 100vh), not window.innerWidth/innerHeight:
  // on mobile, innerHeight shrinks while the browser toolbars are showing but 100vh
  // doesn't, and the mismatch stretched the frames (squeezed-looking video on iPhone).
  function viewSize() {
    return { vw: canvas.clientWidth, vh: canvas.clientHeight };
  }

  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const { vw, vh } = viewSize();
    canvas.width = Math.round(vw * dpr);
    canvas.height = Math.round(vh * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // resizing resets context state, so re-apply the high-quality upscale each time
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
  }

  const isLoaded = (img) => img && img.complete && img.naturalWidth > 0;

  // Frames stream in after the page loads; until the exact one arrives, show the
  // nearest frame that has.
  function nearestLoaded(index) {
    for (let d = 0; d < FRAME_COUNT; d++) {
      if (isLoaded(images[index - d])) return images[index - d];
      if (isLoaded(images[index + d])) return images[index + d];
    }
    return null;
  }

  function drawFrame(index) {
    const img = nearestLoaded(index);
    if (img) drawImageCover(img);
  }

  function drawImageCover(img) {
    const { vw, vh } = viewSize();
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

  function loadFrame(index) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = img.onerror = () => resolve(img);
      img.src = FRAME_PATH(index + 1);
      images[index] = img;
    });
  }

  // Coarse-to-fine order (every 32nd frame, then every 16th, ...) so scrubbing
  // works across the whole page early and gets smoother as the rest arrive.
  function loadOrder() {
    const order = [];
    const seen = new Set([0]);
    for (let gap = 32; gap >= STEP; gap /= 2) {
      for (let i = 0; i < FRAME_COUNT; i += gap) {
        if (!seen.has(i)) {
          seen.add(i);
          order.push(i);
        }
      }
    }
    if (!seen.has(FRAME_COUNT - 1)) order.push(FRAME_COUNT - 1);
    return order;
  }

  async function loadRest() {
    const queue = loadOrder();
    const worker = async () => {
      while (queue.length) {
        await loadFrame(queue.shift());
        lastDrawnFrame = -1; // redraw in case a closer frame just arrived
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
  }

  window.addEventListener("scroll", updateTargetProgress, { passive: true });
  window.addEventListener("resize", () => {
    resizeCanvas();
    updateTargetProgress();
    drawFrame(lastDrawnFrame >= 0 ? lastDrawnFrame : 0);
  });

  resizeCanvas();
  loadFrame(0).then(() => {
    drawFrame(0);
    canvas.classList.add("ready");
  });

  // Reduced motion: a still first frame, no scroll scrubbing.
  if (REDUCED_MOTION) return;

  updateTargetProgress();
  requestAnimationFrame(tick);
  // Start the bulk download only once the page itself has finished loading.
  if (document.readyState === "complete") loadRest();
  else window.addEventListener("load", loadRest, { once: true });
})();

// Scroll reveals: elements fade up as they enter the viewport, siblings staggered.
// The hidden starting state only applies while <html> has .js-reveal (set in <head>).
(() => {
  const root = document.documentElement;
  if (!root.classList.contains("js-reveal")) return;
  const els = document.querySelectorAll(
    ".hero-hey, .hero-heading h1, .hero-tagline, .stat, .eyebrow, .section-title, .section-intro, " +
    ".behind-text, .about-copy p, .portrait, .about-stats > div, .card, .work-card, .step, .faq-item, " +
    ".brand, .toolkit li, .footer-cta > *, .footer-col"
  );
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        io.unobserve(entry.target);
      });
    },
    { rootMargin: "0px 0px -8% 0px" }
  );
  const revealSet = new Set(els);
  els.forEach((el) => {
    const siblings = [...el.parentElement.children].filter((c) => revealSet.has(c));
    el.style.setProperty("--d", `${Math.min(siblings.indexOf(el), 8) * 70}ms`);
    io.observe(el);
  });
})();

// Cards: a soft accent spotlight follows the cursor.
(() => {
  if (!window.matchMedia("(hover: hover)").matches) return;
  document.querySelectorAll(".card, .work-card").forEach((card) => {
    card.addEventListener("pointermove", (e) => {
      const r = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${e.clientX - r.left}px`);
      card.style.setProperty("--my", `${e.clientY - r.top}px`);
    });
  });
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
