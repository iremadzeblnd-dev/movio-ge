(function () {
  const client = window.movioSupabase;

  if (!window.MovioStore) return;

  function toDb(product) {
    return {
      id: String(product.id),
      name: product.name || "",
      category: product.category || "",
      category_key: window.MovioStore.getCategoryKey(product) || null,
      price: Number(product.price || 0),
      weight_kg: product.weightKg == null ? null : Number(product.weightKg),
      free_delivery: product.freeDelivery === true,
      old_price: product.oldPrice ? Number(product.oldPrice) : null,
      stock: Number(product.stock || 0),
      description: product.description || "",
      specifications: Array.isArray(product.specifications) ? product.specifications : [],
      image: product.image || "",
      images: product.images,
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
      categoryKey: window.MovioStore.getCategoryKey({ categoryKey: row.category_key, category: row.category }),
      price: Number(row.price || 0),
      weightKg: row.weight_kg == null ? null : Number(row.weight_kg),
      freeDelivery: typeof row.free_delivery === 'boolean' ? row.free_delivery : null,
      oldPrice: row.old_price == null ? null : Number(row.old_price),
      stock: Number(row.stock || 0),
      description: row.description || "",
      specifications: Array.isArray(row.specifications) ? row.specifications : [],
      image: row.image || "",
      images: Array.isArray(row.images) ? row.images : (row.image ? [row.image] : []),
      imagesLoaded: Object.prototype.hasOwnProperty.call(row, 'image'),
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
  const detailPage = typeof document !== 'undefined' && !!document.querySelector?.('#productDetail');
  const homePage = typeof document !== 'undefined' && !!document.querySelector?.('[data-managed-products]');
  const imageMemoryCache = new Map();
  const imageCachePrefix = `movio-main-image-v1:${typeof SUPABASE_URL === 'string' ? SUPABASE_URL : 'local'}:`;
  function readMainImage(product) {
    if (!product?.updatedAt) return null;
    const key = imageCachePrefix + product.id;
    let cached = imageMemoryCache.get(key);
    if (!cached) {
      try { cached = JSON.parse(sessionStorage.getItem(key)); } catch { /* Optional image cache. */ }
    }
    return cached?.revision === product.updatedAt && typeof cached.image === 'string' ? cached : null;
  }
  function rememberMainImage(row) {
    if (!row.updated_at || typeof row.image !== 'string') return;
    const key = imageCachePrefix + row.id;
    const cached = {revision:row.updated_at,image:row.image};
    imageMemoryCache.set(key, cached);
    try { sessionStorage.setItem(key, JSON.stringify(cached)); } catch { /* Quota/privacy settings never block catalog loading. */ }
  }
  const metadataFields = 'id,name,category,category_key,price,weight_kg,free_delivery,old_price,stock,description,specifications,active,updated_at,old_price_visible,discount_visible,discount_percent,stock_quantity_visible,stock_status_visible,stock_status';
  async function timedRequest(query, timeout = 8000) {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    if (controller && typeof query.abortSignal === 'function') query = query.abortSignal(controller.signal);
    let timer;
    try {
      return await Promise.race([query, new Promise((_, reject) => {
        timer = setTimeout(() => { controller?.abort(); reject(new Error('Request timed out')); }, timeout);
      })]);
    } finally { clearTimeout(timer); }
  }
  async function fetchCatalog() {
    window.MovioStore.setCatalog([], "loading");
    try {
      if (!client) throw new Error("Supabase client unavailable");
      const result = await timedRequest(client.from('products').select(detailPage || homePage ? metadataFields : '*').order('created_at', {ascending:false}), detailPage || homePage ? 8000 : 15000);
      const { data, error } = result;
      if (error) throw error;
      if (!Array.isArray(data)) throw new Error("Invalid catalog response");
      window.MovioStore.setCatalog(data.map(row => {
        const product = fromDb(row);
        const cached = !product.imagesLoaded && readMainImage(product);
        return cached ? {...product,image:cached.image,images:cached.image ? [cached.image] : []} : product;
      }));
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
      if (error?.code === 'PGRST204' || error?.code === '42703') {
        throw new Error('პროდუქტის სქემა განახლებას საჭიროებს. ადმინისტრატორმა უნდა შეამოწმოს საჭირო მიგრაციები, მათ შორის supabase-product-images.sql.');
      }
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
  const pendingImages = new Map();
  window.MovioStore.loadProductImageData = function (id, gallery = false) {
    const product = window.MovioStore.getProducts().find(item => String(item.id) === String(id));
    if (product?.active === false) return Promise.reject(new Error('Product images unavailable'));
    const cached = !gallery && readMainImage(product);
    if (cached) return Promise.resolve({id:String(id),image:cached.image,updated_at:cached.revision});
    const key = `${id}:${gallery}`;
    if (!pendingImages.has(key)) pendingImages.set(key, (async () => {
      if (!client) throw new Error('Image service unavailable');
      const result = await timedRequest(client.from('products').select(gallery ? 'id,images,active,updated_at' : 'id,image,active,updated_at')
        .eq('id', String(id)).limit(1), gallery ? 12000 : 8000);
      if (result.error || !Array.isArray(result.data) || result.data.length !== 1 || result.data[0].active === false) throw new Error('Product images unavailable');
      if (!gallery) rememberMainImage(result.data[0]);
      return result.data[0];
    })().finally(() => pendingImages.delete(key)));
    return pendingImages.get(key);
  };

  window.MovioStore.catalogReady = syncFromSupabase();
})();


