let adminOrders = [], ordersGeneration = 0, ordersBusy = false;
function adminCustomers() {
  const customers = new Map();
  for (const order of adminOrders) {
    const key = JSON.stringify([order.phone, order.name]);
    const customer = customers.get(key) || {name:order.name,phone:order.phone,city:order.city,totalOrders:0,totalSpent:0,orders:[]};
    customer.totalOrders++;
    if (order.status !== 'cancelled') customer.totalSpent += order.total;
    customer.orders.push(order); customers.set(key,customer);
  }
  return [...customers.values()].sort((a,b)=>b.totalSpent-a.totalSpent);
}
async function loadAdminOrders() {
  if (window.movioAdminAuthorized !== true) return;
  const generation = ++ordersGeneration;
  ordersBusy = true;
  const message = document.getElementById('adminOrdersMessage');
  message.textContent = 'შეკვეთები იტვირთება…';
  renderAll();
  try {
    const orders = [];
    for (let offset = 0; ; offset += 100) {
      const result = await window.movioSupabase.rpc('movio_admin_orders', {p_offset:offset});
      if (generation !== ordersGeneration || window.movioAdminAuthorized !== true) return;
      if (result.error || !Array.isArray(result.data)) throw Error('შეკვეთების ჩატვირთვა ვერ მოხერხდა. სცადეთ განახლება.');
      orders.push(...result.data);
      if (result.data.length < 100) break;
    }
    adminOrders = orders; message.textContent = '';
  } catch (error) {
    if (generation !== ordersGeneration) return;
    adminOrders = []; message.textContent = error.message;
  } finally {
    if (generation === ordersGeneration) { ordersBusy = false; renderAll(); }
  }
}
document.getElementById('refreshAdminOrders').addEventListener('click', loadAdminOrders);

﻿const CATEGORY_LABELS = {
  "electric-scooters": "ელექტრო სკუტერები",
  "electric-bikes": "ელექტრო ველოსიპედები",
  "quad-bikes": "კვადრო ციკლები",
  "car-accessories": "მანქანის აქსესუარები",
};

const ORDER_STATUSES = [
  ["received", "მიღებულია"],
  ["preparing", "მზადდება"],
  ["shipped", "გაგზავნილი"],
  ["completed", "დასრულებული"],
  ["cancelled", "გაუქმებული"],
];

const money = (value) => `${new Intl.NumberFormat("ka-GE", { maximumFractionDigits: 2 }).format(value)} ₾`;
const date = (value) => new Intl.DateTimeFormat("ka-GE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value));
const element = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

function addCell(row, value, className) {
  const cell = element("td", className, value);
  row.appendChild(cell);
  return cell;
}

function emptyRow(body, message, colspan) {
  body.replaceChildren();
  const row = document.createElement("tr");
  const cell = element("td", "empty-state", message);
  cell.colSpan = colspan;
  row.appendChild(cell);
  body.appendChild(row);
}

function statusSelect(order) {
  const select = element("select", "status-select");
  select.dataset.orderId = order.id;
  select.setAttribute("aria-label", `შეკვეთა ${order.number} სტატუსი`);
  ORDER_STATUSES.forEach(([value, label]) => {
    const option = element("option", "", label);
    option.value = value;
    option.selected = order.status === value;
    select.appendChild(option);
  });
  select.disabled = ordersBusy || ["cancelled", "completed"].includes(order.status);
  return select;
}

function orderSummary(order) {
  const details = element("details", "order-details");
  details.appendChild(element("summary", "", "ნახვა"));
  const content = element("div", "detail-content");
  content.appendChild(element("div", "", `ტელეფონი: ${order.phone}`));
  content.appendChild(element("div", "", `ქალაქი: ${order.city}`));
  content.appendChild(element("div", "", `მისამართი: ${order.address}`));
  content.appendChild(element("div", "", `გადახდა: ${order.paymentMethod}`));
  content.appendChild(element("div", "", `ელფოსტა: ${order.email || "—"}`));
  content.appendChild(element("div", "", `მიწოდება: ${money(order.deliveryCost)} · ${order.deliveryType || "—"}`));
  content.appendChild(element("div", "", `პროდუქტების ჯამი: ${money(order.subtotal)}`));
  content.appendChild(element("div", "", `გადახდის სტატუსი: ${order.paymentStatus}`));
  content.appendChild(element("div", "", order.deliveryInformation || ""));
  const items = element("ul", "detail-items");
  order.items.forEach((item) => items.appendChild(element("li", "", `${item.name} × ${item.quantity} · ${money(item.price * item.quantity)}`)));
  content.appendChild(items);
  details.appendChild(content);
  return details;
}

function renderDashboard() {
  if (window.movioAdminAuthorized !== true) return;
  const orders = adminOrders;
  const products = MovioStore.getProducts();
  const completed = orders.filter((order) => order.status === "completed");
  const sales = orders.filter((order) => order.status !== "cancelled").reduce((sum, order) => sum + order.total, 0);
  document.querySelector("#metric-orders").textContent = orders.length;
  document.querySelector("#metric-new").textContent = orders.filter((order) => order.status === "received").length;
  document.querySelector("#metric-completed").textContent = completed.length;
  document.querySelector("#metric-sales").textContent = money(sales);
  document.querySelector("#metric-low-stock").textContent = products.filter((product) => product.stock <= 3).length;

  const body = document.querySelector("#latestOrders");
  body.replaceChildren();
  document.querySelector("#latestEmpty").hidden = orders.length > 0;
  orders.slice(0, 5).forEach((order) => {
    const row = document.createElement("tr");
    addCell(row, order.number, "order-number");
    addCell(row, date(order.createdAt), "muted");
    addCell(row, order.name);
    addCell(row, money(order.total));
    row.appendChild(addCell(row, "").appendChild(statusSelect(order)).parentElement);
    body.appendChild(row);
  });
}

function renderProducts() {
  if (window.movioAdminAuthorized !== true) return;
  const products = MovioStore.getProducts();
  const query = document.querySelector("#productSearch").value.trim().toLocaleLowerCase("ka-GE");
  const category = document.querySelector("#productCategoryFilter").value;
  const filtered = products.filter((product) => {
    const matchesQuery = `${product.name} ${product.description}`.toLocaleLowerCase("ka-GE").includes(query);
    return product.active !== false && matchesQuery && (!category || product.category === category);
  });
  document.querySelector("#productCount").textContent = `(${filtered.length})`;
  const list = document.querySelector("#productsList");
  list.replaceChildren();
  if (!filtered.length) {
    list.appendChild(element("p", "empty-state", "პროდუქტები ვერ მოიძებნა."));
    return;
  }

  filtered.forEach((product) => {
    const row = element("article", "product-row");
    const imageBox = element("div", "product-image");
    if (product.image) {
      const image = document.createElement("img");
      image.src = product.image;
      image.alt = product.name;
      imageBox.appendChild(image);
    } else {
      imageBox.textContent = "MOVIO";
    }
    const name = document.createElement("div");
    name.appendChild(element("strong", "product-name", product.name));
    name.appendChild(element("small", "product-meta", product.description || "აღწერა არ არის"));
    const category = element("span", "product-meta product-category", CATEGORY_LABELS[product.category] || product.category);
    const price = element("div", "product-price", money(product.price));
    if (product.oldPrice) price.appendChild(element("small", "product-meta", `ძველი ფასი: ${money(product.oldPrice)}`));
    const stock = element("div", "product-stock");
    if (product.stockStatusVisible !== false) {
      const status = MovioStore.getStockLabel(product);
      const stockClass = status === "მარაგშია" ? "stock-available" : "stock-unavailable";
      stock.classList.add(stockClass);
      stock.appendChild(element("span", "product-stock-status", status));
    }
    stock.appendChild(element("small", "product-meta", `რაოდენობა: ${product.stock}`));
    const actions = element("div", "product-actions");
    const edit = element("button", "quiet-button", "რედაქტირება");
    edit.type = "button";
    edit.dataset.productAction = "edit";
    edit.dataset.productId = product.id;
    const remove = element("button", "danger-button", "წაშლა");
    remove.type = "button";
    remove.dataset.productAction = "delete";
    remove.dataset.productId = product.id;
    actions.append(edit, remove);
    row.append(imageBox, name, category, price, stock, actions);
    list.appendChild(row);
  });
}

function renderOrders() {
  if (window.movioAdminAuthorized !== true) return;
  const orders = adminOrders;
  const query = document.querySelector("#orderSearch").value.trim().toLocaleLowerCase("ka-GE");
  const status = document.querySelector("#orderStatusFilter").value;
  const filtered = orders.filter((order) => {
    const haystack = `${order.number} ${order.name} ${order.phone} ${order.city} ${order.address} ${order.items.map((item) => item.name).join(" ")}`.toLocaleLowerCase("ka-GE");
    return haystack.includes(query) && (!status || order.status === status);
  });
  document.querySelector("#orderCount").textContent = `(${filtered.length})`;
  const body = document.querySelector("#ordersList");
  body.replaceChildren();
  document.querySelector("#ordersEmpty").hidden = filtered.length > 0;
  filtered.forEach((order) => {
    const row = document.createElement("tr");
    const numberCell = addCell(row, "");
    numberCell.appendChild(element("strong", "order-number", order.number));
    numberCell.appendChild(element("small", "product-meta", date(order.createdAt)));
    addCell(row, order.name);
    addCell(row, order.items.map((item) => `${item.name} × ${item.quantity}`).join(", "));
    addCell(row, money(order.total));
    row.appendChild(addCell(row, "").appendChild(statusSelect(order)).parentElement);
    row.appendChild(addCell(row, "").appendChild(orderSummary(order)).parentElement);
    body.appendChild(row);
  });
}

function renderCustomers() {
  if (window.movioAdminAuthorized !== true) return;
  const customers = adminCustomers();
  const query = document.querySelector("#customerSearch").value.trim().toLocaleLowerCase("ka-GE");
  const filtered = customers.filter((customer) => `${customer.name} ${customer.phone} ${customer.city}`.toLocaleLowerCase("ka-GE").includes(query));
  document.querySelector("#customerCount").textContent = `(${filtered.length})`;
  const body = document.querySelector("#customersList");
  body.replaceChildren();
  document.querySelector("#customersEmpty").hidden = filtered.length > 0;
  filtered.forEach((customer) => {
    const row = document.createElement("tr");
    addCell(row, customer.name);
    addCell(row, customer.phone);
    addCell(row, customer.city);
    addCell(row, customer.totalOrders);
    addCell(row, money(customer.totalSpent));
    const historyCell = addCell(row, "");
    const history = element("button", "quiet-button", "ისტორია");
    history.type = "button";
    history.dataset.customerPhone = customer.phone;
    history.dataset.customerName = customer.name;
    historyCell.appendChild(history);
    body.appendChild(row);
  });
}

function renderAll() {
  if (window.movioAdminAuthorized !== true) return;
  renderDashboard();
  renderProducts();
  renderOrders();
  renderCustomers();
}

function showView(viewName) {
  if (window.movioAdminAuthorized !== true) return;
  document.querySelectorAll("[data-view]").forEach((view) => {
    view.hidden = view.dataset.view !== viewName;
  });
  document.querySelectorAll("[data-view-link]").forEach((button) => {
    if (button.matches(".navigation button")) {
      if (button.dataset.viewLink === viewName) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    }
  });
}

function resetProductForm() {
  const form = document.querySelector("#productForm");
  form.reset();
  document.querySelector("#productSpecifications").replaceChildren();
  document.querySelector("#productId").value = "";
  document.querySelector("#productStock").value = 1;
  document.querySelector("#productWeightKg").value = '';
  document.querySelector("#productFreeDelivery").checked = false;
  document.querySelector('#productWeightKg').required = true;
  document.querySelector("#productStockStatus").value = "მარაგშია";
  document.querySelector("#productOldPriceVisible").checked = true;
  document.querySelector("#productDiscountVisible").checked = false;
  document.querySelector("#productDiscountPercent").value = 0;
  document.querySelector("#productStockQuantityVisible").checked = false;
  document.querySelector("#productStockStatusVisible").checked = true;
  document.querySelector("#productFormHeading").textContent = "ახალი პროდუქტი";
  document.querySelector("#productMessage").textContent = "";
  form.hidden = true;
}

function addSpecificationRow(specification = {}) {
  const row = document.createElement("div");
  row.className = "admin-specification-row";
  const label = document.createElement("input");
  label.name = "specificationLabel";
  label.placeholder = "დასახელება";
  label.setAttribute("aria-label", "მახასიათებლის დასახელება");
  label.maxLength = 100;
  label.value = specification.label || "";
  const value = document.createElement("input");
  value.name = "specificationValue";
  value.placeholder = "მნიშვნელობა";
  value.setAttribute("aria-label", "მახასიათებლის მნიშვნელობა");
  value.maxLength = 500;
  value.value = specification.value || "";
  const remove = document.createElement("button");
  remove.type = "button";
  remove.textContent = "წაშლა";
  remove.addEventListener("click", () => row.remove());
  row.append(label, value, remove);
  document.querySelector("#productSpecifications").append(row);
}

document.querySelector("#addSpecificationButton").addEventListener("click", () => addSpecificationRow());

function updateProductWeightRequirement() {
  document.querySelector('#productWeightKg').required = !document.querySelector('#productFreeDelivery').checked;
}
document.querySelector('#productFreeDelivery').addEventListener('change', updateProductWeightRequirement);

function editProduct(product) {
  if (window.movioAdminAuthorized !== true) return;
  const form = document.querySelector("#productForm");
  form.hidden = false;
  document.querySelector("#productFormHeading").textContent = "პროდუქტის რედაქტირება";
  document.querySelector("#productId").value = product.id;
  document.querySelector("#productName").value = product.name;
  document.querySelector("#productCategory").value = product.category;
  document.querySelector("#productPrice").value = product.price;
  document.querySelector("#productWeightKg").value = product.weightKg ?? '';
  document.querySelector("#productFreeDelivery").checked = product.freeDelivery === true;
  updateProductWeightRequirement();
  document.querySelector("#productOldPrice").value = product.oldPrice ?? "";
  document.querySelector("#productStock").value = product.stock;
  document.querySelector("#productStockStatus").value = MovioStore.getStockLabel(product);
  document.querySelector("#productOldPriceVisible").checked = product.oldPriceVisible !== false;
  document.querySelector("#productDiscountVisible").checked = product.discountVisible === true;
  document.querySelector("#productDiscountPercent").value = product.discountPercent ?? 0;
  document.querySelector("#productStockQuantityVisible").checked = product.stockQuantityVisible === true;
  document.querySelector("#productStockStatusVisible").checked = product.stockStatusVisible !== false;
  document.querySelector("#productDescription").value = product.description || "";
  document.querySelector("#productSpecifications").replaceChildren();
  (Array.isArray(product.specifications) ? product.specifications : []).forEach(addSpecificationRow);
  document.querySelector("#productMessage").textContent = "ფოტოს არჩევის გარეშე არსებული ფოტო შენარჩუნდება.";
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function readImage(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve("");
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("ფოტოს წაკითხვა ვერ მოხერხდა."));
    reader.readAsDataURL(file);
  });
}

function showCustomerHistory(phone, name) {
  if (window.movioAdminAuthorized !== true) return;
  const customer = adminCustomers().find((entry) => entry.phone === phone && entry.name === name);
  if (!customer) return;
  document.querySelector("#customerDialogTitle").textContent = `${customer.name} · შეკვეთების ისტორია`;
  const history = document.querySelector("#customerHistory");
  history.replaceChildren();
  customer.orders.forEach((order) => {
    const item = element("article", "history-item");
    item.appendChild(element("strong", "order-number", order.number));
    item.appendChild(element("div", "", `${date(order.createdAt)} · ${money(order.total)} · ${ORDER_STATUSES.find(([value]) => value === order.status)?.[1] || order.status}`));
    item.appendChild(element("div", "muted", order.items.map((product) => `${product.name} × ${product.quantity}`).join(", ")));
    history.appendChild(item);
  });
  document.querySelector("#customerDialog").showModal();
}

document.querySelectorAll("[data-view-link]").forEach((button) => button.addEventListener("click", () => showView(button.dataset.viewLink)));
document.querySelector("#productSearch").addEventListener("input", renderProducts);
document.querySelector("#productCategoryFilter").addEventListener("change", renderProducts);
document.querySelector("#orderSearch").addEventListener("input", renderOrders);
document.querySelector("#orderStatusFilter").addEventListener("change", renderOrders);
document.querySelector("#customerSearch").addEventListener("input", renderCustomers);
document.querySelector("#newProductButton").addEventListener("click", () => {
  resetProductForm();
  const form = document.querySelector("#productForm");
  form.hidden = false;
  form.scrollIntoView({ behavior: "smooth", block: "start" });
});
document.querySelector("#cancelProductButton").addEventListener("click", resetProductForm);
document.querySelector("#closeCustomerDialog").addEventListener("click", () => document.querySelector("#customerDialog").close());

document.querySelector("#productForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (form.hasAttribute('aria-busy')) return;
  form.setAttribute('aria-busy','true');
  const submit = form.querySelector('[type="submit"]');
  if (submit) submit.disabled = true;
  const message = document.querySelector("#productMessage");
  const data = new FormData(form);
  const id = data.get("id") || `product-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const previous = MovioStore.getProducts().find((product) => product.id === id);
  try {
    const image = await readImage(data.get("image").size ? data.get("image") : null);
    const product = {
      id,
      name: data.get("name").trim(),
      category: data.get("category"),
      price: Number(data.get("price")),
      weightKg: data.get("weightKg") === '' ? null : Number(data.get("weightKg")),
      freeDelivery: data.get("freeDelivery") !== null,
      oldPrice: data.get("oldPrice") ? Number(data.get("oldPrice")) : null,
      stock: Number(data.get("stock")),
      stockStatus: data.get("stockStatus"),
      oldPriceVisible: data.get("oldPriceVisible") !== null,
      discountVisible: data.get("discountVisible") !== null,
      discountPercent: Number(data.get("discountPercent")),
      stockQuantityVisible: data.get("stockQuantityVisible") !== null,
      stockStatusVisible: data.get("stockStatusVisible") !== null,
      description: data.get("description").trim(),
      specifications: data.getAll("specificationLabel").map((label, index) => ({
        label: label.trim(),
        value: String(data.getAll("specificationValue")[index] || "").trim(),
      })).filter((entry) => entry.label || entry.value),
      image: image || previous?.image || "",
      active: true,
    };
    if (window.movioAdminAuthorized !== true) return;
    await MovioStore.saveProduct(product);
    if (window.movioAdminAuthorized !== true) return;
    resetProductForm();
    document.querySelector("#productForm").hidden = false;
    renderAll();
    document.querySelector("#productMessage").textContent = "პროდუქტი შენახულია.";
  } catch (error) {
    message.textContent = error.message || "პროდუქტი ვერ შეინახა. შეამოწმეთ ბრაუზერის საცავის სივრცე.";
  } finally {
    form.removeAttribute('aria-busy');
    if (submit) submit.disabled = false;
  }
});

document.querySelector("#productsList").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-product-action]");
  if (!button) return;
  const product = MovioStore.getProducts().find((item) => item.id === button.dataset.productId);
  if (!product) return;
  if (button.dataset.productAction === "edit") editProduct(product);
  if (button.dataset.productAction === "delete" && window.confirm(`წავშალოთ პროდუქტი „${product.name}“?`)) {
    try {
      button.disabled = true;
      await MovioStore.deleteProduct(product.id);
      renderAll();
    } catch (error) {
      window.alert("პროდუქტის წაშლა ვერ მოხერხდა.");
    } finally { button.disabled = false; }
  }
});

document.addEventListener("change", async (event) => {
  const select = event.target.closest(".status-select");
  if (!select || ordersBusy || window.movioAdminAuthorized !== true) return;
  try {
    const orderId = select.dataset.orderId, status = select.value, generation = ordersGeneration;
    ordersBusy = true; renderAll();
    const result = await window.movioSupabase.rpc('movio_admin_order_status', {p_order_id: orderId, p_status: status});
    if (generation !== ordersGeneration || window.movioAdminAuthorized !== true) return;
    if (result.error) throw Error('სტატუსის განახლება ვერ მოხერხდა. განაახლეთ შეკვეთები და სცადეთ ხელახლა.');
    await loadAdminOrders();
  } catch (error) {
    if (window.movioAdminAuthorized === true) window.alert(error.message || "სტატუსის განახლება ვერ მოხერხდა.");
  } finally { ordersBusy = false; renderAll(); }
});

document.querySelector("#customersList").addEventListener("click", (event) => {
  const button = event.target.closest("[data-customer-phone]");
  if (button) showCustomerHistory(button.dataset.customerPhone, button.dataset.customerName);
});

window.addEventListener("storage", (event) => {
  if (event.key === "movio-data-v1") renderAll();
});

window.MovioAdminUI = {
  setAuthorized(authorized) {
    if (authorized && window.movioAdminAuthorized === true) { renderAll(); loadAdminOrders(); return; }
    ++ordersGeneration; adminOrders = []; ordersBusy = false;
    for (const id of ['latestOrders','productsList','ordersList','customersList','customerHistory']) document.getElementById(id)?.replaceChildren();
    for (const id of ['metric-orders','metric-new','metric-completed','metric-sales','metric-low-stock','productCount','orderCount','customerCount']) {
      const node = document.getElementById(id); if (node) node.textContent = '';
    }
    resetProductForm();
    document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
  }
};
const adminRoot = document.getElementById('adminPanel');
for (const type of ['click','input','change','submit']) adminRoot.addEventListener(type, event => {
  if (window.movioAdminAuthorized !== true) { event.preventDefault(); event.stopImmediatePropagation(); }
}, true);
window.MovioAdminUI.setAuthorized(false);


window.addEventListener("movio:catalog", () => { if (window.movioAdminAuthorized === true) renderAll(); });
