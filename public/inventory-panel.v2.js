export function initializeInventoryPanel({
  supabaseClient,
  btnInventario,
  mInventario,
  inventoryPanel,
  inventoryDropdown,
  inventoryContent,
  inventoryCloseBtn,
  isChatPage = false,
  onUseSkin = null,
  desktopIgnoreSelector = ".nav-inventory"
}) {
  if (!supabaseClient) {
    return null;
  }

  let inventoryClosingTimer = null;

  function setLoadingUI(isLoading) {
    if (!inventoryDropdown) return;
    inventoryDropdown.classList.toggle("is-loading", isLoading);
    inventoryDropdown.classList.toggle("is-loaded", !isLoading);
  }

  function syncInventoryButtonState(isOpen) {
    btnInventario?.classList.toggle("active", isOpen);
    btnInventario?.setAttribute("aria-expanded", isOpen ? "true" : "false");
    mInventario?.classList.toggle("active", isOpen);
    mInventario?.setAttribute("aria-expanded", isOpen ? "true" : "false");
    inventoryPanel?.setAttribute("aria-hidden", isOpen ? "false" : "true");
    inventoryDropdown?.setAttribute("aria-hidden", isOpen ? "false" : "true");
  }

  function updateChatShiftForInventory() {
    const dropdown = inventoryDropdown || document.getElementById("inventory-dropdown");
    const dojoUI = document.getElementById("dojo-ui");
    if (!dropdown || !dojoUI) return;
    if (window.innerWidth <= 1023) return;

    const dropdownWidth = Math.ceil(dropdown.getBoundingClientRect().width);
    const gap = 28;
    const shift = dropdownWidth + gap;

    document.documentElement.style.setProperty("--chat-shift", `${shift}px`);
  }

  async function loadInventory() {
    if (!inventoryContent) return;

    inventoryContent.innerHTML = `<p class="inventory-state inventory-state--loading">Abriendo sala privada...</p>`;

    try {
      const { data: { user } } = await supabaseClient.auth.getUser();
      const userId = user?.id;
      if (!userId) {
        inventoryContent.innerHTML = `<p class="inventory-state inventory-state--error">No se pudo obtener tu sesión.</p>`;
        return;
      }

      const res = await fetch(`/api/inventario?user_id=${userId}`);
      const data = await res.json();
      const items = data.inventario || [];

      if (!items.length) {
        inventoryContent.innerHTML = `<p class="inventory-state inventory-state--empty">Aún no hay piezas en tu colección.</p>`;
        return;
      }

      inventoryContent.innerHTML = items.map((i) => {
        const rareza = i.rareza?.toLowerCase() || "comun";
        const color =
          rareza === "rara" ? "#4da6ff" :
          rareza === "epica" || rareza === "épica" ? "#c77dff" :
          rareza === "legendaria" ? "#ffcc00" : "#f7f3e9";

        return `
          <div class="inv-item">
            <img src="${i.imagen_url || "/varios/placeholder.png"}" class="inv-img">
            <div class="inv-info">
              <div class="inv-nombre" style="color:${color}">${i.nombre}</div>
              <div class="inv-detalle">
                ${rareza.charAt(0).toUpperCase() + rareza.slice(1)} • x${i.cantidad}
              </div>

              ${isChatPage ? `
                <button class="inv-use-btn" data-skin-id="${i.skin_id}">
                  Aplicar a mi sala
                </button>
              ` : ``}
            </div>
          </div>
        `;
      }).join("");

      if (isChatPage && typeof onUseSkin === "function") {
        inventoryContent.querySelectorAll(".inv-use-btn").forEach((btn) => {
          btn.onclick = async () => {
            const skinId = btn.getAttribute("data-skin-id");
            await onUseSkin(skinId);
          };
        });
      }
    } catch (error) {
      console.error(error);
      inventoryContent.innerHTML = `<p class="inventory-state inventory-state--error">No se pudo cargar el inventario.</p>`;
    } finally {
      requestAnimationFrame(() => setLoadingUI(false));
    }
  }

  function openInventoryPanel() {
    if (!inventoryPanel || !inventoryDropdown) return;
    if (inventoryClosingTimer) {
      clearTimeout(inventoryClosingTimer);
      inventoryClosingTimer = null;
    }

    document.body.classList.remove("inventory-closing");
    document.body.classList.add("inventory-open");
    syncInventoryButtonState(true);
    setLoadingUI(true);

    requestAnimationFrame(() => {
      updateChatShiftForInventory();
    });

    loadInventory();
  }

  function closeInventoryPanel() {
    if (inventoryClosingTimer) {
      clearTimeout(inventoryClosingTimer);
    }

    document.body.classList.add("inventory-closing");
    document.body.classList.remove("inventory-open");
    syncInventoryButtonState(false);
    document.documentElement.style.removeProperty("--chat-shift");

    inventoryClosingTimer = window.setTimeout(() => {
      document.body.classList.remove("inventory-closing");
      inventoryClosingTimer = null;
    }, 780);
  }

  function toggleInventoryPanel() {
    if (document.body.classList.contains("inventory-open")) {
      closeInventoryPanel();
    } else {
      openInventoryPanel();
    }
  }

  syncInventoryButtonState(false);

  if (inventoryCloseBtn) {
    inventoryCloseBtn.onclick = () => closeInventoryPanel();
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && document.body.classList.contains("inventory-open")) {
      closeInventoryPanel();
    }
  });

  document.addEventListener("click", (event) => {
    if (!document.body.classList.contains("inventory-open")) return;
    if (window.innerWidth <= 1023) return;
    if (desktopIgnoreSelector && event.target.closest(desktopIgnoreSelector)) return;

    closeInventoryPanel();
  });

  window.addEventListener("resize", () => {
    if (!document.body.classList.contains("inventory-open")) return;
    updateChatShiftForInventory();
  });

  window.openInventoryPanel = openInventoryPanel;
  window.closeInventoryPanel = closeInventoryPanel;
  window.toggleInventoryPanel = toggleInventoryPanel;

  return {
    openInventoryPanel,
    closeInventoryPanel,
    toggleInventoryPanel,
    loadInventory,
    syncInventoryButtonState
  };
}
