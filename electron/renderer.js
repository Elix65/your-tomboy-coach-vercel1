const lifecycleDebugEnabled = window.yumikoOverlay?.debugLifecycle === true;

function logRendererLifecycle(event, details = {}) {
  if (!lifecycleDebugEnabled) return;
  console.info(`[yumiko][renderer] ${event}`, details);
}

function showRuntimeError(errorLike) {
  const pre = document.createElement('pre');
  pre.style.position = 'fixed';
  pre.style.left = '10px';
  pre.style.right = '10px';
  pre.style.bottom = '10px';
  pre.style.maxHeight = '40vh';
  pre.style.overflow = 'auto';
  pre.style.padding = '10px';
  pre.style.borderRadius = '8px';
  pre.style.border = '1px solid #f66';
  pre.style.background = 'rgba(34, 0, 0, 0.92)';
  pre.style.color = '#ffd2d2';
  pre.style.zIndex = '10000';

  const message = errorLike instanceof Error
    ? `${errorLike.message}\n\n${errorLike.stack || ''}`
    : String(errorLike);

  pre.textContent = `Runtime error:\n${message}`;
  document.body.appendChild(pre);
}

window.onerror = (message, _source, _lineno, _colno, error) => {
  logRendererLifecycle('window.onerror', { message: String(message || '') });
  showRuntimeError(error || message);
};

window.addEventListener('unhandledrejection', (event) => {
  logRendererLifecycle('unhandledrejection', {
    reason: event?.reason instanceof Error ? event.reason.message : String(event?.reason || '')
  });
  showRuntimeError(event.reason || 'Unhandled promise rejection');
});

window.addEventListener('DOMContentLoaded', () => {
  logRendererLifecycle('DOMContentLoaded');
});

window.addEventListener('load', () => {
  logRendererLifecycle('load');
});

window.yumikoOverlay?.onAuthCode?.((payload) => {
  const code = typeof payload?.code === 'string' ? payload.code : '';
  window.dispatchEvent(new CustomEvent('yumiko:auth-code', { detail: { code } }));
});


window.yumikoOverlay?.onAuthResult?.((payload) => {
  const message = typeof payload?.message === 'string' ? payload.message : '';
  window.dispatchEvent(new CustomEvent('yumiko:auth-result', { detail: { message } }));
});

window.yumikoOverlay?.onResizeAttempt?.((payload) => {
  const width = Number(payload?.width);
  const height = Number(payload?.height);
  window.dispatchEvent(new CustomEvent('yumiko:resize-attempt', {
    detail: {
      width: Number.isFinite(width) ? width : 0,
      height: Number.isFinite(height) ? height : 0
    }
  }));
});


window.yumikoOverlay?.onPanicReset?.(() => {
  window.dispatchEvent(new CustomEvent('yumiko:panic-reset'));
});


window.yumikoOverlay?.onMiniScale?.((payload) => {
  window.dispatchEvent(new CustomEvent('yumiko:mini-scale', { detail: payload || {} }));
});
