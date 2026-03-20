import supabaseClient from './supabase.js';

const ALLOWED_ADMIN_UID = 'a5429e17-43e2-4922-9560-ab914f63283e';

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
  listAbortController: null
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

function showFeedback(message, type = 'error') {
  feedbackEl.textContent = message;
  feedbackEl.classList.remove('hidden', 'success');
  if (type === 'success') {
    feedbackEl.classList.add('success');
  }
}

function clearFeedback() {
  feedbackEl.textContent = '';
  feedbackEl.classList.add('hidden');
  feedbackEl.classList.remove('success');
}

function setLoading(isLoading) {
  state.loading = isLoading;
  loadingEl.classList.toggle('hidden', !isLoading);
  refreshBtn.disabled = isLoading;
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
    return;
  }

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

  approveBtn.disabled = request.status === 'approved' || request.status === 'invited' || request.status === 'account_enabled' || request.status === 'active';
  inviteBtn.disabled = request.status === 'invited' || request.status === 'account_enabled' || request.status === 'active';
  enableBtn.disabled = request.status === 'account_enabled' || request.status === 'active';
}

async function copyText(value, successMessage) {
  if (!value) {
    showFeedback('No hay nada para copiar todavía.');
    return;
  }

  try {
    await navigator.clipboard.writeText(value);
    showFeedback(successMessage, 'success');
  } catch (error) {
    console.error('Clipboard error:', error);
    showFeedback('No pude copiar al portapapeles en este entorno.');
  }
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
    clearFeedback();
  } catch (error) {
    console.error('Detail load error:', error);
    handleApiError(error);
  }
}

async function fetchList() {
  if (state.listAbortController) {
    state.listAbortController.abort();
  }

  const controller = new AbortController();
  state.listAbortController = controller;
  setLoading(true);

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
    clearFeedback();
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

async function updateRequest(payload, successMessage) {
  const selected = getSelectedRequest();
  if (!selected) {
    showFeedback('Primero elegí una solicitud.');
    return;
  }

  try {
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
    showFeedback(successMessage, 'success');
  } catch (error) {
    console.error('Update error:', error);
    handleApiError(error);
  }
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

  showFeedback('No pude completar la acción ahora. Revisemos el backend o intentemos de nuevo.');
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

  try {
    await fetchList();
    gateEl.classList.add('hidden');
    appEl.classList.remove('hidden');
  } catch {}
}

refreshBtn?.addEventListener('click', () => {
  void fetchList();
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
  void copyText(selected?.invite_token, 'Token copiado.');
});

copyLinkBtn?.addEventListener('click', () => {
  const selected = getSelectedRequest();
  void copyText(selected?.invite_url, 'Link privado copiado.');
});

saveNoteBtn?.addEventListener('click', () => {
  void updateRequest({ internal_note: detailInternalNoteEl.value }, 'Nota interna guardada.');
});

approveBtn?.addEventListener('click', () => {
  void updateRequest({ status: 'approved' }, 'Solicitud marcada como approved.');
});

inviteBtn?.addEventListener('click', () => {
  void updateRequest({ status: 'invited' }, 'Solicitud marcada como invited.');
});

enableBtn?.addEventListener('click', () => {
  void updateRequest({ status: 'account_enabled' }, 'Solicitud marcada como account_enabled.');
});

supabaseClient.auth.onAuthStateChange((_event, session) => {
  state.session = session?.user || null;
});

void validateSessionAndBoot();
