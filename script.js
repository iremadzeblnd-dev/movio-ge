const pageMain = document.querySelector("main");
const pageFooter = document.querySelector("footer");
const searchPanel = document.querySelector(".header-search");
const searchForm = document.querySelector(".search-form");
const searchInput = document.querySelector("#site-search");
const searchMessage = document.querySelector(".search-message");
const searchResults = document.querySelector(".search-results");
let activeCategoryFilter = new URLSearchParams(window.location.search).get("category") || "";

const CATEGORY_LABELS = {
  "electric-scooters": "ელექტრო სკუტერები",
  "electric-bikes": "ელექტრო ველოსიპედები",
  "quad-bikes": "კვადრო ციკლები",
  "car-accessories": "მანქანის აქსესუარები",
};

function getProduct(productId) {
  const savedProduct = window.MovioStore.getProducts().find((product) => product.id === productId);
  if (!savedProduct || savedProduct.active === false) return null;

  return {
    ...savedProduct,
    categoryKey: savedProduct.category,
    category: CATEGORY_LABELS[savedProduct.category] || savedProduct.category,
    imageAlt: savedProduct.name,
  };
}

function formatPrice(amount) {
  return `${new Intl.NumberFormat("ka-GE", { maximumFractionDigits: 2 }).format(amount)} ₾`;
}

function setStockStatusClass(element, product) {
  const isAvailable = window.MovioStore.getStockLabel(product) === "მარაგშია";
  element.classList.toggle("stock-available", isAvailable);
  element.classList.toggle("stock-unavailable", !isAvailable);
}

function syncDiscountBadge(media, product) {
  media?.querySelectorAll(".product-discount").forEach((badge) => badge.remove());
  if (!media || product.discountVisible !== true) return;
  const badge = document.createElement("span");
  badge.className = "product-discount";
  badge.textContent = `-${Number(product.discountPercent ?? 0)}%`;
  media.prepend(badge);
}

function setProductButtonState(button, product) {
  button.disabled = product.stock < 1;
  const label = button.querySelector(".add-label");
  if (label) label.textContent = product.stock ? "კალათაში" : "ამოიწურა";
  else button.textContent = product.stock ? "კალათაში" : "ამოიწურა";
}

class CartStore {
  constructor() {
    this.items = this.load();
  }

  load() {
    try {
      const savedItems = JSON.parse(localStorage.getItem(CartStore.storageKey) || "[]");

      if (!Array.isArray(savedItems)) return [];

      const products = new Map(window.MovioStore.getProducts().map((product) => [product.id, product]));
      return savedItems
        .filter((item) => products.has(item.id) && products.get(item.id).active !== false && products.get(item.id).stock > 0 && window.MovioStore.getStockLabel(products.get(item.id)) === "მარაგშია" && Number.isInteger(item.quantity) && item.quantity > 0)
        .map((item) => ({ id: item.id, quantity: Math.min(item.quantity, products.get(item.id).stock, 99) }));
    } catch (error) {
      return [];
    }
  }

  save() {
    try {
      localStorage.setItem(CartStore.storageKey, JSON.stringify(this.items));
    } catch (error) {
      // The cart still works for this visit when browser storage is unavailable.
    }
  }

  add(productId) {
    const product = getProduct(productId);
    if (!product || product.stock < 1 || window.MovioStore.getStockLabel(product) !== "მარაგშია") return;

    const existingItem = this.items.find((item) => item.id === productId);

    if (existingItem) {
      existingItem.quantity = Math.min(existingItem.quantity + 1, product.stock, 99);
    } else {
      this.items.push({ id: productId, quantity: 1 });
    }

    this.save();
  }

  setQuantity(productId, quantity) {
    const item = this.items.find((cartItem) => cartItem.id === productId);
    if (!item) return;
    const product = getProduct(productId);
    if (!product || product.stock < 1 || window.MovioStore.getStockLabel(product) !== "მარაგშია") {
      this.remove(productId);
      return;
    }

    if (quantity < 1) {
      this.remove(productId);
      return;
    }

    item.quantity = Math.min(quantity, product.stock, 99);
    this.save();
  }

  remove(productId) {
    this.items = this.items.filter((item) => item.id !== productId);
    this.save();
  }

  clear() {
    this.items = [];
    this.save();
  }

  get itemCount() {
    return this.items.reduce((total, item) => total + item.quantity, 0);
  }

}

CartStore.storageKey = "movio-cart";

const cartStore = new CartStore();
const cartSection = document.querySelector("#cart");
const cartItems = document.querySelector("[data-cart-items]");
const cartEmpty = document.querySelector("[data-cart-empty]");
const cartCount = document.querySelector(".cart-count");
const cartLink = document.querySelector(".header-cart-link");
const cartHeadingCount = document.querySelector(".cart-heading-count");
const cartSubtotal = document.querySelector("[data-cart-subtotal]");
const cartTotal = document.querySelector("[data-cart-total]");
const cartStatus = document.querySelector(".cart-status");

function replaceContent(element, nodes) {
  while (element.firstChild) element.removeChild(element.firstChild);
  nodes.forEach((node) => element.appendChild(node));
}

function createTextElement(tagName, className, text) {
  const node = document.createElement(tagName);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function createCartIcon() {
  const namespace = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(namespace, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(namespace, "path");
  path.setAttribute("d", "M3 4h2l2.1 9.2a2 2 0 0 0 2 1.6h7.8a2 2 0 0 0 2-1.6L20 7H6");
  svg.appendChild(path);
  [[10, 19], [17, 19]].forEach(([cx, cy]) => {
    const wheel = document.createElementNS(namespace, "circle");
    wheel.setAttribute("cx", cx);
    wheel.setAttribute("cy", cy);
    wheel.setAttribute("r", "1.4");
    svg.appendChild(wheel);
  });
  return svg;
}

function focusWithoutScroll(element) {
  if (!element) return;

  try {
    element.focus({ preventScroll: true });
  } catch (error) {
    element.focus();
  }
}

function setInert(element, isInert) {
  if (isInert) element.setAttribute("inert", "");
  else element.removeAttribute("inert");
}

function createCartItem(cartItem) {
  const product = getProduct(cartItem.id);
  if (!product) return document.createElement("li");
  const item = document.createElement("li");
  item.className = "cart-item";
  item.dataset.productId = product.id;
  const modernCart = document.body.classList.contains("cart-page");
  const detailUrl = `item.html?item=${encodeURIComponent(product.id)}`;

  const media = document.createElement(modernCart ? "a" : "div");
  media.className = "cart-item-media";
  if (modernCart) {
    media.href = detailUrl;
    media.setAttribute("aria-label", product.name);
  }
  if (product.image) {
    const image = document.createElement("img");
    image.src = product.image;
    image.alt = product.name;
    media.appendChild(image);
  } else {
    const mark = document.createElement("span");
    mark.textContent = product.mark || "M";
    media.appendChild(mark);
  }

  const copy = document.createElement("div");
  copy.className = "cart-item-copy";
  const category = document.createElement("span");
  category.textContent = product.category;
  const name = document.createElement("h3");
  if (modernCart) {
    const link = document.createElement("a");
    link.href = detailUrl;
    link.textContent = product.name;
    name.append(link);
  } else name.textContent = product.name;
  const remove = document.createElement("button");
  remove.className = "cart-remove";
  remove.type = "button";
  remove.dataset.cartAction = "remove";
  remove.textContent = "წაშლა";
  remove.setAttribute("aria-label", `${product.name} — წაშლა`);
  if (modernCart) {
    const pricing = document.createElement("div");
    pricing.className = "cart-unit-pricing";
    const current = document.createElement("strong");
    current.textContent = formatPrice(product.price);
    pricing.append(current);
    if (product.oldPriceVisible !== false && Number(product.oldPrice) > 0) {
      const old = document.createElement("del");
      old.textContent = formatPrice(product.oldPrice);
      pricing.append(old);
    }
    copy.append(name, pricing);
  } else copy.append(category, name, remove);

  const quantity = document.createElement("div");
  quantity.className = "quantity-control";
  quantity.setAttribute("aria-label", `${product.name} რაოდენობა`);
  [["decrease", "−", "რაოდენობის შემცირება"], ["increase", "+", "რაოდენობის გაზრდა"]].forEach(([action, label, ariaLabel], index) => {
    const control = document.createElement(index === 0 ? "button" : "output");
    if (index !== 1) {
      control.type = "button";
      control.dataset.cartAction = action;
      control.setAttribute("aria-label", ariaLabel);
      control.textContent = label;
    } else {
      control.setAttribute("aria-live", "polite");
      control.textContent = cartItem.quantity;
    }
    quantity.appendChild(control);
  });
  const increase = document.createElement("button");
  increase.type = "button";
  increase.dataset.cartAction = "increase";
  increase.setAttribute("aria-label", "რაოდენობის გაზრდა");
  increase.textContent = "+";
  increase.disabled = cartItem.quantity >= Math.min(Number(product.stock), 99);
  quantity.appendChild(increase);

  const price = document.createElement("span");
  price.className = "cart-item-price";
  price.textContent = `${formatPrice(product.price)} × ${cartItem.quantity} = ${formatPrice(product.price * cartItem.quantity)}`;
  if (modernCart) {
    price.textContent = formatPrice(product.price * cartItem.quantity);
    price.setAttribute("aria-label", "პროდუქტის ჯამური ფასი");
    const controls = document.createElement("div");
    controls.className = "cart-item-controls";
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("aria-hidden", "true");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7M14 10v7");
    icon.append(path);
    remove.replaceChildren(icon);
    controls.append(quantity, remove);
    item.append(media, copy, controls);
  } else item.append(media, copy, quantity, price);

  return item;
}

function renderCart() {
  const hasItems = cartStore.items.length > 0;
  const itemCount = cartStore.itemCount;

  replaceContent(cartItems, cartStore.items.map(createCartItem));
  cartItems.hidden = !hasItems;
  cartEmpty.hidden = hasItems;
  cartCount.textContent = itemCount;
  cartCount.classList.toggle("has-items", hasItems);
  cartLink.setAttribute("aria-label", `კალათა, ${itemCount} პროდუქტი`);
  cartHeadingCount.textContent = hasItems ? `${itemCount} პროდუქტი კალათაში` : "კალათა ცარიელია";
  const subtotal = cartStore.items.reduce((total, item) => {
    const product = getProduct(item.id);
    return total + (product ? product.price * item.quantity : 0);
  }, 0);
  cartSubtotal.textContent = formatPrice(subtotal);
  cartTotal.textContent = formatPrice(subtotal);
  const checkoutForm = document.querySelector("#checkoutForm");
  if (checkoutForm) checkoutForm.hidden = !hasItems;
  const demoCheckoutButton = document.querySelector("#demoCheckoutButton");
  if (demoCheckoutButton) {
    const localDemoHost = ["localhost", "127.0.0.1"].includes(window.location.hostname);
    const paymentUnavailable = document.documentElement.dataset.paymentAvailable !== "true";
    demoCheckoutButton.hidden = !localDemoHost || !hasItems || !paymentUnavailable || typeof window.MovioStore?.createOrder !== "function";
  }
}

function goToCart(productName) {
  cartStatus.textContent = `${productName} დაემატა კალათაში.`;

  window.location.href = "cart.html";
}

function renderProductCard(article, product) {
  article.classList.add("compact-product-card");
  article.removeAttribute("tabindex");
  const existingArt = article.querySelector(".placeholder-art")?.cloneNode(true);
  const copy = createTextElement("div", "category-detail-copy");
  const title = document.createElement("h3");
  title.id = `${article.id}-title`;
  article.setAttribute("aria-labelledby", title.id);
  const link = createTextElement("a", "product-card-link", product.name);
  link.href = `item.html?item=${encodeURIComponent(product.id)}`;
  title.appendChild(link);
  const price = createTextElement("span", "product-price-label", formatPrice(product.price));
  const actions = createTextElement("div", "product-actions");
  const buy = createTextElement("button", "add-to-cart product-buy");
  buy.type = "button";
  buy.dataset.productId = product.id;
  buy.appendChild(createTextElement("span", "add-label", "ყიდვა"));
  buy.disabled = Number(product.stock) < 1 || window.MovioStore.getStockLabel(product) !== "მარაგშია";
  const cart = createTextElement("button", "add-to-cart product-cart");
  cart.type = "button";
  cart.dataset.productId = product.id;
  cart.setAttribute("aria-label", `${product.name}: \u10d9\u10d0\u10da\u10d0\u10d7\u10d0\u10e8\u10d8 \u10d3\u10d0\u10db\u10d0\u10e2\u10d4\u10d1\u10d0`);
  cart.disabled = buy.disabled;
  const icon = createTextElement("span", "add-icon");
  icon.setAttribute("aria-hidden", "true");
  icon.appendChild(createCartIcon());
  cart.appendChild(icon);
  actions.append(buy, cart);
  copy.append(title, price, actions);
  const media = createTextElement("div", "product-media");
  if (product.image) {
    const image = document.createElement("img");
    image.src = product.image;
    image.alt = product.name;
    image.loading = "lazy";
    image.decoding = "async";
    media.appendChild(image);
  } else if (existingArt) {
    media.classList.add("product-media--art");
    media.appendChild(existingArt);
  } else {
    media.appendChild(createTextElement("span", "product-no-image", "MOVIO"));
  }
  syncDiscountBadge(media, product);
  article.replaceChildren(media, copy);
}

function renderManagedProducts() {
  const mount = document.querySelector("[data-managed-products]");
  if (!mount) return;
  const customProducts = window.MovioStore.getProducts().filter((product) => product.active !== false);
  const articles = customProducts.map((product) => {
    const article = document.createElement("article");
    article.className = "category-detail managed-product";
    article.id = `managed-${product.id}`;
    renderProductCard(article, product);
    return article;
  });
  replaceContent(mount, articles);
}

function syncCatalogProducts() {
  renderManagedProducts();
  applyCatalogFilter(activeCategoryFilter);
}


function getProductCategoryKey(product) {
  const raw = String(product?.category || product?.categoryKey || "")
    .trim()
    .toLocaleLowerCase("ka-GE");

  // კვადრო აუცილებლად შემოწმდეს ველოზე ადრე,
  // რადგან "quad-bikes"-შიც არის სიტყვა "bike"
  if (
    raw === "quad-bikes" ||
    raw.includes("quad") ||
    raw.includes("atv") ||
    raw.includes("კვად")
  ) {
    return "quad-bikes";
  }

  if (
    raw === "electric-scooters" ||
    raw.includes("scooter") ||
    raw.includes("სკუტ")
  ) {
    return "electric-scooters";
  }

  if (
    raw === "electric-bikes" ||
    raw.includes("bicycle") ||
    raw.includes("ველო") ||
    raw.includes("ველოსიპ")
  ) {
    return "electric-bikes";
  }

  if (
    raw === "car-accessories" ||
    raw.includes("accessor") ||
    raw.includes("აქსესუარ")
  ) {
    return "car-accessories";
  }

  return raw;
}
function applyCatalogFilter(categoryKey) {
  document.querySelectorAll("[data-category-filter]").forEach((card) => {
    card.classList.toggle(
      "category-active",
      Boolean(categoryKey) && card.dataset.categoryFilter === categoryKey
    );
  });
  activeCategoryFilter = categoryKey || "";
  const cards = document.querySelectorAll("#catalog .product-grid .category-detail");
  let visibleCount = 0;
  cards.forEach((card) => {
    const productButton = card.querySelector(".add-to-cart[data-product-id]");
    const product = productButton ? getProduct(productButton.dataset.productId) : null;
    card.hidden = Boolean(activeCategoryFilter) && getProductCategoryKey(product) !== activeCategoryFilter;
    if (!card.hidden) visibleCount += 1;
  });

  const label = document.querySelector("#activeCategoryLabel");
  const filterState = document.querySelector("#catalogFilterState");
  if (label) label.textContent = CATEGORY_LABELS[activeCategoryFilter] || "";
  if (filterState) filterState.hidden = !activeCategoryFilter;
  const emptyState = document.querySelector("#catalogEmpty");
  if (emptyState) emptyState.hidden = visibleCount > 0;
}


function renderSearchResults(query) {
  const normalizedQuery = query.trim().toLocaleLowerCase("ka-GE");
  replaceContent(searchResults, []);

  if (!normalizedQuery) {
    searchResults.hidden = true;
    searchMessage.hidden = true;
    return;
  }

  const matches = window.MovioStore.getProducts()
    .filter((product) => product.active !== false)
    .filter((product) => `${product.name} ${CATEGORY_LABELS[product.category] || product.category} ${product.description || ""}`
      .toLocaleLowerCase("ka-GE").includes(normalizedQuery));

  if (!matches.length) {
    searchResults.hidden = true;
    searchMessage.hidden = false;
    searchMessage.textContent = "შედეგი ვერ მოიძებნა.";
    return;
  }

  const resultLinks = matches.slice(0, 8).map((product) => {
    const listItem = document.createElement("li");
    const link = document.createElement("a");
    const type = document.createElement("span");
    const title = document.createElement("strong");

    link.className = "search-result-link";
    const card = [...document.querySelectorAll(".category-detail")]
      .find((article) => article.querySelector(".add-to-cart")?.dataset.productId === product.id);
    const target = card?.id || "catalog";
    link.href = `${document.body.classList.contains("cart-page") ? "index.html" : ""}#${target}`;
    type.textContent = CATEGORY_LABELS[product.category] || product.category;
    title.textContent = product.name;
    link.appendChild(type);
    link.appendChild(title);
    listItem.appendChild(link);

    link.addEventListener("click", () => {
      applyCatalogFilter("");
      searchResults.hidden = true;
      searchMessage.hidden = true;
    });

    return listItem;
  });

  resultLinks.forEach((resultLink) => searchResults.appendChild(resultLink));
  searchResults.hidden = false;
  searchMessage.hidden = true;
}

searchInput.addEventListener("input", () => renderSearchResults(searchInput.value));

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const firstResult = searchResults.querySelector("a");
  if (firstResult) firstResult.click();
});

document.addEventListener("click", (event) => {
  if (searchResults.hidden || searchPanel.contains(event.target)) return;
  searchResults.hidden = true;
  searchMessage.hidden = true;
});

document.querySelectorAll("[data-category-filter]").forEach((link) => {
  link.addEventListener("click", () => applyCatalogFilter(link.dataset.categoryFilter));
});

document.querySelector("#clearCategoryFilter").addEventListener("click", () => {
  applyCatalogFilter("");
  window.location.hash = "catalog";
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !searchResults.hidden) {
    searchResults.hidden = true;
    searchMessage.hidden = true;
  }
});

document.querySelectorAll('a[href^="#"]').forEach((link) => {
  link.addEventListener("click", (event) => {
    if (event.defaultPrevented) return;
    const target = document.querySelector(link.getAttribute("href"));

    if (target && target.matches('[tabindex="-1"]')) {
      window.setTimeout(() => focusWithoutScroll(target), 350);
    }
  });
});

document.addEventListener("click", (event) => {
  const button = event.target.closest(".add-to-cart[data-product-id]");
  if (!button || button.disabled) return;
  const product = getProduct(button.dataset.productId);
  if (!product || product.stock < 1 || window.MovioStore.getStockLabel(product) !== "მარაგშია") return;

  cartStore.add(product.id);
  renderCart();
  if (button.classList.contains("product-buy")) {
    window.location.href = "cart.html";
    return;
  }
  goToCart(product.name);
});

const checkoutForm = document.querySelector("#checkoutForm");
const checkoutMessage = document.querySelector("#checkoutMessage");
const demoCheckoutButton = document.querySelector("#demoCheckoutButton");
const localDemoHost = ["localhost", "127.0.0.1"].includes(window.location.hostname);

document.querySelectorAll(".local-demo-only").forEach((element) => {
  element.hidden = !localDemoHost;
});

function placeCartOrder(paymentMethod, useDemoDetails) {
  if (!cartStore.items.length) return;

  const formData = new FormData(checkoutForm);
  const field = (name, fallback) => {
    const value = String(formData.get(name) || "").trim();
    return value || fallback;
  };
  const submitButtons = [...checkoutForm.querySelectorAll("[type=submit]"), demoCheckoutButton].filter(Boolean);
  submitButtons.forEach((button) => { button.disabled = true; });
  checkoutMessage.textContent = "შეკვეთა მუშავდება...";

  try {
    const order = window.MovioStore.createOrder({
      name: useDemoDetails ? field("name", "დემო მომხმარებელი") : formData.get("name"),
      customerEmail: window.MovioCustomerAuth?.getCurrentUser()?.email || "",
      phone: useDemoDetails ? field("phone", "555 01 23 45") : formData.get("phone"),
      city: useDemoDetails ? field("city", "თბილისი") : formData.get("city"),
      address: useDemoDetails ? field("address", "რუსთაველის გამზირი 1") : formData.get("address"),
      paymentMethod,
      items: cartStore.items,
    });
    cartStore.clear();
    checkoutForm.reset();
    renderCart();
    checkoutMessage.textContent = useDemoDetails
      ? `დემო შეკვეთა ${order.number} წარმატებით შეიქმნა.`
      : `შეკვეთა ${order.number} წარმატებით შეიქმნა.`;
    cartStatus.textContent = checkoutMessage.textContent;
  } catch (error) {
    checkoutMessage.textContent = error.message || "შეკვეთა ვერ შეიქმნა. სცადეთ ხელახლა.";
  } finally {
    submitButtons.forEach((button) => { button.disabled = false; });
  }
}

if (checkoutForm) {
  checkoutForm.addEventListener("submit", (event) => {
    event.preventDefault();
    placeCartOrder(new FormData(checkoutForm).get("paymentMethod"), false);
  });
}

if (demoCheckoutButton) {
  demoCheckoutButton.addEventListener("click", () => placeCartOrder("დემო", true));
}

cartItems.addEventListener("click", (event) => {
  const actionButton = event.target.closest("[data-cart-action]");
  const item = event.target.closest(".cart-item");
  if (!actionButton || !item) return;

  const productId = item.dataset.productId;
  const cartItem = cartStore.items.find((currentItem) => currentItem.id === productId);
  if (!cartItem) return;

  if (actionButton.dataset.cartAction === "increase") {
    cartStore.setQuantity(productId, cartItem.quantity + 1);
    cartStatus.textContent = "რაოდენობა განახლდა.";
  } else if (actionButton.dataset.cartAction === "decrease") {
    const willRemoveItem = cartItem.quantity === 1;
    cartStore.setQuantity(productId, cartItem.quantity - 1);
    cartStatus.textContent = willRemoveItem ? "პროდუქტი წაიშალა კალათიდან." : "რაოდენობა განახლდა.";
  } else if (actionButton.dataset.cartAction === "remove") {
    cartStore.remove(productId);
    cartStatus.textContent = "პროდუქტი წაიშალა კალათიდან.";
  }

  renderCart();
});

window.addEventListener("storage", (event) => {
  if (event.key === CartStore.storageKey) {
    cartStore.items = cartStore.load();
    renderCart();
  }
  if (event.key === "movio-data-v1") {
    cartStore.items = cartStore.load();
    syncCatalogProducts();
    renderCart();
  }
});

syncCatalogProducts();
renderCart();
window.addEventListener("hashchange", () => {
  if (window.location.hash === "#cart") {
    document.body.classList.add("cart-open");
  } else {
    document.body.classList.remove("cart-open");
  }
});

if (window.location.hash === "#cart") {
  document.body.classList.add("cart-open");
}







// მთავარ გვერდზე შესვლისას ყოველთვის ყველა პროდუქტი აჩვენე
window.addEventListener("load", () => {
  if (!activeCategoryFilter && (!window.location.hash || window.location.hash === "#top")) {
    if (typeof applyCatalogFilter === "function") {
      applyCatalogFilter("");
    }
  }
});
