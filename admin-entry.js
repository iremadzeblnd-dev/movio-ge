(() => {
  'use strict';
  const entry = document.querySelector('.footer-admin-entry');
  if (!entry) return;
  const dialog = document.createElement('dialog');
  dialog.id = 'storefrontAdminDialog';
  dialog.className = 'storefront-admin-dialog';
  dialog.setAttribute('aria-labelledby', 'storefrontAdminTitle');
  dialog.innerHTML = `
    <form class="storefront-admin-form">
      <button class="storefront-admin-close" type="button" aria-label="Close">&times;</button>
      <p class="storefront-admin-brand">MOVIO</p>
      <h2 id="storefrontAdminTitle">Administrator access</h2>
      <label for="storefrontAdminEmail">Email</label>
      <input id="storefrontAdminEmail" name="email" type="email" autocomplete="username" required>
      <label for="storefrontAdminPassword">Password</label>
      <input id="storefrontAdminPassword" name="password" type="password" autocomplete="current-password" required>
      <button class="storefront-admin-submit" type="submit">Sign in</button>
      <p class="storefront-admin-message" role="status" aria-live="polite"></p>
    </form>`;
  document.body.append(dialog);
  const form = dialog.querySelector('form');
  const email = dialog.querySelector('[name="email"]');
  const password = dialog.querySelector('[name="password"]');
  const submit = dialog.querySelector('[type="submit"]');
  const message = dialog.querySelector('[role="status"]');
  let busy = false, generation = 0;
  function setBusy(value) {
    busy = value;
    form.setAttribute('aria-busy', String(value));
    submit.disabled = value;
    email.disabled = value;
    password.disabled = value;
    submit.textContent = value ? 'Checking...' : 'Sign in';
  }
  entry.addEventListener('click', () => {
    if (dialog.open) return;
    message.textContent = '';
    dialog.showModal();
    email.focus();
  });
  dialog.querySelector('.storefront-admin-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) {
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  }});
  dialog.addEventListener('close', () => {
    ++generation;
    password.value = '';
    setBusy(false);
    entry.focus();
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    const current = ++generation;
    const client = window.movioSupabase;
    const credentials = { email: email.value.trim(), password: password.value };
    setBusy(true);
    message.textContent = '';
    try {
      if (!client?.auth || typeof client.rpc !== 'function') throw Error('unavailable');
      const result = await client.auth.signInWithPassword(credentials);
      if (current !== generation || !dialog.open) return;
      password.value = '';
      if (result.error) {
        message.textContent = result.error.code === 'invalid_credentials' || result.error.status === 400
          ? 'Incorrect email or password.' : 'Sign-in failed. Check your connection and try again.';
        return;
      }
      // A valid customer session never grants administrator access.
      const role = await client.rpc('movio_is_admin');
      if (current !== generation || !dialog.open) return;
      if (role.error) { message.textContent = 'Administrator permissions could not be verified. Try again.'; return; }
      if (role.data !== true) { message.textContent = 'This account does not have administrator access.'; return; }
      window.location.assign('admin.html');
    } catch {
      if (current === generation) message.textContent = 'Sign-in is unavailable. Please try again.';
    } finally {
      credentials.password = '';
      if (current === generation) { password.value = ''; setBusy(false); }
    }
  });
})();
