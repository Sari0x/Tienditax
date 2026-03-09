const DB_URL = "https://tienditax-default-rtdb.firebaseio.com";
const stores = [
  { key: "bna", name: "Tienda BNA", logo: "https://i.ibb.co/jPB2fcMJ/logo-bna.png" },
  { key: "macro", name: "Tienda Macro", logo: "https://i.ibb.co/vx557jDZ/logo-tienda-macro.webp" },
  { key: "ciudad", name: "Tienda Ciudad", logo: "https://i.ibb.co/GfKZ8K7h/logo-ciudad.webp" },
];
const fields = ["Title", "Description", "Category", "Transaction Type", "Manufacturer", "Price", "Price Without Taxes", "Available On", "Sale Price", "Sale Price Without Taxes", "sale_on", "sale_until", "Height", "Length", "Width", "Weight", "Property Quantity", "Property Names", "Property Values", "Property SKU", "BRAND", "ORIGIN_OF_PRODUCT", "stock"];
const requiredFields = ["Title", "Category", "Price", "Property SKU", "stock"];

let state = { user: null, currentStore: null, categories: {}, products: {}, history: {}, draft: {} };
let table = null;
const $ = (id) => document.getElementById(id);

const dbGet = async (path) => (await fetch(`${DB_URL}/${path}.json`)).json();
const dbPut = async (path, data) => fetch(`${DB_URL}/${path}.json`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
const dbPost = async (path, data) => (await fetch(`${DB_URL}/${path}.json`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })).json();

function showToast(msg) {
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  $("toastContainer").appendChild(t);
  setTimeout(() => t.remove(), 2500);
}

function switchView(viewId) {
  ["loginView", "storeView", "workspaceView", "categoriesView"].forEach((id) => $(id).classList.toggle("active", id === viewId));
}

function nowArgentina() {
  return new Date().toLocaleString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" }).replace(" ", "_").replace(/:/g, "-");
}

function renderStoreButtons() {
  const container = $("storeButtons");
  container.innerHTML = "";
  const tpl = $("storeButtonTemplate");
  stores.forEach((store) => {
    const node = tpl.content.firstElementChild.cloneNode(true);
    node.querySelector("img").src = store.logo;
    node.querySelector("span").textContent = store.name;
    node.onclick = () => selectStore(store.key);
    container.appendChild(node);
  });
}

function renderStoreSwitchList() {
  const list = $("storeSwitchList");
  if (!list) return;
  list.innerHTML = "";
  stores
    .filter((store) => store.key !== state.currentStore)
    .forEach((store) => {
      const btn = document.createElement("button");
      btn.className = "ios-btn";
      btn.textContent = store.name;
      btn.onclick = async () => {
        $("storeSwitchModal").classList.add("hidden");
        await selectStore(store.key);
      };
      list.appendChild(btn);
    });
}

function renderCategoryList() {
  const storeKey = $("categoryStoreSelect").value;
  const list = $("categoriesList");
  const cats = state.categories[storeKey] || [];
  list.innerHTML = cats.length ? "" : "<p>Sin categorías</p>";
  cats.forEach((cat, idx) => {
    const row = document.createElement("div");
    row.className = "list-item";
    row.innerHTML = `<span>${cat.name} (#${cat.id})</span><div><button data-act='e'>✏️</button><button data-act='d'>🗑️</button></div>`;
    row.querySelector("[data-act='e']").onclick = async () => {
      const newName = prompt("Nuevo nombre", cat.name);
      const newId = prompt("Nuevo id", cat.id);
      if (!newName || !/^\d+$/.test(String(newId))) return;
      state.categories[storeKey][idx] = { name: newName, id: Number(newId) };
      await dbPut(`categories/${storeKey}`, state.categories[storeKey]);
      renderCategoryList();
      showToast("Categoría editada");
    };
    row.querySelector("[data-act='d']").onclick = async () => {
      if (!confirm("¿Eliminar categoría?")) return;
      state.categories[storeKey].splice(idx, 1);
      await dbPut(`categories/${storeKey}`, state.categories[storeKey]);
      renderCategoryList();
      showToast("Categoría eliminada");
    };
    list.appendChild(row);
  });
}

async function addCategory(storeKey, name, id) {
  if (!name || !/^\d+$/.test(String(id))) return showToast("ID debe ser numérico");
  state.categories[storeKey] = state.categories[storeKey] || [];
  state.categories[storeKey].push({ name, id: Number(id) });
  await dbPut(`categories/${storeKey}`, state.categories[storeKey]);
  renderCategoryList();
  showToast("Categoría agregada correctamente");
}

async function importXlsx(file, storeKey) {
  try {
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
    const parsed = rows.filter((r) => r[0] && /^\d+$/.test(String(r[1]))).map((r) => ({ name: String(r[0]), id: Number(r[1]) }));
    state.categories[storeKey] = [...(state.categories[storeKey] || []), ...parsed];
    await dbPut(`categories/${storeKey}`, state.categories[storeKey]);
    renderCategoryList();
    showToast("Categorías importadas");
  } catch {
    showToast("Error al importar XLSX");
  }
}

function buildWorkspace() {
  const container = $("tableContainer");
  const draft = state.draft[state.currentStore] || {};
  const formGrid = fields.map((f) => `<div class='field-block'><label>${f}${requiredFields.includes(f) ? " *" : ""}</label><input data-field='${f}' value='${(draft[f] || "").replaceAll("'", "&#39;")}'/></div>`).join("");
  container.innerHTML = `<div class='form-grid'>${formGrid}</div><div id='gridWrap'></div>`;

  fields.forEach((f) => {
    const input = container.querySelector(`[data-field='${f}']`);
    input.oninput = () => {
      const d = state.draft[state.currentStore] || {};
      d[f] = input.value;
      state.draft[state.currentStore] = d;
      localStorage.setItem("ttx_draft", JSON.stringify(state.draft));
      dbPut(`drafts/${state.user}/${state.currentStore}`, d);
      validateForm();
    };
  });

  renderGrid();
  validateForm();
}

function getFormData() {
  const obj = {};
  fields.forEach((f) => { obj[f] = document.querySelector(`#tableContainer [data-field='${f}']`)?.value?.trim() || ""; });
  return obj;
}

function validateForm() {
  const data = getFormData();
  let ok = true;
  requiredFields.forEach((f) => {
    const el = document.querySelector(`#tableContainer [data-field='${f}']`);
    const bad = !data[f];
    el?.classList.toggle("error-field", bad);
    if (bad) ok = false;
  });
  return ok;
}

function checkDuplicateSku(list) {
  const seen = new Set();
  const dup = new Set();
  list.forEach((p) => {
    const sku = p["Property SKU"];
    if (!sku) return;
    if (seen.has(sku)) dup.add(sku);
    seen.add(sku);
  });
  return [...dup];
}

function renderGrid() {
  const rows = (state.products[state.currentStore] || []).map((p) => fields.map((f) => p[f] || ""));
  if (table) table.destroy();
  table = new gridjs.Grid({
    columns: fields,
    data: rows,
    pagination: { limit: 8 },
    search: true,
    sort: true,
    language: { search: { placeholder: "Buscar..." } },
  }).render($("gridWrap"));
}

async function selectStore(key) {
  state.currentStore = key;
  $("workspaceTitle").textContent = stores.find((s) => s.key === key)?.name || key;
  const remoteProducts = await dbGet(`products/${state.user}/${key}`);
  const remoteDraft = await dbGet(`drafts/${state.user}/${key}`);
  state.products[key] = Array.isArray(remoteProducts) ? remoteProducts : (state.products[key] || []);
  if (remoteDraft) state.draft[key] = remoteDraft;
  switchView("workspaceView");
  buildWorkspace();
  renderStoreSwitchList();
}

async function exportCsv() {
  const list = state.products[state.currentStore] || [];
  if (!list.length) return showToast("No hay productos para exportar");
  const dup = checkDuplicateSku(list);
  if (dup.length) return showToast(`SKUs repetidos: ${dup.join(", ")}`);
  for (const p of list) {
    if (requiredFields.some((f) => !p[f])) return showToast("No se puede exportar: faltan campos obligatorios");
  }

  const csvRows = [fields.join(","), ...list.map((p) => fields.map((f) => `"${(p[f] || "").toString().replaceAll('"', '""')}"`).join(","))];
  const csv = csvRows.join("\n");
  const stamp = nowArgentina();
  const filename = `tienditax_${state.currentStore}_${stamp}.csv`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);

  await dbPost(`exports/${state.user}`, { user: state.user, createdAt: stamp, store: state.currentStore, filename, csv });
  showToast("Export generado");
  await loadHistory();
}

async function loadHistory() {
  const entries = await dbGet(`exports/${state.user}`) || {};
  state.history = entries;
  const box = $("historyList");
  box.innerHTML = "";
  Object.entries(entries).reverse().forEach(([, h]) => {
    const row = document.createElement("div");
    row.className = "list-item";
    row.innerHTML = `<span>${h.user} - ${h.createdAt} - ${h.filename}</span><button class='ios-btn small'>Descargar</button>`;
    row.querySelector("button").onclick = () => {
      const blob = new Blob([h.csv], { type: "text/csv;charset=utf-8;" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = h.filename;
      a.click();
    };
    box.appendChild(row);
  });
}

function openHistoryModal() {
  $("historyModal").classList.remove("hidden");
  loadHistory();
}

function closeAllDrawers() {
  $("menuDrawer").classList.remove("open");
  $("workspaceDrawer").classList.remove("open");
}

async function init() {
  renderStoreButtons();

  const categoriesRemote = await dbGet("categories");
  if (categoriesRemote) state.categories = categoriesRemote;
  const allStores = [...new Set([...stores.map((s) => s.key), ...Object.keys(state.categories)])];
  $("categoryStoreSelect").innerHTML = allStores.map((s) => `<option value='${s}'>${s}</option>`).join("");
  renderCategoryList();

  state.draft = JSON.parse(localStorage.getItem("ttx_draft") || "{}");

  const userFromSession = localStorage.getItem("ttx_user");
  if (userFromSession) {
    state.user = userFromSession;
    switchView("storeView");
    await loadHistory();
  }
}

$("togglePass").onclick = () => {
  const p = $("loginPass");
  const showing = p.type === "password";
  p.type = showing ? "text" : "password";
  $("togglePass").textContent = showing ? "Ocultar" : "Mostrar";
};

async function doLogin() {
  const user = $("loginUser").value.trim();
  const pass = $("loginPass").value.trim();
  const remote = await dbGet("user");
  if (user === remote?.user && pass === String(remote?.pass)) {
    state.user = user;
    localStorage.setItem("ttx_user", user);
    switchView("storeView");
    await loadHistory();
    showToast("Bienvenido");
  } else {
    showToast("Credenciales inválidas");
  }
}

$("loginBtn").onclick = doLogin;
$("loginPass").addEventListener("keydown", (e) => { if (e.key === "Enter") doLogin(); });
$("loginUser").addEventListener("keydown", (e) => { if (e.key === "Enter") doLogin(); });

$("menuBtn").onclick = () => $("menuDrawer").classList.toggle("open");
$("workspaceMenuBtn").onclick = () => $("workspaceDrawer").classList.toggle("open");
$("closeMenuBtn").onclick = closeAllDrawers;
$("closeWorkspaceMenuBtn").onclick = closeAllDrawers;

$("menuHistorialBtn").onclick = () => { closeAllDrawers(); openHistoryModal(); };
$("workspaceHistorialBtn").onclick = () => { closeAllDrawers(); openHistoryModal(); };

$("menuCategoriesBtn").onclick = () => { closeAllDrawers(); switchView("categoriesView"); renderCategoryList(); };
$("workspaceCategoriesBtn").onclick = () => { closeAllDrawers(); switchView("categoriesView"); renderCategoryList(); };
$("categoriesBackBtn").onclick = () => switchView(state.currentStore ? "workspaceView" : "storeView");

$("closeHistoryModal").onclick = () => $("historyModal").classList.add("hidden");
$("historyModal").onclick = (e) => { if (e.target.id === "historyModal") $("historyModal").classList.add("hidden"); };

$("changeStoreBtn").onclick = () => {
  renderStoreSwitchList();
  $("storeSwitchModal").classList.remove("hidden");
};
$("closeStoreSwitchModal").onclick = () => $("storeSwitchModal").classList.add("hidden");
$("storeSwitchModal").onclick = (e) => { if (e.target.id === "storeSwitchModal") $("storeSwitchModal").classList.add("hidden"); };

$("newStoreBtn").onclick = () => {
  const name = prompt("Nombre de nueva tienda");
  if (!name) return;
  const key = name.trim().toLowerCase().replaceAll(" ", "_");
  if (![...$("categoryStoreSelect").options].some((o) => o.value === key)) {
    const op = document.createElement("option");
    op.value = key;
    op.textContent = key;
    $("categoryStoreSelect").appendChild(op);
  }
  state.categories[key] = state.categories[key] || [];
  $("categoryStoreSelect").value = key;
  renderCategoryList();
  showToast("Nueva tienda creada");
};

$("categoryStoreSelect").onchange = renderCategoryList;
$("addCategoryBtn").onclick = () => addCategory($("categoryStoreSelect").value, $("catName").value.trim(), $("catId").value.trim());
$("xlsxInput").onchange = (e) => {
  if (e.target.files?.[0]) importXlsx(e.target.files[0], $("categoryStoreSelect").value);
};

$("addRowBtn").onclick = async () => {
  if (!validateForm()) return showToast("Completá los campos obligatorios");
  const data = getFormData();
  state.products[state.currentStore] = state.products[state.currentStore] || [];
  state.products[state.currentStore].push(data);
  await dbPut(`products/${state.user}/${state.currentStore}`, state.products[state.currentStore]);
  renderGrid();
  showToast("Producto agregado");
};

$("clearFormBtn").onclick = () => {
  fields.forEach((f) => {
    const el = document.querySelector(`#tableContainer [data-field='${f}']`);
    if (el) el.value = "";
  });
  state.draft[state.currentStore] = {};
  localStorage.setItem("ttx_draft", JSON.stringify(state.draft));
  dbPut(`drafts/${state.user}/${state.currentStore}`, {});
  validateForm();
};

$("categorySearch").oninput = (e) => {
  const term = e.target.value.trim();
  if (!term) return;
  const cats = state.categories[state.currentStore] || [];
  const match = cats.find((c) => String(c.id).includes(term));
  if (match) {
    const catInput = document.querySelector(`#tableContainer [data-field='Category']`);
    if (catInput) catInput.value = String(match.id);
  }
};

$("manualCategoryBtn").onclick = () => $("manualCategoryInput").classList.toggle("hidden");
$("manualCategoryInput").onchange = async (e) => {
  const id = e.target.value.trim();
  if (!/^\d+$/.test(id)) return showToast("ID manual inválido");
  const catInput = document.querySelector(`#tableContainer [data-field='Category']`);
  if (catInput) catInput.value = id;
  await addCategory(state.currentStore, `Manual ${id}`, id);
};

$("exportBtn").onclick = exportCsv;
$("logoutBtn").onclick = () => {
  localStorage.removeItem("ttx_user");
  state.user = null;
  state.currentStore = null;
  switchView("loginView");
  closeAllDrawers();
};

init();
