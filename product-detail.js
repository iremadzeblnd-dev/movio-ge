async function initializeProductDetail() {
  const loadingMessage = document.createElement('p');
  loadingMessage.setAttribute('role', 'status');
  loadingMessage.textContent = 'პროდუქტები იტვირთება…';
  document.querySelector('main')?.prepend(loadingMessage);
  let readyTimer;
  try {
    await Promise.race([window.MovioStore.catalogReady, new Promise((_, reject) => {
      readyTimer = setTimeout(() => reject(new Error('Product loading timed out')), 8500);
    })]);
  } catch { /* The error panel below replaces the loading message. */ }
  finally { clearTimeout(readyTimer); }
  loadingMessage.remove();
  if (window.MovioStore.getCatalogStatus() !== 'ready') {
    const unavailable = document.querySelector('#productNotFound');
    document.querySelector('#productDetail').hidden = true;
    unavailable.hidden = false;
    unavailable.querySelector('p').textContent = 'პროდუქტების ჩატვირთვა ვერ მოხერხდა. განაახლეთ გვერდი და სცადეთ ხელახლა.';
    unavailable.querySelector('h1').textContent = 'კატალოგი დროებით მიუწვდომელია';
    const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = 'ხელახლა ცდა';
    retry.addEventListener('click', () => location.reload()); unavailable.append(retry);
    return;
  }
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
  const categoryLabels = Object.fromEntries(window.MovioStore.getCategories().map(category => [category.key, category.label]));
  const productCategory = categoryLabels[window.MovioStore.getCategoryKey(product)] || product.category || "—";

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

  const showOldPrice = window.MovioStore.shouldShowOldPrice(product);

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

  let galleryImages = MovioStore.normalizeImages(product).images;
  let selectedImage = Math.max(0, galleryImages.indexOf(product.image));
  const media = image.closest('figure');
  detail.dataset.galleryState = product.imagesLoaded === false ? 'loading' : 'ready';
  const thumbnails = document.createElement('div'); thumbnails.className = 'product-gallery-thumbnails';
  const controls = document.createElement('div'); controls.className = 'product-gallery-controls';
  const counter = document.createElement('span'); counter.setAttribute('aria-live', 'polite');
  image.decoding = 'async'; image.fetchPriority = 'high';
  function showImage(index) {
    if (!galleryImages.length) { image.hidden = true; noPhoto.hidden = false; return; }
    selectedImage = (index + galleryImages.length) % galleryImages.length;
    image.src = galleryImages[selectedImage]; image.alt = `${productName} — ${selectedImage + 1}`;
    image.hidden = false; noPhoto.hidden = true;
    counter.textContent = `${selectedImage + 1} / ${galleryImages.length}`;
    [...thumbnails.children].forEach((button, i) => button.setAttribute('aria-pressed', String(i === selectedImage)));
  }
  image.addEventListener('error', () => { image.hidden = true; noPhoto.hidden = false; });
  function renderThumbnails() {
    thumbnails.replaceChildren();
    galleryImages.forEach((src, index) => {
    const button = document.createElement('button'); button.type = 'button'; button.setAttribute('aria-label', `ფოტო ${index + 1}`);
    const thumb = document.createElement('img'); thumb.alt = ''; thumb.loading = 'lazy'; thumb.decoding = 'async'; thumb.fetchPriority = 'low'; thumb.src = src;
    thumb.addEventListener('error', () => { thumb.hidden = true; button.textContent = String(index + 1); });
    button.append(thumb); button.addEventListener('click', () => showImage(index)); thumbnails.append(button);
  });
    controls.hidden = thumbnails.hidden = galleryImages.length < 2;
  }
  for (const [label, step] of [['წინა ფოტო', -1], ['შემდეგი ფოტო', 1]]) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = step < 0 ? '←' : '→';
    button.setAttribute('aria-label', label); button.addEventListener('click', () => showImage(selectedImage + step)); controls.append(button);
  }
  controls.insertBefore(counter, controls.lastChild);
  // Keep controls outside the clipped frame containing the absolute-positioned image.
  controls.hidden = thumbnails.hidden = galleryImages.length < 2;
  media.closest('.detail-product-gallery').append(controls, thumbnails);
  renderThumbnails();
  let touchStart;
  image.addEventListener('touchstart', event => { const touch = event.touches[0]; touchStart = event.touches.length === 1 ? {x:touch.clientX,y:touch.clientY} : null; }, {passive:true});
  image.addEventListener('touchend', event => {
    if (!touchStart || !event.changedTouches.length) return;
    const dx = event.changedTouches[0].clientX - touchStart.x, dy = event.changedTouches[0].clientY - touchStart.y;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) showImage(selectedImage + (dx < 0 ? 1 : -1));
    touchStart = null;
  }, {passive:true});
  image.addEventListener('touchcancel', () => { touchStart = null; });
  showImage(selectedImage);
  if (product.imagesLoaded === false) {
    const imageStatus = document.createElement('p'); imageStatus.setAttribute('role', 'status');
    imageStatus.className = 'detail-cart-message'; imageStatus.textContent = 'ფოტოები იტვირთება…';
    media.closest('.detail-product-gallery').append(imageStatus);
    let mainFetched = false;
    async function hydrateImages() {
      try {
        if (!mainFetched) {
          const main = await MovioStore.loadProductImageData(product.id);
          product.image = main.image || '';
          galleryImages = product.image ? [product.image] : [];
          renderThumbnails(); showImage(0); mainFetched = true;
        }
        // Give the main photo a rendering opportunity before requesting the gallery.
        await new Promise(resolve => setTimeout(resolve, 0));
        const gallery = await MovioStore.loadProductImageData(product.id, true);
        galleryImages = MovioStore.normalizeImages({image:product.image, images:Array.isArray(gallery.images) ? gallery.images : galleryImages}).images;
        product.images = galleryImages; product.imagesLoaded = true;
        const current = MovioStore.getProducts();
        MovioStore.setCatalog(current.map(item => String(item.id) === String(product.id) ? {...item,image:product.image,images:galleryImages,imagesLoaded:true} : item));
        selectedImage = Math.max(0, galleryImages.indexOf(product.image));
        renderThumbnails(); showImage(selectedImage); imageStatus.remove(); detail.dataset.galleryState = 'ready';
      } catch {
        detail.dataset.galleryState = 'error';
        imageStatus.textContent = 'ფოტოების ჩატვირთვა ვერ მოხერხდა.';
        const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = 'ხელახლა ცდა';
        retry.addEventListener('click', () => { detail.dataset.galleryState = 'loading'; imageStatus.replaceChildren(); imageStatus.textContent = 'ფოტოები იტვირთება…'; hydrateImages(); });
        imageStatus.append(retry);
      }
    }
    hydrateImages();
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
        const current = currentProducts.find((entry) => String(entry.id) === String(item?.id) && entry.active !== false);
        if (!current || window.MovioStore.getStockLabel(current) !== "მარაგშია" || !Number.isInteger(Number(item.quantity)) || Number(item.quantity) < 1) return sum;
        return sum + Math.min(Number(item.quantity), Number(current.stock), 100);
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
      if (Array.isArray(cart)) previousQuantity = Number(cart.find((item) => String(item?.id) === String(current.id))?.quantity) || 0;
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
    String(item.id) !== String(product.id) && window.MovioStore.getCategoryKey(item) === window.MovioStore.getCategoryKey(product)).slice(0, 4);
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
    if (!item.image && item.imagesLoaded === false) {
      MovioStore.loadProductImageData(item.id).then(row => {
        if (!row.image) return;
        const picture = document.createElement('img'); picture.src = row.image; picture.alt = item.name || ''; picture.loading = 'lazy'; picture.decoding = 'async';
        picture.addEventListener('error', () => { media.textContent = 'ფოტო არ არის'; });
        media.replaceChildren(picture);
      }).catch(() => { /* Related content remains useful when an image fails. */ });
    }
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
