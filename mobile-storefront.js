(function () {
  if (!window.matchMedia("(max-width: 760px)").matches) return;

  document.querySelectorAll('a[href="#categories"]').forEach((link) => {
    if (!document.querySelector("#categories")) link.setAttribute("href", "#catalog");
  });

  // Category pages use the older detail markup without storefront handlers.
  const legacyProductId = document.body.dataset.productId;
  if (!legacyProductId) {
    if (location.hash === "#account") {
      document.querySelector("#accountButton")?.click();
    }
    return;
  }

  const products = window.MovioStore.getProducts();
  const product = products.find((entry) => entry.id === legacyProductId && entry.active !== false);
  const money = (value) => `${new Intl.NumberFormat("ka-GE", { maximumFractionDigits: 2 }).format(value)} ₾`;
  const addButton = document.querySelector(".item-page-add");
  if (product) {
    const stock = document.querySelector("[data-product-stock]");
    stock.textContent = window.MovioStore.getStockLabel(product);
    stock.parentElement.hidden = product.stockStatusVisible === false;
    stock.classList.toggle("stock-available", stock.textContent === "მარაგშია");
    stock.classList.toggle("stock-unavailable", stock.textContent === "ამოიწურა");
    document.querySelector("[data-product-price]").textContent = money(product.price);
    const oldPriceRow = document.querySelector("[data-product-old-price-row]");
    oldPriceRow.hidden = product.oldPriceVisible === false || !(Number(product.oldPrice) > 0);
    document.querySelector("[data-product-old-price]").textContent = money(product.oldPrice);
    document.querySelector("[data-product-quantity-row]").hidden = product.stockQuantityVisible !== true;
    document.querySelector("[data-product-quantity]").textContent = `${product.stock} ცალი`;
    const media = document.querySelector(".item-page-media");
    media.querySelectorAll(".product-discount").forEach((badge) => badge.remove());
    if (product.discountVisible === true) {
      const badge = document.createElement("span");
      badge.className = "product-discount";
      badge.textContent = `-${Number(product.discountPercent ?? 0)}%`;
      media.prepend(badge);
    }
    addButton.disabled = Number(product.stock) < 1 || product.stockStatus === "ამოიწურა";
    addButton.addEventListener("click", () => {
      if (window.MovioStore.addToCart(product.id)) location.href = "index.html#cart";
    });
  } else {
    addButton.disabled = true;
  }

  try {
    const cart = JSON.parse(localStorage.getItem("movio-cart") || "[]");
    const count = Array.isArray(cart) ? cart.reduce((sum, item) => sum + Number(item.quantity || 0), 0) : 0;
    const countBadge = document.querySelector(".cart-count");
    if (countBadge) countBadge.textContent = count;
    document.querySelector(".header-cart-link")?.setAttribute("aria-label", `კალათა, ${count} პროდუქტი`);
  } catch (error) {
    // A malformed local cart should not disable the search or detail controls.
  }

  const form = document.querySelector(".search-form");
  if (!form) return;
  const input = document.querySelector("#site-search");
  const results = document.querySelector(".search-results");
  const message = document.querySelector(".search-message");
  input.addEventListener("input", () => {
    const query = input.value.trim().toLocaleLowerCase("ka-GE");
    results.replaceChildren();
    const matches = query ? products.filter((entry) => entry.active !== false &&
      `${entry.name} ${entry.category} ${entry.description || ""}`.toLocaleLowerCase("ka-GE").includes(query)).slice(0, 8) : [];
    matches.forEach((entry) => {
      const item = document.createElement("li");
      const link = document.createElement("a");
      link.className = "search-result-link";
      link.href = `item.html?item=${encodeURIComponent(entry.id)}`;
      link.textContent = entry.name;
      item.appendChild(link);
      results.appendChild(item);
    });
    results.hidden = matches.length === 0;
    message.hidden = !query || matches.length > 0;
    message.textContent = "შედეგი ვერ მოიძებნა.";
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    results.querySelector("a")?.click();
  });
  document.addEventListener("click", (event) => {
    if (!form.parentElement.contains(event.target)) {
      results.hidden = true;
      message.hidden = true;
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      results.hidden = true;
      message.hidden = true;
    }
  });
  document.querySelector("#accountButton")?.addEventListener("click", () => {
    location.href = "index.html#account";
  });
})();
