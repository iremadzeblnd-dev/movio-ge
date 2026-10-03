const PORT = 9224;
const ROOT = "http://127.0.0.1:4173/";
const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 13_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.1 Mobile/15E148 Safari/604.1";
const version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
const browser = new WebSocket(version.webSocketDebuggerUrl);
let id = 1;
const browserPending = new Map();
await new Promise((resolve, reject) => {
  browser.addEventListener("open", resolve, { once: true });
  browser.addEventListener("error", reject, { once: true });
});
browser.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  const pending = browserPending.get(message.id);
  if (!pending) return;
  browserPending.delete(message.id);
  message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result);
});
function browserCommand(method, params = {}) {
  const commandId = id++;
  browser.send(JSON.stringify({ id: commandId, method, params }));
  return new Promise((resolve, reject) => browserPending.set(commandId, { resolve, reject }));
}
const { targetId } = await browserCommand("Target.createTarget", { url: "about:blank" });
const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = new WebSocket(targets.find((target) => target.id === targetId).webSocketDebuggerUrl);
const pagePending = new Map();
const errors = [];
const responses = [];
await new Promise((resolve, reject) => {
  page.addEventListener("open", resolve, { once: true });
  page.addEventListener("error", reject, { once: true });
});
page.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pagePending.has(message.id)) {
    const pending = pagePending.get(message.id);
    pagePending.delete(message.id);
    message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result);
    return;
  }
  if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails.text);
  if (message.method === "Log.entryAdded" && message.params.entry.level === "error") errors.push(message.params.entry.text);
  if (message.method === "Network.responseReceived" && message.params.response.url.startsWith(ROOT)) {
    responses.push({ url: message.params.response.url, status: message.params.response.status });
  }
});
function command(method, params = {}) {
  const commandId = id++;
  page.send(JSON.stringify({ id: commandId, method, params }));
  return new Promise((resolve, reject) => pagePending.set(commandId, { resolve, reject }));
}
async function evaluate(expression) {
  const result = await command("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}
async function navigate(path) {
  await command("Page.navigate", { url: `${ROOT}${path}` });
  for (let attempt = 0; attempt < 50; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    try {
      if (await evaluate("document.readyState === 'complete'")) return;
    } catch {}
  }
  throw new Error(`Timed out: ${path}`);
}
await command("Page.enable");
await command("Runtime.enable");
await command("Log.enable");
await command("Network.enable");
await command("Page.addScriptToEvaluateOnNewDocument", {
  source: `
    window.URLSearchParams = undefined;
    Element.prototype.replaceChildren = undefined;
    Element.prototype.toggleAttribute = undefined;
  `,
});
await command("Network.setUserAgentOverride", { userAgent: IPHONE_UA, platform: "iPhone" });
await command("Emulation.setDeviceMetricsOverride", {
  width: 375,
  height: 812,
  deviceScaleFactor: 3,
  mobile: true,
  screenWidth: 375,
  screenHeight: 812,
});
const states = {};
for (const path of ["index.html", "electric-scooters.html"]) {
  await navigate(path);
  states[path] = await evaluate(`(() => {
    const main = document.querySelector('main');
    const heading = document.querySelector('h1');
    const logo = document.querySelector('.wordmark');
    const mainStyle = getComputedStyle(main);
    const headingStyle = getComputedStyle(heading);
    const mainRect = main.getBoundingClientRect();
    const headingRect = heading.getBoundingClientRect();
    const logoRect = logo.getBoundingClientRect();
    return {
      ready: document.readyState,
      title: document.title,
      bodyTextLength: document.body.innerText.trim().length,
      bodyBackground: getComputedStyle(document.body).backgroundColor,
      mainDisplay: mainStyle.display,
      mainVisibility: mainStyle.visibility,
      mainOpacity: mainStyle.opacity,
      mainRect: { x: mainRect.x, y: mainRect.y, width: mainRect.width, height: mainRect.height },
      headingText: heading.textContent.trim(),
      headingColor: headingStyle.color,
      headingRect: { x: headingRect.x, y: headingRect.y, width: headingRect.width, height: headingRect.height },
      logoRect: { x: logoRect.x, y: logoRect.y, width: logoRect.width, height: logoRect.height },
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  })()`);
}
await navigate("index.html");
await evaluate(`document.querySelector('.menu-toggle').click()`);
const menuState = await evaluate(`({
  expanded: document.querySelector('.menu-toggle').getAttribute('aria-expanded'),
  className: document.querySelector('.site-nav').className,
  visible: getComputedStyle(document.querySelector('.site-nav')).visibility,
  opacity: getComputedStyle(document.querySelector('.site-nav')).opacity,
  mainInert: document.querySelector('main').hasAttribute('inert'),
})`);
await evaluate(`document.querySelector('.menu-toggle').click()`);
await evaluate(`document.querySelector('.search-toggle').click()`);
await new Promise((resolve) => setTimeout(resolve, 80));
await evaluate(`(() => {
  const input = document.querySelector('#site-search');
  input.value = 'კვად';
  input.dispatchEvent(new Event('input', { bubbles: true }));
})()`);
const searchState = await evaluate(`({
  focused: document.activeElement === document.querySelector('#site-search'),
  resultHref: document.querySelector('.search-result-link')?.getAttribute('href'),
})`);
await evaluate(`localStorage.removeItem('movio-cart'); location.reload()`);
for (let attempt = 0; attempt < 50; attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 50));
  try {
    if (await evaluate("document.readyState === 'complete'")) break;
  } catch {}
}
await evaluate(`document.querySelector('.add-to-cart').click()`);
const cartState = await evaluate(`({
  count: document.querySelector('.cart-count').textContent,
  hash: location.hash,
  rows: document.querySelectorAll('.cart-item').length,
})`);
await navigate("item.html?item=quad-bikes");
const legacyState = await evaluate(`({ path: location.pathname, heading: document.querySelector('h1')?.textContent.trim() })`);
console.log(JSON.stringify({ states, menuState, searchState, cartState, legacyState, errors, responses }, null, 2));
await browserCommand("Target.closeTarget", { targetId });
page.close();
browser.close();
