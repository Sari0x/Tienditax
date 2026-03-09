const DB_URL = "https://tienditax-default-rtdb.firebaseio.com";
const stores = [
  { key: "bna", name: "Tienda BNA", logo: "https://i.ibb.co/jPB2fcMJ/logo-bna.png" },
  { key: "macro", name: "Tienda Macro", logo: "https://i.ibb.co/vx557jDZ/logo-tienda-macro.webp" },
  { key: "ciudad", name: "Tienda Ciudad", logo: "https://i.ibb.co/GfKZ8K7h/logo-ciudad.webp" },
];
const fields = ["Title", "Description", "Category", "Transaction Type", "Manufacturer", "Price", "Price Without Taxes", "Available On", "Sale Price", "Sale Price Without Taxes", "sale_on", "sale_until", "Height", "Length", "Width", "Weight", "Property Quantity", "Property Names", "Property Values", "Property SKU", "BRAND", "ORIGIN_OF_PRODUCT", "stock"];
const requiredFields = ["Title", "Category", "Price", "Property SKU", "stock"];

let state = {
  user: null,
  currentStore: null,
  categories: {},
  products: {},
  history: {},
  draft: {},
};
let table = null;

const $ = (id) => document.getElementById(id);
const showToast = (msg) => {
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  $("toastContainer").appendChild(t);
  setTimeout(() => t.remove(), 2800);
};

const dbGet = async (path) => (await fetch(`${DB_URL}/${path}.json`)).json();
const dbPut = async (path, data) => fetch(`${DB_URL}/${path}.json`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
const dbPost = async (path, data) => (await fetch(`${DB_URL}/${path}.json`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })).json();

function switchView(viewId) {
  ["loginView", "storeView", "workspaceView"].forEach((id) => $(id).classList.toggle("active", id === viewId));
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

function renderCategoryList(targetId, storeKey) {
  const list = $(targetId);
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
      await persistCategories(storeKey);
      refreshCategoryUi();
    };
    row.querySelector("[data-act='d']").onclick = async () => {
      if (!confirm("¿Eliminar categoría?")) return;
      state.categories[storeKey].splice(idx, 1);
      await persistCategories(storeKey);
      refreshCategoryUi();
    };
    list.appendChild(row);
  });
}

function refreshCategoryUi() {
  const key = state.currentStore || $("categoryStoreSelect").value || "bna";
  renderCategoryList("categoriesList", $("categoryStoreSelect").value || key);
  renderCategoryList("workspaceCategoriesList", $("workspaceCategoryStoreSelect").value || key);
}

async function persistCategories(storeKey) {
  await dbPut(`categories/${storeKey}`, state.categories[storeKey] || []);
}

function buildWorkspace() {
  const container = $("tableContainer");
  const draft = state.draft[state.currentStore] || {};
  container.innerHTML = `<div class='card' style='max-width:none;margin:0;'>${fields.map((f) => `<label>${f}${requiredFields.includes(f) ? " *" : ""}</label><input data-field="${f}" value="${draft[f] || ""}"/>`).join("")}<div style='margin-top:10px;display:flex;gap:8px;'><button id='saveDraftBtn' class='ios-btn ghost'>Guardar borrador</button></div></div><div id='gridWrap' style='margin-top:8px;'></div>`;
  fields.forEach((f) => {
    const input = container.querySelector(`[data-field='${f}']`);
    input.oninput = () => {
      const storeDraft = state.draft[state.currentStore] || {};
      storeDraft[f] = input.value;
      state.draft[state.currentStore] = storeDraft;
      localStorage.setItem("ttx_draft", JSON.stringify(state.draft));
      dbPut(`drafts/${state.user}/${state.currentStore}`, storeDraft);
      validateForm();
    };
  });
  $("saveDraftBtn").onclick = () => showToast("Borrador guardado");
  renderGrid();
  validateForm();
}

function getFormData() {
  const obj = {};
  fields.forEach((f) => {
    obj[f] = document.querySelector(`#tableContainer [data-field='${f}']`)?.value?.trim() || "";
  });
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
  refreshCategoryUi();
}

async function addCategory(storeKey, name, id) {
  if (!name || !/^\d+$/.test(String(id))) return showToast("ID debe ser numérico");
  state.categories[storeKey] = state.categories[storeKey] || [];
  state.categories[storeKey].push({ name, id: Number(id) });
  await persistCategories(storeKey);
  refreshCategoryUi();
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
    await persistCategories(storeKey);
    refreshCategoryUi();
    showToast("Categorías importadas");
  } catch {
    showToast("Error al importar XLSX");
  }
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

  const record = { user: state.user, createdAt: stamp, store: state.currentStore, filename, csv };
  await dbPost(`exports/${state.user}`, record);
  showToast("Export generado");
  await loadHistory();
}

async function loadHistory() {
  const entries = await dbGet(`exports/${state.user}`) || {};
  state.history = entries;
  ["historyList", "workspaceHistoryList"].forEach((target) => {
    const box = $(target);
    box.innerHTML = "";
    Object.entries(entries).reverse().forEach(([id, h]) => {
      const row = document.createElement("div");
      row.className = "list-item";
      row.innerHTML = `<span>${h.user} - ${h.createdAt} - ${h.filename}</span><button>Descargar</button>`;
      row.querySelector("button").onclick = () => {
        const blob = new Blob([h.csv], { type: "text/csv;charset=utf-8;" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = h.filename;
        a.click();
      };
      box.appendChild(row);
    });
  });
}

function toggleHistory(isWorkspace) {
  const prefix = isWorkspace ? "workspace" : "";
  const h = $(`${prefix}HistoryList`);
  const c = $(`${prefix}CategoriesList`);
  h.classList.toggle("hidden");
  c.classList.toggle("hidden");
}

async function init() {
  renderStoreButtons();
  const userFromSession = localStorage.getItem("ttx_user");
  if (userFromSession) {
    state.user = userFromSession;
    switchView("storeView");
  }

  const allStores = [...stores.map((s) => s.key)];
  const categoriesRemote = await dbGet("categories");
  if (categoriesRemote) state.categories = categoriesRemote;
  Object.keys(state.categories).forEach((k) => { if (!allStores.includes(k)) allStores.push(k); });
  ["categoryStoreSelect", "workspaceCategoryStoreSelect"].forEach((id) => {
    $(id).innerHTML = allStores.map((s) => `<option value='${s}'>${s}</option>`).join("");
  });

  state.draft = JSON.parse(localStorage.getItem("ttx_draft") || "{}");
  refreshCategoryUi();
  loadHistory();
}

$("togglePass").onclick = () => {
  const p = $("loginPass");
  p.type = p.type === "password" ? "text" : "password";
};

async function doLogin() {
  const user = $("loginUser").value.trim();
  const pass = $("loginPass").value.trim();
  const remote = await dbGet("user");
  if (user === remote?.user && pass === String(remote?.pass)) {
    state.user = user;
    localStorage.setItem("ttx_user", user);
    switchView("storeView");
    showToast("Bienvenido");
    loadHistory();
  } else showToast("Credenciales inválidas");
}
$("loginBtn").onclick = doLogin;
$("loginPass").addEventListener("keydown", (e) => { if (e.key === "Enter") doLogin(); });
$("loginUser").addEventListener("keydown", (e) => { if (e.key === "Enter") doLogin(); });

$("menuBtn").onclick = () => $("menuDrawer").classList.toggle("open");
$("workspaceMenuBtn").onclick = () => $("workspaceDrawer").classList.toggle("open");
$("historialTabBtn").onclick = () => toggleHistory(false);
$("workspaceHistorialBtn").onclick = () => toggleHistory(true);

$("newStoreBtn").onclick = () => {
  const name = prompt("Nombre de nueva tienda");
  if (!name) return;
  const key = name.trim().toLowerCase().replaceAll(" ", "_");
  state.categories[key] = state.categories[key] || [];
  ["categoryStoreSelect", "workspaceCategoryStoreSelect"].forEach((id) => {
    const op = document.createElement("option"); op.value = key; op.textContent = key; $(id).appendChild(op);
  });
  showToast("Nueva tienda creada");
};
$("workspaceNewStoreBtn").onclick = $("newStoreBtn").onclick;

$("addCategoryBtn").onclick = () => addCategory($("categoryStoreSelect").value, $("catName").value.trim(), $("catId").value.trim());
$("workspaceAddCategoryBtn").onclick = () => addCategory($("workspaceCategoryStoreSelect").value, $("workspaceCatName").value.trim(), $("workspaceCatId").value.trim());
$("xlsxInput").onchange = (e) => importXlsx(e.target.files[0], $("categoryStoreSelect").value);
$("workspaceXlsxInput").onchange = (e) => importXlsx(e.target.files[0], $("workspaceCategoryStoreSelect").value);

$("categoryStoreSelect").onchange = refreshCategoryUi;
$("workspaceCategoryStoreSelect").onchange = refreshCategoryUi;

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
};

init();
