const product = window.MovioStore.getProducts().find((item) => item.id === document.body.dataset.productId);
const stockElement = document.querySelector("[data-product-stock]");
const priceElement = document.querySelector("[data-product-price]");
const oldPriceRow = document.querySelector("[data-product-old-price-row]");
const oldPriceElement = document.querySelector("[data-product-old-price]");
const quantityRow = document.querySelector("[data-product-quantity-row]");
const quantityElement = document.querySelector("[data-product-quantity]");

function formatPrice(amount) {
	return `${new Intl.NumberFormat("ka-GE", { maximumFractionDigits: 2 }).format(amount)} ₾`;
}

stockElement.textContent = product
	? window.MovioStore.getStockLabel(product)
	: "ამოიწურა";
stockElement.hidden = product?.stockStatusVisible === false;
stockElement.parentElement.hidden = stockElement.hidden;
const isAvailable = product && window.MovioStore.getStockLabel(product) === "მარაგშია";
stockElement.classList.toggle("stock-available", Boolean(isAvailable));
stockElement.classList.toggle("stock-unavailable", !isAvailable);

if (product && priceElement) priceElement.textContent = formatPrice(product.price);

const showOldPrice = product && product.oldPriceVisible !== false && Number(product.oldPrice) > 0;
if (oldPriceRow) oldPriceRow.hidden = !showOldPrice;
if (showOldPrice && oldPriceElement) oldPriceElement.textContent = formatPrice(product.oldPrice);

const showQuantity = product && product.stockQuantityVisible === true;
if (quantityRow) quantityRow.hidden = !showQuantity;
if (showQuantity && quantityElement) quantityElement.textContent = `${product.stock} ცალი`;