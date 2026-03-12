const OVERLAY_ROOT_ID = "overlay-root";

export function ensureOverlayRoot() {
  let overlayRoot = document.getElementById(OVERLAY_ROOT_ID);
  if (!overlayRoot) {
    overlayRoot = document.createElement("div");
    overlayRoot.id = OVERLAY_ROOT_ID;
    document.body.appendChild(overlayRoot);
  }

  overlayRoot.style.position = "fixed";
  overlayRoot.style.inset = "0";
  overlayRoot.style.pointerEvents = "none";
  overlayRoot.style.zIndex = "99980";

  return overlayRoot;
}

export function appendToOverlayRoot(element) {
  if (!(element instanceof Element)) return;
  const overlayRoot = ensureOverlayRoot();
  if (element.parentElement !== overlayRoot) {
    overlayRoot.appendChild(element);
  }
}
