// gacha.v2.js
import supabaseClient from './supabase.js';
import { initializeInventoryPanel } from './inventory-panel.v2.js';

// ===============================
// SISTEMA GACHA
// ===============================

let userId = null;
let modo = "comun"; // comun (ilimitado) | premium (consume saldo)
const ritualEl = document.getElementById("gacha-ritual");
const ritualFadeMs = 280;

const btn1 = document.getElementById("btn-tirar-1");
const btn10 = document.getElementById("btn-tirar-10");
const btnRecharge = document.getElementById("btn-recharge");
const packSelect = document.getElementById("pack-select");
const divRes = document.getElementById("gacha-resultados");

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function getRarityClass(rareza) {
  const normalizedRarity = String(rareza || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

  if (normalizedRarity === "legendaria") return "rarity-legendary";
  if (normalizedRarity === "rara" || normalizedRarity === "epica") return "rarity-rare";
  if (normalizedRarity === "comun") return "rarity-common";
  return "rarity-common";
}

function isLegendary(rareza) {
  return getRarityClass(rareza) === "rarity-legendary";
}

function launchConfetti(durationMs = 1200, pieces = 36) {
  const existingLayer = document.getElementById("confetti-layer");
  if (existingLayer) existingLayer.remove();

  const layer = document.createElement("div");
  layer.id = "confetti-layer";
  document.body.appendChild(layer);

  const colors = [
    "rgba(255, 210, 90, 0.95)",
    "rgba(255, 146, 191, 0.92)",
    "rgba(255, 255, 255, 0.95)",
    "rgba(255, 186, 133, 0.9)"
  ];

  for (let i = 0; i < pieces; i += 1) {
    const piece = document.createElement("div");
    piece.className = "confetti-piece";

    const size = 6 + Math.random() * 8;
    const left = Math.random() * 100;
    const drift = -45 + Math.random() * 90;
    const duration = 700 + Math.random() * 700;
    const delay = Math.random() * 220;
    const rotation = 260 + Math.random() * 420;

    piece.style.left = `${left}vw`;
    piece.style.width = `${size}px`;
    piece.style.height = `${size * (0.6 + Math.random() * 0.9)}px`;
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.setProperty("--drift", `${drift}px`);
    piece.style.setProperty("--spin", `${rotation}deg`);
    piece.style.animationDuration = `${duration}ms`;
    piece.style.animationDelay = `${delay}ms`;
    piece.style.opacity = `${0.7 + Math.random() * 0.3}`;

    layer.appendChild(piece);
  }

  setTimeout(() => {
    layer.remove();
  }, durationMs + 350);
}

function renderSkinCard(skin, extraClass = "") {
  return `
    <div class="skin-card skin-result ${getRarityClass(skin.rareza)} ${extraClass}">
      <img src="${skin.imagen_url}" class="skin-img" alt="${skin.nombre}">
      <p class="skin-${skin.rareza}">
        ${skin.nombre} (${skin.rareza})
      </p>
    </div>
  `;
}

function setButtonsEnabled(enabled) {
  const controls = [btn1, btn10, btnRecharge, packSelect, btnModoComun, btnModoPremium];
  controls.forEach((el) => {
    if (!el) return;
    el.disabled = !enabled;
    el.setAttribute("aria-disabled", String(!enabled));
  });
}

async function showRitual(durationMs = 1000) {
  if (!ritualEl) {
    await delay(durationMs);
    return;
  }

  ritualEl.classList.remove("hidden");
  ritualEl.setAttribute("aria-hidden", "false");

  await new Promise((resolve) => requestAnimationFrame(resolve));
  ritualEl.classList.add("show");

  await delay(durationMs);
}

async function hideRitual() {
  if (!ritualEl) return;

  ritualEl.classList.remove("show");
  ritualEl.setAttribute("aria-hidden", "true");
  await delay(ritualFadeMs);
  ritualEl.classList.add("hidden");
}

function animateRevealSingle(skin) {
  divRes.innerHTML = `
    <h3>Resultado:</h3>
    ${renderSkinCard(skin, "reveal-pop")}
  `;
}

async function animateRevealTen(resultsArray) {
  const placeholders = Array.from({ length: resultsArray.length }, (_, idx) => `
    <div class="skin-card skin-placeholder" data-slot="${idx}">
      ???
    </div>
  `).join("");

  divRes.innerHTML = `
    <h3>Resultados (${resultsArray.length}):</h3>
    <div class="gacha-grid">${placeholders}</div>
  `;

  for (let i = 0; i < resultsArray.length; i += 1) {
    const slot = divRes.querySelector(`[data-slot="${i}"]`);
    if (slot) {
      slot.outerHTML = renderSkinCard(resultsArray[i], "reveal-pop");
    }
    await delay(150);
  }
}

// ===============================
// UI MODO (COMUN / PREMIUM)
// ===============================
const btnModoComun = document.getElementById("mode-comun");
const btnModoPremium = document.getElementById("mode-premium");
const premiumBalanceEl = document.getElementById("premium-balance");

function setModo(nuevo) {
  modo = nuevo;

  if (btnModoComun) btnModoComun.classList.toggle("active", modo === "comun");
  if (btnModoPremium) btnModoPremium.classList.toggle("active", modo === "premium");

  // Mostrar balance solo en premium
  if (premiumBalanceEl) {
    if (modo === "premium") premiumBalanceEl.classList.remove("hidden");
    else premiumBalanceEl.classList.add("hidden");
  }

  // Mensajito rápido
  if (divRes) {
    divRes.innerHTML = `
      <p style="opacity:.85;margin:0;">
        Modo: <b>${modo === "premium" ? "Premium" : "Común"}</b>
      </p>
    `;
  }

  // Si eligen premium, intentamos mostrar saldo
  if (modo === "premium") refreshPremiumBalance();
}

async function refreshPremiumBalance() {
  if (!premiumBalanceEl || !userId) return;

  // Lee saldo premium desde user_rolls (server-side sería mejor, pero hoy vale)
  const { data, error } = await supabaseClient
    .from("user_rolls")
    .select("cantidad")
    .eq("user_id", userId)
    .eq("tipo", "premium")
    .maybeSingle();

  if (error) {
    premiumBalanceEl.textContent = "Premium: --";
    return;
  }

  const saldo = data?.cantidad ?? 0;
  premiumBalanceEl.textContent = `Premium: ${saldo}`;
}

// clicks
if (btnModoComun) btnModoComun.onclick = () => setModo("comun");
if (btnModoPremium) btnModoPremium.onclick = () => setModo("premium");

// Obtener sesión
supabaseClient.auth.getUser().then(({ data: { user } }) => {
  if (user) userId = user.id;
});

function endpointUno() {
  return modo === "premium" ? "/api/tirar-skin-premium" : "/api/tirar-skin";
}

function endpointDiez() {
  return modo === "premium" ? "/api/tirar-multiple-premium" : "/api/tirar-multiple";
}

function handlePremiumError(data) {
  if (data?.error === "INSUFFICIENT_PREMIUM_ROLLS") {
    divRes.innerHTML = `
      <h3>Sin tiradas premium</h3>
      <p style="opacity:.85">
        Te quedan <b>${data.saldo ?? 0}</b> tiradas premium.
        <br/>Recargá Yumiko Coins para seguir tirando premium.
      </p>
    `;
    return true;
  }
  return false;
}

// ===============================
// TIRADA DE 1
// ===============================
if (btn1) {
  btn1.onclick = async () => {
    if (!userId) return;

    setButtonsEnabled(false);

    try {
      await showRitual(1000);

      const res = await fetch(endpointUno(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId })
      });

      const data = await res.json();
      await hideRitual();

      if (!res.ok) {
        if (modo === "premium" && handlePremiumError(data)) return;
        divRes.innerHTML = `<p style="color:#ff8080">Error al tirar (1).</p>`;
        console.warn(data);
        return;
      }

      if (!data?.skin) {
        divRes.innerHTML = `<p style="color:#ff8080">Error al tirar (1). Revisá logs.</p>`;
        console.warn("Respuesta tirar-skin:", data);
        return;
      }

      animateRevealSingle(data.skin);
      if (isLegendary(data.skin.rareza)) {
        launchConfetti();
      }
    } catch (error) {
      await hideRitual();
      divRes.innerHTML = `<p style="color:#ff8080">Error al tirar (1).</p>`;
      console.warn("tirar 1 error:", error);
    } finally {
      setButtonsEnabled(true);
      if (modo === "premium") refreshPremiumBalance();
    }
  };
}

// ===============================
// TIRADA X10
// ===============================
if (btn10) {
  btn10.onclick = async () => {
    if (!userId) return;

    setButtonsEnabled(false);

    try {
      await showRitual(1100);

      const res = await fetch(endpointDiez(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, cantidad: 10 })
      });

      let data = null;
      try {
        data = await res.json();
      } catch (e) {
        await hideRitual();
        divRes.innerHTML = `<p style="color:#ff8080">Error leyendo respuesta del servidor.</p>`;
        return;
      }

      await hideRitual();

      if (!res.ok) {
        if (modo === "premium" && handlePremiumError(data)) return;
        divRes.innerHTML = `<p style="color:#ff8080">Error al tirar (x10).</p>`;
        console.warn("tirar-multiple error:", data);
        return;
      }

      if (!data?.resultados || !Array.isArray(data.resultados)) {
        divRes.innerHTML = `<p style="color:#ff8080">Error al tirar (x10): respuesta inválida.</p>`;
        console.warn("Respuesta inválida tirar-multiple:", data);
        return;
      }

      await animateRevealTen(data.resultados);

      const legendaryCount = data.resultados.filter((skin) => isLegendary(skin?.rareza)).length;
      if (legendaryCount > 0) {
        const pieces = legendaryCount >= 2 ? 45 : 36;
        launchConfetti(1200, pieces);
      }
    } catch (error) {
      await hideRitual();
      divRes.innerHTML = `<p style="color:#ff8080">Error al tirar (x10).</p>`;
      console.warn("tirar x10 error:", error);
    } finally {
      setButtonsEnabled(true);
      if (modo === "premium") refreshPremiumBalance();
    }
  };
}

// ===============================
// BOTONES DE NAVEGACIÓN (GACHA)
// ===============================

// Desktop
const btnInicio = document.getElementById("btn-inicio");
const btnInventario = document.getElementById("btn-inventario");
const btnAudios = document.getElementById("btn-audios");

// Mobile
const mInicio = document.getElementById("m-inicio");
const mInventario = document.getElementById("m-inventario");
const mAudios = document.getElementById("m-audios");
const inventoryPanel = document.getElementById("inventoryPanel");
const inventoryDropdown = document.getElementById("inventoryDropdown");
const inventoryContent = document.getElementById("inventory-content");
const inventoryCloseBtn = document.getElementById("inventory-close-btn");

if (btnInicio) {
  btnInicio.onclick = (event) => {
    event.preventDefault();
    if (typeof window.playPageTransitionAndGo === "function") {
      window.playPageTransitionAndGo("index.html");
      return;
    }
    window.location.href = "index.html";
  };
}

if (mInicio) {
  mInicio.onclick = (event) => {
    event.preventDefault();
    mobileMenuOverlay?.classList.add("hidden");
    if (typeof window.playPageTransitionAndGo === "function") {
      window.playPageTransitionAndGo("index.html");
      return;
    }
    window.location.href = "index.html";
  };
}

if (btnInventario) {
  btnInventario.setAttribute("aria-expanded", "false");
  btnInventario.onclick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    window.toggleInventoryPanel?.();
  };
}

if (mInventario) {
  mInventario.setAttribute("aria-expanded", "false");
  mInventario.onclick = () => {
    mobileMenuOverlay?.classList.add("hidden");
    window.toggleInventoryPanel?.();
  };
}

if (btnAudios) btnAudios.onclick = () => window.location.href = "/pacto-lunar-voz-triunfante.html";
if (mAudios) mAudios.onclick = () => window.location.href = "/pacto-lunar-voz-triunfante.html";


// ===============================
// MENÚ MOBILE (HAMBURGUESA)
// ===============================
const hamburgerBtn = document.getElementById("hamburger-btn");
const mobileMenuOverlay = document.getElementById("mobile-menu-overlay");

if (hamburgerBtn) {
  hamburgerBtn.onclick = () => {
    mobileMenuOverlay.classList.toggle("hidden");
  };
}

if (mobileMenuOverlay) {
  mobileMenuOverlay.onclick = (e) => {
    if (e.target === mobileMenuOverlay) {
      mobileMenuOverlay.classList.add("hidden");
    }
  };
}

initializeInventoryPanel({
  supabaseClient,
  btnInventario,
  mInventario,
  inventoryPanel,
  inventoryDropdown,
  inventoryContent,
  inventoryCloseBtn,
  isChatPage: false,
  desktopIgnoreSelector: ".nav-inventory"
});

setModo("comun");

if (btnRecharge) {
  btnRecharge.onclick = async () => {
    if (!userId) return;

    const pack = packSelect?.value || "55";

    const res = await fetch("/api/create-checkout-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, pack })
    });

    const data = await res.json();
    if (!res.ok || !data?.url) {
      console.warn("Checkout error:", data);
      return;
    }

    window.location.href = data.url;
  };
}
