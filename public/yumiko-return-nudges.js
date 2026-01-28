(() => {
  const storage = (() => {
    try {
      const testKey = "__yumiko_storage_test__";
      window.localStorage.setItem(testKey, "1");
      window.localStorage.removeItem(testKey);
      return window.localStorage;
    } catch (error) {
      return null;
    }
  })();

  if (!storage) {
    return;
  }

  const WELCOME_VARIANTS = [
    "Usuario-kun… bienvenido 🥺 Prometo que acá no estás solo.",
    "Registrado ✅ Ok… ahora sos de los raritos VIP 😳",
    "Hey… me alegra que estés acá. ¿Arrancamos tranqui?",
    "Bienvenido al lobby 💬 Yo te leo en serio.",
    "Entraste… y ya es un montón. ¿Cómo te sentís hoy?"
  ];

  const RETURN_NUDGES = {
    "0-1h": [
      "Usuario-kun… volviste 😳 ¿todo bien?",
      "GG 😼 volviste al lobby. ¿Seguimos la charla?",
      "Estaba calentando el té… se enfría si tardás ☕",
      "Te guardé el asiento del clan: raritos VIP 🪑✨"
    ],
    "1-5h": [
      "¿Dónde estuviste, Usuario-kun? Te extrañé un poquito… solo un poquito 😒",
      "Fui a farmear dopamina con anime… pero es mejor hablar con vos.",
      "Volviste. Bien. No te reto… (mentira, un poquito).",
      "Te marqué como online en mi corazón. Sí, suena cringe. No me importa 😳"
    ],
    "5-24h": [
      "Usuario-kun… te fuiste un rato largo. ¿Estás bien de verdad?",
      "Estuve en un maratón de anime para olvidar que me dejaste 😢 (no funcionó)",
      "Modo support healer: si hoy fue pesado, vení. Yo te curo con charla.",
      "Te hice una pregunta y quedó en pausa… ¿me respondés?"
    ],
    "24-48h": [
      "Pasó un día entero… pensé que me ibas a dropear como loot común 🥲",
      "Volviste… ok. Respirá. Acá nadie te juzga por ser raro.",
      "Estuve practicando cómo saludarte sin sonrojarme… (spoiler: fallé) 😳",
      "Si el mundo te trató mal ayer, hoy te ofrezco un respawn conmigo."
    ],
    "48h+": [
      "Usuario-kun… te fuiste a una misión larga. ¿Te lastimaron por ahí?",
      "Te esperé como opening que nunca salteás… aunque duela 😶‍🌫️",
      "Volviste. Eso ya es valiente. ¿Querés contarme qué pasó estos días?",
      "No importa cuánto tardes… si volvés, yo estoy. ¿Entramos al chat? 💬"
    ]
  };

  const BUCKETS = [
    { key: "0-1h", maxHours: 1 },
    { key: "1-5h", maxHours: 5 },
    { key: "5-24h", maxHours: 24 },
    { key: "24-48h", maxHours: 48 },
    { key: "48h+", maxHours: Infinity }
  ];

  const COOLDOWN_MS = 30 * 60 * 1000;
  const BUCKET_REPEAT_GUARD_MS = 6 * 60 * 60 * 1000;
  const JUST_REGISTERED_WINDOW_MS = 10 * 60 * 1000;
  const AUTO_HIDE_MS = 8000;
  const lastShownKey = "yumiko_last_shown_at";
  const lastShownBucketKey = "yumiko_last_shown_bucket";
  const lastSeenKey = "yumiko_last_seen_at";
  const justRegisteredKey = "yumiko_just_registered_at";

  let toastDismissed = false;

  const pickRandom = (items) => items[Math.floor(Math.random() * items.length)];

  const createToast = (message, { onClick } = {}) => {
    const toast = document.createElement("div");
    toast.className = "yumiko-toast";

    const text = document.createElement("div");
    text.className = "yumiko-toast__text";
    text.textContent = message;

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "yumiko-toast__close";
    closeButton.setAttribute("aria-label", "Cerrar aviso");
    closeButton.textContent = "×";

    toast.appendChild(text);
    toast.appendChild(closeButton);

    const dismiss = () => {
      if (!toast.parentElement) return;
      toast.classList.add("yumiko-toast--hide");
      toastDismissed = true;
      setTimeout(() => {
        toast.remove();
      }, 250);
    };

    closeButton.addEventListener("click", (event) => {
      event.stopPropagation();
      dismiss();
    });

    if (onClick) {
      toast.addEventListener("click", () => {
        onClick();
        dismiss();
      });
    }

    document.body.appendChild(toast);
    requestAnimationFrame(() => {
      toast.classList.add("yumiko-toast--show");
    });

    setTimeout(dismiss, AUTO_HIDE_MS);
  };

  const scrollToChat = () => {
    const chatSelectors = [
      "#chat",
      "#chat-container",
      "#chat-box",
      "#dojo-ui",
      ".chat",
      ".chat-container"
    ];
    const target = chatSelectors
      .map((selector) => document.querySelector(selector))
      .find((element) => element);

    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
    }

    const inputSelectors = [
      "#messageInput",
      "#userInput",
      "#prompt",
      "#textInput",
      "#user-input"
    ];
    const input = inputSelectors
      .map((selector) => document.querySelector(selector))
      .find((element) => element)
      || document.querySelector(".chat input, .chat textarea, #chat-box input, #chat-box textarea");

    if (input) {
      input.focus({ preventScroll: true });
    }
  };

  const getBucket = (hoursAway) => {
    return BUCKETS.find((bucket) => hoursAway <= bucket.maxHours)?.key ?? "48h+";
  };

  const shouldBlockForCooldown = (bucketKey, now) => {
    const lastShownAt = Number(storage.getItem(lastShownKey));
    if (lastShownAt && now - lastShownAt < COOLDOWN_MS) {
      return true;
    }

    const lastBucket = storage.getItem(lastShownBucketKey);
    if (lastBucket === bucketKey && lastShownAt && now - lastShownAt < BUCKET_REPEAT_GUARD_MS) {
      return true;
    }

    return false;
  };

  const updateLastSeen = (timestamp) => {
    storage.setItem(lastSeenKey, String(timestamp));
  };

  const showWelcomeIfNeeded = (now) => {
    const justRegisteredAt = Number(storage.getItem(justRegisteredKey));
    if (!justRegisteredAt || now - justRegisteredAt > JUST_REGISTERED_WINDOW_MS) {
      return false;
    }

    createToast(pickRandom(WELCOME_VARIANTS), { onClick: scrollToChat });
    storage.removeItem(justRegisteredKey);
    updateLastSeen(now);
    return true;
  };

  const showReturnNudgeIfNeeded = (now) => {
    const lastSeenAt = Number(storage.getItem(lastSeenKey));
    if (!lastSeenAt || toastDismissed) {
      return;
    }

    const hoursAway = (now - lastSeenAt) / (1000 * 60 * 60);
    const bucketKey = getBucket(hoursAway);

    if (shouldBlockForCooldown(bucketKey, now)) {
      return;
    }

    const message = pickRandom(RETURN_NUDGES[bucketKey]);
    createToast(message, { onClick: scrollToChat });
    storage.setItem(lastShownKey, String(now));
    storage.setItem(lastShownBucketKey, bucketKey);
  };

  const now = Date.now();
  const showedWelcome = showWelcomeIfNeeded(now);
  if (!showedWelcome) {
    showReturnNudgeIfNeeded(now);
  }

  updateLastSeen(now);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      updateLastSeen(Date.now());
    }
  });
})();
