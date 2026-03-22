import supabaseClient from './supabase.js';

const safeLocalStorage = (() => {
  try {
    const testKey = '__yumiko_storage_test__';
    window.localStorage.setItem(testKey, '1');
    window.localStorage.removeItem(testKey);
    return window.localStorage;
  } catch (error) {
    return null;
  }
})();

const currentPage = window.location.pathname;
const url = new URL(window.location.href);
const returnToParam = url.searchParams.get('returnTo');
const inviteTokenParam = (url.searchParams.get('token') || '').trim();

function normalizeInvitationCode(code) {
  return String(code || '').trim();
}

function getSafeReturnTo() {
  if (!returnToParam || !returnToParam.startsWith('/')) {
    return null;
  }

  if (returnToParam.startsWith('//')) {
    return null;
  }

  return returnToParam;
}

function getPostLoginRedirectPath() {
  const safeReturnTo = getSafeReturnTo();
  return safeReturnTo || '/index.html';
}

const postLoginRedirectPath = getPostLoginRedirectPath();

function isInitDebugFlagEnabled(flag) {
  const params = new URLSearchParams(window.location.search);
  if (params.get(flag) === '1') return true;
  const list = String(params.get('debug_init_flags') || '')
    .split(',')
    .map((entry) => entry.trim().toUpperCase())
    .filter(Boolean);
  if (list.includes(flag)) return true;
  return window.localStorage.getItem(flag) === '1' || window.sessionStorage.getItem(flag) === '1';
}

function goWithTransition(targetUrl) {
  if (typeof window.playPageTransitionAndGo === 'function') {
    window.playPageTransitionAndGo(targetUrl);
    return;
  }
  window.location.href = targetUrl;
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char] || char));
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

async function parseJsonResponse(response) {
  const text = await response.text().catch(() => '');
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch (error) {
    return {};
  }
}

async function postJson(endpoint, payload) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload || {})
  });

  const data = await parseJsonResponse(response);
  if (!response.ok) {
    const error = new Error(data?.error || 'request_failed');
    error.status = response.status;
    error.payload = data;
    throw error;
  }

  return data;
}

function completeSignedInArrival() {
  sessionStorage.setItem('show_entry_choice', '1');
  goWithTransition(postLoginRedirectPath);
}

async function redirectIfSessionExists() {
  if (!currentPage.includes('login') && !currentPage.includes('invitation') && !currentPage.includes('member-login')) {
    return;
  }

  const res = await supabaseClient.auth.getUser();
  const user = res?.data?.user;
  if (user) {
    completeSignedInArrival();
  }
}

void redirectIfSessionExists();

if (currentPage.includes('index') || currentPage.includes('gacha')) {
  if (isInitDebugFlagEnabled('DISABLE_AUTH_REHYDRATION')) {
    console.info('[DEBUG_INIT] auth rehydration disabled by flag');
  } else {
    supabaseClient.auth.getUser().then((res) => {
      const user = res?.data?.user;
      if (!user) {
        window.location.href = 'login.html';
      }
    });
  }
}

const errorBox = document.getElementById('login-error');
const loginContainer = document.getElementById('login-container');
const onboardingStage = document.getElementById('onboarding-stage');
const loginSteps = document.getElementById('login-steps');
const loginStepsText = document.getElementById('login-steps-text');

function showAuthMessage(message, type = 'error') {
  if (!errorBox) {
    return;
  }

  errorBox.textContent = message;
  errorBox.classList.remove('hidden', 'success');
  if (type === 'success') {
    errorBox.classList.add('success');
  }
}

function clearAuthMessage() {
  if (!errorBox) {
    return;
  }

  errorBox.textContent = '';
  errorBox.classList.add('hidden');
  errorBox.classList.remove('success');
}

const STEP_TRANSITION_MS = 260;
const RITUAL_TEXT_TRANSITION_MS = 200;
let isStepTransitioning = false;

function sleep(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function syncOnboardingStepVisibility(activeStep) {
  if (!loginContainer) {
    return;
  }

  const targetStep = String(activeStep);
  const onboardingSteps = loginContainer.querySelectorAll('[data-onboarding-step]');

  onboardingSteps.forEach((stepNode) => {
    const isActive = stepNode.dataset.onboardingStep === targetStep;
    stepNode.classList.toggle('hidden', !isActive);
    stepNode.setAttribute('aria-hidden', String(!isActive));
    stepNode.dataset.active = isActive ? 'true' : 'false';
  });
}

async function syncRitualLine(step, ritualLinesByStep) {
  if (!loginSteps || !loginStepsText) {
    return;
  }

  const targetStep = String(step);
  const nextLine = ritualLinesByStep[targetStep];
  if (!nextLine) {
    return;
  }

  const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) {
    loginStepsText.textContent = nextLine;
    loginSteps.dataset.step = targetStep;
    return;
  }

  loginStepsText.classList.add('is-changing');
  await sleep(RITUAL_TEXT_TRANSITION_MS);
  loginStepsText.textContent = nextLine;
  loginSteps.dataset.step = targetStep;
  loginStepsText.classList.remove('is-changing');
}

async function setOnboardingStep(step, ritualLinesByStep) {
  if (!loginContainer) {
    return;
  }

  if (isStepTransitioning) {
    return;
  }

  const targetStep = String(step);
  const currentStep = loginContainer.dataset.step || '1';
  if (currentStep === targetStep) {
    return;
  }

  const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const currentStepNode = loginContainer.querySelector(`[data-onboarding-step="${currentStep}"]`);
  const nextStepNode = loginContainer.querySelector(`[data-onboarding-step="${targetStep}"]`);

  if (onboardingStage && currentStepNode && nextStepNode) {
    const stageHeight = Math.max(currentStepNode.offsetHeight, nextStepNode.offsetHeight);
    onboardingStage.style.height = `${stageHeight}px`;
    onboardingStage.style.minHeight = `${stageHeight}px`;
  }

  isStepTransitioning = true;
  loginContainer.classList.add('is-transitioning');

  try {
    if (nextStepNode) {
      nextStepNode.classList.remove('step-exit');
      if (!prefersReducedMotion) {
        nextStepNode.classList.add('step-enter');
      } else {
        nextStepNode.classList.remove('step-enter');
      }
      nextStepNode.setAttribute('aria-hidden', 'true');
      nextStepNode.dataset.active = 'false';
    }

    if (!prefersReducedMotion && currentStepNode) {
      currentStepNode.classList.add('step-exit');
      await sleep(STEP_TRANSITION_MS);
      currentStepNode.classList.remove('step-exit');
    }

    loginContainer.dataset.step = targetStep;
    await syncRitualLine(targetStep, ritualLinesByStep);
    syncOnboardingStepVisibility(targetStep);

    if (!prefersReducedMotion && nextStepNode) {
      void nextStepNode.offsetWidth;
      nextStepNode.classList.remove('step-enter');
      await sleep(STEP_TRANSITION_MS);
    } else if (nextStepNode) {
      nextStepNode.classList.remove('step-enter');
    }
  } finally {
    if (onboardingStage) {
      onboardingStage.style.height = '';
      onboardingStage.style.minHeight = '';
    }

    loginContainer.classList.remove('is-transitioning');
    isStepTransitioning = false;
  }
}

function setupPublicArrivalFlow() {
  if (!currentPage.includes('login') || !loginContainer) {
    return;
  }

  const arrivalNameInput = document.getElementById('arrival-name');
  const arrivalNextBtn = document.getElementById('btn-arrival-next');
  const arrivalAdmissionForm = document.getElementById('arrival-admission-form');
  const arrivalAdmissionNextBtn = document.getElementById('btn-arrival-admission-next');
  const arrivalChatLog = document.getElementById('arrival-chat-log');
  const arrivalChatQuickReplies = document.getElementById('arrival-chat-quick-replies');
  const arrivalChatInput = document.getElementById('arrival-chat-input');
  const arrivalChatTyping = document.getElementById('arrival-chat-typing');
  const arrivalChatStatus = document.getElementById('arrival-chat-status');
  const arrivalContinueBtn = document.getElementById('btn-arrival-continue');
  const arrivalAdmissionNameDisplay = document.getElementById('arrival-admission-name-display');
  const arrivalNameDisplay = document.getElementById('arrival-name-display');
  const arrivalCheckoutForm = document.getElementById('arrival-direct-checkout-form');
  const arrivalEmailInput = document.getElementById('arrival-email');
  const arrivalProviderRecommendation = document.getElementById('arrival-provider-recommendation');
  const arrivalProviderPrimary = document.getElementById('arrival-provider-primary');
  const arrivalProviderSecondary = document.getElementById('arrival-provider-secondary');
  const arrivalInviteLinks = Array.from(document.querySelectorAll('[data-private-door-link]'));

  const RITUAL_LINES_BY_STEP = {
    '1': 'Tu llegada empieza ahora.',
    '2': 'Yumiko abre una admisión breve.',
    '3': 'Tu email queda resguardado antes del acceso.',
    '4': 'Elegí cómo querés abrir tu acceso.'
  };
  const ARRIVAL_PROVIDER_LABELS = {
    mercadopago: 'Mercado Pago',
    paypal: 'PayPal'
  };
  const ARRIVAL_PROVIDER_RECOMMENDATION_COPY = {
    mercadopago: 'Mercado Pago',
    paypal: 'PayPal'
  };
  const ARRIVAL_CHAT_STATE_KEY = 'yumiko_arrival_chat_state';
  const ARRIVAL_CHAT_TRANSCRIPT_KEY = 'yumiko_arrival_chat_transcript';
  const ARRIVAL_CHAT_RESULT_KEY = 'yumiko_arrival_fit_result';
  const ARRIVAL_CHAT_QUESTIONS = [
    {
      id: 'intent',
      prompt: (name) => `Hola, ${name || 'vos'}. Antes de abrir la siguiente puerta, decime qué te gustaría encontrar acá.`,
      quickReplies: [
        { value: 'presence', label: 'Presencia, calma y compañía', score: 3, reply: 'Entonces no viniste a mirar desde lejos. Bien.' },
        { value: 'continuity', label: 'Un vínculo más constante', score: 3, reply: 'La continuidad cambia mucho la forma en la que se siente entrar.' },
        { value: 'curiosity', label: 'Solo quiero ver qué onda', score: -2, reply: 'Puedo mostrarte algo breve, aunque no todo se abre desde la curiosidad sola.' }
      ],
      allowsInput: true
    },
    {
      id: 'reception',
      prompt: () => '¿Y cómo te gustaría ser recibido por mí cuando entres?',
      quickReplies: [
        { value: 'warm', label: 'Con calidez y suavidad', score: 2, reply: 'Entiendo. Eso pide presencia, no apuro.' },
        { value: 'close', label: 'Con cercanía y complicidad', score: 2, reply: 'Bien. La complicidad necesita un tono cuidado.' },
        { value: 'light', label: 'Sin tanta profundidad', score: -1, reply: 'Puedo ser liviana, pero esta puerta está pensada para algo más sostenido.' }
      ],
      allowsInput: false
    },
    {
      id: 'premium',
      prompt: () => 'Última cosa: ¿valorás una experiencia íntima, constante y premium, o buscás algo más casual?',
      quickReplies: [
        { value: 'premium_yes', label: 'Sí, eso es lo que busco', score: 3, reply: 'Entonces ya estamos hablando el mismo idioma.' },
        { value: 'premium_maybe', label: 'Sí, si se siente real', score: 2, reply: 'Perfecto. Lo real también se cuida.' },
        { value: 'premium_no', label: 'Prefiero algo casual', score: -3, reply: 'Gracias por decirlo directo.' }
      ],
      allowsInput: false
    }
  ];
  const ARRIVAL_FIT_KEYWORDS = ['compañ', 'compan', 'presencia', 'calma', 'íntim', 'intim', 'vínculo', 'vinculo', 'continu', 'constan', 'cercan', 'acompañ', 'acompan', 'premium', 'curad', 'real'];
  const ARRIVAL_NO_FIT_KEYWORDS = ['solo ver', 'solo mirar', 'por que si', 'porque si', 'aburr', 'meme', 'probar', 'casual', 'random', 'nada', 'da igual'];

  let arrivalChatState = null;
  let arrivalChatTimers = [];
  let arrivalChatBootstrapped = false;

  function updateArrivalWelcomeName() {
    const storedName = (window.sessionStorage.getItem('yumiko_arrival_name') || '').trim();
    if (arrivalAdmissionNameDisplay) {
      arrivalAdmissionNameDisplay.textContent = storedName || 'vos';
    }
    if (arrivalNameDisplay) {
      arrivalNameDisplay.textContent = storedName || 'vos';
    }
    return true;
  }

  function getArrivalName() {
    return (window.sessionStorage.getItem('yumiko_arrival_name') || '').trim() || 'vos';
  }

  function syncPrivateDoorLinks() {
    if (arrivalInviteLinks.length) {
      const inviteUrl = new URL('/invitation.html', window.location.origin);
      const safeReturnTo = getSafeReturnTo();
      if (safeReturnTo) {
        inviteUrl.searchParams.set('returnTo', safeReturnTo);
      }
      const href = inviteUrl.pathname + inviteUrl.search;
      arrivalInviteLinks.forEach((link) => link.setAttribute('href', href));
    }
  }

  function submitArrivalStepOne() {
    clearAuthMessage();
    const normalizedName = String(arrivalNameInput?.value || '').trim();
    if (normalizedName) {
      window.sessionStorage.setItem('yumiko_arrival_name', normalizedName.slice(0, 24));
    } else {
      window.sessionStorage.removeItem('yumiko_arrival_name');
    }
    resetArrivalChatState();
    updateArrivalWelcomeName();
    void setOnboardingStep(2, RITUAL_LINES_BY_STEP);
  }

  function clearArrivalChatTimers() {
    arrivalChatTimers.forEach((timerId) => window.clearTimeout(timerId));
    arrivalChatTimers = [];
  }

  function scheduleArrivalChat(callback, delay) {
    const timerId = window.setTimeout(() => {
      arrivalChatTimers = arrivalChatTimers.filter((entry) => entry !== timerId);
      callback();
    }, delay);
    arrivalChatTimers.push(timerId);
  }

  function getDefaultArrivalChatState() {
    return {
      phase: 'intro',
      currentQuestionIndex: -1,
      answers: {},
      fitScore: 0,
      strongNoFit: false,
      completed: false,
      result: null
    };
  }

  function saveArrivalChatState() {
    window.sessionStorage.setItem(ARRIVAL_CHAT_STATE_KEY, JSON.stringify(arrivalChatState || getDefaultArrivalChatState()));
    window.sessionStorage.setItem(ARRIVAL_CHAT_TRANSCRIPT_KEY, arrivalChatLog?.innerHTML || '');
    if (arrivalChatState?.result) {
      window.sessionStorage.setItem(ARRIVAL_CHAT_RESULT_KEY, arrivalChatState.result);
    } else {
      window.sessionStorage.removeItem(ARRIVAL_CHAT_RESULT_KEY);
    }
  }

  function loadArrivalChatState() {
    try {
      const rawState = window.sessionStorage.getItem(ARRIVAL_CHAT_STATE_KEY);
      if (!rawState) {
        return getDefaultArrivalChatState();
      }

      return {
        ...getDefaultArrivalChatState(),
        ...JSON.parse(rawState)
      };
    } catch (error) {
      return getDefaultArrivalChatState();
    }
  }

  function pushArrivalMessage(role, content, meta = {}) {
    if (!arrivalChatLog) {
      return;
    }

    const bubble = document.createElement('div');
    bubble.className = `arrival-chat-message arrival-chat-message--${role}`;
    if (meta.isClosure) {
      bubble.classList.add('arrival-chat-message--closure');
    }

    const bubbleInner = document.createElement('div');
    bubbleInner.className = 'arrival-chat-bubble';
    bubbleInner.textContent = content;
    bubble.appendChild(bubbleInner);
    arrivalChatLog.appendChild(bubble);
    arrivalChatLog.scrollTop = arrivalChatLog.scrollHeight;
    saveArrivalChatState();
  }

  function setArrivalChatTyping(visible) {
    if (!arrivalChatTyping) {
      return;
    }

    arrivalChatTyping.classList.toggle('hidden', !visible);
    arrivalChatTyping.setAttribute('aria-hidden', String(!visible));
  }

  function updateArrivalChatStatus(text) {
    if (arrivalChatStatus) {
      arrivalChatStatus.textContent = text;
    }
  }

  function setArrivalChatComposerEnabled(enabled) {
    if (arrivalChatInput) {
      arrivalChatInput.disabled = !enabled;
    }
    if (arrivalAdmissionNextBtn) {
      arrivalAdmissionNextBtn.disabled = !enabled;
    }
  }

  function renderArrivalQuickReplies() {
    if (!arrivalChatQuickReplies) {
      return;
    }

    arrivalChatQuickReplies.innerHTML = '';

    if (!arrivalChatState || arrivalChatState.completed || arrivalChatState.phase !== 'question') {
      return;
    }

    const question = ARRIVAL_CHAT_QUESTIONS[arrivalChatState.currentQuestionIndex];
    if (!question) {
      return;
    }

    question.quickReplies.forEach((option) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'arrival-quick-reply';
      button.textContent = option.label;
      button.addEventListener('click', () => {
        void handleArrivalChatAnswer({
          value: option.value,
          label: option.label,
          source: 'quick_reply'
        });
      });
      arrivalChatQuickReplies.appendChild(button);
    });
  }

  function normalizeArrivalChatText(value) {
    return String(value || '').trim().replace(/\s+/g, ' ');
  }

  function scoreArrivalFreeText(text) {
    const normalized = normalizeArrivalChatText(text).toLowerCase();
    if (!normalized) {
      return { score: -3, strongNoFit: true };
    }

    let score = normalized.length >= 18 ? 1 : 0;
    ARRIVAL_FIT_KEYWORDS.forEach((keyword) => {
      if (normalized.includes(keyword)) {
        score += 1;
      }
    });
    ARRIVAL_NO_FIT_KEYWORDS.forEach((keyword) => {
      if (normalized.includes(keyword)) {
        score -= 2;
      }
    });

    const strongNoFit = normalized.length < 6 || ARRIVAL_NO_FIT_KEYWORDS.some((keyword) => normalized.includes(keyword));
    return { score, strongNoFit };
  }

  function evaluateArrivalFit() {
    if (!arrivalChatState) {
      return 'no_fit';
    }

    if (arrivalChatState.strongNoFit) {
      return 'no_fit';
    }

    const premiumAnswer = arrivalChatState.answers?.premium?.value;
    if (premiumAnswer === 'premium_no') {
      return 'no_fit';
    }

    return arrivalChatState.fitScore >= 4 ? 'fit' : 'no_fit';
  }

  async function concludeArrivalChat() {
    const result = evaluateArrivalFit();
    arrivalChatState.completed = true;
    arrivalChatState.result = result;
    saveArrivalChatState();
    renderArrivalQuickReplies();
    setArrivalChatComposerEnabled(false);
    setArrivalChatTyping(true);
    updateArrivalChatStatus('Yumiko está decidiendo');

    scheduleArrivalChat(async () => {
      setArrivalChatTyping(false);

      if (result === 'fit') {
        pushArrivalMessage('assistant', 'Entiendo. Creo que sí puedo abrirte el siguiente paso.', { isClosure: true });
        updateArrivalChatStatus('Acceso habilitado');
        scheduleArrivalChat(async () => {
          pushArrivalMessage('assistant', 'Dejame resguardar tu email y seguimos.', { isClosure: true });
          await setOnboardingStep(3, RITUAL_LINES_BY_STEP);
        }, 900);
        return;
      }

      pushArrivalMessage('assistant', 'Todavía no siento que esta sea la mejor puerta para vos.', { isClosure: true });
      updateArrivalChatStatus('Puerta en pausa');
      scheduleArrivalChat(() => {
        pushArrivalMessage('assistant', 'Prefiero dejarlo acá, con suavidad, antes que abrir algo sin encaje real.', { isClosure: true });
      }, 800);
    }, 900);
  }

  function askArrivalQuestion(index) {
    if (!arrivalChatState) {
      return;
    }

    const question = ARRIVAL_CHAT_QUESTIONS[index];
    if (!question) {
      void concludeArrivalChat();
      return;
    }

    arrivalChatState.currentQuestionIndex = index;
    arrivalChatState.phase = 'question';
    saveArrivalChatState();
    renderArrivalQuickReplies();
    setArrivalChatComposerEnabled(true);
    setArrivalChatTyping(true);
    updateArrivalChatStatus('Yumiko está escribiendo');

    scheduleArrivalChat(() => {
      setArrivalChatTyping(false);
      pushArrivalMessage('assistant', question.prompt(getArrivalName()));
      updateArrivalChatStatus('Esperando tu respuesta');
      if (arrivalChatInput) {
        arrivalChatInput.value = '';
        arrivalChatInput.placeholder = question.allowsInput
          ? 'Podés responder en una línea o tocar una opción…'
          : 'Elegí una de las respuestas sugeridas…';
        arrivalChatInput.disabled = !question.allowsInput;
      }
      renderArrivalQuickReplies();
      const preferredTarget = question.quickReplies.length
        ? arrivalChatQuickReplies?.querySelector('button')
        : arrivalChatInput;
      preferredTarget?.focus();
    }, 700);
  }

  async function handleArrivalChatAnswer({ value = '', label = '', source = 'input' } = {}) {
    if (!arrivalChatState || arrivalChatState.completed || arrivalChatState.phase !== 'question') {
      return;
    }

    const question = ARRIVAL_CHAT_QUESTIONS[arrivalChatState.currentQuestionIndex];
    if (!question) {
      return;
    }

    const normalizedLabel = normalizeArrivalChatText(label || value);
    if (!normalizedLabel) {
      showAuthMessage('Dejame sentir una respuesta real antes de seguir.');
      arrivalChatInput?.focus();
      return;
    }

    clearAuthMessage();
    setArrivalChatComposerEnabled(false);
    arrivalChatState.phase = 'answer';
    saveArrivalChatState();
    renderArrivalQuickReplies();
    pushArrivalMessage('user', normalizedLabel);

    let scoreDelta = 0;
    let strongNoFit = false;
    let assistantReply = 'Entiendo.';

    if (source === 'quick_reply') {
      const selectedOption = question.quickReplies.find((option) => option.value === value || option.label === normalizedLabel);
      scoreDelta = selectedOption?.score || 0;
      assistantReply = selectedOption?.reply || assistantReply;
      strongNoFit = scoreDelta <= -3;
    } else {
      const freeTextScore = scoreArrivalFreeText(normalizedLabel);
      scoreDelta = freeTextScore.score;
      strongNoFit = freeTextScore.strongNoFit;
      if (scoreDelta >= 2) {
        assistantReply = 'Eso suena más cercano a la clase de vínculo que cuido acá.';
      } else if (scoreDelta >= 0) {
        assistantReply = 'Te sigo. Quiero sentir un poco más tu intención.';
      } else {
        assistantReply = 'Gracias por decírmelo así de directo.';
      }
    }

    arrivalChatState.answers[question.id] = {
      value: normalizeArrivalChatText(value),
      label: normalizedLabel,
      source
    };
    arrivalChatState.fitScore += scoreDelta;
    arrivalChatState.strongNoFit = Boolean(arrivalChatState.strongNoFit || strongNoFit);
    saveArrivalChatState();
    updateArrivalChatStatus('Yumiko está leyendo');
    setArrivalChatTyping(true);

    scheduleArrivalChat(() => {
      setArrivalChatTyping(false);
      pushArrivalMessage('assistant', assistantReply);
      const nextIndex = arrivalChatState.currentQuestionIndex + 1;
      if (nextIndex >= ARRIVAL_CHAT_QUESTIONS.length) {
        void concludeArrivalChat();
        return;
      }

      askArrivalQuestion(nextIndex);
    }, 700);
  }

  function resetArrivalChatState({ preserveName = true } = {}) {
    clearArrivalChatTimers();
    arrivalChatState = getDefaultArrivalChatState();
    arrivalChatBootstrapped = false;
    if (!preserveName) {
      window.sessionStorage.removeItem('yumiko_arrival_name');
    }
    window.sessionStorage.removeItem(ARRIVAL_CHAT_STATE_KEY);
    window.sessionStorage.removeItem(ARRIVAL_CHAT_TRANSCRIPT_KEY);
    window.sessionStorage.removeItem(ARRIVAL_CHAT_RESULT_KEY);
    ['intent', 'reception', 'premium'].forEach((field) => window.sessionStorage.removeItem(`yumiko_arrival_${field}`));
    if (arrivalChatLog) {
      arrivalChatLog.innerHTML = '';
    }
    if (arrivalChatQuickReplies) {
      arrivalChatQuickReplies.innerHTML = '';
    }
    if (arrivalChatInput) {
      arrivalChatInput.value = '';
    }
    setArrivalChatTyping(false);
    updateArrivalChatStatus('Abriendo una primera impresión');
    setArrivalChatComposerEnabled(true);
  }

  function restoreArrivalTranscript() {
    if (!arrivalChatLog) {
      return;
    }

    const rawTranscript = window.sessionStorage.getItem(ARRIVAL_CHAT_TRANSCRIPT_KEY);
    if (rawTranscript) {
      arrivalChatLog.innerHTML = rawTranscript;
      arrivalChatLog.scrollTop = arrivalChatLog.scrollHeight;
    } else {
      arrivalChatLog.innerHTML = '';
    }
  }

  function ensureArrivalChatStarted() {
    if (!arrivalAdmissionForm || !arrivalChatLog) {
      return;
    }

    clearArrivalChatTimers();
    arrivalChatState = loadArrivalChatState();
    restoreArrivalTranscript();
    updateArrivalChatStatus(arrivalChatState.result === 'fit'
      ? 'Acceso habilitado'
      : arrivalChatState.result === 'no_fit'
        ? 'Puerta en pausa'
        : 'Abriendo una primera impresión');

    if (arrivalChatState.completed) {
      renderArrivalQuickReplies();
      setArrivalChatComposerEnabled(false);
      return;
    }

    if (!arrivalChatBootstrapped && !arrivalChatLog.innerHTML) {
      arrivalChatState = getDefaultArrivalChatState();
      saveArrivalChatState();
      arrivalChatBootstrapped = true;
      askArrivalQuestion(0);
      return;
    }

    arrivalChatBootstrapped = true;
    renderArrivalQuickReplies();
    const currentQuestion = ARRIVAL_CHAT_QUESTIONS[arrivalChatState.currentQuestionIndex];
    setArrivalChatComposerEnabled(Boolean(currentQuestion));
    if (arrivalChatInput) {
      arrivalChatInput.disabled = !currentQuestion?.allowsInput;
      arrivalChatInput.placeholder = currentQuestion?.allowsInput
        ? 'Podés responder en una línea o tocar una opción…'
        : 'Elegí una de las respuestas sugeridas…';
    }
  }

  function buildArrivalReturnUrl(provider) {
    const email = normalizeEmail(window.sessionStorage.getItem('yumiko_arrival_email') || '');
    const returnUrl = new URL('/arrival/return', window.location.origin);
    if (email) {
      returnUrl.searchParams.set('email', email);
    }
    if (provider) {
      returnUrl.searchParams.set('provider', provider);
    }
    return returnUrl;
  }

  function withReturnParams(paymentUrl, provider) {
    const normalizedPaymentUrl = String(paymentUrl || '').trim();
    if (!normalizedPaymentUrl) {
      return normalizedPaymentUrl;
    }

    const urlObject = new URL(normalizedPaymentUrl);
    const returnUrl = buildArrivalReturnUrl(provider);

    urlObject.searchParams.set('return', returnUrl.toString());
    urlObject.searchParams.set('cancel_return', returnUrl.toString());
    urlObject.searchParams.set('custom', normalizeEmail(window.sessionStorage.getItem('yumiko_arrival_email') || ''));
    urlObject.searchParams.set('external_reference', normalizeEmail(window.sessionStorage.getItem('yumiko_arrival_email') || ''));
    urlObject.searchParams.set('back_url', returnUrl.toString());
    urlObject.searchParams.set('back_url_success', returnUrl.toString());
    urlObject.searchParams.set('back_url_pending', returnUrl.toString());
    urlObject.searchParams.set('back_url_failure', returnUrl.toString());

    return urlObject.toString();
  }

  function updateArrivalProviderChoice(data) {
    const recommendedProvider = String(data?.recommended_provider || '').trim().toLowerCase();
    const alternativeProvider = String(data?.alternative_provider || '').trim().toLowerCase();
    const paymentUrls = data?.payment_urls && typeof data.payment_urls === 'object' ? data.payment_urls : {};
    const recommendedUrl = withReturnParams(paymentUrls?.[recommendedProvider], recommendedProvider);
    const alternativeUrl = withReturnParams(paymentUrls?.[alternativeProvider], alternativeProvider);
    const recommendedLabel = ARRIVAL_PROVIDER_LABELS[recommendedProvider];
    const alternativeLabel = ARRIVAL_PROVIDER_LABELS[alternativeProvider];

    if (!recommendedLabel || !alternativeLabel || !recommendedUrl || !alternativeUrl) {
      throw new Error('missing_payment_options');
    }

    if (arrivalProviderRecommendation) {
      arrivalProviderRecommendation.textContent = ARRIVAL_PROVIDER_RECOMMENDATION_COPY[recommendedProvider] || ARRIVAL_PROVIDER_RECOMMENDATION_COPY.paypal;
    }

    if (arrivalProviderPrimary) {
      arrivalProviderPrimary.textContent = `Continuar con ${recommendedLabel}`;
      arrivalProviderPrimary.href = recommendedUrl;
    }

    if (arrivalProviderSecondary) {
      arrivalProviderSecondary.textContent = `Usar ${alternativeLabel}`;
      arrivalProviderSecondary.href = alternativeUrl;
    }
  }

  function validateArrivalCheckoutEmail(email) {
    if (!email) {
      return 'Dejanos tu email para poder abrir tu acceso ahora.';
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return 'Revisemos ese email y volvamos a intentarlo.';
    }

    return null;
  }

  async function submitArrivalCheckout() {
    const email = normalizeEmail(arrivalEmailInput?.value || '');
    const validationError = validateArrivalCheckoutEmail(email);

    if (validationError) {
      showAuthMessage(validationError);
      arrivalEmailInput?.focus();
      return;
    }

    clearAuthMessage();
    if (arrivalContinueBtn) {
      arrivalContinueBtn.disabled = true;
    }

    try {
      const data = await postJson('/api/arrival/request', {
        email,
        source: 'public_direct_checkout'
      });

      updateArrivalProviderChoice(data);
      window.sessionStorage.setItem('yumiko_arrival_email', email);
      await setOnboardingStep(4, RITUAL_LINES_BY_STEP);
    } catch (error) {
      console.error('Arrival checkout error:', error?.payload || error?.message || error);
      const fallbackMessage = 'Uhm… algo interrumpió tu acceso. Intentemos de nuevo en un momento.';
      showAuthMessage(error?.payload?.error_description || error?.payload?.error || fallbackMessage);
    } finally {
      if (arrivalContinueBtn) {
        arrivalContinueBtn.disabled = false;
      }
    }
  }

  loginContainer.dataset.step = '1';
  syncOnboardingStepVisibility('1');
  void syncRitualLine('1', RITUAL_LINES_BY_STEP);
  syncPrivateDoorLinks();
  updateArrivalWelcomeName();
  arrivalChatState = loadArrivalChatState();
  restoreArrivalTranscript();

  if (arrivalNameInput && arrivalNextBtn) {
    arrivalNextBtn.onclick = submitArrivalStepOne;
    arrivalNameInput.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') {
        return;
      }
      event.preventDefault();
      submitArrivalStepOne();
    });
  }

  if (arrivalAdmissionForm) {
    arrivalAdmissionForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      await handleArrivalChatAnswer({
        value: normalizeArrivalChatText(arrivalChatInput?.value || ''),
        label: normalizeArrivalChatText(arrivalChatInput?.value || ''),
        source: 'input'
      });
      if (arrivalChatInput) {
        arrivalChatInput.value = '';
      }
    });
  }

  if (arrivalCheckoutForm) {
    arrivalCheckoutForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      await submitArrivalCheckout();
    });
  }

  const observer = new MutationObserver(() => {
    if (loginContainer.dataset.step === '2') {
      updateArrivalWelcomeName();
      ensureArrivalChatStarted();
      return;
    }

    if (loginContainer.dataset.step === '3') {
      arrivalEmailInput?.focus();
      return;
    }

    if (loginContainer.dataset.step === '4') {
      arrivalProviderPrimary?.focus();
    }
  });

  observer.observe(loginContainer, {
    attributes: true,
    attributeFilter: ['data-step']
  });
}

function setupInvitationFlow() {
  if (!currentPage.includes('invitation')) {
    return;
  }

  const invitationStatus = document.getElementById('invitation-status');
  const invitationStatusText = document.getElementById('invitation-status-text');
  const invitationContainer = document.getElementById('login-container');
  const lockedView = document.getElementById('invitation-locked-view');
  const activationView = document.getElementById('invitation-activation-view');
  const loginView = document.getElementById('invitation-login-view');
  const invitationGreeting = document.getElementById('invitation-greeting');
  const invitationLead = document.getElementById('invitation-lead');
  const invitationCompletionNote = document.getElementById('invitation-completion-note');
  const invitationEmailGroup = document.getElementById('invitation-email-group');
  const invitationEmailInput = document.getElementById('invitation-email');
  const invitationPasswordInput = document.getElementById('invitation-password');
  const invitationCompleteBtn = document.getElementById('btn-complete-arrival');
  const invitationSignInForm = document.getElementById('private-signin-form');
  const signInEmailInput = document.getElementById('private-email');
  const signInPasswordInput = document.getElementById('private-password');
  const signInBtn = document.getElementById('btn-private-signin');
  const invitationLoginGreeting = document.getElementById('invitation-login-greeting');
  const invitationLoginLead = document.getElementById('invitation-login-lead');
  const manualInvitationForm = document.getElementById('manual-invitation-form');
  const manualInvitationEmailInput = document.getElementById('manual-invitation-email');
  const manualInvitationCodeInput = document.getElementById('manual-invitation-code');
  const manualInvitationBtn = document.getElementById('btn-open-invitation');

  let activeInvitation = null;
  let activeInvitationToken = inviteTokenParam;

  function setInvitationState(state) {
    if (!invitationStatus || !invitationStatusText || !invitationContainer) {
      return;
    }

    invitationStatus.dataset.state = state;
    invitationContainer.dataset.doorState = state;

    if (state === 'approved') {
      invitationStatusText.textContent = 'Acceso concedido';
      return;
    }

    if (state === 'ready') {
      invitationStatusText.textContent = 'Entrada reservada';
      return;
    }

    invitationStatusText.textContent = 'Invitación privada';
  }

  function showInvitationView(view) {
    const views = [
      ['locked', lockedView],
      ['activation', activationView],
      ['signin', loginView]
    ];

    views.forEach(([viewName, node]) => {
      if (!node) {
        return;
      }

      const isActive = viewName === view;
      node.classList.toggle('hidden', !isActive);
      node.setAttribute('aria-hidden', String(!isActive));
    });
  }

  function resetInvitationDoor() {
    activeInvitation = null;
    activeInvitationToken = inviteTokenParam;
    clearAuthMessage();
    setInvitationState('idle');
    showInvitationView('locked');

    if (manualInvitationEmailInput) {
      manualInvitationEmailInput.value = normalizeEmail(window.sessionStorage.getItem('yumiko_arrival_email') || '');
    }

    if (manualInvitationCodeInput && !inviteTokenParam) {
      manualInvitationCodeInput.value = '';
    }
  }

  function renderInvitation(data, tokenUsed = '') {
    activeInvitation = data;
    activeInvitationToken = normalizeInvitationCode(tokenUsed || data?.invite_token || activeInvitationToken);
    clearAuthMessage();

    const name = data?.name || 'vos';
    const email = data?.email || '';
    const accountEnabled = Boolean(data?.account_enabled);
    const needsEmail = !email;

    if (invitationGreeting) {
      invitationGreeting.textContent = `${name}, tu acceso puede quedar abierto ahora.`;
    }

    if (invitationLead) {
      invitationLead.textContent = needsEmail
        ? 'Primero dejá el email que va a quedar unido a esta invitación. Después elegí tu contraseña.'
        : 'Tu email ya fue reservado. Solo falta elegir la contraseña con la que vas a volver.';
    }

    if (invitationCompletionNote) {
      invitationCompletionNote.textContent = needsEmail
        ? 'Un email y una contraseña. Nada más entre vos y esta puerta.'
        : 'Solo falta resguardar la forma en la que vas a volver.';
    }

    if (invitationEmailGroup) {
      invitationEmailGroup.classList.toggle('hidden', !needsEmail);
    }

    if (invitationEmailInput) {
      invitationEmailInput.value = email;
      invitationEmailInput.readOnly = !needsEmail;
    }

    if (signInEmailInput) {
      signInEmailInput.value = email;
      signInEmailInput.readOnly = Boolean(email);
    }

    if (invitationLoginGreeting) {
      invitationLoginGreeting.textContent = `${name}, tu puerta ya está lista.`;
    }

    if (invitationLoginLead) {
      invitationLoginLead.textContent = 'Entrá con el acceso que ya quedó sellado para vos.';
    }

    showInvitationView(accountEnabled ? 'signin' : 'activation');
    setInvitationState(accountEnabled ? 'ready' : 'approved');
  }

  async function validateInvitation({ token = '', email = '', code = '' } = {}) {
    const normalizedToken = normalizeInvitationCode(token);
    const normalizedEmail = normalizeEmail(email);
    const normalizedCode = normalizeInvitationCode(code);

    if (!normalizedToken && (!normalizedEmail || !normalizedCode)) {
      resetInvitationDoor();
      return;
    }

    const requestUrl = new URL('/api/arrival/invite', window.location.origin);
    if (normalizedToken) {
      requestUrl.searchParams.set('token', normalizedToken);
    } else {
      requestUrl.searchParams.set('email', normalizedEmail);
      requestUrl.searchParams.set('code', normalizedCode);
    }

    try {
      const response = await fetch(requestUrl.pathname + requestUrl.search);
      const data = await parseJsonResponse(response);

      if (!response.ok) {
        throw Object.assign(new Error(data?.error || 'invalid_invite'), { payload: data, status: response.status });
      }

      renderInvitation(data, normalizedToken || normalizedCode);

      if (manualInvitationEmailInput && data?.email) {
        manualInvitationEmailInput.value = data.email;
      }

      if (manualInvitationCodeInput && (normalizedToken || normalizedCode)) {
        manualInvitationCodeInput.value = normalizedToken || normalizedCode;
      }

      if (data?.account_enabled) {
        signInPasswordInput?.focus();
      } else if (!data?.email) {
        invitationEmailInput?.focus();
      } else {
        invitationPasswordInput?.focus();
      }
    } catch (error) {
      console.error('Invitation validation error:', error?.payload || error?.message || error);
      resetInvitationDoor();
      showAuthMessage(
        normalizedToken
          ? 'No pude reconocer esa carta privada. Revisemos el enlace e intentemos de nuevo.'
          : 'No pude reconocer esa entrada reservada. Revisemos el email y el código único.'
      );
      if (!normalizedToken) {
        manualInvitationEmailInput?.focus();
      }
    }
  }

  async function completeInvitationArrival() {
    const token = activeInvitationToken;
    const email = normalizeEmail(invitationEmailInput?.value || activeInvitation?.email || '');
    const password = invitationPasswordInput?.value || '';

    if (!activeInvitation || !token) {
      resetInvitationDoor();
      showAuthMessage('Esta puerta necesita una invitación privada válida.');
      return;
    }

    if (!email) {
      showAuthMessage('Dejemos primero el email reservado para esta llegada.');
      invitationEmailInput?.focus();
      return;
    }

    if (!password || password.length < 8) {
      showAuthMessage('Elegí una contraseña de al menos 8 caracteres para resguardar tu llegada.');
      invitationPasswordInput?.focus();
      return;
    }

    if (invitationCompleteBtn) {
      invitationCompleteBtn.disabled = true;
    }

    try {
      await postJson('/api/arrival/complete', {
        token,
        email,
        password
      });

      const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) {
        throw error;
      }

      if (safeLocalStorage) {
        safeLocalStorage.setItem('yumiko_private_access_completed_at', String(Date.now()));
      }

      completeSignedInArrival();
    } catch (error) {
      console.error('Invitation completion error:', error?.payload || error?.message || error);
      const alreadyEnabled = error?.payload?.error === 'account_already_enabled';
      if (alreadyEnabled) {
        showInvitationView('signin');
        setInvitationState('ready');
      }

      showAuthMessage(
        alreadyEnabled
          ? 'Tu acceso ya estaba abierto. Volvé a entrar desde esta misma puerta.'
          : error?.payload?.error_description || error?.message || 'No pude completar tu llegada. Intentemos de nuevo.'
      );
    } finally {
      if (invitationCompleteBtn) {
        invitationCompleteBtn.disabled = false;
      }
    }
  }

  async function submitPrivateSignIn() {
    const email = normalizeEmail(signInEmailInput?.value || '');
    const password = signInPasswordInput?.value || '';

    if (!email || !password) {
      showAuthMessage('Completá email y contraseña para cruzar esta puerta interior.');
      if (!email) {
        signInEmailInput?.focus();
      } else {
        signInPasswordInput?.focus();
      }
      return;
    }

    if (signInBtn) {
      signInBtn.disabled = true;
    }

    try {
      const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) {
        throw error;
      }

      completeSignedInArrival();
    } catch (error) {
      console.error('Private sign-in error:', error?.message || error);
      showAuthMessage('No pude abrir tu acceso. Revisemos tus datos e intentemos de nuevo.');
    } finally {
      if (signInBtn) {
        signInBtn.disabled = false;
      }
    }
  }

  manualInvitationForm?.addEventListener('submit', async (event) => {
    event.preventDefault();

    const email = normalizeEmail(manualInvitationEmailInput?.value || '');
    const code = normalizeInvitationCode(manualInvitationCodeInput?.value || '');

    if (!email || !code) {
      showAuthMessage('Dejemos el email reservado y el código de invitación para abrir esta entrada.');
      if (!email) {
        manualInvitationEmailInput?.focus();
      } else {
        manualInvitationCodeInput?.focus();
      }
      return;
    }

    if (manualInvitationBtn) {
      manualInvitationBtn.disabled = true;
    }

    try {
      await validateInvitation({ email, code });
    } finally {
      if (manualInvitationBtn) {
        manualInvitationBtn.disabled = false;
      }
    }
  });

  document.getElementById('invitation-completion-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    await completeInvitationArrival();
  });

  invitationSignInForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    await submitPrivateSignIn();
  });

  resetInvitationDoor();

  if (inviteTokenParam) {
    void validateInvitation({ token: inviteTokenParam });
  }
}

function setupMemberLoginFlow() {
  if (!currentPage.includes('member-login')) {
    return;
  }

  const memberSignInForm = document.getElementById('member-signin-form');
  const memberEmailInput = document.getElementById('member-email');
  const memberPasswordInput = document.getElementById('member-password');
  const memberSignInBtn = document.getElementById('btn-member-signin');

  memberSignInForm?.addEventListener('submit', async (event) => {
    event.preventDefault();

    const email = normalizeEmail(memberEmailInput?.value || '');
    const password = memberPasswordInput?.value || '';

    if (!email || !password) {
      showAuthMessage('Completá email y contraseña para volver a entrar.');
      if (!email) {
        memberEmailInput?.focus();
      } else {
        memberPasswordInput?.focus();
      }
      return;
    }

    if (memberSignInBtn) {
      memberSignInBtn.disabled = true;
    }

    try {
      const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) {
        throw error;
      }

      completeSignedInArrival();
    } catch (error) {
      console.error('Member sign-in error:', error?.message || error);
      showAuthMessage('No pude abrir tu acceso. Revisemos tus datos e intentemos de nuevo.');
    } finally {
      if (memberSignInBtn) {
        memberSignInBtn.disabled = false;
      }
    }
  });
}

setupPublicArrivalFlow();
setupInvitationFlow();
setupMemberLoginFlow();

const logoutButtons = [
  document.getElementById('btn-logout'),
  document.getElementById('m-logout')
].filter(Boolean);

logoutButtons.forEach((logoutBtn) => {
  logoutBtn.onclick = async () => {
    await supabaseClient.auth.signOut();
    goWithTransition('login.html');
  };
});
