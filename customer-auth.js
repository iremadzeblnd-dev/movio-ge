(function () {
  const USERS_KEY = "movio-customer-users-v1";
  const SESSION_KEY = "movio-customer-session-v1";
  const encoder = new TextEncoder();

  function normalizeEmail(email) {
    return String(email || "").trim().toLocaleLowerCase("en-US");
  }

  function readUsers() {
    try {
      const users = JSON.parse(localStorage.getItem(USERS_KEY) || "[]");
      return Array.isArray(users) ? users : [];
    } catch (error) {
      return [];
    }
  }

  function getCurrentUser() {
    try {
      const session = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
      if (!session?.email) return null;
      const user = readUsers().find((entry) => entry.email === session.email);
      return user ? { name: user.name, email: user.email } : null;
    } catch (error) {
      return null;
    }
  }

  function bytesToHex(bytes) {
    return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  function hexToBytes(hex) {
    return new Uint8Array(hex.match(/.{1,2}/g).map((part) => Number.parseInt(part, 16)));
  }

  async function hashPassword(password, salt) {
    if (!window.crypto?.subtle) throw new Error("ამ ბრაუზერში უსაფრთხო ავტორიზაცია მიუწვდომელია.");
    const key = await window.crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await window.crypto.subtle.deriveBits({ name: "PBKDF2", salt: hexToBytes(salt), iterations: 120000, hash: "SHA-256" }, key, 256);
    return bytesToHex(new Uint8Array(bits));
  }

  async function register({ name, email, password }) {
    const normalizedEmail = normalizeEmail(email);
    const cleanName = String(name || "").trim();
    const users = readUsers();
    if (!cleanName) throw new Error("სახელი აუცილებელია.");
    if (users.some((user) => user.email === normalizedEmail)) throw new Error("ამ ელფოსტით ანგარიში უკვე არსებობს.");
    const salt = bytesToHex(window.crypto.getRandomValues(new Uint8Array(16)));
    const passwordHash = await hashPassword(password, salt);
    const user = { name: cleanName, email: normalizedEmail, salt, passwordHash, createdAt: new Date().toISOString() };
    users.push(user);
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
    localStorage.setItem(SESSION_KEY, JSON.stringify({ email: normalizedEmail }));
    return { name: user.name, email: user.email };
  }

  async function login({ email, password }) {
    const normalizedEmail = normalizeEmail(email);
    const user = readUsers().find((entry) => entry.email === normalizedEmail);
    if (!user) throw new Error("ელფოსტა ან პაროლი არასწორია.");
    const passwordHash = await hashPassword(password, user.salt);
    if (passwordHash !== user.passwordHash) throw new Error("ელფოსტა ან პაროლი არასწორია.");
    localStorage.setItem(SESSION_KEY, JSON.stringify({ email: normalizedEmail }));
    return { name: user.name, email: user.email };
  }

  function logout() {
    localStorage.removeItem(SESSION_KEY);
  }

  function getOrders() {
    const user = getCurrentUser();
    if (!user || !window.MovioStore) return [];
    return window.MovioStore.getOrders().filter((order) => normalizeEmail(order.customerEmail) === user.email);
  }

  window.MovioCustomerAuth = { getCurrentUser, register, login, logout, getOrders };

  const accountButton = document.querySelector("#accountButton");
  const accountLabel = document.querySelector("#accountLabel");
  const accountMenu = document.querySelector("#accountMenu");
  const dialog = document.querySelector("#accountDialog");
  const authView = document.querySelector("#accountAuthView");
  const detailsView = document.querySelector("#accountDetailsView");
  const loginForm = document.querySelector("#customerLoginForm");
  const registerForm = document.querySelector("#customerRegisterForm");
  const authMessage = document.querySelector("#authMessage");
  const forgotPasswordButton = document.querySelector("#forgotPasswordButton");

  function renderHeader() {
    const user = getCurrentUser();
    accountLabel.textContent = user ? user.name.trim().split(/\s+/)[0] : "შესვლა";
    accountButton.setAttribute("aria-label", user ? `ანგარიში: ${user.name}` : "შესვლა");
    accountButton.title = user ? user.name : "შესვლა";
  }

  function setAuthMode(mode) {
    const isRegister = mode === "register";
    loginForm.hidden = isRegister;
    registerForm.hidden = !isRegister;
    forgotPasswordButton.hidden = isRegister;
    authMessage.textContent = "";
    document.querySelectorAll("[data-auth-mode]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.authMode === mode));
    });
  }

  function openAuth(mode = "login") {
    authView.hidden = false;
    detailsView.hidden = true;
    setAuthMode(mode);
    if (!dialog.open) dialog.showModal();
  }

  function showAccountSection(section) {
    const user = getCurrentUser();
    if (!user) return openAuth("login");
    authView.hidden = true;
    detailsView.hidden = false;
    document.querySelector("#accountGreeting").textContent = user.name;
    const profilePanel = document.querySelector("#accountProfilePanel");
    const ordersPanel = document.querySelector("#accountOrdersPanel");
    profilePanel.replaceChildren();
    ordersPanel.replaceChildren();
    profilePanel.hidden = section !== "profile";
    ordersPanel.hidden = section !== "orders";

    if (section === "profile") {
      profilePanel.appendChild(document.createElement("h3")).textContent = "ჩემი პროფილი";
      profilePanel.appendChild(document.createElement("p")).textContent = `სახელი: ${user.name}`;
      profilePanel.appendChild(document.createElement("p")).textContent = `ელფოსტა: ${user.email}`;
    } else {
      ordersPanel.appendChild(document.createElement("h3")).textContent = "ჩემი შეკვეთები";
      const orders = getOrders();
      if (!orders.length) {
        ordersPanel.appendChild(document.createElement("p")).textContent = "შეკვეთები ჯერ არ არის.";
      } else {
        orders.forEach((order) => {
          const row = document.createElement("article");
          row.className = "account-order";
          const title = document.createElement("strong");
          title.textContent = order.number;
          const summary = document.createElement("span");
          summary.textContent = `${new Intl.DateTimeFormat("ka-GE", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(order.createdAt))} · ${new Intl.NumberFormat("ka-GE").format(order.total)} ₾`;
          row.append(title, summary);
          ordersPanel.appendChild(row);
        });
      }
    }
    if (!dialog.open) dialog.showModal();
  }

  accountButton.addEventListener("click", () => {
    if (!getCurrentUser()) return openAuth("login");
    accountMenu.hidden = !accountMenu.hidden;
    accountButton.setAttribute("aria-expanded", String(!accountMenu.hidden));
  });

  document.querySelectorAll("[data-auth-mode]").forEach((button) => {
    button.addEventListener("click", () => setAuthMode(button.dataset.authMode));
  });

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    authMessage.textContent = "იტვირთება...";
    const data = new FormData(loginForm);
    try {
      await login({ email: data.get("email"), password: data.get("password") });
      loginForm.reset();
      renderHeader();
      dialog.close();
      authMessage.textContent = "";
    } catch (error) {
      authMessage.textContent = error.message || "შესვლა ვერ მოხერხდა.";
    }
  });

  registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(registerForm);
    if (data.get("password") !== data.get("passwordRepeat")) {
      authMessage.textContent = "პაროლები ერთმანეთს არ ემთხვევა.";
      return;
    }
    authMessage.textContent = "იტვირთება...";
    try {
      await register({ name: data.get("name"), email: data.get("email"), password: data.get("password") });
      registerForm.reset();
      renderHeader();
      dialog.close();
      authMessage.textContent = "";
    } catch (error) {
      authMessage.textContent = error.message || "რეგისტრაცია ვერ მოხერხდა.";
    }
  });

  forgotPasswordButton.addEventListener("click", () => {
    authMessage.textContent = "პაროლის აღდგენა დემო რეჟიმში მიუწვდომელია.";
  });

  accountMenu.addEventListener("click", (event) => {
    const action = event.target.closest("[data-account-action]")?.dataset.accountAction;
    if (!action) return;
    accountMenu.hidden = true;
    accountButton.setAttribute("aria-expanded", "false");
    if (action === "logout") {
      logout();
      renderHeader();
      return;
    }
    showAccountSection(action);
  });

  document.querySelector(".account-close").addEventListener("click", () => dialog.close());
  document.querySelector("#accountBackButton").addEventListener("click", () => dialog.close());

  document.addEventListener("click", (event) => {
    if (accountMenu.hidden || accountMenu.contains(event.target) || accountButton.contains(event.target)) return;
    accountMenu.hidden = true;
    accountButton.setAttribute("aria-expanded", "false");
  });

  window.addEventListener("storage", (event) => {
    if (event.key === SESSION_KEY || event.key === USERS_KEY) renderHeader();
  });

  renderHeader();
})();
