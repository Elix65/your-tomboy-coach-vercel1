const DESKTOP_BREAKPOINT = 768;

function setVisibility(element, shouldShow) {
  if (!element) return;
  element.classList.toggle("hidden", !shouldShow);
}

function syncTopBarAndMenuState() {
  const topBar = document.getElementById("top-bar");
  const hamburgerBtn = document.getElementById("hamburger-btn");
  const mobileMenuOverlay = document.getElementById("mobile-menu-overlay");
  const isDesktop = window.innerWidth >= DESKTOP_BREAKPOINT;

  setVisibility(topBar, isDesktop);
  setVisibility(hamburgerBtn, !isDesktop);

  if (isDesktop && hamburgerBtn) {
    hamburgerBtn.classList.remove("open");
  }

  if (mobileMenuOverlay) {
    mobileMenuOverlay.classList.add("hidden");
    mobileMenuOverlay.classList.remove("active");
  }
}

export function initTopBarAndMobileMenu() {
  if (window.__topBarAndMenuInitDoneV2) return;

  const topBar = document.getElementById("top-bar");
  const hamburgerBtn = document.getElementById("hamburger-btn");
  const mobileMenuOverlay = document.getElementById("mobile-menu-overlay");

  if (!topBar && !hamburgerBtn && !mobileMenuOverlay) return;

  syncTopBarAndMenuState();
  window.addEventListener("resize", syncTopBarAndMenuState);
  window.__topBarAndMenuInitDoneV2 = true;
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initTopBarAndMobileMenu, { once: true });
} else {
  initTopBarAndMobileMenu();
}
