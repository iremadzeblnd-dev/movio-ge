(function () {
  const client = window.movioSupabase;
  const loginPanel = document.getElementById('loginPanel');
  const adminPanel = document.getElementById('adminPanel');
  const form = document.getElementById('adminLoginForm');
  const message = document.getElementById('loginMessage');
  let generation = 0;
  function hide() {
    window.movioAdminAuthorized = false;
    loginPanel.hidden = false;
    adminPanel.hidden = true;
    adminPanel.removeAttribute('data-authorized');
    window.MovioAdminUI?.setAuthorized(false);
  }
  hide();
  async function checkSession() {
    const current = ++generation;
    hide();
    try {
      if (!client?.auth || typeof client.rpc !== 'function') throw Error('Unavailable');
      const { data, error } = await client.auth.getSession();
      if (error || !data?.session?.user?.id) return;
      const result = await client.rpc('movio_is_admin');
      if (current !== generation) return;
      if (result.error || result.data !== true) {
        message.textContent = 'ამ ანგარიშს ადმინისტრატორის უფლება არ აქვს.';
        return;
      }
      window.movioAdminAuthorized = true;
      window.MovioAdminUI?.setAuthorized(true);
      adminPanel.setAttribute('data-authorized', 'true');
      loginPanel.hidden = true;
      adminPanel.hidden = false;
      message.textContent = '';
    } catch {
      if (current === generation) message.textContent = 'ადმინისტრატორის უფლება ვერ დადასტურდა. სცადეთ ხელახლა.';
    }
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    hide();
    message.textContent = 'მოწმდება...';
    try {
      const { error } = await client.auth.signInWithPassword({
        email: document.getElementById('adminEmail').value.trim(),
        password: document.getElementById('adminPassword').value,
      });
      document.getElementById('adminPassword').value = '';
      if (error) { message.textContent = 'ელფოსტა ან პაროლი არასწორია.'; return; }
      await checkSession();
    } catch { message.textContent = 'შესვლა ვერ მოხერხდა. სცადეთ ხელახლა.'; }
  });
  document.querySelectorAll('[data-admin-logout]').forEach(button => {
    button.addEventListener('click', async () => {
      ++generation;
      hide();
      try { await client?.auth?.signOut(); }
      catch { message.textContent = 'გასვლა ვერ დადასტურდა. სცადეთ ხელახლა.'; }
    });
  });
  client?.auth?.onAuthStateChange((_event, session) => {
    // Never await another Supabase call inside the Auth callback.
    ++generation;
    hide();
    const scheduled = generation;
    if (session) setTimeout(() => {
      if (scheduled === generation) checkSession();
    }, 0);
  });
  checkSession();
})();
