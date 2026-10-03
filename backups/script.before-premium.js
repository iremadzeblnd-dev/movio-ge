const menuButton = document.querySelector(".menu-toggle");
const menu = document.querySelector(".site-nav");
const menuLinks = document.querySelectorAll(".site-nav a");
const menuLabel = document.querySelector(".menu-label");
const wordmark = document.querySelector(".wordmark");
const categoryLink = document.querySelector(".header-category-link");
const pageMain = document.querySelector("main");
const pageFooter = document.querySelector("footer");
const searchToggle = document.querySelector(".search-toggle");
const searchPanel = document.querySelector(".header-search");
const searchForm = document.querySelector(".search-form");
const searchInput = document.querySelector("#site-search");
const searchClose = document.querySelector(".search-close");
const searchMessage = document.querySelector(".search-message");
const searchResults = document.querySelector(".search-results");

const DETAIL_PAGES = {
  "electric-scooters": "electric-scooters.html",
  "electric-bikes": "electric-bikes.html",
  "quad-bikes": "quad-bikes.html",
  "car-accessories": "car-accessories.html",
};

const SEARCHABLE_ITEMS = [
  ...[...document.querySelectorAll(".category-detail h3")].map((heading) => ({
    title: heading.textContent.trim(),
    type: "კატეგორია",
    href: DETAIL_PAGES[heading.closest(".category-detail").id],
  })),
  ...[...document.querySelectorAll(".faq-list summary")].map((summary) => ({
    title: summary.textContent.trim(),
    type: "ხშირი კითხვა",
    target: summary.closest("details"),
    href: `#${summary.closest("details").id}`,
  })),
];

const PRODUCTS = {
  "scooter-s1": {
    id: "scooter-s1",
    name: "ელექტროსკუტერები",
    category: "ელექტროსკუტერები",
    image: "scooter-red.png",
    imageAlt: "წითელ-შავი ელექტროსკუტერი",
    imageWidth: 960,
    imageHeight: 1280,
    mark: "01",
  },
  "ebike-city": {
    id: "ebike-city",
    name: "ელექტროველოსიპედები",
    category: "ელექტროველოსიპედები",
    mark: "02",
  },
  "quad-x4": {
    id: "quad-x4",
    name: "კვადროციკლები",
    category: "კვადროციკლები",
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
  "electric-scooters": "ელექტროსკუტერები",
  "electric-bikes": "ელექტროველოსიპედები",
  "quad-bikes": "კვადროციკლები",
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
    button.disabled = product.stock < 1;
    button.textContent = product.stock ? "კალათაში დამატება →" : "ამოიწურა";
    actions.appendChild(button);
    copy.append(...[category, title, description, price, oldPrice, availability, quantity, actions].filter(Boolean));

    const media = document.createElement("div");
    media.className = "product-media";
    const label = document.createElement("span");
    label.className = "product-label";
    label.textContent = product.name;
    media.appendChild(label);
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
    button.disabled = product.stock < 1;
    button.textContent = product.stock ? "კალათაში დამატება →" : "ამოიწურა";
    const image = article.querySelector(".product-media img");
    if (image && product.image) {
      image.src = product.image;
      image.alt = product.name;
    }
  });
  renderManagedProducts();
}


function renderSearchResults(query) {
  const normalizedQuery = query.trim().toLocaleLowerCase("ka-GE");
  replaceContent(searchResults, []);

  if (!normalizedQuery) {
    searchResults.hidden = true;
    searchMessage.textContent = "აკრიფე საძიებო სიტყვა";
    return;
  }

  const matches = SEARCHABLE_ITEMS.filter((item) =>
    item.title.toLocaleLowerCase("ka-GE").includes(normalizedQuery),
  );

  if (!matches.length) {
    searchResults.hidden = true;
    searchMessage.textContent = "შედეგი ვერ მოიძებნა.";
    return;
  }

  const resultLinks = matches.map((item) => {
    const listItem = document.createElement("li");
    const link = document.createElement("a");
    const type = document.createElement("span");
    const title = document.createElement("strong");

    link.className = "search-result-link";
    link.href = item.href;
    type.textContent = item.type;
    title.textContent = item.title;
    link.appendChild(type);
    link.appendChild(title);
    listItem.appendChild(link);

    link.addEventListener("click", () => {
      setSearchState(false);

      if (!item.target) return;
      item.target.open = true;

      window.setTimeout(() => {
        focusWithoutScroll(item.target.querySelector("summary"));
      }, 350);
    });

    return listItem;
  });

  resultLinks.forEach((resultLink) => searchResults.appendChild(resultLink));
  searchResults.hidden = false;
  searchMessage.textContent = `ნაპოვნია ${matches.length} შედეგი`;
}

function setSearchState(isOpen, returnFocus = false) {
  if (isOpen) setMenuState(false);

  searchToggle.setAttribute("aria-expanded", String(isOpen));
  searchToggle.setAttribute("aria-label", isOpen ? "ძიების დახურვა" : "ძიების გახსნა");
  searchPanel.hidden = !isOpen;

  if (isOpen) {
    searchInput.value = "";
    renderSearchResults("");
    window.requestAnimationFrame(() => focusWithoutScroll(searchInput));
  } else if (returnFocus) {
    focusWithoutScroll(searchToggle);
  }
}

function setMenuState(isOpen) {
  if (isOpen) setSearchState(false);

  menuButton.setAttribute("aria-expanded", String(isOpen));
  menuButton.setAttribute("aria-label", isOpen ? "მენიუს დახურვა" : "მენიუს გახსნა");
  menu.classList.toggle("is-open", isOpen);
  document.body.classList.toggle("menu-open", isOpen);
  menuLabel.textContent = isOpen ? "დახურვა" : "მენიუ";
  setInert(pageMain, isOpen);
  setInert(pageFooter, isOpen);

  if (isOpen) {
    window.setTimeout(() => {
      if (menuLinks[0]) focusWithoutScroll(menuLinks[0]);
    }, 200);
  }
}

menuButton.addEventListener("click", () => {
  setMenuState(menuButton.getAttribute("aria-expanded") !== "true");
});

menuLinks.forEach((link) => {
  link.addEventListener("click", () => setMenuState(false));
});

wordmark.addEventListener("click", () => setMenuState(false));
categoryLink.addEventListener("click", () => setMenuState(false));

searchToggle.addEventListener("click", () => {
  setSearchState(searchToggle.getAttribute("aria-expanded") !== "true", true);
});

searchClose.addEventListener("click", () => setSearchState(false, true));
searchInput.addEventListener("input", () => renderSearchResults(searchInput.value));

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const firstResult = searchResults.querySelector("a");
  if (firstResult) firstResult.click();
});

document.addEventListener("click", (event) => {
  const isSearchOpen = searchToggle.getAttribute("aria-expanded") === "true";
  if (!isSearchOpen || searchPanel.contains(event.target) || searchToggle.contains(event.target)) return;
  setSearchState(false);
});

document.addEventListener("keydown", (event) => {
  const isMenuOpen = menuButton.getAttribute("aria-expanded") === "true";
  const isSearchOpen = searchToggle.getAttribute("aria-expanded") === "true";

  if (event.key === "Escape" && isSearchOpen) {
    event.preventDefault();
    setSearchState(false, true);
    return;
  }

  if (event.key === "Escape" && isMenuOpen) {
    setMenuState(false);
    focusWithoutScroll(menuButton);
  }

  if (event.key === "Tab" && isMenuOpen) {
    const focusableItems = [wordmark, menuButton, ...menuLinks, searchToggle, categoryLink, cartLink]
      .filter((item) => item.getClientRects().length > 0);
    const firstItem = focusableItems[0];
    const lastItem = focusableItems[focusableItems.length - 1];

    if (event.shiftKey && document.activeElement === firstItem) {
      event.preventDefault();
      focusWithoutScroll(lastItem);
    } else if (!event.shiftKey && document.activeElement === lastItem) {
      event.preventDefault();
      focusWithoutScroll(firstItem);
    }
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

window.addEventListener("resize", () => {
  if (window.innerWidth >= 1060) setMenuState(false);
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