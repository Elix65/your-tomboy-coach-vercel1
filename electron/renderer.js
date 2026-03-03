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
  showRuntimeError(error || message);
};

window.addEventListener('unhandledrejection', (event) => {
  showRuntimeError(event.reason || 'Unhandled promise rejection');
});

window.yumikoOverlay?.onAuthCode?.((payload) => {
  const code = typeof payload?.code === 'string' ? payload.code : '';
  window.dispatchEvent(new CustomEvent('yumiko:auth-code', { detail: { code } }));
});
