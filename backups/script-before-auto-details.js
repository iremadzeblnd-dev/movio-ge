const pageMain = document.querySelector("main");
const pageFooter = document.querySelector("footer");
const searchPanel = document.querySelector(".header-search");
const searchForm = document.querySelector(".search-form");
const searchInput = document.querySelector("#site-search");
const searchMessage = document.querySelector(".search-message");
const searchResults = document.querySelector(".search-results");
let activeCategoryFilter = "";

const DETAIL_PAGES = {
  "electric-scooters": "electric-scooters.html",
  "electric-bikes": "electric-bikes.html",
  "quad-bikes": "quad-bikes.html",
  "car-accessories": "car-accessories.html",
};

const PRODUCTS = {
  "scooter-s1": {
    id: "scooter-s1",
    name: "ელექტრო სკუტერები",
    category: "ელექტრო სკუტერები",
    image: "scooter-red.png",
    imageAlt: "წითელ-შავი ელექტროსკუტერი",
    imageWidth: 960,
    imageHeight: 1280,
    mark: "01",
  },
  "ebike-city": {
    id: "ebike-city",
    name: "ელექტრო ველოსიპედები",
    category: "ელექტრო ველოსიპედები",
    mark: "02",
  },
  "quad-x4": {
    id: "quad-x4",
    name: "კვადრო ციკლები",
    category: "კვადრო ციკლები",
    image: "cyadro-2.jpg",
    imageAlt: "წითელ-შავი კვადროციკლი",
    imageWidth: 1254,
    imageHeight: 1254,
    mark: "03",
  },
  "auto-kit": {
    id: "auto-kit",
    name: "მანქანის აქსესუარები",
    category: "მანქანის აქსესუარები",
    mark: "04",
  },
};

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
    ...PRODUCTS[productId],
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

function getDiscountPercent(product) {
  if (product.oldPriceVisible === false || Number(product.oldPrice) <= Number(product.price) || Number(product.oldPrice) <= 0) return 0;
  return Math.round((1 - Number(product.price) / Number(product.oldPrice)) * 100);
}

function syncDiscountBadge(media, product) {
  const percent = getDiscountPercent(product);
  let badge = media.querySelector(".product-discount");
  if (!percent) {
    badge?.remove();
    return;
  }
  if (!badge) {
    badge = document.createElement("span");
    badge.className = "product-discount";
    media.prepend(badge);
  }
  badge.textContent = `-${percent}%`;
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
        .filter((item) => products.has(item.id) && products.get(item.id).active !== false && products.get(item.id).stock > 0 && Number.isInteger(item.quantity) && item.quantity > 0)
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
    if (!product || product.stock < 1) return;

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
    if (!product || product.stock < 1) {
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

  const media = document.createElement("div");
  media.className = "cart-item-media";
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
  name.textContent = product.name;
  const remove = document.createElement("button");
  remove.className = "cart-remove";
  remove.type = "button";
  remove.dataset.cartAction = "remove";
  remove.textContent = "წაშლა";
  copy.append(category, name, remove);

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
  quantity.appendChild(increase);

  const price = document.createElement("span");
  price.className = "cart-item-price";
  price.textContent = `${formatPrice(product.price)} × ${cartItem.quantity} = ${formatPrice(product.price * cartItem.quantity)}`;
  item.append(media, copy, quantity, price);

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

  if (window.location.hash !== "#cart") {
    window.location.hash = "cart";
  }
document.body.classList.add("cart-open");
  cartSection.scrollIntoView(true);
  focusWithoutScroll(cartSection);
}

function renderManagedProducts() {
  const mount = document.querySelector("[data-managed-products]");
  if (!mount) return;

  const customProducts = window.MovioStore.getProducts().filter((product) => !PRODUCTS[product.id] && product.active !== false);
  const articles = customProducts.map((product, index) => {
    const article = document.createElement("article");
    article.className = `category-detail${index % 2 ? " category-detail--reverse" : ""} managed-product`;
    article.id = `managed-${product.id}`;
    article.id = `managed-${product.id}`;
    const copy = document.createElement("div");
    copy.className = "category-detail-copy";
    const category = document.createElement("span");
    category.className = "detail-index";
    category.textContent = `MOVIO / ${CATEGORY_LABELS[product.category] || product.category}`;
    const title = document.createElement("h3");
    title.textContent = product.name;
    const description = document.createElement("p");
    description.textContent = product.description || "";
    const price = createTextElement("span", "product-price-label", formatPrice(product.price));
    const oldPrice = product.oldPriceVisible !== false && Number(product.oldPrice) > 0
      ? createTextElement("del", "product-old-price-label", formatPrice(product.oldPrice))
      : null;
    const availability = createTextElement("span", "product-availability", window.MovioStore.getStockLabel(product));
    availability.hidden = product.stockStatusVisible === false;
    setStockStatusClass(availability, product);
    const quantity = product.stockQuantityVisible === true
      ? createTextElement("span", "product-stock-quantity", `რაოდენობა: ${product.stock} ცალი`)
      : null;
    const actions = document.createElement("div");
    actions.className = "product-actions";
    const button = document.createElement("button");
    button.className = "add-to-cart";
    button.type = "button";
    button.dataset.productId = product.id;
    const buttonLabel = createTextElement("span", "add-label", "კალათაში");
    const buttonIcon = createTextElement("span", "add-icon");
    buttonIcon.setAttribute("aria-hidden", "true");
    buttonIcon.appendChild(createCartIcon());
    button.append(buttonLabel, buttonIcon);
    setProductButtonState(button, product);
    const details = createTextElement("a", "product-details-link", "დეტალურად");
    const categoryPages = {
  "electric-scooters": "electric-scooters.html",
  "ელექტრო სკუტერები": "electric-scooters.html",
  "electric-bikes": "electric-bikes.html",
  "ელექტრო ველოსიპედები": "electric-bikes.html",
  "quad-bikes": "quad-bikes.html",
  "კვადრო ციკლები": "quad-bikes.html",
  "car-accessories": "car-accessories.html",
  "მანქანის აქსესუარები": "car-accessories.html"
};

const detailPage = categoryPages[product.category];

details.href = `item.html?item=${encodeURIComponent(product.id)}`;
    actions.append(button, details);
    copy.append(...[category, title, description, price, oldPrice, availability, quantity, actions].filter(Boolean));

    const media = document.createElement("div");
    media.className = "product-media";
    const label = document.createElement("span");
    label.className = "product-label";
    label.textContent = product.name;
    media.appendChild(label);
    syncDiscountBadge(media, product);
    if (product.image) {
      const image = document.createElement("img");
      image.src = product.image;
      image.alt = product.name;
      image.loading = "lazy";
      media.appendChild(image);
    }
    article.append(copy, media);
    return article;
  });
  replaceContent(mount, articles);
}

function syncCatalogProducts() {
  document.querySelectorAll(".category-detail .add-to-cart[data-product-id]").forEach((button) => {
    const product = getProduct(button.dataset.productId);
    if (!product) {
      button.disabled = true;
      button.textContent = "პროდუქტი მიუწვდომელია";
      return;
    }
    const article = button.closest(".category-detail");
    const title = article.querySelector(".category-detail-copy h3");
    const description = article.querySelector(".category-detail-copy > p:not(.section-index)");
    let availability = article.querySelector(".product-availability");
    if (title) title.textContent = product.name;
    if (description) description.textContent = product.description;
    let price = article.querySelector(".product-price-label");
    if (!price && availability) {
      price = document.createElement("span");
      price.className = "product-price-label";
      availability.insertAdjacentElement("beforebegin", price);
    }
    if (price) price.textContent = formatPrice(product.price);
    let oldPrice = article.querySelector(".product-old-price-label");
    if (product.oldPriceVisible !== false && Number(product.oldPrice) > 0) {
      if (!oldPrice) {
        oldPrice = document.createElement("del");
        oldPrice.className = "product-old-price-label";
        if (price) price.insertAdjacentElement("afterend", oldPrice);
      }
      oldPrice.textContent = formatPrice(product.oldPrice);
    } else {
      oldPrice?.remove();
    }
    if (availability) {
      availability.textContent = window.MovioStore.getStockLabel(product);
      availability.hidden = product.stockStatusVisible === false;
      setStockStatusClass(availability, product);
    }
    let quantity = article.querySelector(".product-stock-quantity");
    if (product.stockQuantityVisible === true) {
      if (!quantity) {
        quantity = document.createElement("span");
        quantity.className = "product-stock-quantity";
        availability?.insertAdjacentElement("afterend", quantity);
      }
      quantity.textContent = `რაოდენობა: ${product.stock} ცალი`;
    } else {
      quantity?.remove();
    }
    const image = article.querySelector(".product-media img");
    if (image && product.image) {
      image.src = product.image;
      image.alt = product.name;
    }
    const media = article.querySelector(".product-media");
    if (media) syncDiscountBadge(media, product);
    setProductButtonState(button, product);
  });
  renderManagedProducts();
  applyCatalogFilter(activeCategoryFilter);
}

function applyCatalogFilter(categoryKey) {
  activeCategoryFilter = categoryKey || "";
  const cards = document.querySelectorAll("#catalog .product-grid .category-detail");
  let visibleCount = 0;
  cards.forEach((card) => {
    const productButton = card.querySelector(".add-to-cart[data-product-id]");
    const product = productButton ? getProduct(productButton.dataset.productId) : null;
    card.hidden = Boolean(activeCategoryFilter) && product?.categoryKey !== activeCategoryFilter;
    if (!card.hidden) visibleCount += 1;
  });

  const label = document.querySelector("#activeCategoryLabel");
  const filterState = document.querySelector("#catalogFilterState");
  if (label) label.textContent = CATEGORY_LABELS[activeCategoryFilter] || "";
  if (filterState) filterState.hidden = !activeCategoryFilter;
  const emptyState = document.querySelector("#catalogEmpty");
  if (emptyState) emptyState.hidden = !activeCategoryFilter || visibleCount > 0;
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
  if (!product) return;

  cartStore.add(product.id);
  renderCart();
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


