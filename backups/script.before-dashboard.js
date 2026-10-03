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

class CartStore {
  constructor() {
    this.items = this.load();
  }

  load() {
    try {
      const savedItems = JSON.parse(localStorage.getItem(CartStore.storageKey) || "[]");

      if (!Array.isArray(savedItems)) return [];

      return savedItems
        .filter((item) => PRODUCTS[item.id] && Number.isInteger(item.quantity) && item.quantity > 0)
        .map((item) => ({ id: item.id, quantity: Math.min(item.quantity, 99) }));
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
    if (!PRODUCTS[productId]) return;

    const existingItem = this.items.find((item) => item.id === productId);

    if (existingItem) {
      existingItem.quantity = Math.min(existingItem.quantity + 1, 99);
    } else {
      this.items.push({ id: productId, quantity: 1 });
    }

    this.save();
  }

  setQuantity(productId, quantity) {
    const item = this.items.find((cartItem) => cartItem.id === productId);
    if (!item) return;

    if (quantity < 1) {
      this.remove(productId);
      return;
    }

    item.quantity = Math.min(quantity, 99);
    this.save();
  }

  remove(productId) {
    this.items = this.items.filter((item) => item.id !== productId);
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
  const product = PRODUCTS[cartItem.id];
  const item = document.createElement("li");
  item.className = "cart-item";
  item.dataset.productId = product.id;

  const media = product.image
    ? `<img src="${product.image}" alt="${product.imageAlt}" width="${product.imageWidth}" height="${product.imageHeight}" />`
    : `<span aria-hidden="true">${product.mark}</span>`;

  item.innerHTML = `
    <div class="cart-item-media">${media}</div>
    <div class="cart-item-copy">
      <span>${product.category}</span>
      <h3>${product.name}</h3>
      <button class="cart-remove" type="button" data-cart-action="remove">წაშლა</button>
    </div>
    <div class="quantity-control" aria-label="${product.name} რაოდენობა">
      <button type="button" data-cart-action="decrease" aria-label="რაოდენობის შემცირება">−</button>
      <output aria-live="polite">${cartItem.quantity}</output>
      <button type="button" data-cart-action="increase" aria-label="რაოდენობის გაზრდა">+</button>
    </div>
    <span class="cart-item-price">ფასის ინფორმაცია ჯერ არ არის მოწოდებული</span>
  `;

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
  cartSubtotal.textContent = "ინფორმაცია ჯერ არ არის მოწოდებული";
  cartTotal.textContent = "ინფორმაცია ჯერ არ არის მოწოდებული";
}

function goToCart(productName) {
  cartStatus.textContent = `${productName} დაემატა კალათაში.`;

  if (window.location.hash !== "#cart") {
    window.location.hash = "cart";
  }
document.body.classList.add("cart-open");
  cartSection.scrollIntoView(true);
  focusWithoutScroll(cartSection);


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

document.querySelectorAll(".add-to-cart").forEach((button) => {
  button.addEventListener("click", () => {
    const product = PRODUCTS[button.dataset.productId];
    if (!product) return;

    cartStore.add(product.id);
    renderCart();
    goToCart(product.name);
  });
});

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
  if (event.key !== CartStore.storageKey) return;
  cartStore.items = cartStore.load();
  renderCart();
});

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