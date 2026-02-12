// gacha.v2.js
import supabaseClient from './supabase.js';

// ===============================
// SISTEMA GACHA
// ===============================

let userId = null;
let modo = "comun"; // comun (ilimitado) | premium (consume saldo)
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

const btn1 = document.getElementById("btn-tirar-1");
const btn10 = document.getElementById("btn-tirar-10");
const divRes = document.getElementById("gacha-resultados");

// (Opcional) si después agregás botones premium en UI, solo seteás modo="premium"
// Ej: document.getElementById("btn-modo-premium").onclick = () => modo="premium";

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

    const res = await fetch(endpointUno(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId })
    });

    const data = await res.json();
    if (!res.ok) {
      if (modo === "premium" && handlePremiumError(data)) return;
      console.warn(data);
      return;
    }

    const s = data.skin;
    if (!data?.skin) {
    divRes.innerHTML = `<p style="color:#ff8080">Error al tirar (1). Revisá logs.</p>`;
    console.warn("Respuesta tirar-skin:", data);
    return;
    }


    divRes.innerHTML = `
      <h3>Resultado:</h3>
      <div class="skin-result">
        <img src="${s.imagen_url}" class="skin-img">
        <p class="skin-${s.rareza} reveal">
          ${s.nombre} (${s.rareza})
        </p>
      </div>
    `;
  };
}

// ===============================
// TIRADA X10
// ===============================
if (btn10) {
  btn10.onclick = async () => {
    if (!userId) return;

    const res = await fetch(endpointDiez(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, cantidad: 10 })
    });

    let data = null;
    try {
      data = await res.json();
    } catch (e) {
      divRes.innerHTML = `<p style="color:#ff8080">Error leyendo respuesta del servidor.</p>`;
      return;
    }

    if (!res.ok) {
      if (modo === "premium" && handlePremiumError(data)) return;
      divRes.innerHTML = `<p style="color:#ff8080">Error al tirar (x10).</p>`;
      console.warn("tirar-multiple error:", data);
      return;
    }

    // ✅ PARCHE DEFENSIVO
    if (!data?.resultados || !Array.isArray(data.resultados)) {
      divRes.innerHTML = `<p style="color:#ff8080">Error al tirar (x10): respuesta inválida.</p>`;
      console.warn("Respuesta inválida tirar-multiple:", data);
      return;
    }

    divRes.innerHTML = `
      <h3>Resultados (${data.cantidad ?? data.resultados.length}):</h3>
      <div class="gacha-grid">
        ${data.resultados
          .map(s => `
            <div class="skin-result">
              <img src="${s.imagen_url}" class="skin-img">
              <p class="skin-${s.rareza} reveal">
                ${s.nombre} (${s.rareza})
              </p>
            </div>
          `)
          .join("")}
      </div>
    `;
  };
}

// ===============================
// INVENTARIO (PANEL ANIMADO)
// ===============================
const inventoryPanel = document.getElementById("inventoryPanel");
const inventoryContent = document.getElementById("inventory-content");
const inventoryCloseBtn = document.getElementById("inventory-close-btn");

function syncInventoryButtonState(isOpen) {
  btnInventario?.classList.toggle("active", isOpen);
  btnInventario?.setAttribute("aria-expanded", isOpen ? "true" : "false");
  mInventario?.classList.toggle("active", isOpen);
  mInventario?.setAttribute("aria-expanded", isOpen ? "true" : "false");
  inventoryPanel?.setAttribute("aria-hidden", isOpen ? "false" : "true");
}

function openInventory() {
  if (!inventoryPanel) return;
  document.body.classList.add("inventory-open");
  syncInventoryButtonState(true);
  loadInventory();
}

function closeInventory() {
  document.body.classList.remove("inventory-open");
  syncInventoryButtonState(false);
}

function toggleInventory() {
  if (document.body.classList.contains("inventory-open")) {
    closeInventory();
  } else {
    openInventory();
  }
}

async function loadInventory() {
  if (!inventoryContent) return;

  inventoryContent.innerHTML = `<p style="color:#ccc">Cargando...</p>`;

  try {
    const { data: { user } } = await supabaseClient.auth.getUser();
    const currentUserId = user?.id;
    if (!currentUserId) {
      inventoryContent.innerHTML = `<p style="color:#f88">No se pudo obtener tu sesión.</p>`;
      return;
    }

    const res = await fetch(`/api/inventario?user_id=${currentUserId}`);
    const data = await res.json();
    const items = data.inventario || [];

    if (!items.length) {
      inventoryContent.innerHTML = `<p style="color:#ccc">No tenés skins todavía.</p>`;
      return;
    }

    inventoryContent.innerHTML = items.map(i => {
      const rareza = i.rareza?.toLowerCase() || "comun";
      const color =
        rareza === "rara" ? "#4da6ff" :
        rareza === "epica" || rareza === "épica" ? "#c77dff" :
        rareza === "legendaria" ? "#ffcc00" : "#f7f3e9";

      return `
        <div class="inv-item">
          <img src="${i.imagen_url || '/varios/placeholder.png'}" class="inv-img">
          <div class="inv-info">
            <div class="inv-nombre" style="color:${color}">${i.nombre}</div>
            <div class="inv-detalle">
              ${rareza.charAt(0).toUpperCase() + rareza.slice(1)} • x${i.cantidad}
            </div>
          </div>
        </div>
      `;
    }).join("");
  } catch (e) {
    console.error(e);
    inventoryContent.innerHTML = `<p style="color:#f88">No se pudo cargar el inventario.</p>`;
  }
}

if (inventoryCloseBtn) {
  inventoryCloseBtn.onclick = () => closeInventory();
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && document.body.classList.contains("inventory-open")) {
    closeInventory();
  }
});

document.addEventListener("click", (event) => {
  if (!document.body.classList.contains("inventory-open")) return;
  if (window.innerWidth <= 768) return;

  const target = event.target;
  const clickedInsidePanel = inventoryPanel?.contains(target);
  const clickedInventoryButton = btnInventario?.contains(target) || mInventario?.contains(target);

  if (!clickedInsidePanel && !clickedInventoryButton) {
    closeInventory();
  }
});

// ===============================
// BOTONES DE NAVEGACIÓN (GACHA)
// ===============================

// Desktop
const btnInicio = document.getElementById("btn-inicio");
const btnInventario = document.getElementById("btn-inventario");
const btnLogout = document.getElementById("btn-logout");
const btnAudios = document.getElementById("btn-audios");

// Mobile
const mInicio = document.getElementById("m-inicio");
const mInventario = document.getElementById("m-inventario");
const mLogout = document.getElementById("m-logout");
const mAudios = document.getElementById("m-audios");

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
  btnInventario.onclick = () => toggleInventory();
}

if (mInventario) {
  mInventario.setAttribute("aria-expanded", "false");
  mInventario.onclick = () => {
    mobileMenuOverlay.classList.add("hidden");
    toggleInventory();
  };
}

if (btnAudios) btnAudios.onclick = () => window.location.href = "/pacto-lunar-voz-triunfante.html";
if (mAudios) mAudios.onclick = () => window.location.href = "/pacto-lunar-voz-triunfante.html";

if (btnLogout) {
  btnLogout.onclick = async () => {
    await supabaseClient.auth.signOut();
    window.location.href = "login.html";
  };
}
if (mLogout) {
  mLogout.onclick = async () => {
    await supabaseClient.auth.signOut();
    window.location.href = "login.html";
  };
}

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
setModo("comun");
const btnRecharge = document.getElementById("btn-recharge");
const packSelect = document.getElementById("pack-select");

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
