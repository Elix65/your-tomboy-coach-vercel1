
function isInitDebugFlagEnabled(flag) {
  const params = new URLSearchParams(window.location.search);
  if (params.get(flag) === "1") return true;
  const list = String(params.get("debug_init_flags") || "")
    .split(",")
    .map((entry) => entry.trim().toUpperCase())
    .filter(Boolean);
  if (list.includes(flag)) return true;
  return window.localStorage.getItem(flag) === "1" || window.sessionStorage.getItem(flag) === "1";
}

const DESKTOP_BREAKPOINT = 768;

function setVisibility(element, shouldShow) {
  if (!element) return;
  element.classList.toggle("hidden", !shouldShow);
}

function syncTopBarAndMenuState() {
  if (isInitDebugFlagEnabled("DISABLE_RESPONSIVE_SYNC")) return;
  const ts = Math.round(performance.now());
  const topBar = document.getElementById("top-bar");
  const hamburgerBtn = document.getElementById("hamburger-btn");
  const mobileMenuOverlay = document.getElementById("mobile-menu-overlay");
  const isDesktop = window.innerWidth >= DESKTOP_BREAKPOINT;

  console.info(`[RUNTIME_DIAG +${ts}ms] sync_topbar_menu_enter`, { isDesktop, width: window.innerWidth });

  setVisibility(topBar, isDesktop);
  setVisibility(hamburgerBtn, !isDesktop);

  if (isDesktop && hamburgerBtn) {
    hamburgerBtn.classList.remove("open");
  }

  if (mobileMenuOverlay) {
    mobileMenuOverlay.classList.add("hidden");
    mobileMenuOverlay.classList.remove("active");
  }

  console.info(`[RUNTIME_DIAG +${ts}ms] sync_topbar_menu_exit`, {
    topBarClass: topBar?.className || null,
    hamburgerClass: hamburgerBtn?.className || null,
    mobileMenuClass: mobileMenuOverlay?.className || null
  });
}

export function initTopBarAndMobileMenu() {
  console.info(`[RUNTIME_DIAG +${Math.round(performance.now())}ms] init_topbar_menu_enter`);
  if (window.__topBarAndMenuInitDoneV2) return;

  const topBar = document.getElementById("top-bar");
  const hamburgerBtn = document.getElementById("hamburger-btn");
  const mobileMenuOverlay = document.getElementById("mobile-menu-overlay");

  if (!topBar && !hamburgerBtn && !mobileMenuOverlay) return;

  syncTopBarAndMenuState();
  window.addEventListener("resize", syncTopBarAndMenuState);
  window.__topBarAndMenuInitDoneV2 = true;
  console.info(`[RUNTIME_DIAG +${Math.round(performance.now())}ms] init_topbar_menu_exit`);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initTopBarAndMobileMenu, { once: true });
} else {
  initTopBarAndMobileMenu();
}
