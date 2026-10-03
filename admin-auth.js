const client = window.movioSupabase;

const loginPanel = document.getElementById("loginPanel");
const adminPanel = document.getElementById("adminPanel");
const loginForm = document.getElementById("adminLoginForm");
const loginMessage = document.getElementById("loginMessage");
const logoutButton = document.getElementById("adminLogout");

function showLogin() {
  loginPanel.hidden = false;
  adminPanel.hidden = true;
}

function showAdmin() {
  loginPanel.hidden = true;
  adminPanel.hidden = false;
}

async function checkSession() {
  const { data } = await client.auth.getSession();

  if (data.session) {
    showAdmin();
  } else {
    showLogin();
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  loginMessage.textContent = "მოწმდება...";

  const email = document.getElementById("adminEmail").value.trim();
  const password = document.getElementById("adminPassword").value;

  const { error } = await client.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    loginMessage.textContent = "ელფოსტა ან პაროლი არასწორია.";
    return;
  }

  loginMessage.textContent = "";
  showAdmin();
});

logoutButton.addEventListener("click", async () => {
  await client.auth.signOut();
  showLogin();
});

client.auth.onAuthStateChange((_event, session) => {
  if (session) showAdmin();
  else showLogin();
});

checkSession();
