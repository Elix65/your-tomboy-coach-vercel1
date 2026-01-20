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

    const data = await res.json();
    if (!res.ok) {
      if (modo === "premium" && handlePremiumError(data)) return;
      console.warn(data);
      return;
    }

    divRes.innerHTML = `
      <h3>Resultados (${data.cantidad}):</h3>
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
// INVENTARIO LATERAL (VERSIÓN GACHA)
// ===============================
async function openInventoryPanelGacha() {
  let overlay = document.getElementById("inventory-overlay");

  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "inventory-overlay";
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.background = "rgba(0,0,0,0.6)";
    overlay.style.zIndex = "10000";
    overlay.style.display = "flex";
    overlay.style.justifyContent = "flex-end";

    const drawer = document.createElement("div");
    drawer.style.width = "360px";
    drawer.style.maxWidth = "90%";
    drawer.style.background = "rgba(0,0,0,0.85)";
    drawer.style.padding = "18px";
    drawer.style.overflowY = "auto";
    drawer.style.borderLeft = "1px solid rgba(255,255,255,0.08)";
    drawer.style.backdropFilter = "blur(6px)";
    drawer.style.display = "flex";
    drawer.style.flexDirection = "column";
    drawer.style.gap = "12px";

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "Cerrar";
    closeBtn.className = "inventory-close-btn";
    closeBtn.onclick = () => overlay.remove();

    const content = document.createElement("div");
    content.id = "inventory-content";
    content.innerHTML = `<p style="color:#ccc">Cargando...</p>`;

    drawer.appendChild(closeBtn);
    drawer.appendChild(content);
    overlay.appendChild(drawer);
    document.body.appendChild(overlay);
  }

  const content = document.getElementById("inventory-content");
  if (!content) return;

  try {
    const { data: { user } } = await supabaseClient.auth.getUser();
    const userId = user?.id;
    if (!userId) {
      content.innerHTML = `<p style="color:#f88">No se pudo obtener tu sesión.</p>`;
      return;
    }

    const res = await fetch(`/api/inventario?user_id=${userId}`);
    const data = await res.json();
    const items = data.inventario || [];

    if (!items.length) {
      content.innerHTML = `<p style="color:#ccc">No tenés skins todavía.</p>`;
      return;
    }

    content.innerHTML = items.map(i => {
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
    content.innerHTML = `<p style="color:#f88">No se pudo cargar el inventario.</p>`;
  }
}

// ===============================
// BOTONES DE NAVEGACIÓN (GACHA)
// ===============================

// Desktop
const btnInicio = document.getElementById("btn-inicio");
const btnInventario = document.getElementById("btn-inventario");
const btnLogout = document.getElementById("btn-logout");

// Mobile
const mInicio = document.getElementById("m-inicio");
const mInventario = document.getElementById("m-inventario");
const mLogout = document.getElementById("m-logout");

if (btnInicio) btnInicio.onclick = () => window.location.href = "index.html";
if (mInicio) mInicio.onclick = () => window.location.href = "index.html";

if (btnInventario) btnInventario.onclick = () => openInventoryPanelGacha();
if (mInventario) mInventario.onclick = () => openInventoryPanelGacha();

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
