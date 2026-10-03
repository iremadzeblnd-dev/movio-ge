const params = new URLSearchParams(window.location.search);
const itemId = params.get("item") || params.get("product");

if (itemId) {
  document.body.dataset.productId = itemId;

  const detail = document.querySelector(".item-page-detail");
  const notFound = document.querySelector(".item-page-not-found");

  if (detail) detail.hidden = false;
  if (notFound) notFound.hidden = true;
}
