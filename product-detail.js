const params = new URLSearchParams(window.location.search);
const productId = params.get("item") || params.get("product");

const detail = document.querySelector("#productDetail");
const notFound = document.querySelector("#productNotFound");

const products =
  window.MovioStore && typeof window.MovioStore.getProducts === "function"
    ? window.MovioStore.getProducts()
    : [];

const product = products.find(
  (item) => String(item.id) === String(productId)
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
  const addLabel = addButton?.querySelector(".add-label");

  if (product.discountVisible === true) {
    const badge = document.createElement("span");
    badge.className = "product-discount";
    badge.textContent = `-${Number(product.discountPercent ?? 0)}%`;
    image.closest("figure")?.prepend(badge);
  }

  const productName = product.name || "პროდუქტი";
  const productCategory = product.category || "—";

  title.textContent = productName;

  description.textContent =
    product.description ||
    "პროდუქტის დამატებითი ინფორმაცია მალე დაემატება.";

  category.textContent = productCategory;
  categoryRow.textContent = productCategory;

  price.textContent = formatPrice(product.price);

  const stockLabel =
    window.MovioStore &&
    typeof window.MovioStore.getStockLabel === "function"
      ? window.MovioStore.getStockLabel(product)
      : Number(product.stock) > 0
        ? "მარაგშია"
        : "ამოიწურა";

  stock.textContent = stockLabel;

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

  addButton.disabled = !available;

  if (addLabel) {
    addLabel.textContent =
      available ? "კალათაში" : "ამოიწურა";
  }

  addButton.addEventListener("click", () => {

    if (!available) return;

    if (
      window.MovioStore &&
      typeof window.MovioStore.addToCart === "function" &&
      window.MovioStore.addToCart(product.id)
    ) {
      window.location.href = "index.html#cart";
    }

  });

  document.title = `MOVIO — ${productName}`;
}
