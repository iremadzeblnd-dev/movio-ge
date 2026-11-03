// Supabase owns credentials and session persistence. Shopping remains optional-auth.
(() => {
  'use strict';
  // Legal-retention release gate; the server independently blocks requests.
  const ACCOUNT_DELETION_ENABLED = false;
  // Custom SMTP is off. Keep existing password login and valid recovery links;
  // do not offer new email-dependent signup or recovery-email requests.
  const EMAIL_AUTH_REQUESTS_ENABLED = false;
  const client = window.movioSupabase;
  let currentUser = null, recovery = false, eventSeen = false, busy = false;
  let recoveryHint = new URLSearchParams(location.search).get('account') === 'recovery' || new URLSearchParams(location.hash.slice(1)).get('type') === 'recovery';
  try {
    localStorage.removeItem('movio-customer-users-v1');
    localStorage.removeItem('movio-customer-session-v1');
  } catch { /* Remove only legacy demo auth, never shopping or SDK storage. */ }
  const email = value => String(value || '').trim().toLowerCase();
  const prefilled = new Map();
  const observedFields = new WeakSet();
  let authVersion = 0;
  let deletedUserId = null;
  let resolvedNameUserId = null;
  const promptedUsers = new Set();
  const nameValue = (...values) => values.find(value => typeof value === 'string' && value.trim() && value.trim().length <= 160)?.trim() || '';
  function profile(user) {
    if (!user?.id) return null;
    const meta = user.user_metadata || {};
    const saved = meta.profile && typeof meta.profile === 'object' ? meta.profile : {};
    const full = nameValue(meta.full_name, meta.fullName, meta.name, saved.full_name, saved.name);
    const firstName = nameValue(meta.first_name, meta.firstName, meta.given_name, saved.first_name, saved.firstName) || full.split(/\s+/)[0] || '';
    const lastName = nameValue(meta.last_name, meta.lastName, meta.family_name, saved.last_name, saved.lastName) || full.split(/\s+/).slice(1).join(' ');
    return { id: user.id, firstName, lastName, name: [firstName, lastName].filter(Boolean).join(' '), email: user.email || '' };
  }
  function auth() {
    if (!client?.auth) throw new Error('ავტორიზაცია დროებით მიუწვდომელია. შეძენა შეგიძლიათ სტუმრის სტატუსით.');
    return client.auth;
  }
  function redirect(mode) {
    const url = new URL('index.html', location.href);
    url.search = `?account=${mode}`;
    url.hash = '';
    return url.href;
  }
  function check(error, fallback) {
    if (!error) return;
    const messages = {
      invalid_credentials: 'ელფოსტა ან პაროლი არასწორია.',
      email_not_confirmed: 'შესვლამდე დაადასტურეთ ელფოსტა მიღებული ბმულით.',
      weak_password: 'პაროლი არ აკმაყოფილებს უსაფრთხოების მოთხოვნებს.',
      user_already_exists: 'ამ ელფოსტით ანგარიში უკვე არსებობს. სცადეთ შესვლა ან პაროლის აღდგენა.',
      signup_disabled: 'რეგისტრაცია დროებით მიუწვდომელია.',
      over_email_send_rate_limit: 'მოთხოვნები ძალიან ხშირია. სცადეთ ცოტა მოგვიანებით.',
      over_request_rate_limit: 'მოთხოვნები ძალიან ხშირია. სცადეთ ცოტა მოგვიანებით.',
      same_password: 'აირჩიეთ ძველისგან განსხვავებული ახალი პაროლი.',
    };
    throw new Error(messages[error.code] || fallback);
  }
  function getCurrentUser() { return currentUser ? { ...currentUser } : null; }
  function prefillCheckout() {
    for (const [id, value] of [['customerName', currentUser?.name], ['customerEmail', currentUser?.email]]) {
      const field = document.getElementById(id);
      if (!field) continue;
      if (!observedFields.has(field)) {
        observedFields.add(field);
        field.addEventListener('input', () => prefilled.delete(field));
      }
      if (prefilled.has(field) && field.value === prefilled.get(field)) {
        field.value = value || '';
        if (value) prefilled.set(field, value); else prefilled.delete(field);
      } else if (!field.value.trim() && value) {
        field.value = value;
        prefilled.set(field, value);
      }
    }
  }
  function updateUser(user, refresh = true) {
    if (user?.id === deletedUserId) user = null;
    const version = ++authVersion;
    currentUser = profile(user);
    resolvedNameUserId = !refresh && currentUser ? currentUser.id : null;
    if (!currentUser) {
      document.getElementById('accountOrdersPanel')?.replaceChildren();
      document.getElementById('accountProfilePanel')?.replaceChildren();
      if (nameForm && !nameForm.hidden) {
        nameForm.reset();
        if (dialog?.open) openAuth('login');
      }
    }
    renderHeader();
    prefillCheckout();
    window.dispatchEvent(new CustomEvent('movio:customer-auth', { detail: { user: getCurrentUser() } }));
    if (detailsView && !detailsView.hidden) currentUser ? showAccountSection(activeSection) : openAuth('login');
    // Defer SDK requests until the synchronous Auth event callback has released its lock.
    if (user?.id) window.setTimeout(async () => {
      if (version !== authVersion) return;
      if (refresh && typeof client?.auth?.getUser === 'function') {
        try {
          const { data, error } = await client.auth.getUser();
          if (!error && data?.user?.id === user.id && version === authVersion) updateUser(data.user, false);
        } catch { /* Keep the session display; don't ask for a name on a failed lookup. */ }
      } else maybeRequestName();
    }, 0);
  }
  function maybeRequestName() {
    if (!currentUser || resolvedNameUserId !== currentUser.id || currentUser.firstName || recovery || recoveryHint || busy || !nameForm) return;
    const key = `movio-name-prompted:${currentUser.id}`;
    if (promptedUsers.has(currentUser.id)) return;
    try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1'); } catch { /* Memory fallback. */ }
    promptedUsers.add(currentUser.id);
    openAuth('name');
  }
  async function saveFirstName(value) {
    const firstName = typeof value === 'string' ? value.trim() : '';
    if (!firstName || firstName.length > 80 || /[\u0000-\u001f\u007f]/.test(firstName)) throw Error('შეიყვანეთ სახელი (არაუმეტეს 80 სიმბოლო).');
    const userId = currentUser?.id;
    if (!userId) throw Error('სახელის შესანახად გაიარეთ ავტორიზაცია.');
    const { data: verified, error: verifyError } = await auth().getUser();
    check(verifyError, 'ანგარიშის შემოწმება ვერ მოხერხდა. სცადეთ ხელახლა.');
    if (verified?.user?.id !== userId || currentUser?.id !== userId) throw Error('სესია შეიცვალა. ხელახლა გაიარეთ ავტორიზაცია.');
    const lastName = profile(verified.user).lastName;
    const { data, error } = await auth().updateUser({ data: { first_name: firstName, full_name: [firstName, lastName].filter(Boolean).join(' ') } });
    check(error, 'სახელის შენახვა ვერ მოხერხდა. სცადეთ ხელახლა.');
    if (data?.user?.id !== userId || currentUser?.id !== userId) throw Error('სესია შეიცვალა. ხელახლა გაიარეთ ავტორიზაცია.');
    if (profile(data.user).firstName !== firstName) throw Error('სახელის შენახვა ვერ დადასტურდა. სცადეთ ხელახლა.');
    updateUser(data.user, false);
  }
  async function register({ firstName, lastName, email: address, password }) {
    if (!EMAIL_AUTH_REQUESTS_ENABLED) throw Error('ახალი რეგისტრაცია დროებით მიუწვდომელია. შეძენა შეგიძლიათ ანგარიშის გარეშე.');
    firstName = String(firstName || '').trim();
    lastName = String(lastName || '').trim();
    if (!firstName || !lastName || firstName.length > 80 || lastName.length > 80) throw new Error('შეავსეთ სახელი და გვარი.');
    if (String(password || '').length < 8) throw new Error('პაროლი უნდა შეიცავდეს მინიმუმ 8 სიმბოლოს.');
    const { data, error } = await auth().signUp({ email: email(address), password,
      options: { data: { first_name: firstName, last_name: lastName, full_name: `${firstName} ${lastName}` }, emailRedirectTo: redirect('confirmed') } });
    check(error, 'რეგისტრაცია ვერ მოხერხდა. სცადეთ მოგვიანებით.');
    if (data.session) updateUser(data.session.user);
    return { confirmationRequired: !data.session };
  }
  async function login({ email: address, password }) {
    const { data, error } = await auth().signInWithPassword({ email: email(address), password });
    check(error, 'შესვლა ვერ მოხერხდა. შეამოწმეთ მონაცემები და სცადეთ ხელახლა.');
    recovery = recoveryHint = false;
    updateUser(data.user);
    return getCurrentUser();
  }
  async function logout() {
    const { error } = await auth().signOut({ scope: 'local' });
    check(error, 'გამოსვლა ვერ მოხერხდა. სცადეთ ხელახლა.');
    recovery = recoveryHint = false;
    updateUser(null);
  }
  async function deleteAccount({password, confirmation}) {
    if (!ACCOUNT_DELETION_ENABLED) throw Error('ანგარიშის თვითმომსახურებით წაშლა დროებით გამორთულია. მოთხოვნისთვის დაგვიკავშირდით.');
    const userId = currentUser?.id;
    if (!userId) throw Error('ანგარიშის წასაშლელად გაიარეთ ავტორიზაცია.');
    if (confirmation !== 'წაშლა' || typeof password !== 'string' || !password) throw Error('ჩაწერეთ „წაშლა“ და შეიყვანეთ მიმდინარე პაროლი.');
    const {data, error} = await auth().getSession();
    check(error, 'სესიის შემოწმება ვერ მოხერხდა. სცადეთ ხელახლა.');
    if (data.session?.user?.id !== userId || !data.session.access_token || currentUser?.id !== userId) throw Error('სესია შეიცვალა. ხელახლა გაიარეთ ავტორიზაცია.');
    const response = await fetch('/api/customer-account', {
      method: 'POST', headers: {'Content-Type':'application/json', Authorization:`Bearer ${data.session.access_token}`},
      body: JSON.stringify({password, confirmation:'DELETE'}),
    });
    const result = await response.json();
    if (!response.ok || result.deleted !== true) throw Error(result.error || 'ანგარიშის წაშლა ვერ დადასტურდა. სცადეთ ხელახლა ან დაგვიკავშირდით.');
    deletedUserId = userId;
    if (currentUser?.id && currentUser.id !== userId) return; // Never sign out a different, newly selected account.
    try { await auth().signOut({scope:'local'}); } catch { /* Deleted identity may already be rejected by Auth. */ }
    try {
      const key = client.auth.storageKey;
      if (key) { localStorage.removeItem(key); localStorage.removeItem(`${key}-code-verifier`); }
    } catch { /* Optional browser persistence. */ }
    try {
      const pending = JSON.parse(sessionStorage.getItem('movio-pending-checkout') || 'null');
      if (pending?.userId === userId) sessionStorage.removeItem('movio-pending-checkout');
      sessionStorage.removeItem(`movio-name-prompted:${userId}`);
    } catch { /* Leave unreadable/other-user retry state untouched. */ }
    recovery = recoveryHint = false;
    updateUser(null);
  }
  async function requestPasswordReset(address) {
    if (!EMAIL_AUTH_REQUESTS_ENABLED) throw Error('პაროლის აღდგენის წერილის მოთხოვნა დროებით მიუწვდომელია.');
    const { error } = await auth().resetPasswordForEmail(email(address), { redirectTo: redirect('recovery') });
    check(error, 'ბმულის გაგზავნა ვერ მოხერხდა. სცადეთ ცოტა მოგვიანებით.');
  }
  async function changePassword(password) {
    if (!recovery || !currentUser) throw new Error('აღდგენის ბმული არასწორია ან ვადა ამოიწურა. მოითხოვეთ ახალი ბმული.');
    if (String(password || '').length < 8) throw new Error('პაროლი უნდა შეიცავდეს მინიმუმ 8 სიმბოლოს.');
    const { data, error } = await auth().updateUser({ password });
    check(error, 'პაროლის შეცვლა ვერ მოხერხდა. მოითხოვეთ ახალი აღდგენის ბმული.');
    recovery = recoveryHint = false;
    const url = new URL(location.href);
    url.searchParams.delete('account');
    history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    updateUser(data.user);
  }
  async function getOrders() {
    const user = getCurrentUser();
    if (!user) return [];
    if (!client) throw Error('შეკვეთები დროებით მიუწვდომელია.');
    const { data, error } = await client.from('orders')
      .select('id,order_number,created_at,total,delivery_cost,delivery_type,total_weight_kg,order_status,payment_status,order_items(product_id,product_name,product_image,unit_price,quantity,line_total,weight_kg,free_delivery)')
      .eq('user_id', user.id).order('created_at', { ascending: false }).limit(100);
    if (error) throw Error('შეკვეთების ჩატვირთვა ვერ მოხერხდა. სცადეთ ხელახლა.');
    // RLS is the security boundary. Also discard stale responses after sign-out/account switch.
    return currentUser?.id === user.id ? (data || []) : [];
  }
  let ordersRequest = 0;
  async function renderOrders(panel) {
    const requestId = ++ordersRequest, userId = currentUser?.id;
    const state = document.createElement('p'); state.setAttribute('role','status');
    state.textContent = 'შეკვეთები იტვირთება…'; panel.append(state);
    try {
      const orders = await getOrders();
      if (requestId !== ordersRequest || currentUser?.id !== userId || activeSection !== 'orders') return;
      state.remove();
      if (!orders.length) {
        const empty = document.createElement('p'); empty.className = 'customer-orders-empty';
        empty.textContent = 'შეკვეთები ჯერ არ გაქვთ.'; panel.append(empty); return;
      }
      const statuses = { received:'მიღებულია', preparing:'მზადდება', shipped:'გაგზავნილია', completed:'დასრულებულია', cancelled:'გაუქმებულია' };
      const payments = { pending:'მოლოდინშია', paid:'გადახდილია', failed:'ვერ შესრულდა', cancelled:'გაუქმებულია', refunded:'დაბრუნებულია' };
      const shippingTypes = {city:'ქალაქი',region:'რეგიონი',branch_pickup:'ფილიალიდან გატანა',village_highland:'სოფელი / მაღალმთიანი'};
      const money = value => new Intl.NumberFormat('ka-GE', {style:'currency',currency:'GEL'}).format(Number(value));
      for (const order of orders) {
        const card = document.createElement('article'); card.className = 'customer-order';
        card.appendChild(document.createElement('h4')).textContent = order.order_number;
        for (const text of [new Date(order.created_at).toLocaleDateString('ka-GE', {timeZone:'Asia/Tbilisi'}),
          `ჯამი: ${money(order.total)}`, `შეკვეთა: ${statuses[order.order_status] || '—'}`,
          `გადახდა: ${payments[order.payment_status] || '—'}`,
          `მიწოდების ტიპი: ${shippingTypes[order.delivery_type] || '—'}`,
          `მიწოდება: ${order.delivery_cost != null && Number(order.delivery_cost) === 0 ? 'უფასო მიწოდება' : order.delivery_cost == null ? '—' : money(order.delivery_cost)}`,
          `საერთო წონა: ${order.total_weight_kg == null ? '—' : order.total_weight_kg + ' კგ'}`]) card.appendChild(document.createElement('p')).textContent = text;
        const list = document.createElement('ul');
        for (const item of order.order_items || []) {
          const row = document.createElement('li');
          row.textContent = `${item.product_name} × ${item.quantity} · ${money(item.unit_price)} · ${money(item.line_total)}`;
          list.append(row);
        }
        card.append(list); panel.append(card);
      }
      if (orders.length === 100) panel.appendChild(document.createElement('p')).textContent = 'ნაჩვენებია ბოლო 100 შეკვეთა.';
    } catch (error) {
      if (requestId !== ordersRequest || currentUser?.id !== userId || activeSection !== 'orders') return;
      state.textContent = error.message;
      const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'account-back';
      retry.textContent = 'ხელახლა ცდა'; retry.onclick = () => showAccountSection('orders'); panel.append(retry);
    }
  }
  window.MovioCustomerAuth = { getCurrentUser, register, login, logout, requestPasswordReset, changePassword, getOrders, prefillCheckout, saveFirstName, deleteAccount };
  const button = document.getElementById('accountButton');
  const label = document.getElementById('accountLabel');
  const menu = document.getElementById('accountMenu');
  const dialog = document.getElementById('accountDialog');
  const authView = document.getElementById('accountAuthView');
  const detailsView = document.getElementById('accountDetailsView');
  const loginForm = document.getElementById('customerLoginForm');
  const registerForm = document.getElementById('customerRegisterForm');
  const message = document.getElementById('authMessage');
  const forgot = document.getElementById('forgotPasswordButton');
  let activeSection = 'profile', resetForm, passwordForm, nameForm, deleteForm;
  if (authView) {
    const extra = document.createElement('div');
    extra.innerHTML = `<form class="auth-form" id="customerResetForm" hidden>
      <p class="customer-auth-hint">შეიყვანეთ ელფოსტა და გამოგიგზავნით პაროლის აღდგენის ბმულს.</p>
      <label for="resetEmail">ელფოსტა</label><input id="resetEmail" name="email" type="email" autocomplete="email" required>
      <button class="auth-submit" type="submit">ბმულის გაგზავნა</button><button class="account-back" type="button" data-auth-mode="login">← შესვლაზე დაბრუნება</button></form>
      <form class="auth-form" id="customerNewPasswordForm" hidden><p class="customer-auth-hint">შექმენით ახალი პაროლი თქვენი ანგარიშისთვის.</p>
      <label for="newPassword">ახალი პაროლი</label><input id="newPassword" name="password" type="password" autocomplete="new-password" minlength="8" required>
      <label for="newPasswordRepeat">პაროლის გამეორება</label><input id="newPasswordRepeat" name="passwordRepeat" type="password" autocomplete="new-password" minlength="8" required>
      <button class="auth-submit" type="submit">პაროლის შენახვა</button></form>
      <form class="auth-form" id="customerNameForm" hidden>
      <p class="customer-auth-hint">თქვენს ანგარიშში სახელი არ არის შენახული. გთხოვთ, ერთხელ მიუთითოთ თქვენი სახელი.</p>
      <label for="customerFirstName">სახელი</label><input id="customerFirstName" name="firstName" autocomplete="given-name" required maxlength="80">
      <button class="auth-submit" type="submit">სახელის შენახვა</button><button class="account-back" type="button" id="customerNameLater">მოგვიანებით</button></form>
      <form class="auth-form" id="customerDeleteForm" hidden>
      <h3>ანგარიშის წაშლა</h3><p class="customer-auth-hint">წაიშლება თქვენი შესვლის ანგარიში და პროფილი. საჭირო შეკვეთების ჩანაწერები რჩება კანონით დასაშვები ვალდებულებების შესასრულებლად; ანგარიშთან კავშირი მოიხსნება. შეკვეთები არ გაუქმდება. ეს მოქმედება შეუქცევადია.</p>
      <p class="customer-auth-hint"><a href="privacy.html#privacy-retention" target="_blank" rel="noopener noreferrer">მონაცემების შენახვა და თქვენი უფლებები</a></p>
      <label for="deletePassword">მიმდინარე პაროლი</label><input id="deletePassword" name="password" type="password" autocomplete="current-password" required maxlength="1024">
      <label for="deleteConfirmation">დასადასტურებლად ჩაწერეთ „წაშლა“</label><input id="deleteConfirmation" name="confirmation" autocomplete="off" pattern="წაშლა" required>
      <button class="auth-submit" type="submit">ანგარიშის საბოლოოდ წაშლა</button><button class="account-back" type="button" id="customerDeleteCancel">გაუქმება</button></form>`;
    authView.insertBefore(extra, message);
    resetForm = document.getElementById('customerResetForm');
    passwordForm = document.getElementById('customerNewPasswordForm');
    nameForm = document.getElementById('customerNameForm');
    nameForm.addEventListener('submit', event => {
      event.preventDefault();
      run(nameForm, async () => { await saveFirstName(new FormData(nameForm).get('firstName')); nameForm.reset(); dialog.close(); });
    });
    document.getElementById('customerNameLater').addEventListener('click', () => dialog.close());
    deleteForm = document.getElementById('customerDeleteForm');
    document.getElementById('customerDeleteCancel').addEventListener('click', () => { deleteForm.reset(); showAccountSection('profile'); });
    deleteForm.addEventListener('submit', event => {
      event.preventDefault();
      run(deleteForm, async () => {
        const data = new FormData(deleteForm);
        await deleteAccount({password:data.get('password'), confirmation:data.get('confirmation')});
        deleteForm.reset();
        openAuth('login');
        message.textContent = 'ანგარიში წაიშალა. აუცილებელი შეკვეთების ჩანაწერები შენარჩუნებულია.';
      });
    });
    const tabs = document.createElement('nav');
    tabs.className = 'customer-account-tabs';
    tabs.setAttribute('aria-label', 'ანგარიშის განყოფილებები');
    tabs.innerHTML = '<button type="button" data-account-action="profile">ჩემი პროფილი</button><button type="button" data-account-action="orders">ჩემი შეკვეთები</button><button type="button" data-account-action="logout">გამოსვლა</button>';
    detailsView.prepend(tabs);
  }
  function closeMenu() { if (menu) menu.hidden = true; button?.setAttribute('aria-expanded', 'false'); }
  function renderHeader() {
    if (!button) return;
    label.textContent = currentUser?.firstName || 'ანგარიში';
    button.dataset.authenticated = String(Boolean(currentUser));
    button.setAttribute('aria-label', currentUser ? `ანგარიში: ${currentUser.name || currentUser.email}` : 'ანგარიში');
    button.setAttribute('aria-haspopup', currentUser ? 'menu' : 'dialog');
    button.title = currentUser?.name || 'ანგარიში';
    closeMenu();
  }
  function setMode(mode) {
    if (!authView) return;
    if (!EMAIL_AUTH_REQUESTS_ENABLED && ['register','reset'].includes(mode)) mode = 'login';
    for (const [name, form] of [['login', loginForm], ['register', registerForm], ['reset', resetForm], ['recovery', passwordForm], ['name', nameForm], ['delete', deleteForm]]) form.hidden = name !== mode;
    authView.querySelector('.auth-switch').hidden = !EMAIL_AUTH_REQUESTS_ENABLED || ['reset', 'recovery', 'name', 'delete'].includes(mode);
    forgot.hidden = !EMAIL_AUTH_REQUESTS_ENABLED || mode !== 'login';
    message.textContent = '';
    authView.querySelectorAll('[data-auth-mode]').forEach(control => control.setAttribute('aria-pressed', String(control.dataset.authMode === mode)));
  }
  function openAuth(mode = 'login') {
    if (!dialog) return;
    closeMenu(); authView.hidden = false; detailsView.hidden = true; setMode(mode);
    if (!dialog.open) dialog.showModal();
  }
  function showAccountSection(section) {
    if (!dialog) return;
    if (!currentUser) return openAuth();
    ++ordersRequest;
    activeSection = section; closeMenu(); authView.hidden = true; detailsView.hidden = false;
    document.getElementById('accountGreeting').textContent = currentUser.name || 'MOVIO ანგარიში';
    const profilePanel = document.getElementById('accountProfilePanel'), ordersPanel = document.getElementById('accountOrdersPanel');
    profilePanel.hidden = section !== 'profile'; ordersPanel.hidden = section !== 'orders';
    profilePanel.replaceChildren(); ordersPanel.replaceChildren();
    detailsView.querySelectorAll('[data-account-action]').forEach(control => control.setAttribute('aria-pressed', String(control.dataset.accountAction === section)));
    const panel = section === 'profile' ? profilePanel : ordersPanel;
    panel.appendChild(document.createElement('h3')).textContent = section === 'profile' ? 'ჩემი პროფილი' : 'ჩემი შეკვეთები';
    if (section === 'profile') {
      const list = document.createElement('dl'); list.className = 'customer-profile-data';
      for (const [title, value] of [['სახელი', currentUser.firstName], ['გვარი', currentUser.lastName], ['ელფოსტა', currentUser.email]]) {
        list.appendChild(document.createElement('dt')).textContent = title;
        list.appendChild(document.createElement('dd')).textContent = value || '—';
      }
      panel.append(list);
      const userId = currentUser.id;
      // Presentation only; the server and database independently protect Admin accounts.
      if (ACCOUNT_DELETION_ENABLED) Promise.resolve().then(() => client.rpc('movio_is_admin')).then(result => {
        if (result.error || result.data !== false || currentUser?.id !== userId || activeSection !== 'profile' || !list.isConnected) return;
        const remove = document.createElement('button');
        remove.type = 'button'; remove.className = 'account-back'; remove.id = 'customerDeleteButton';
        remove.textContent = 'ანგარიშის წაშლა';
        remove.addEventListener('click', () => { deleteForm.reset(); openAuth('delete'); });
        panel.append(remove);
      }).catch(() => { /* Unknown role: do not offer self-deletion. */ });
    } else {
      renderOrders(panel);
    }
    if (!dialog.open) dialog.showModal();
  }
  async function run(form, operation) {
    if (busy) return;
    busy = true;
    const controls = [...dialog.querySelectorAll('button')].filter(control => !control.classList.contains('account-close'));
    controls.forEach(control => { control.disabled = true; }); form?.setAttribute('aria-busy', 'true'); message.textContent = 'იტვირთება…';
    try { await operation(); }
    catch (error) { message.textContent = error.message || 'მოთხოვნა ვერ შესრულდა. სცადეთ მოგვიანებით.'; }
    finally {
      busy = false; controls.forEach(control => { control.disabled = false; }); form?.removeAttribute('aria-busy');
      form?.querySelectorAll('input[type="password"]').forEach(field => { field.value = ''; });
      maybeRequestName();
    }
  }
  button?.addEventListener('click', () => {
    if (recovery) return openAuth('recovery');
    if (!currentUser) return openAuth();
    if (!currentUser.firstName) return openAuth('name');
    menu.hidden = !menu.hidden; button.setAttribute('aria-expanded', String(!menu.hidden));
  });
  authView?.querySelectorAll('[data-auth-mode]').forEach(control => control.addEventListener('click', () => setMode(control.dataset.authMode)));
  loginForm?.addEventListener('submit', event => {
    event.preventDefault(); const data = new FormData(loginForm);
    run(loginForm, async () => { await login({ email: data.get('email'), password: data.get('password') }); loginForm.reset(); dialog.close(); });
  });
  registerForm?.addEventListener('submit', event => {
    event.preventDefault(); const data = new FormData(registerForm);
    if (data.get('password') !== data.get('passwordRepeat')) { message.textContent = 'პაროლები ერთმანეთს არ ემთხვევა.'; return; }
    run(registerForm, async () => {
      const result = await register({ firstName: data.get('firstName'), lastName: data.get('lastName'), email: data.get('email'), password: data.get('password') }); registerForm.reset();
      if (result.confirmationRequired) { setMode('login'); loginForm.elements.email.value = data.get('email'); message.textContent = 'თუ რეგისტრაცია შესაძლებელია, ელფოსტაზე მიიღებთ დადასტურების ბმულს. შეამოწმეთ შემომავალი წერილები.'; }
      else dialog.close();
    });
  });
  forgot?.addEventListener('click', () => { setMode('reset'); resetForm.elements.email.value = loginForm.elements.email.value; });
  resetForm?.addEventListener('submit', event => {
    event.preventDefault(); run(resetForm, async () => { await requestPasswordReset(new FormData(resetForm).get('email')); message.textContent = 'თუ ამ ელფოსტით ანგარიში არსებობს, მიიღებთ პაროლის აღდგენის ბმულს.'; });
  });
  passwordForm?.addEventListener('submit', event => {
    event.preventDefault(); const data = new FormData(passwordForm);
    if (data.get('password') !== data.get('passwordRepeat')) { message.textContent = 'პაროლები ერთმანეთს არ ემთხვევა.'; return; }
    run(passwordForm, async () => { await changePassword(data.get('password')); openAuth('login'); message.textContent = 'პაროლი წარმატებით შეიცვალა. შეგიძლიათ გააგრძელოთ შეძენა.'; });
  });
  async function action(event) {
    const control = event.target.closest('[data-account-action]');
    if (!control || control.disabled) return;
    closeMenu();
    if (control.dataset.accountAction === 'logout') {
      try { await logout(); dialog?.close(); } catch (error) { openAuth(); message.textContent = error.message; }
    } else showAccountSection(control.dataset.accountAction);
  }
  menu?.addEventListener('click', action); detailsView?.addEventListener('click', action);
  dialog?.querySelector('.account-close').addEventListener('click', () => dialog.close());
  document.getElementById('accountBackButton')?.addEventListener('click', () => dialog.close());
  dialog?.addEventListener('close', () => dialog.querySelectorAll('input[type="password"]').forEach(field => { field.value = ''; }));
  document.addEventListener('click', event => { if (menu && !menu.contains(event.target) && !button.contains(event.target)) closeMenu(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });
  document.getElementById('checkoutForm')?.addEventListener('reset', () => window.setTimeout(prefillCheckout, 0));
  window.addEventListener('movio:order-created', () => { if (currentUser && detailsView && !detailsView.hidden && activeSection === 'orders') showAccountSection('orders'); });
  renderHeader();
  if (client?.auth) {
    // No async SDK calls within the synchronous auth event callback (session lock).
    client.auth.onAuthStateChange((event, session) => {
      eventSeen = true; updateUser(session?.user || null);
      if ((event === 'PASSWORD_RECOVERY' || recoveryHint) && session?.user) { recovery = true; window.setTimeout(() => { if (recovery) openAuth('recovery'); }, 0); }
      if (event === 'SIGNED_OUT') recovery = recoveryHint = false;
    });
    client.auth.getSession().then(({ data, error }) => {
      if (!error && !eventSeen) updateUser(data.session?.user || null);
      if (recoveryHint) {
        if (currentUser) { recovery = true; openAuth('recovery'); }
        else { openAuth('reset'); message.textContent = 'აღდგენის ბმული არასწორია ან ვადა ამოიწურა. მოითხოვეთ ახალი ბმული.'; }
      }
      if (new URLSearchParams(location.search).get('account') === 'confirmed') currentUser ? showAccountSection('profile') : openAuth();
    }).catch(() => { /* Auth failure never blocks guest shopping. */ });
  }
})();
