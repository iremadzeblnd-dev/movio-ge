async function initializeProductDetail() {
  const loadingMessage = document.createElement('p');
  loadingMessage.setAttribute('role', 'status');
  loadingMessage.textContent = 'პროდუქტები იტვირთება…';
  document.querySelector('main')?.prepend(loadingMessage);
  await window.MovioStore.catalogReady;
  loadingMessage.remove();
﻿const params = new URLSearchParams(window.location.search);
const productId = params.get("item") || params.get("product");

const detail = document.querySelector("#productDetail");
const notFound = document.querySelector("#productNotFound");

const products =
  window.MovioStore && typeof window.MovioStore.getProducts === "function"
    ? window.MovioStore.getProducts()
    : [];

const product = products.find(
  (item) => String(item.id) === String(productId) && item.active !== false
);

function formatPrice(value) {
  return `${new Intl.NumberFormat("ka-GE", {
    maximumFractionDigits: 2
  }).format(Number(value) || 0)} ₾`;
}

if (!product) {

  if (detail) detail.hidden = true;
  if (notFound) notFound.hidden = false;

} else {

  if (detail) detail.hidden = false;
  if (notFound) notFound.hidden = true;

  const image = document.querySelector("#detailImage");
  const noPhoto = document.querySelector("#detailNoPhoto");

  const title = document.querySelector("#detailTitle");
  const description = document.querySelector("#detailDescription");

  const category = document.querySelector("#detailCategory");
  const categoryRow = document.querySelector("#detailCategoryRow");

  const stock = document.querySelector("#detailStock");

  const price = document.querySelector("#detailPrice");

  const oldPriceRow = document.querySelector("#detailOldPriceRow");
  const oldPrice = document.querySelector("#detailOldPrice");

  const quantityRow = document.querySelector("#detailQuantityRow");
  const quantity = document.querySelector("#detailQuantity");

  const addButton = document.querySelector("#detailAdd");
  const buyButton = document.querySelector("#detailBuy");
  const message = document.querySelector("#detailCartMessage");

  const discountBadge = document.querySelector("#detailDiscountBadge");
  discountBadge.hidden = product.discountVisible !== true;
  if (product.discountVisible === true) {
    discountBadge.textContent = `-${Number(product.discountPercent ?? 0)}%`;
  }

  const productName = product.name || "პროდუქტი";
  const categoryLabels = {
    "electric-scooters": "ელექტრო სკუტერები",
    "electric-bikes": "ელექტრო ველოსიპედები",
    "quad-bikes": "კვადრო ციკლები",
    "car-accessories": "მანქანის აქსესუარები",
  };
  const productCategory = categoryLabels[product.category] || product.category || "—";

  title.textContent = productName;

  description.textContent =
    product.description ||
    "პროდუქტის დამატებითი ინფორმაცია მალე დაემატება.";

  category.textContent = productCategory;
  categoryRow.textContent = productCategory;

  const specifications = document.querySelector("#detailSpecifications");
  (Array.isArray(product.specifications) ? product.specifications : []).forEach((entry) => {
    if (!entry || !entry.label || !entry.value) return;
    const row = document.createElement("div");
    row.className = "detail-specification-row";
    const label = document.createElement("dt");
    label.textContent = entry.label;
    const value = document.createElement("dd");
    value.textContent = entry.value;
    row.append(label, value);
    specifications.append(row);
  });

  price.textContent = formatPrice(product.price);
  const delivery = document.createElement('p');
  delivery.className = 'detail-cart-message';
  delivery.id = 'detailDeliveryPrice';
  delivery.textContent = product.freeDelivery === true ? 'უფასო მიწოდება'
    : product.weightKg != null && Number(product.weightKg) > 0
      ? `წონა: ${Number(product.weightKg)} კგ. მიწოდება გამოითვლება კალათის საერთო წონითა და მიწოდების ტიპით.`
      : 'პროდუქტის წონა დასაზუსტებელია.';
  document.querySelector('.detail-pricing').after(delivery);

  const stockLabel =
    window.MovioStore &&
    typeof window.MovioStore.getStockLabel === "function"
      ? window.MovioStore.getStockLabel(product)
      : Number(product.stock) > 0
        ? "მარაგშია"
        : "ამოიწურა";

  stock.textContent = stockLabel;
  stock.parentElement.hidden = product.stockStatusVisible === false;

  stock.classList.toggle(
    "stock-available",
    stockLabel === "მარაგშია"
  );

  stock.classList.toggle(
    "stock-unavailable",
    stockLabel !== "მარაგშია"
  );

  const showOldPrice =
    product.oldPriceVisible !== false &&
    Number(product.oldPrice) > 0;

  oldPriceRow.hidden = !showOldPrice;

  if (showOldPrice) {
    oldPrice.textContent = formatPrice(product.oldPrice);
  }

  const showQuantity =
    product.stockQuantityVisible === true;

  quantityRow.hidden = !showQuantity;

  if (showQuantity) {
    quantity.textContent = `${Number(product.stock) || 0} ცალი`;
  }

  if (product.image) {

    image.src = product.image;
    image.alt = productName;
    image.hidden = false;
    noPhoto.hidden = true;

  } else {

    image.hidden = true;
    noPhoto.hidden = false;

  }

  const available =
    stockLabel === "მარაგშია" &&
    Number(product.stock) > 0;

  document.querySelector("#detailStockBadge").hidden = !available || product.stockStatusVisible === false;
  addButton.disabled = !available;
  buyButton.disabled = !available;
  if (!available) message.textContent = "პროდუქტი ამჟამად არ არის მარაგში.";

  function updateCartCount() {
    try {
      const cart = JSON.parse(localStorage.getItem("movio-cart") || "[]");
      const currentProducts = window.MovioStore.getProducts();
      const count = Array.isArray(cart) ? cart.reduce((sum, item) => {
        const current = currentProducts.find((entry) => entry.id === item.id && entry.active !== false);
        if (!current || window.MovioStore.getStockLabel(current) !== "მარაგშია" || !Number.isInteger(item.quantity) || item.quantity < 1) return sum;
        return sum + Math.min(item.quantity, Number(current.stock), 100);
      }, 0) : 0;
      document.querySelector("#detailCartCount").textContent = count;
      document.querySelector(".detail-header-cart").setAttribute("aria-label", `კალათა, ${count} პროდუქტი`);
    } catch (error) {
      document.querySelector("#detailCartCount").textContent = "0";
    }
  }

  function addSelectedProduct(openCart) {
    const current = window.MovioStore.getProducts().find((item) => item.id === product.id && item.active !== false);
    if (!current || window.MovioStore.getStockLabel(current) !== "მარაგშია" || Number(current.stock) < 1) {
      document.querySelector("#detailStockBadge").hidden = true;
      addButton.disabled = true;
      buyButton.disabled = true;
      message.textContent = "პროდუქტი ამჟამად არ არის მარაგში.";
      return;
    }
    let previousQuantity = 0;
    try {
      const cart = JSON.parse(localStorage.getItem("movio-cart") || "[]");
      if (Array.isArray(cart)) previousQuantity = Number(cart.find((item) => item.id === current.id)?.quantity) || 0;
    } catch (error) {
      // The store reports malformed cart data as an unsuccessful add below.
    }
    if (!window.MovioStore.addToCart(current.id)) {
      message.textContent = "კალათაში დამატება ვერ მოხერხდა. სცადეთ ხელახლა.";
      return;
    }
    updateCartCount();
    message.textContent = previousQuantity >= Math.min(Number(current.stock), 100)
      ? "პროდუქტი უკვე კალათაშია — მიღწეულია მარაგის მაქსიმუმი."
      : "პროდუქტი დაემატა კალათაში.";
    if (openCart) window.location.href = "cart.html";
  }
  addButton.addEventListener("click", () => addSelectedProduct(false));
  buyButton.addEventListener("click", () => addSelectedProduct(true));
  updateCartCount();
  window.addEventListener("storage", (event) => {
    if (event.key === "movio-cart") updateCartCount();
  });

  document.title = `MOVIO — ${productName}`;

  const relatedProducts = products.filter((item) => item.active !== false &&
    String(item.id) !== String(product.id) && item.category === product.category).slice(0, 4);
  const relatedGrid = document.querySelector("#detailRelatedGrid");
  relatedProducts.forEach((item) => {
    const link = document.createElement("a");
    link.className = "detail-related-card";
    link.href = `item.html?item=${encodeURIComponent(item.id)}`;
    const media = document.createElement("div");
    media.className = "detail-related-media";
    if (item.image) {
      const picture = document.createElement("img");
      picture.src = item.image;
      picture.alt = item.name || "პროდუქტი";
      picture.loading = "lazy";
      media.append(picture);
    } else {
      media.textContent = "ფოტო არ არის";
    }
    const name = document.createElement("h3");
    name.textContent = item.name || "პროდუქტი";
    const cost = document.createElement("strong");
    cost.textContent = formatPrice(item.price);
    link.append(media, name, cost);
    relatedGrid.append(link);
  });
  document.querySelector("#detailRelated").hidden = false;
  document.querySelector("#detailRelatedEmpty").hidden = relatedProducts.length > 0;
}

  if (window.MovioStore.getCatalogStatus() !== 'ready' && notFound) {
    notFound.hidden = false;
    notFound.textContent = 'პროდუქტების ჩატვირთვა ვერ მოხერხდა. განაახლეთ გვერდი.';
  }
}
initializeProductDetail();
