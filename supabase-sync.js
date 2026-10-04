(function () {
  const client = window.movioSupabase;
  const STORAGE_KEY = "movio-data-v1";

  if (!client || !window.MovioStore) return;

  function toDb(product) {
    return {
      id: String(product.id),
      name: product.name || "",
      category: product.category || "",
      category_key: product.categoryKey || null,
      price: Number(product.price || 0),
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
      oldPrice: row.old_price == null ? null : Number(row.old_price),
      stock: Number(row.stock || 0),
      description: row.description || "",
      specifications: Array.isArray(row.specifications) ? row.specifications : [],
      image: row.image || "",
      active: row.active !== false,
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

  async function syncFromSupabase() {
    const { data, error } = await client
      .from("products")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("MOVIO Supabase sync error:", error);
      return;
    }

    try {
      const state = JSON.parse(
        localStorage.getItem(STORAGE_KEY) ||
        '{"products":[],"orders":[]}'
      );

      const remoteProducts = (data || [])
        .filter((row) => !window.MovioStore.isLegacyDemoProduct(row))
        .map(fromDb);
      const currentProducts = Array.isArray(state.products)
        ? state.products
        : [];

      const currentJson = JSON.stringify(currentProducts);
      const remoteJson = JSON.stringify(remoteProducts);

      if (currentJson !== remoteJson) {
        state.products = remoteProducts;
        if (!Array.isArray(state.orders)) state.orders = [];

        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        window.location.reload();
      }
    } catch (error) {
      console.error("MOVIO local cache error:", error);
    }
  }

  const originalSaveProduct = window.MovioStore.saveProduct;
  const originalDeleteProduct = window.MovioStore.deleteProduct;

  window.MovioStore.saveProduct = function (product) {
  const saved = originalSaveProduct(product);

  (async () => {
    try {
      const { data: sessionData, error: sessionError } =
        await client.auth.getSession();

      if (sessionError) throw sessionError;

      if (!sessionData.session) {
        alert("Supabase: Admin-ის სესია ვერ მოიძებნა. თავიდან შედი Admin-ში.");
        return;
      }

      const { error } = await client
        .from("products")
        .upsert(toDb(saved), { onConflict: "id" });

      if (error) throw error;

      alert("✅ პროდუქტი ონლაინ ბაზაშიც წარმატებით დაემატა.");
    } catch (error) {
      console.error("SUPABASE SAVE ERROR:", error);
      alert("❌ Supabase შეცდომა: " + (error?.message || String(error)));
    }
  })();

  return saved;
};

  window.MovioStore.deleteProduct = function (id) {
    originalDeleteProduct(id);

    client
      .from("products")
      .delete()
      .eq("id", id)
      .then(({ error }) => {
        if (error) {
          console.error(error);
          alert("პროდუქტი ლოკალურად წაიშალა, მაგრამ ონლაინ ბაზიდან ვერ წაიშალა.");
        }
      });
  };

  window.MovioStore.syncFromSupabase = syncFromSupabase;

  syncFromSupabase();
})();


