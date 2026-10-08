(function () {
  let config, widget, configPromise;
  const client = () => window.movioSupabase;
  async function configure() {
    if (config) return config;
    if (configPromise) return configPromise;
    configPromise = (async () => {
      const response = await fetch('/api/orders', { cache: 'no-store' });
      if (!response.ok) throw Error('შეკვეთის გაფორმება დროებით მიუწვდომელია. კალათა შენახულია.');
      const settings = await response.json();
      if (!settings.siteKey || settings.deliveryRule !== 'weight_tariff_v1') throw Error('შეკვეთა დროებით მიუწვდომელია.');
      config = settings;
      return config;
    })().catch(error => { configPromise = null; throw error; });
    return configPromise;
  }
  async function prepare() {
    const settings = await configure();
    if (!window.turnstile) await new Promise((resolve, reject) => {
      let script = document.getElementById('movio-turnstile-script');
      if (!script) {
        script = document.createElement('script'); script.id = 'movio-turnstile-script';
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.onload = resolve; script.onerror = () => { script.remove(); reject(Error('უსაფრთხოების შემოწმება ვერ ჩაიტვირთა. სცადეთ ხელახლა.')); };
        document.head.append(script);
      } else {
        script.addEventListener('load', resolve, { once: true });
        script.addEventListener('error', () => reject(Error('უსაფრთხოების შემოწმება ვერ ჩაიტვირთა.')), { once: true });
      }
    });
    if (widget === undefined) widget = window.turnstile.render('#checkoutVerification', {
      sitekey: settings.siteKey, action: 'checkout', theme: 'dark', size: 'flexible',
    });
    return settings;
  }
  async function createOrder(input, pending) {
    await prepare();
    const turnstileToken = window.turnstile.getResponse(widget);
    if (!turnstileToken) throw Error('გაიარეთ უსაფრთხოების შემოწმება და დაადასტურეთ შეკვეთა.');
    if (!client()?.auth) throw Error('შეკვეთის სერვისი დროებით მიუწვდომელია.');
    const { data, error } = await client().auth.getSession();
    if (error) throw Error('სესიის შემოწმება ვერ მოხერხდა. სცადეთ ხელახლა.');
    if (Object.prototype.hasOwnProperty.call(pending, 'userId') && pending.userId !== (data.session?.user?.id || null)) {
      throw Error('შეკვეთის აღსადგენად გამოიყენეთ თავდაპირველი ანგარიში ან სტუმრის სესია.');
    }
    const headers = { 'Content-Type': 'application/json' };
    if (data.session?.access_token) headers.Authorization = `Bearer ${data.session.access_token}`;
    // Legacy saved requests lack this flag and may already have committed.
    const wasUncertain = pending.outcomeUncertain !== false;
    // Persist before sending, so reloads during a request are also recoverable.
    pending.outcomeUncertain = true;
    try { sessionStorage.setItem('movio-pending-checkout', JSON.stringify(pending)); }
    catch { throw Error('ჩართეთ ბრაუზერის სესიის შენახვა შეკვეთის უსაფრთხოდ გასაფორმებლად.'); }
    try {
      const response = await fetch('/api/orders', { method: 'POST', headers,
        body: JSON.stringify({ ...(pending.input || input), checkoutToken: pending.token,
          deliveryRule: 'weight_tariff_v1', turnstileToken }) });
      const result = await response.json();
      if (!response.ok) {
        const error = Error(result.error || 'შეკვეთა ვერ შეიქმნა. კალათა შენახულია.');
        // A rejection of this attempt cannot disprove an earlier commit.
        error.definitive = !wasUncertain && [400,401,403,409,413,415].includes(response.status);
        if (error.definitive) {
          pending.outcomeUncertain = false;
          sessionStorage.setItem('movio-pending-checkout', JSON.stringify(pending));
        }
        throw error;
      }
      if (!result.id || !/^MOVIO-\d+$/.test(result.number)
        || ![result.subtotal,result.deliveryCost,result.total].every(value => typeof value === 'number' && Number.isFinite(value) && value >= 0)
        || Math.abs(result.total-result.subtotal-result.deliveryCost) > 0.001) {
        throw Error('შეკვეთის პასუხი ვერ დადასტურდა. კალათა შენახულია. სცადეთ ხელახლა.');
      }
      return result;
    } finally { window.turnstile.reset(widget); }
  }
  window.MovioOrders = { prepare, createOrder };
})();
