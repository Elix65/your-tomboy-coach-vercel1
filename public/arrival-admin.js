import supabaseClient from './supabase.js';

const ALLOWED_ADMIN_UID = 'a5429e17-43e2-4922-9560-ab914f63283e';
const STATUS_DONE = new Set(['approved', 'invited', 'account_enabled', 'active']);
const INVITE_DONE = new Set(['invited', 'account_enabled', 'active']);
const ENABLE_DONE = new Set(['account_enabled', 'active']);

const gateEl = document.getElementById('arrival-admin-gate');
const gateStatusEl = document.getElementById('arrival-admin-gate-status');
const gateCopyEl = document.getElementById('arrival-admin-gate-copy');
const gateErrorEl = document.getElementById('arrival-admin-gate-error');
const loginLinkEl = document.getElementById('arrival-admin-login-link');
const retryBtn = document.getElementById('arrival-admin-retry');
const appEl = document.getElementById('arrival-admin-app');
const feedbackEl = document.getElementById('arrival-admin-feedback');
const refreshBtn = document.getElementById('arrival-admin-refresh');
const signOutBtn = document.getElementById('arrival-admin-signout');
const listEl = document.getElementById('arrival-admin-list');
const countEl = document.getElementById('arrival-admin-count');
const loadingEl = document.getElementById('arrival-admin-loading');
const searchInput = document.getElementById('arrival-admin-search');
const statusFilter = document.getElementById('arrival-admin-status-filter');
const emptyEl = document.getElementById('arrival-admin-empty');
const detailCardEl = document.getElementById('arrival-admin-detail-card');
const sessionPillEl = document.getElementById('arrival-admin-session-pill');
const tokenFeedbackEl = document.getElementById('arrival-admin-token-feedback');
const noteFeedbackEl = document.getElementById('arrival-admin-note-feedback');
const statusFeedbackEl = document.getElementById('arrival-admin-status-feedback');
const rescueSearchInputEl = document.getElementById('arrival-admin-rescue-email');
const rescueSearchBtn = document.getElementById('arrival-admin-rescue-search-btn');
const rescueEmptyEl = document.getElementById('arrival-admin-rescue-empty');
const rescueEmptyCopyEl = document.getElementById('arrival-admin-rescue-empty-copy');
const rescueCreateEl = document.getElementById('arrival-admin-rescue-create');
const rescueCreateProviderEl = document.getElementById('arrival-admin-rescue-provider');
const rescueCreatePaymentStatusEl = document.getElementById('arrival-admin-rescue-payment-status');
const rescueCreateNoteEl = document.getElementById('arrival-admin-rescue-create-note');
const rescueCreateBtn = document.getElementById('arrival-admin-rescue-create-btn');
const rescueDetailEl = document.getElementById('arrival-admin-rescue-detail');
const rescueEmailTitleEl = document.getElementById('rescue-email-title');
const rescueAccountCopyEl = document.getElementById('rescue-account-copy');
const rescuePaymentStatusEl = document.getElementById('rescue-payment-status');
const rescueEligibilityEl = document.getElementById('rescue-eligibility');
const rescuePaymentReferenceEl = document.getElementById('rescue-payment-reference');
const rescueProviderEl = document.getElementById('rescue-provider');
const rescuePaymentConfirmedAtEl = document.getElementById('rescue-payment-confirmed-at');
const rescueManuallyVerifiedAtEl = document.getElementById('rescue-manually-verified-at');
const rescueManuallyVerifiedByEl = document.getElementById('rescue-manually-verified-by');
const rescueLinkGeneratedAtEl = document.getElementById('rescue-link-generated-at');
const rescueAuthUserIdEl = document.getElementById('rescue-auth-user-id');
const rescueActivationModeEl = document.getElementById('rescue-activation-mode');
const rescueActivatedAtEl = document.getElementById('rescue-activated-at');
const rescueArrivalStatusEl = document.getElementById('rescue-arrival-status');
const rescueActiveTokenEl = document.getElementById('rescue-active-token');
const rescueNoteInputEl = document.getElementById('arrival-admin-rescue-note');
const rescueFeedbackEl = document.getElementById('arrival-admin-rescue-feedback');
const markPaidBtn = document.getElementById('arrival-admin-mark-paid-btn');
const generateRescueBtn = document.getElementById('arrival-admin-generate-rescue-btn');
const copyRescueBtn = document.getElementById('arrival-admin-copy-rescue-btn');

const detailNameEl = document.getElementById('detail-name');
const detailEmailEl = document.getElementById('detail-email');
const detailStatusEl = document.getElementById('detail-status');
const detailCreatedAtEl = document.getElementById('detail-created-at');
const detailExperienceEl = document.getElementById('detail-experience');
const detailMomentsEl = document.getElementById('detail-moments');
const detailOptionalNoteEl = document.getElementById('detail-optional-note');
const detailTokenEl = document.getElementById('detail-token');
const detailInviteLinkEl = document.getElementById('detail-invite-link');
const detailCreatedFullEl = document.getElementById('detail-created-full');
const detailApprovedAtEl = document.getElementById('detail-approved-at');
const detailInvitedAtEl = document.getElementById('detail-invited-at');
const detailAccountEnabledAtEl = document.getElementById('detail-account-enabled-at');
const detailInternalNoteEl = document.getElementById('detail-internal-note');

const copyTokenBtn = document.getElementById('copy-token-btn');
const copyLinkBtn = document.getElementById('copy-link-btn');
const saveNoteBtn = document.getElementById('save-note-btn');
const approveBtn = document.getElementById('approve-btn');
const inviteBtn = document.getElementById('invite-btn');
const enableBtn = document.getElementById('enable-btn');

const state = {
  session: null,
  requests: [],
  selectedId: null,
  search: '',
  status: 'all',
  loading: false,
  noteDirty: false,
  listAbortController: null,
  feedbackTimer: null,
  inlineFeedbackTimers: new WeakMap(),
  buttonTimers: new WeakMap(),
  rescueEmail: '',
  rescueData: null,
  generatedRescueLink: '',
  rescueMissingLead: false
};

function showGate({ title, copy, error, showLogin = false, showRetry = false, tone = 'idle' }) {
  gateEl.classList.remove('hidden');
  appEl.classList.add('hidden');
  gateStatusEl.textContent = title;
  gateCopyEl.textContent = copy;
  gateErrorEl.textContent = error || '';
  gateErrorEl.classList.toggle('hidden', !error);
  loginLinkEl.classList.toggle('hidden', !showLogin);
  retryBtn.classList.toggle('hidden', !showRetry);
  gateEl.querySelector('.invitation-status-pill')?.setAttribute('data-state', tone);
}

function clearGlobalFeedbackTimer() {
  if (state.feedbackTimer) {
    window.clearTimeout(state.feedbackTimer);
    state.feedbackTimer = null;
  }
}

function showFeedback(message, type = 'error', options = {}) {
  const { autoHide = type === 'success', duration = 2200 } = options;

  clearGlobalFeedbackTimer();
  feedbackEl.textContent = message;
  feedbackEl.dataset.tone = type;
  feedbackEl.classList.remove('hidden', 'success');

  if (type === 'success') {
    feedbackEl.classList.add('success');
  }

  if (autoHide) {
    state.feedbackTimer = window.setTimeout(() => {
      clearFeedback();
    }, duration);
  }
}

function clearFeedback() {
  clearGlobalFeedbackTimer();
  feedbackEl.textContent = '';
  feedbackEl.classList.add('hidden');
  feedbackEl.classList.remove('success');
  delete feedbackEl.dataset.tone;
}

function showInlineFeedback(element, message, tone = 'success', options = {}) {
  if (!element) return;

  const { autoHide = tone === 'success', duration = 2200 } = options;
  const existingTimer = state.inlineFeedbackTimers.get(element);
  if (existingTimer) {
    window.clearTimeout(existingTimer);
  }

  element.textContent = message;
  element.dataset.tone = tone;
  element.classList.remove('hidden');

  if (autoHide) {
    const timer = window.setTimeout(() => {
      clearInlineFeedback(element);
    }, duration);
    state.inlineFeedbackTimers.set(element, timer);
  } else {
    state.inlineFeedbackTimers.delete(element);
  }
}

function clearInlineFeedback(element) {
  if (!element) return;

  const existingTimer = state.inlineFeedbackTimers.get(element);
  if (existingTimer) {
    window.clearTimeout(existingTimer);
    state.inlineFeedbackTimers.delete(element);
  }

  element.textContent = '';
  element.classList.add('hidden');
  delete element.dataset.tone;
}

function setLoading(isLoading) {
  state.loading = isLoading;
  loadingEl.classList.toggle('hidden', !isLoading);
  setButtonVisual(refreshBtn, {
    label: isLoading ? 'Actualizando…' : 'Actualizar lista',
    meta: isLoading ? 'Sincronizando sala' : 'Sincronizar sala',
    tone: isLoading ? 'loading' : 'idle',
    busy: isLoading,
    disabled: isLoading
  });
}

function formatDate(value, options = {}) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('es-AR', {
    dateStyle: options.dateStyle || 'medium',
    timeStyle: options.timeStyle || 'short'
  }).format(date);
}

function truncate(value, maxLength = 120) {
  const text = String(value || '').trim();
  if (!text) return 'Sin respuesta adicional.';
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}…`;
}

function setStatusBadge(element, status) {
  const normalized = String(status || 'requested').trim() || 'requested';
  element.textContent = normalized;
  element.dataset.status = normalized;
}

async function getAccessToken() {
  const { data, error } = await supabaseClient.auth.getSession();
  if (error) throw error;
  return data?.session?.access_token || null;
}

async function parseJsonResponse(response) {
  const text = await response.text().catch(() => '');
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

async function apiFetch(url, options = {}) {
  const token = await getAccessToken();
  const headers = new Headers(options.headers || {});

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(url, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
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

function updateCount() {
  const count = state.requests.length;
  countEl.textContent = `${count} ${count === 1 ? 'solicitud' : 'solicitudes'}`;
}

function getSelectedRequest() {
  return state.requests.find((item) => item.id === state.selectedId) || null;
}

function getRescueLead() {
  return state.rescueData?.checkout_lead || null;
}

function getRescueNote() {
  return rescueNoteInputEl?.value?.trim() || '';
}

function getRescueCreateNote() {
  return rescueCreateNoteEl?.value?.trim() || '';
}

function getRescueCreatePaymentStatus() {
  return String(rescueCreatePaymentStatusEl?.value || 'pending').trim().toLowerCase() === 'paid' ? 'paid' : 'pending';
}

function getRescueCreateProvider() {
  return String(rescueCreateProviderEl?.value || 'mercadopago').trim().toLowerCase() === 'paypal' ? 'paypal' : 'mercadopago';
}

function getRescueSummary(rescue) {
  const lead = rescue?.checkout_lead;
  const account = rescue?.account_state;
  if (!lead) return 'Sin lead cargado';
  if (account?.has_account) {
    return account.activation_mode === 'reset_password'
      ? 'Ya existe cuenta: el link abrirá un reset premium de contraseña.'
      : 'Existe auth user asociado.';
  }
  return 'Todavía no hay cuenta: el link abrirá creación de contraseña.';
}

function getRescueEligibilityLabel(lead) {
  if (!lead) return 'Sin verificar';
  if (lead.manually_verified_at) return 'Verificado manualmente';
  if (lead.payment_status === 'paid') return 'Pago confirmado';
  return 'Falta verificar';
}

function renderRescueMissingLeadState() {
  rescueEmptyEl?.classList.remove('hidden');
  rescueDetailEl?.classList.add('hidden');
  rescueCreateEl?.classList.remove('hidden');
  if (rescueEmptyCopyEl) {
    rescueEmptyCopyEl.textContent = state.rescueEmail
      ? `No encontré un checkout lead para ${state.rescueEmail}. Si corresponde, podés crearlo manualmente sin tocar los flujos privados.`
      : 'No encontré ese checkout lead. Si corresponde, podés crearlo manualmente sin tocar los flujos privados.';
  }
  if (rescueCreateNoteEl && !rescueCreateNoteEl.value) {
    rescueCreateNoteEl.value = rescueNoteInputEl?.value?.trim() || '';
  }
  if (rescueNoteInputEl) rescueNoteInputEl.value = '';
  clearInlineFeedback(rescueFeedbackEl);
  renderRescueActionStates();
  setButtonVisual(rescueCreateBtn, {
    label: 'Crear lead manual',
    meta: 'Insertar en checkout_leads',
    disabled: !state.rescueEmail,
    tone: state.rescueEmail ? 'idle' : 'done'
  });
}

function getMarkPaidVisual(lead = getRescueLead()) {
  if (!lead) return { label: 'Marcar como pagado', meta: 'Buscá un lead', disabled: true, tone: 'done' };
  if (lead.payment_status === 'paid' && lead.manually_verified_at) {
    return { label: 'Verificado', meta: 'Auditoría lista', disabled: true, tone: 'done' };
  }
  return { label: 'Marcar como pagado', meta: 'Verificación manual', disabled: false, tone: 'idle' };
}

function getGenerateRescueVisual(lead = getRescueLead()) {
  if (!lead) return { label: 'Generar link de acceso', meta: 'Buscá un lead', disabled: true, tone: 'done' };
  if (!lead.rescue_eligible) return { label: 'Generar link de acceso', meta: 'Primero verificá', disabled: true, tone: 'done' };
  return { label: 'Generar link de acceso', meta: 'Single-use + expira', disabled: false, tone: 'idle' };
}

function getCopyRescueVisual() {
  if (!state.generatedRescueLink) return { label: 'Copiar link', meta: 'Generá uno nuevo', disabled: true, tone: 'done' };
  return { label: 'Copiar link', meta: 'Enviar manualmente', disabled: false, tone: 'idle' };
}

function renderRescueActionStates() {
  setButtonVisual(markPaidBtn, getMarkPaidVisual());
  setButtonVisual(generateRescueBtn, getGenerateRescueVisual());
  setButtonVisual(copyRescueBtn, getCopyRescueVisual());
  if (!state.rescueMissingLead) {
    setButtonVisual(rescueCreateBtn, {
      label: 'Crear lead manual',
      meta: 'Insertar en checkout_leads',
      disabled: true,
      tone: 'done'
    });
  }
}

function renderRescueDetail(rescue = state.rescueData) {
  const lead = rescue?.checkout_lead || null;
  const account = rescue?.account_state || null;
  const linkedRequest = rescue?.linked_arrival_request || null;
  const activeToken = rescue?.active_rescue_token || null;

  if (!lead) {
    if (state.rescueMissingLead) {
      renderRescueMissingLeadState();
      return;
    }
    rescueEmptyEl?.classList.remove('hidden');
    rescueDetailEl?.classList.add('hidden');
    rescueCreateEl?.classList.add('hidden');
    if (rescueEmptyCopyEl) {
      rescueEmptyCopyEl.textContent = 'Buscá por email para revisar estado de pago, referencia y rescate premium.';
    }
    if (rescueNoteInputEl) rescueNoteInputEl.value = '';
    renderRescueActionStates();
    clearInlineFeedback(rescueFeedbackEl);
    return;
  }

  state.rescueMissingLead = false;
  rescueEmptyEl?.classList.add('hidden');
  rescueDetailEl?.classList.remove('hidden');
  rescueCreateEl?.classList.add('hidden');
  rescueEmailTitleEl.textContent = lead.email || '—';
  rescueAccountCopyEl.textContent = getRescueSummary(rescue);
  setStatusBadge(rescuePaymentStatusEl, lead.payment_status || 'pending');
  rescueEligibilityEl.textContent = getRescueEligibilityLabel(lead);
  rescuePaymentReferenceEl.textContent = lead.payment_reference || '—';
  rescueProviderEl.textContent = lead.payment_provider || '—';
  rescuePaymentConfirmedAtEl.textContent = formatDate(lead.payment_confirmed_at);
  rescueManuallyVerifiedAtEl.textContent = formatDate(lead.manually_verified_at);
  rescueManuallyVerifiedByEl.textContent = lead.manually_verified_by || '—';
  rescueLinkGeneratedAtEl.textContent = formatDate(lead.rescue_link_generated_at);
  rescueAuthUserIdEl.textContent = account?.auth_user_id || '—';
  rescueActivationModeEl.textContent = account?.activation_mode === 'reset_password' ? 'reset_password' : 'create_password';
  rescueActivatedAtEl.textContent = formatDate(lead.activated_at);
  rescueArrivalStatusEl.textContent = linkedRequest?.status || 'Sin arrival_request';
  rescueActiveTokenEl.textContent = activeToken?.expires_at
    ? `Activo hasta ${formatDate(activeToken.expires_at)}`
    : 'No hay token activo';
  rescueNoteInputEl.value = lead.manual_verification_note || '';
  renderRescueActionStates();
}

async function loadRescueDetail(email, options = {}) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) {
    state.rescueEmail = '';
    state.rescueData = null;
    state.generatedRescueLink = '';
    state.rescueMissingLead = false;
    renderRescueDetail(null);
    return null;
  }

  const { announce = false } = options;
  if (announce) {
    showInlineFeedback(rescueFeedbackEl, 'Buscando checkout lead…', 'loading', { autoHide: false });
  }

  let data;
  try {
    data = await apiFetch(`/api/arrival/admin/rescue-detail?email=${encodeURIComponent(normalizedEmail)}`);
  } catch (error) {
    if (error?.status === 404 && error?.payload?.error === 'checkout_lead_not_found') {
      state.rescueEmail = normalizedEmail;
      state.rescueData = null;
      state.generatedRescueLink = '';
      state.rescueMissingLead = true;
      if (rescueSearchInputEl) rescueSearchInputEl.value = normalizedEmail;
      renderRescueDetail(null);
      if (announce) {
        showInlineFeedback(rescueFeedbackEl, 'No existe el lead todavía. Podés crearlo manualmente.', 'error', { autoHide: false });
      }
      return null;
    }
    throw error;
  }
  state.rescueEmail = normalizedEmail;
  state.rescueData = data?.rescue || null;
  state.generatedRescueLink = '';
  state.rescueMissingLead = false;
  if (rescueSearchInputEl) rescueSearchInputEl.value = normalizedEmail;
  renderRescueDetail(state.rescueData);
  if (announce) {
    showInlineFeedback(rescueFeedbackEl, 'Lead cargado.', 'success');
  } else {
    clearInlineFeedback(rescueFeedbackEl);
  }
  return state.rescueData;
}

async function updateRescue(endpoint, body, options = {}) {
  const lead = getRescueLead();
  const email = String(body?.email || lead?.email || state.rescueEmail || '').trim().toLowerCase();
  if (!email) {
    showInlineFeedback(rescueFeedbackEl, 'Primero buscá un lead por email.', 'error', { autoHide: false });
    return null;
  }

  const data = await apiFetch(endpoint, { method: 'POST', body: { ...body, email } });
  state.rescueEmail = email;
  state.rescueData = data?.rescue || null;
  state.rescueMissingLead = false;
  if (data?.rescue_link) {
    state.generatedRescueLink = data.rescue_link;
  }
  renderRescueDetail(state.rescueData);
  return data;
}

function setButtonVisual(button, options = {}) {
  if (!button) return;

  const {
    label,
    meta = '',
    tone = 'idle',
    busy = false,
    disabled = button.disabled,
    pulse = false
  } = options;

  const labelEl = button.querySelector('.arrival-admin-action-label');
  const metaEl = button.querySelector('.arrival-admin-action-meta');

  if (labelEl && typeof label === 'string') {
    labelEl.textContent = label;
  } else if (typeof label === 'string') {
    button.textContent = label;
  }

  if (metaEl) {
    metaEl.textContent = meta;
    metaEl.classList.toggle('hidden', !meta);
  }

  button.disabled = Boolean(disabled);
  button.dataset.visualState = tone;
  button.dataset.busy = busy ? 'true' : 'false';
  button.setAttribute('aria-disabled', button.disabled ? 'true' : 'false');

  if (pulse) {
    button.dataset.pulse = 'false';
    window.requestAnimationFrame(() => {
      button.dataset.pulse = 'true';
    });

    window.setTimeout(() => {
      button.dataset.pulse = 'false';
    }, 760);
  }
}

function clearButtonTimer(button) {
  const timer = state.buttonTimers.get(button);
  if (timer) {
    window.clearTimeout(timer);
    state.buttonTimers.delete(button);
  }
}

function queueButtonReset(button, callback, delay = 1600) {
  clearButtonTimer(button);
  const timer = window.setTimeout(() => {
    state.buttonTimers.delete(button);
    callback();
  }, delay);
  state.buttonTimers.set(button, timer);
}

function getApproveVisual(request) {
  if (!request) {
    return { label: 'Aprobar', meta: 'Elegí una solicitud', disabled: true, tone: 'done' };
  }

  if (STATUS_DONE.has(request.status)) {
    const doneMeta = {
      approved: 'Ya confirmada',
      invited: 'Continuó a invitación',
      account_enabled: 'Cuenta ya habilitada',
      active: 'Acceso ya activo'
    };

    return {
      label: 'Aprobada',
      meta: doneMeta[request.status] || 'Ya no hace falta',
      disabled: true,
      tone: 'done'
    };
  }

  return {
    label: 'Aprobar',
    meta: 'Primer paso',
    disabled: false,
    tone: 'idle'
  };
}

function getInviteVisual(request) {
  if (!request) {
    return { label: 'Marcar invited', meta: 'Elegí una solicitud', disabled: true, tone: 'done' };
  }

  if (INVITE_DONE.has(request.status)) {
    const doneMeta = {
      invited: 'Ya enviada',
      account_enabled: 'El acceso ya avanzó',
      active: 'Acceso ya activo'
    };

    return {
      label: 'Invitación enviada',
      meta: doneMeta[request.status] || 'Ya no hace falta',
      disabled: true,
      tone: 'done'
    };
  }

  return {
    label: 'Marcar invited',
    meta: request.status === 'requested' ? 'Disponible ahora' : 'Enviar acceso',
    disabled: false,
    tone: 'idle'
  };
}

function getEnableVisual(request) {
  if (!request) {
    return { label: 'Marcar account_enabled', meta: 'Elegí una solicitud', disabled: true, tone: 'done' };
  }

  if (ENABLE_DONE.has(request.status)) {
    return {
      label: 'Cuenta habilitada',
      meta: request.status === 'active' ? 'Acceso ya activo' : 'Ya confirmada',
      disabled: true,
      tone: 'done'
    };
  }

  return {
    label: 'Marcar account_enabled',
    meta: 'Habilitar cuenta',
    disabled: false,
    tone: 'idle'
  };
}

function getSaveNoteVisual(request) {
  if (!request) {
    return { label: 'Guardar nota', meta: 'Elegí una solicitud', disabled: true, tone: 'done' };
  }

  if (!state.noteDirty) {
    return {
      label: 'Sin cambios',
      meta: 'Nada nuevo por guardar',
      disabled: true,
      tone: 'done'
    };
  }

  return {
    label: 'Guardar nota',
    meta: 'Persistir seguimiento',
    disabled: false,
    tone: 'idle'
  };
}

function getCopyTokenVisual(request) {
  if (!request?.invite_token) {
    return { label: 'Sin token', meta: 'Aún no disponible', disabled: true, tone: 'done' };
  }

  return {
    label: 'Copiar token',
    meta: 'Portapapeles',
    disabled: false,
    tone: 'idle'
  };
}

function getCopyLinkVisual(request) {
  if (!request?.invite_url) {
    return { label: 'Sin link', meta: 'Esperando invitación', disabled: true, tone: 'done' };
  }

  return {
    label: 'Copiar link privado',
    meta: 'Acceso reservado',
    disabled: false,
    tone: 'idle'
  };
}

function renderActionStates(request = getSelectedRequest()) {
  setButtonVisual(copyTokenBtn, getCopyTokenVisual(request));
  setButtonVisual(copyLinkBtn, getCopyLinkVisual(request));
  setButtonVisual(saveNoteBtn, getSaveNoteVisual(request));
  setButtonVisual(approveBtn, getApproveVisual(request));
  setButtonVisual(inviteBtn, getInviteVisual(request));
  setButtonVisual(enableBtn, getEnableVisual(request));

  if (!request) {
    clearInlineFeedback(tokenFeedbackEl);
    clearInlineFeedback(noteFeedbackEl);
    clearInlineFeedback(statusFeedbackEl);
  }
}

function syncNoteDirty() {
  const selected = getSelectedRequest();
  if (!selected) {
    state.noteDirty = false;
    return;
  }

  const currentValue = detailInternalNoteEl.value ?? '';
  const persistedValue = selected.internal_note ?? '';
  state.noteDirty = currentValue !== persistedValue;
}

function renderList() {
  listEl.innerHTML = '';
  updateCount();

  if (!state.requests.length) {
    const empty = document.createElement('div');
    empty.className = 'arrival-admin-info-card';
    empty.innerHTML = `
      <p class="section-kicker">Sin resultados</p>
      <p class="section-note">No encontré solicitudes con esos filtros.</p>
    `;
    listEl.appendChild(empty);
    return;
  }

  state.requests.forEach((request) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'arrival-admin-list-item';
    if (request.id === state.selectedId) {
      button.classList.add('is-selected');
    }

    button.innerHTML = `
      <div class="arrival-admin-list-top">
        <div>
          <div class="arrival-admin-list-name">${escapeHtml(request.name || 'Sin nombre')}</div>
          <div class="arrival-admin-list-email">${escapeHtml(request.email || 'Sin email')}</div>
        </div>
        <span class="arrival-admin-status-badge" data-status="${escapeHtml(request.status || 'requested')}">${escapeHtml(request.status || 'requested')}</span>
      </div>
      <div class="arrival-admin-list-preview">${escapeHtml(truncate(request.desired_experience || request.desired_moments))}</div>
      <div class="arrival-admin-list-bottom">
        <span class="arrival-admin-timestamp">${escapeHtml(formatDate(request.created_at, { dateStyle: 'medium', timeStyle: undefined }))}</span>
        <span class="arrival-admin-timestamp">${escapeHtml(truncate(request.desired_moments, 48))}</span>
      </div>
    `;

    button.addEventListener('click', () => {
      void loadDetail(request.id);
    });

    listEl.appendChild(button);
  });
}

function renderDetail(request) {
  if (!request) {
    emptyEl.classList.remove('hidden');
    detailCardEl.classList.add('hidden');
    renderActionStates(null);
    return;
  }

  clearInlineFeedback(tokenFeedbackEl);
  clearInlineFeedback(noteFeedbackEl);
  clearInlineFeedback(statusFeedbackEl);
  emptyEl.classList.add('hidden');
  detailCardEl.classList.remove('hidden');

  detailNameEl.textContent = request.name || 'Sin nombre';
  detailEmailEl.textContent = request.email || 'Sin email';
  detailCreatedAtEl.textContent = formatDate(request.created_at, { dateStyle: 'medium', timeStyle: undefined });
  detailExperienceEl.textContent = request.desired_experience || 'Sin respuesta.';
  detailMomentsEl.textContent = request.desired_moments || 'Sin respuesta.';
  detailOptionalNoteEl.textContent = request.optional_note || 'Sin nota opcional.';
  detailTokenEl.textContent = request.invite_token || '—';
  detailInviteLinkEl.href = request.invite_url || '#';
  detailInviteLinkEl.textContent = request.invite_url || 'Invitación no disponible';
  detailCreatedFullEl.textContent = formatDate(request.created_at);
  detailApprovedAtEl.textContent = formatDate(request.approved_at);
  detailInvitedAtEl.textContent = formatDate(request.invited_at);
  detailAccountEnabledAtEl.textContent = formatDate(request.account_enabled_at);
  detailInternalNoteEl.value = request.internal_note || '';
  setStatusBadge(detailStatusEl, request.status);

  state.noteDirty = false;
  renderActionStates(request);
}

function describeApiError(error, fallback = 'No pude completar la acción ahora.') {
  if (error?.name === 'AbortError') {
    return 'La actualización anterior se canceló para usar la más reciente.';
  }

  if (error?.status >= 500) {
    return 'El backend respondió mal esta vez. Probemos de nuevo en unos segundos.';
  }

  if (error?.message === 'Failed to fetch') {
    return 'No pude hablar con el backend ahora mismo.';
  }

  const rawMessage = error?.payload?.error || error?.message;
  if (!rawMessage || rawMessage === 'request_failed') {
    return fallback;
  }

  return `No pude completar la acción: ${String(rawMessage).replace(/_/g, ' ')}.`;
}

async function runTransientButtonAction({
  button,
  feedbackNode,
  loadingLabel,
  loadingMeta,
  loadingMessage,
  successLabel,
  successMeta,
  successMessage,
  errorLabel,
  errorMeta,
  errorMessage,
  action,
  reset
}) {
  clearButtonTimer(button);
  setButtonVisual(button, {
    label: loadingLabel,
    meta: loadingMeta,
    tone: 'loading',
    busy: true,
    disabled: true
  });

  if (loadingMessage) {
    showFeedback(loadingMessage, 'loading', { autoHide: false });
  }
  if (feedbackNode && loadingMessage) {
    showInlineFeedback(feedbackNode, loadingMessage, 'loading', { autoHide: false });
  }

  try {
    await action();
    setButtonVisual(button, {
      label: successLabel,
      meta: successMeta,
      tone: 'success',
      disabled: true,
      pulse: true
    });

    if (successMessage) {
      showFeedback(successMessage, 'success');
      if (feedbackNode) {
        showInlineFeedback(feedbackNode, successMessage, 'success');
      }
    }

    queueButtonReset(button, reset);
  } catch (error) {
    const message = errorMessage || describeApiError(error);
    setButtonVisual(button, {
      label: errorLabel,
      meta: errorMeta,
      tone: 'error',
      disabled: false,
      pulse: true
    });
    showFeedback(message, 'error', { autoHide: false });
    if (feedbackNode) {
      showInlineFeedback(feedbackNode, message, 'error', { autoHide: false });
    }
    queueButtonReset(button, reset, 2200);
    throw error;
  }
}

async function copyText(value, config) {
  const { button, feedbackNode, successMessage, idleReset } = config;

  if (!value) {
    const message = 'Todavía no hay nada listo para copiar.';
    showFeedback(message, 'error', { autoHide: false });
    showInlineFeedback(feedbackNode, message, 'error', { autoHide: false });
    return;
  }

  await runTransientButtonAction({
    button,
    feedbackNode,
    loadingLabel: 'Copiando…',
    loadingMeta: 'Portapapeles',
    loadingMessage: 'Copiando al portapapeles…',
    successLabel: 'Copiado',
    successMeta: 'Listo',
    successMessage,
    errorLabel: 'No se copió',
    errorMeta: 'Reintentar',
    action: async () => {
      await navigator.clipboard.writeText(value);
    },
    reset: () => {
      renderActionStates(getSelectedRequest());
      if (idleReset) {
        idleReset();
      }
    }
  });
}

async function loadDetail(id) {
  state.selectedId = id;
  renderList();

  try {
    const data = await apiFetch(`/api/arrival/admin/detail?id=${encodeURIComponent(id)}`);
    const detail = data?.request;
    if (!detail) {
      throw new Error('arrival_request_not_found');
    }

    state.requests = state.requests.map((item) => (item.id === id ? detail : item));
    renderList();
    renderDetail(detail);
    if (detail?.email && rescueSearchInputEl && !state.rescueEmail) {
      rescueSearchInputEl.value = detail.email;
    }
    clearFeedback();
  } catch (error) {
    console.error('Detail load error:', error);
    handleApiError(error);
  }
}

async function fetchList(options = {}) {
  const { announce = false } = options;

  if (state.listAbortController) {
    state.listAbortController.abort();
  }

  const controller = new AbortController();
  state.listAbortController = controller;
  setLoading(true);

  if (announce) {
    showFeedback('Actualizando la sala privada…', 'loading', { autoHide: false });
  }

  try {
    const params = new URLSearchParams();
    if (state.search) params.set('search', state.search);
    if (state.status && state.status !== 'all') params.set('status', state.status);

    const data = await apiFetch(`/api/arrival/admin/list?${params.toString()}`, {
      method: 'GET',
      signal: controller.signal
    });

    state.requests = Array.isArray(data?.requests) ? data.requests : [];
    const stillSelected = getSelectedRequest();
    if (!stillSelected) {
      state.selectedId = state.requests[0]?.id || null;
    }

    renderList();
    renderDetail(getSelectedRequest());

    if (state.rescueEmail) {
      try {
        await loadRescueDetail(state.rescueEmail);
      } catch (rescueError) {
        console.error('Rescue load error:', rescueError);
      }
    }

    if (announce) {
      showFeedback('Lista actualizada.', 'success');
    } else {
      clearFeedback();
    }
    return true;
  } catch (error) {
    if (error.name === 'AbortError') return;
    console.error('List load error:', error);
    handleApiError(error);
    throw error;
  } finally {
    setLoading(false);
  }
}

async function updateRequest(payload) {
  const selected = getSelectedRequest();
  if (!selected) {
    showFeedback('Primero elegí una solicitud.', 'error', { autoHide: false });
    return null;
  }

  const data = await apiFetch('/api/arrival/admin/update', {
    method: 'POST',
    body: {
      id: selected.id,
      ...payload
    }
  });

  const updated = data?.request;
  if (!updated) {
    throw new Error('missing_updated_request');
  }

  state.requests = state.requests.map((item) => (item.id === updated.id ? updated : item));
  state.selectedId = updated.id;
  renderList();
  renderDetail(updated);
  if (updated?.email && updated.email === state.rescueEmail) {
    void loadRescueDetail(updated.email).catch((rescueError) => {
      console.error('Rescue reload error:', rescueError);
    });
  }
  return updated;
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

function handleApiError(error) {
  if (error?.status === 401) {
    showGate({
      title: 'Sesión requerida',
      copy: 'Necesitás entrar con una sesión válida antes de abrir esta sala privada.',
      error: 'La validación backend exige auth real antes de leer o actualizar llegadas.',
      showLogin: true,
      showRetry: true,
      tone: 'idle'
    });
    return;
  }

  if (error?.status === 403) {
    showGate({
      title: 'Acceso bloqueado',
      copy: 'La sesión existe, pero el backend no reconoce este UID como administrador habilitado.',
      error: 'Esta pantalla y sus endpoints solo aceptan el UID administrador configurado.',
      showLogin: false,
      showRetry: true,
      tone: 'locked'
    });
    return;
  }

  showFeedback(describeApiError(error, 'No pude completar la acción ahora. Revisemos el backend o intentemos de nuevo.'), 'error', { autoHide: false });
}

async function validateSessionAndBoot() {
  showGate({
    title: 'Sala privada',
    copy: 'Validando sesión y permiso de administrador…',
    showRetry: false,
    tone: 'idle'
  });

  const { data, error } = await supabaseClient.auth.getUser();
  if (error) {
    throw error;
  }

  const user = data?.user || null;
  state.session = user;

  if (!user) {
    showGate({
      title: 'Sesión requerida',
      copy: 'Entrá con la cuenta autorizada para abrir esta sala privada.',
      error: 'Sin sesión activa no se puede consultar el backend admin.',
      showLogin: true,
      showRetry: true,
      tone: 'idle'
    });
    return;
  }

  if (sessionPillEl) {
    sessionPillEl.querySelector('span').textContent = `UID ${user.id === ALLOWED_ADMIN_UID ? 'autorizado' : 'validando backend'}`;
  }

  if (rescueSearchInputEl) {
    const initialEmail = String(new URL(window.location.href).searchParams.get('rescueEmail') || '').trim().toLowerCase();
    if (initialEmail) {
      state.rescueEmail = initialEmail;
      rescueSearchInputEl.value = initialEmail;
    }
  }

  try {
    await fetchList();
    gateEl.classList.add('hidden');
    appEl.classList.remove('hidden');
  } catch {
    // noop: handleApiError already paints the gate or feedback.
  }
}

refreshBtn?.addEventListener('click', () => {
  void fetchList({ announce: true });
});

retryBtn?.addEventListener('click', () => {
  void validateSessionAndBoot();
});

signOutBtn?.addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
  window.location.href = '/member-login.html?returnTo=/arrival-admin.html';
});

searchInput?.addEventListener('input', () => {
  state.search = searchInput.value.trim();
  window.clearTimeout(searchInput._arrivalAdminTimer);
  searchInput._arrivalAdminTimer = window.setTimeout(() => {
    void fetchList();
  }, 220);
});

statusFilter?.addEventListener('change', () => {
  state.status = statusFilter.value;
  void fetchList();
});

copyTokenBtn?.addEventListener('click', () => {
  const selected = getSelectedRequest();
  void copyText(selected?.invite_token, {
    button: copyTokenBtn,
    feedbackNode: tokenFeedbackEl,
    successMessage: 'Token copiado.',
    idleReset: () => renderActionStates(getSelectedRequest())
  }).catch((error) => {
    console.error('Clipboard error:', error);
  });
});

copyLinkBtn?.addEventListener('click', () => {
  const selected = getSelectedRequest();
  void copyText(selected?.invite_url, {
    button: copyLinkBtn,
    feedbackNode: tokenFeedbackEl,
    successMessage: 'Link privado copiado.',
    idleReset: () => renderActionStates(getSelectedRequest())
  }).catch((error) => {
    console.error('Clipboard error:', error);
  });
});

detailInternalNoteEl?.addEventListener('input', () => {
  syncNoteDirty();
  renderActionStates(getSelectedRequest());
  if (state.noteDirty) {
    clearInlineFeedback(noteFeedbackEl);
  }
});

saveNoteBtn?.addEventListener('click', () => {
  void runTransientButtonAction({
    button: saveNoteBtn,
    feedbackNode: noteFeedbackEl,
    loadingLabel: 'Guardando…',
    loadingMeta: 'Persistiendo nota',
    loadingMessage: 'Guardando nota interna…',
    successLabel: 'Nota guardada',
    successMeta: 'Seguimiento listo',
    successMessage: 'Nota guardada.',
    errorLabel: 'No se guardó',
    errorMeta: 'Reintentar',
    action: async () => {
      await updateRequest({ internal_note: detailInternalNoteEl.value });
    },
    reset: () => {
      renderActionStates(getSelectedRequest());
    }
  }).catch((error) => {
    console.error('Update error:', error);
  });
});

approveBtn?.addEventListener('click', () => {
  void runTransientButtonAction({
    button: approveBtn,
    feedbackNode: statusFeedbackEl,
    loadingLabel: 'Aprobando…',
    loadingMeta: 'Confirmando solicitud',
    loadingMessage: 'Aprobando solicitud…',
    successLabel: 'Solicitud aprobada',
    successMeta: 'Paso completado',
    successMessage: 'Solicitud aprobada.',
    errorLabel: 'No se aprobó',
    errorMeta: 'Reintentar',
    action: async () => {
      await updateRequest({ status: 'approved' });
    },
    reset: () => {
      renderActionStates(getSelectedRequest());
    }
  }).catch((error) => {
    console.error('Update error:', error);
  });
});

inviteBtn?.addEventListener('click', () => {
  void runTransientButtonAction({
    button: inviteBtn,
    feedbackNode: statusFeedbackEl,
    loadingLabel: 'Marcando…',
    loadingMeta: 'Registrando invitación',
    loadingMessage: 'Marcando invitación enviada…',
    successLabel: 'Invitación enviada',
    successMeta: 'Paso completado',
    successMessage: 'Solicitud marcada como invited.',
    errorLabel: 'No se marcó',
    errorMeta: 'Reintentar',
    action: async () => {
      await updateRequest({ status: 'invited' });
    },
    reset: () => {
      renderActionStates(getSelectedRequest());
    }
  }).catch((error) => {
    console.error('Update error:', error);
  });
});

enableBtn?.addEventListener('click', () => {
  void runTransientButtonAction({
    button: enableBtn,
    feedbackNode: statusFeedbackEl,
    loadingLabel: 'Habilitando…',
    loadingMeta: 'Confirmando acceso',
    loadingMessage: 'Habilitando cuenta…',
    successLabel: 'Cuenta habilitada',
    successMeta: 'Paso completado',
    successMessage: 'Solicitud marcada como account_enabled.',
    errorLabel: 'No se habilitó',
    errorMeta: 'Reintentar',
    action: async () => {
      await updateRequest({ status: 'account_enabled' });
    },
    reset: () => {
      renderActionStates(getSelectedRequest());
    }
  }).catch((error) => {
    console.error('Update error:', error);
  });
});

supabaseClient.auth.onAuthStateChange((_event, session) => {
  state.session = session?.user || null;
});

rescueSearchBtn?.addEventListener('click', () => {
  void loadRescueDetail(rescueSearchInputEl?.value, { announce: true }).catch((error) => {
    console.error('Rescue search error:', error);
    showInlineFeedback(rescueFeedbackEl, describeApiError(error, 'No pude cargar ese checkout lead.'), 'error', { autoHide: false });
  });
});

rescueCreateBtn?.addEventListener('click', () => {
  void runTransientButtonAction({
    button: rescueCreateBtn,
    feedbackNode: rescueFeedbackEl,
    loadingLabel: 'Creando…',
    loadingMeta: 'Insertando lead',
    loadingMessage: 'Creando checkout lead manual…',
    successLabel: 'Lead creado',
    successMeta: 'Listo para rescate',
    successMessage: 'Lead manual creado en checkout_leads.',
    errorLabel: 'No se creó',
    errorMeta: 'Reintentar',
    action: async () => {
      await updateRescue('/api/arrival/admin/rescue-create', {
        payment_provider: getRescueCreateProvider(),
        payment_status: getRescueCreatePaymentStatus(),
        note: getRescueCreateNote()
      });
    },
    reset: () => {
      renderRescueActionStates();
    }
  }).catch((error) => {
    console.error('Rescue create error:', error);
  });
});

rescueSearchInputEl?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    rescueSearchBtn?.click();
  }
});

markPaidBtn?.addEventListener('click', () => {
  void runTransientButtonAction({
    button: markPaidBtn,
    feedbackNode: rescueFeedbackEl,
    loadingLabel: 'Verificando…',
    loadingMeta: 'Auditoría manual',
    loadingMessage: 'Marcando lead como verificado…',
    successLabel: 'Lead verificado',
    successMeta: 'Pago confirmado',
    successMessage: 'Lead marcado manualmente como pagado/verificado.',
    errorLabel: 'No se verificó',
    errorMeta: 'Reintentar',
    action: async () => {
      await updateRescue('/api/arrival/admin/rescue-verify', { note: getRescueNote() });
    },
    reset: () => {
      renderRescueActionStates();
    }
  }).catch((error) => {
    console.error('Rescue verify error:', error);
  });
});

generateRescueBtn?.addEventListener('click', () => {
  void runTransientButtonAction({
    button: generateRescueBtn,
    feedbackNode: rescueFeedbackEl,
    loadingLabel: 'Generando…',
    loadingMeta: 'Link privado',
    loadingMessage: 'Generando link de rescate…',
    successLabel: 'Link listo',
    successMeta: 'Single-use',
    successMessage: 'Link de rescate generado. Ya podés copiarlo.',
    errorLabel: 'No se generó',
    errorMeta: 'Reintentar',
    action: async () => {
      await updateRescue('/api/arrival/admin/rescue-generate', { note: getRescueNote() });
    },
    reset: () => {
      renderRescueActionStates();
    }
  }).catch((error) => {
    console.error('Rescue generate error:', error);
  });
});

copyRescueBtn?.addEventListener('click', () => {
  void copyText(state.generatedRescueLink, {
    button: copyRescueBtn,
    feedbackNode: rescueFeedbackEl,
    successMessage: 'Link de rescate copiado.',
    idleReset: () => renderRescueActionStates()
  }).catch((error) => {
    console.error('Clipboard error:', error);
  });
});

renderActionStates(null);
renderRescueActionStates();
setLoading(false);
void validateSessionAndBoot();
