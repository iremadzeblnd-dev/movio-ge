const params = new URLSearchParams(window.location.search);
const requestedProductId = params.get("product") || params.get("item");
const productId = requestedProductId || document.body.dataset.productId;

const products = window.MovioStore ? window.MovioStore.getProducts() : [];
const product = products.find((item) => item.id === productId);

const detail = document.querySelector(".item-page-detail");
const notFound = document.querySelector(".item-page-not-found");

if (!product) {
  if (detail) detail.hidden = true;
  if (notFound) notFound.hidden = false;
} else {
  if (detail) detail.hidden = false;
  if (notFound) notFound.hidden = true;

  const title = document.querySelector("#item-page-title");
  const description = document.querySelector(".item-page-description");
  const availability = document.querySelector(".item-page-availability");
  const image = document.querySelector(".item-page-image");
  const noPhoto = document.querySelector(".item-page-no-photo");
  const copy = document.querySelector(".item-page-copy");

  if (title) title.textContent = product.name || "პროდუქტი";

  if (description) {
    description.textContent =
      product.description || "პროდუქტის დამატებითი ინფორმაცია მალე დაემატება.";
  }

  if (availability) {
    const stockText = window.MovioStore.getStockLabel
      ? window.MovioStore.getStockLabel(product)
      : Number(product.stock) > 0
        ? "მარაგშია"
        : "ამოიწურა";

    availability.textContent = stockText;
  }

  if (image) {
    if (product.image) {
      image.src = product.image;
      image.alt = product.name || "პროდუქტის ფოტო";
      image.hidden = false;
      if (noPhoto) noPhoto.hidden = true;
    } else {
      image.hidden = true;
      if (noPhoto) noPhoto.hidden = false;
    }
  }

  let info = document.querySelector(".dynamic-product-info");

  if (!info && copy) {
    info = document.createElement("div");
    info.className = "dynamic-product-info";

    copy.appendChild(info);
  }

  if (info) {
    const price = Number(product.price || 0);
    const oldPrice = Number(product.oldPrice || 0);

    const formatPrice = (value) =>
      `${new Intl.NumberFormat("ka-GE", {
        maximumFractionDigits: 2
      }).format(value)} ₾`;

    const oldPriceHtml =
      product.oldPriceVisible !== false && oldPrice > 0
        ? `<div class="dynamic-old-price">${formatPrice(oldPrice)}</div>`
        : "";

    const quantityHtml =
      product.stockQuantityVisible === true
        ? `<div class="dynamic-stock-count">რაოდენობა: ${Number(product.stock || 0)}</div>`
        : "";

    info.innerHTML = `
      <div class="dynamic-product-facts">
        <div>
          <span>კატეგორია</span>
          <strong>${product.category || "—"}</strong>
        </div>

        <div>
          <span>ფასი</span>
          <strong class="dynamic-price">${formatPrice(price)}</strong>
        </div>

        ${oldPriceHtml}

        ${quantityHtml}
      </div>

      <button class="dynamic-add-cart" type="button">
        <span>კალათაში</span>
        <span>🛒</span>
      </button>
    `;

    const addButton = info.querySelector(".dynamic-add-cart");

    if (addButton) {
      const available = Number(product.stock || 0) > 0;

      addButton.disabled = !available;

      if (!available) {
        addButton.querySelector("span").textContent = "ამოიწურა";
      }

      addButton.addEventListener("click", () => {
        if (
          window.MovioStore &&
          window.MovioStore.addToCart &&
          window.MovioStore.addToCart(product.id)
        ) {
          window.location.href = "index.html#cart";
        }
      });
    }
  }

  document.title = `MOVIO — ${product.name || "პროდუქტი"}`;
}
