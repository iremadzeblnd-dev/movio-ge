(function () {
  const STORAGE_KEY = "movio-data-v1";
  const LEGACY_DEMO_IDS = new Set(["scooter-s1", "ebike-city", "quad-x4", "auto-kit"]);
  let memoryState;
  let catalog = [];
  let catalogStatus = "loading";

  function setCatalog(products, status = "ready") {
    catalog = status === "ready" ? clone(products) : [];
    catalogStatus = status;
    if (status === "ready") {
      const state = readState();
      state.products = catalog;
      writeState(state);
    }
    window.dispatchEvent?.(new Event("movio:catalog"));
  }


  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function initialState() {
    return { products: [], orders: [] };
  }

  function isLegacyDemoProduct(product) {
    return LEGACY_DEMO_IDS.has(String(product.id));
  }

  function readState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.products) && Array.isArray(parsed.orders)) {
          let migrated = false;
          const retainedProducts = parsed.products.filter((product) => !isLegacyDemoProduct(product));
          if (retainedProducts.length !== parsed.products.length) migrated = true;
          parsed.products = retainedProducts;
          parsed.products = parsed.products.map((product) => {
            const updatedProduct = { ...product };
            if (typeof updatedProduct.stockStatusVisible !== "boolean") {
              updatedProduct.stockStatusVisible = true;
              migrated = true;
            }
            if (typeof updatedProduct.oldPriceVisible !== "boolean") {
              updatedProduct.oldPriceVisible = true;
              migrated = true;
            }
            if (typeof updatedProduct.stockQuantityVisible !== "boolean") {
              updatedProduct.stockQuantityVisible = false;
              migrated = true;
            }
            if (typeof updatedProduct.discountVisible !== "boolean") {
              updatedProduct.discountVisible = false;
              migrated = true;
            }
            if (updatedProduct.discountPercent == null) {
              updatedProduct.discountPercent = 0;
              migrated = true;
            }
            return updatedProduct;
          });
          if (migrated) {
            try {
              localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
            } catch (error) {
              // Existing product visibility still defaults to on for this visit.
            }
          }
          return parsed;
        }
      }
      const state = initialState();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      memoryState = state;
      return state;
    } catch (error) {
      return memoryState ? clone(memoryState) : initialState();
    }
  }

  function writeState(state) {
    memoryState = clone(state);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (error) { /* Session catalog remains usable. */ }
  }

  function getProducts() {
    return clone(catalog);
  }

  function getCategoryKey(product) {
    const raw = String(product?.categoryKey || product?.category || '').trim().toLocaleLowerCase('ka-GE');
    if (/quad|atv|კვად/.test(raw)) return 'quad-bikes';
    if (/scooter|სკუტ/.test(raw)) return 'electric-scooters';
    if (raw === 'electric-bikes' || /bicycle|ველო/.test(raw)) return 'electric-bikes';
    if (/accessor|აქსესუარ/.test(raw)) return 'car-accessories';
    return raw;
  }

  function validateProduct(product) {
    const savedProduct = { ...product };
    savedProduct.id = String(savedProduct.id || '').trim();
    savedProduct.name = String(savedProduct.name || '').trim();
    savedProduct.price = Number(savedProduct.price);
    savedProduct.stock = Number(savedProduct.stock);
    if (!savedProduct.id || !savedProduct.name || !Number.isFinite(savedProduct.price) || savedProduct.price <= 0
      || Math.abs(savedProduct.price * 100 - Math.round(savedProduct.price * 100)) > 0.00001
      || !Number.isInteger(savedProduct.stock) || savedProduct.stock < 0) {
      throw new Error('შეავსეთ პროდუქტის სახელი, დადებითი ფასი და მარაგის მთელი რაოდენობა.');
    }
    savedProduct.freeDelivery = savedProduct.freeDelivery === true;
    savedProduct.weightKg = savedProduct.freeDelivery && (savedProduct.weightKg == null || savedProduct.weightKg === '')
      ? null : Number(savedProduct.weightKg);
    delete savedProduct.deliveryPrice;
    if (!(savedProduct.freeDelivery && savedProduct.weightKg === null) && (!Number.isFinite(savedProduct.weightKg) || savedProduct.weightKg <= 0
      || savedProduct.weightKg > 999999999.999
      || Math.abs(savedProduct.weightKg * 1000 - Math.round(savedProduct.weightKg * 1000)) > 0.00001)) {
      throw new Error("წონა უნდა იყოს დადებითი რიცხვი, მაქსიმუმ სამი ათწილადი ნიშნით.");
    }
    savedProduct.specifications = Array.isArray(savedProduct.specifications)
      ? savedProduct.specifications.map((entry) => ({
        label: String(entry?.label || "").trim(),
        value: String(entry?.value || "").trim(),
      })).filter((entry) => entry.label || entry.value)
      : [];
    if (savedProduct.specifications.some((entry) => !entry.label || !entry.value)) {
      throw new Error("მახასიათებლის დასახელება და მნიშვნელობა ორივე შეავსეთ.");
    }
    delete savedProduct.stockDisplayMode;
    savedProduct.stockStatusVisible = savedProduct.stockStatusVisible !== false;
    savedProduct.oldPriceVisible = savedProduct.oldPriceVisible !== false;
    savedProduct.discountVisible = savedProduct.discountVisible === true;
    savedProduct.discountPercent = Number(savedProduct.discountPercent ?? 0);
    if (!Number.isFinite(savedProduct.discountPercent) || savedProduct.discountPercent < 0 || savedProduct.discountPercent > 100) {
      throw new Error("ფასდაკლების პროცენტი უნდა იყოს 0-დან 100-მდე.");
    }
    savedProduct.stockQuantityVisible = savedProduct.stockQuantityVisible === true;
    if (!["მარაგშია", "ამოიწურა"].includes(savedProduct.stockStatus)) {
      savedProduct.stockStatus = Number(savedProduct.stock) > 0 ? "მარაგშია" : "ამოიწურა";
    }
    return savedProduct;
  }

  function saveProduct(product) {
    const state = readState();
    state.products = clone(catalog);
    const savedProduct = validateProduct(product);
    const index = state.products.findIndex((item) => String(item.id) === savedProduct.id);
    if (index < 0) state.products.unshift(clone(savedProduct));
    else state.products[index] = clone(savedProduct);
    writeState(state);
    catalog = clone(state.products);
    return clone(savedProduct);
  }

  function getStockLabel(product) {
    const quantity = Number(product.stock);
    if (quantity <= 0) return "ამოიწურა";
    return product.stockStatus === "ამოიწურა" ? "ამოიწურა" : "მარაგშია";
  }

  function addToCart(productId) {
    const product = getProducts().find((entry) => String(entry.id) === String(productId) && entry.active !== false);
    if (!product || Number(product.stock) < 1 || getStockLabel(product) !== 'მარაგშია') return false;

    try {
      const cartItems = JSON.parse(localStorage.getItem("movio-cart") || "[]");
      if (!Array.isArray(cartItems)) return false;
      const cartItem = cartItems.find((item) => String(item.id) === String(productId));
      if (cartItem) {
        cartItem.id = String(product.id);
        cartItem.quantity = Math.min(Number(cartItem.quantity) + 1, Math.floor(Number(product.stock)), 100);
      } else cartItems.push({ id: String(product.id), quantity: 1 });
      localStorage.setItem("movio-cart", JSON.stringify(cartItems));
      return true;
    } catch (error) {
      return false;
    }
  }

  function deleteProduct(id) {
    const state = readState();
    state.products = state.products.filter((product) => product.id !== id);
    writeState(state);
    catalog = catalog.filter((product) => String(product.id) !== String(id));
  }

  function getOrders() {
    return clone(readState().orders).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  function createOrder() {
    throw new Error("შეკვეთები ფორმდება მხოლოდ MOVIO-ს ონლაინ სერვისით.");
  }

  function updateOrderStatus(id, status) {
    const state = readState();
    const order = state.orders.find((entry) => entry.id === id);
    if (!order) throw new Error("შეკვეთა ვერ მოიძებნა.");
    order.status = status;
    writeState(state);
    return clone(order);
  }

  function getCustomers() {
    const customers = new Map();
    getOrders().forEach((order) => {
      const key = order.phone || order.name;
      const customer = customers.get(key) || {
        name: order.name,
        phone: order.phone,
        city: order.city,
        totalOrders: 0,
        totalSpent: 0,
        orders: [],
      };
      customer.totalOrders += 1;
      if (order.status !== "cancelled") customer.totalSpent += order.total;
      customer.orders.push(order);
      customers.set(key, customer);
    });
    return [...customers.values()].sort((left, right) => right.totalSpent - left.totalSpent);
  }

  window.MovioStore = {
    setCatalog,
    getCatalogStatus: () => catalogStatus,
    isLegacyDemoProduct,
    getProducts,
    getCategoryKey,
    saveProduct,
    validateProduct,
    getStockLabel,
    addToCart,
    deleteProduct,
    getOrders,
    createOrder,
    updateOrderStatus,
    getCustomers,
  };
})();

