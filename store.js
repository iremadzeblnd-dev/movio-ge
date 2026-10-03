(function () {
  const STORAGE_KEY = "movio-data-v1";
  const LEGACY_DEMO_IDS = new Set(["scooter-s1", "ebike-city", "quad-x4", "auto-kit"]);
  let memoryState;

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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    memoryState = clone(state);
  }

  function getProducts() {
    return clone(readState().products);
  }

  function saveProduct(product) {
    const state = readState();
    const savedProduct = { ...product };
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
    const index = state.products.findIndex((item) => item.id === savedProduct.id);
    if (index < 0) state.products.unshift(clone(savedProduct));
    else state.products[index] = clone(savedProduct);
    writeState(state);
    return clone(savedProduct);
  }

  function getStockLabel(product) {
    const quantity = Number(product.stock);
    if (quantity <= 0) return "ამოიწურა";
    return product.stockStatus === "ამოიწურა" ? "ამოიწურა" : "მარაგშია";
  }

  function addToCart(productId) {
    const product = readState().products.find((entry) => entry.id === productId && entry.active !== false);
    if (!product || Number(product.stock) < 1) return false;

    try {
      const cartItems = JSON.parse(localStorage.getItem("movio-cart") || "[]");
      if (!Array.isArray(cartItems)) return false;
      const cartItem = cartItems.find((item) => item.id === productId);
      if (cartItem) cartItem.quantity = Math.min(cartItem.quantity + 1, product.stock, 99);
      else cartItems.push({ id: productId, quantity: 1 });
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
  }

  function getOrders() {
    return clone(readState().orders).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  function createOrder(input) {
    const state = readState();
    if (!input.items || !input.items.length) throw new Error("კალათა ცარიელია.");

    const items = input.items.map((item) => {
      const product = state.products.find((entry) => entry.id === item.id && entry.active !== false);
      if (!product) throw new Error("პროდუქტი აღარ არის ხელმისაწვდომი.");
      if (product.stock < item.quantity) throw new Error(`${product.name}: მარაგი საკმარისი არ არის.`);
      return {
        id: product.id,
        name: product.name,
        quantity: item.quantity,
        price: Number(product.price),
        image: product.image || "",
      };
    });

    const order = {
      id: `order-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      number: `MV-${Date.now().toString().slice(-8)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      createdAt: new Date().toISOString(),
      name: input.name.trim(),
      customerEmail: String(input.customerEmail || "").trim().toLocaleLowerCase("ka-GE"),
      city: input.city.trim(),
      address: input.address.trim(),
      paymentMethod: input.paymentMethod,
      items,
      total: items.reduce((sum, item) => sum + item.price * item.quantity, 0),
      status: "new",
    };

    state.products = state.products.map((product) => {
      const ordered = items.find((item) => item.id === product.id);
      return ordered ? { ...product, stock: product.stock - ordered.quantity } : product;
    });
    state.orders.unshift(order);
    writeState(state);
    return clone(order);
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
    isLegacyDemoProduct,
    getProducts,
    saveProduct,
    getStockLabel,
    addToCart,
    deleteProduct,
    getOrders,
    createOrder,
    updateOrderStatus,
    getCustomers,
  };
})();

