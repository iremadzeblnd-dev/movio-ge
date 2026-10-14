(() => {
  const logoSelector = 'a.wordmark, a.footer-brand-link';
  document.querySelectorAll(logoSelector).forEach(logo => {
    logo.setAttribute('href', 'index.html');
  });

  function resetHomepage() {
    const search = document.querySelector('#site-search');
    if (search) search.value = '';
    const results = document.querySelector('.search-results');
    if (results) { results.replaceChildren(); results.hidden = true; }
    const message = document.querySelector('.search-message');
    if (message) { message.textContent = ''; message.hidden = true; }
    if (typeof applyCatalogFilter === 'function') applyCatalogFilter('');
    document.querySelectorAll('[data-category-filter]').forEach(card => card.classList.remove('category-active'));
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }

  document.addEventListener('click', event => {
    const logo = event.target.closest?.(logoSelector);
    if (!logo || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    if (logo.target && logo.target !== '_self') return;
    event.preventDefault();
    resetHomepage();
    const homepage = new URL('index.html', document.baseURI);
    if (location.pathname === homepage.pathname || location.pathname.endsWith('/')) {
      // Restore the confirmed catalog in this document rather than replacing it
      // with another asynchronous load merely to clear a category or search.
      if (location.href !== homepage.href) history.pushState(null, '', homepage);
      if (typeof restoreCatalogView === 'function') restoreCatalogView();
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }));
    } else {
      window.location.assign(homepage.href);
    }
  });

  window.addEventListener('pageshow', () => {
    const isHomepage = location.pathname.endsWith('/index.html') || location.pathname.endsWith('/');
    if (isHomepage && !location.search && !location.hash) resetHomepage();
  });
})();
