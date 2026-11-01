// Storefront theme only. Never changes cart, forms, customer Auth or Admin state.
(() => {
  'use strict';
  if (location.pathname.split('/').pop() === 'admin.html') return;
  const key = 'movio-theme';
  const root = document.documentElement;
  let mode = 'dark';
  try { if (localStorage.getItem(key) === 'light') mode = 'light'; } catch { /* Optional persistence. */ }
  root.dataset.theme = mode;
  let toggle;
  const sun = '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>';
  const moon = '<path d="M20.5 13.2A8.6 8.6 0 0 1 10.8 3.5 8.6 8.6 0 1 0 20.5 13.2Z"/>';
  function paint() {
    root.dataset.theme = mode;
    if (toggle) {
      toggle.setAttribute('aria-label', mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
      toggle.setAttribute('aria-pressed', String(mode === 'light'));
      toggle.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${mode === 'dark' ? sun : moon}</svg>`;
    }
    if (typeof CustomEvent === 'function') dispatchEvent(new CustomEvent('movio:themechange'));
    document.querySelectorAll('img.movio-brand-image').forEach(image => {
      const source = image.getAttribute('src');
      if (/^movio-logo-(final|light)\.svg$/.test(source || '')) {
        image.setAttribute('src', mode === 'light' ? 'movio-logo-light.svg' : 'movio-logo-final.svg');
      }
    });
  }
  function mount() {
    const header = document.querySelector('.site-header, .item-page-header');
    if (!header || document.querySelector('.theme-toggle')) return;
    let controls = header.querySelector('.header-actions, .detail-header-actions');
    if (!controls) {
      controls = document.createElement('div');
      controls.className = 'theme-header-tools';
      [...header.children].filter(child => !child.classList.contains('wordmark')).forEach(child => controls.append(child));
      header.append(controls);
    }
    const accountControls = document.createElement('div');
    accountControls.className = 'theme-account-controls';
    while (controls.firstChild) accountControls.append(controls.firstChild);
    controls.append(accountControls);
    header.classList.add('storefront-theme-header');
    controls.classList.add('storefront-header-actions');
    toggle = document.createElement('button');
    toggle.className = 'theme-toggle';
    toggle.type = 'button';
    controls.append(toggle);
    toggle.addEventListener('click', event => {
      // Theme changes must not trigger storefront outside-click dismissal handlers.
      event.stopPropagation();
      mode = mode === 'dark' ? 'light' : 'dark';
      paint();
      try { localStorage.setItem(key, mode); } catch { /* Works even when storage is blocked. */ }
    });
    paint();
  }
  addEventListener('storage', event => {
    if (event.key !== key && event.key !== null) return;
    mode = event.newValue === 'light' ? 'light' : 'dark';
    paint();
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, {once:true});
  else mount();
})();
