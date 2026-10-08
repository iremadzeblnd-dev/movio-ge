(function () {
  const client = window.movioSupabase;

  if (!window.MovioStore) return;

  function toDb(product) {
    return {
      id: String(product.id),
      name: product.name || "",
      category: product.category || "",
      category_key: product.categoryKey || null,
      price: Number(product.price || 0),
      weight_kg: product.weightKg == null ? null : Number(product.weightKg),
      free_delivery: product.freeDelivery === true,
      old_price: product.oldPrice ? Number(product.oldPrice) : null,
      stock: Number(product.stock || 0),
      description: product.description || "",
      specifications: Array.isArray(product.specifications) ? product.specifications : [],
      image: product.image || "",
      active: product.active !== false,
      old_price_visible: product.oldPriceVisible !== false,
      discount_visible: product.discountVisible === true,
      discount_percent: Number(product.discountPercent ?? 0),
      stock_quantity_visible: product.stockQuantityVisible === true,
      stock_status_visible: product.stockStatusVisible !== false,
      stock_status:
        product.stockStatus ||
        (Number(product.stock) > 0 ? "მარაგშია" : "ამოიწურა"),
      updated_at: new Date().toISOString()
    };
  }

  function fromDb(row) {
    return {
      id: row.id,
      name: row.name,
      category: row.category,
      categoryKey: row.category_key || row.category,
      price: Number(row.price || 0),
      weightKg: row.weight_kg == null ? null : Number(row.weight_kg),
      freeDelivery: typeof row.free_delivery === 'boolean' ? row.free_delivery : null,
      oldPrice: row.old_price == null ? null : Number(row.old_price),
      stock: Number(row.stock || 0),
      description: row.description || "",
      specifications: Array.isArray(row.specifications) ? row.specifications : [],
      image: row.image || "",
      active: row.active !== false,
      updatedAt: row.updated_at || null,
      oldPriceVisible: row.old_price_visible !== false,
      discountVisible: row.discount_visible === true,
      discountPercent: Number(row.discount_percent ?? 0),
      stockQuantityVisible: row.stock_quantity_visible === true,
      stockStatusVisible: row.stock_status_visible !== false,
      stockStatus:
        row.stock_status ||
        (Number(row.stock) > 0 ? "მარაგშია" : "ამოიწურა")
    };
  }

  let pendingSync;
  async function fetchCatalog() {
    window.MovioStore.setCatalog([], "loading");
    try {
      if (!client) throw new Error("Supabase client unavailable");
      let timer;
      let result;
      try {
        result = await Promise.race([
          client.from('products').select('*').order('created_at', {ascending:false}),
          new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Catalog request timed out')), 15000); })
        ]);
      } finally { clearTimeout(timer); }
      const { data, error } = result;
      if (error) throw error;
      if (!Array.isArray(data)) throw new Error("Invalid catalog response");
      window.MovioStore.setCatalog(data.map(fromDb));
    } catch (error) {
      console.error("MOVIO Supabase sync error:", error);
      window.MovioStore.setCatalog([], "error");
    }
  }
  function syncFromSupabase() {
    if (!pendingSync) pendingSync = fetchCatalog().finally(() => { pendingSync = null; });
    return pendingSync;
  }

  const originalSaveProduct = window.MovioStore.saveProduct;
  const originalDeleteProduct = window.MovioStore.deleteProduct;

  function requireAdmin() {
    if (window.movioAdminAuthorized !== true) throw new Error('Admin authorization required');
  }
  async function requireSession() {
    requireAdmin();
    const { data, error } = await client.auth.getSession();
    if (error || !data?.session) throw new Error('Admin session unavailable');
    requireAdmin();
  }
  window.MovioStore.saveProduct = function (product) {
    requireAdmin();
    const saved = window.MovioStore.validateProduct(product);
    const previous = window.MovioStore.getProducts().find(item => String(item.id) === saved.id);
    return (async () => {
      await requireSession();
      const row = toDb(saved);
      // Reject stale edits rather than overwriting a checkout stock reservation.
      let query = previous
        ? client.from('products').update(row).eq('id', saved.id).eq('stock', previous.stock).eq('stock_status', previous.stockStatus).eq('active', previous.active !== false)
        : client.from('products').insert(row);
      if (previous?.updatedAt) query = query.eq('updated_at', previous.updatedAt);
      const { data, error } = await query.select('id,updated_at');
      if (error || !Array.isArray(data) || data.length !== 1) throw new Error('პროდუქტი ვერ შეინახა ან მარაგი შეიცვალა. განაახლეთ გვერდი და სცადეთ ხელახლა.');
      requireAdmin();
      saved.updatedAt = data[0].updated_at || row.updated_at;
      return originalSaveProduct(saved);
    })();
  };
  window.MovioStore.deleteProduct = function (id) {
    requireAdmin();
    return (async () => {
      await requireSession();
      // Deactivate instead of deleting reserved products needed for cancellation.
      const { data, error } = await client.from('products').update({active:false,updated_at:new Date().toISOString()}).eq('id', String(id)).select('id');
      if (error || !Array.isArray(data) || data.length !== 1) throw new Error('პროდუქტის წაშლა ვერ მოხერხდა. სცადეთ ხელახლა.');
      requireAdmin();
      originalDeleteProduct(id);
    })();
  };

  window.MovioStore.syncFromSupabase = syncFromSupabase;

  window.MovioStore.catalogReady = syncFromSupabase();
})();


