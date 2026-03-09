const DB_URL = "https://tienditax-default-rtdb.firebaseio.com";
const stores = [
  { key: "bna", name: "Tienda BNA", logo: "https://i.ibb.co/jPB2fcMJ/logo-bna.png" },
  { key: "macro", name: "Tienda Macro", logo: "https://i.ibb.co/vx557jDZ/logo-tienda-macro.webp" },
  { key: "ciudad", name: "Tienda Ciudad", logo: "https://i.ibb.co/GfKZ8K7h/logo-ciudad.webp" },
];
const STORE_FIELDS = {
  bna: ["Title", "Description", "Category", "Transaction Type", "Manufacturer", "Price", "Price Without Taxes", "Available On", "Sale Price", "Sale Price Without Taxes", "sale_on", "sale_until", "Height", "Length", "Width", "Weight", "Property Quantity", "Property Names", "Property Values", "Property SKU", "BRAND", "ORIGIN_OF_PRODUCT"],
  ciudad: ["Title", "Description", "Category", "Transaction Type", "Manufacturer", "Price", "Price Without Taxes", "Available On", "Sale Price", "Sale Price Without Taxes", "sale_on", "sale_until", "Height", "Length", "Width", "Weight", "Property Quantity", "Property Names", "Property Values", "Property SKU", "BRAND", "ORIGIN_OF_PRODUCT"],
  macro: ["Title", "Description", "Category", "Transaction Type", "Manufacturer", "Price", "Price Without Taxes", "Available On", "Sale Price", "Sale Price Without Taxes", "sale_on", "sale_until", "Height", "Length", "Width", "Weight", "Property Quantity", "Property Names", "Property Values", "Property SKU"],
};
const REQUIRED_FIELDS = ["Title", "Category", "Price", "Property SKU"];
const CATEGORY_STORE_OPTIONS = [
  { key: "bna_ciudad", label: "Tienda bna y ciudad" },
  { key: "macro", label: "Tienda Macro" },
];

let state = { user: null, currentStore: null, categories: {}, products: {}, draft: {}, pendingDelete: null };
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
function categoryBucket(storeKey) {
  return storeKey === "macro" ? "macro" : "bna_ciudad";
}
function storeFields() {
  return STORE_FIELDS[state.currentStore] || STORE_FIELDS.bna;
}

function renderStoreButtons() {
  const container = $("storeButtons");
  const tpl = $("storeButtonTemplate");
  container.innerHTML = "";
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
  list.innerHTML = "";
  stores.filter((s) => s.key !== state.currentStore).forEach((store) => {
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

function renderCategorySelectOptions() {
  $("categoryStoreSelect").innerHTML = CATEGORY_STORE_OPTIONS.map((o) => `<option value='${o.key}'>${o.label}</option>`).join("");
}

function openDeleteModal(onAccept) {
  state.pendingDelete = onAccept;
  $("confirmDeleteModal").classList.remove("hidden");
  $("confirmDeleteBtn").focus();
}
function closeDeleteModal() {
  state.pendingDelete = null;
  $("confirmDeleteModal").classList.add("hidden");
}

function renderCategoryList() {
  const bucket = $("categoryStoreSelect").value;
  const list = $("categoriesList");
  const cats = state.categories[bucket] || [];
  list.innerHTML = cats.length ? "" : "<p>Sin categorías</p>";
  cats.forEach((cat, idx) => {
    const row = document.createElement("div");
    row.className = "list-item";
    row.innerHTML = `<span>${cat.name} (#${cat.id})</span><div><button data-act='e'>✏️</button><button data-act='d'>🗑️</button></div>`;
    row.querySelector("[data-act='e']").onclick = async () => {
      const name = prompt("Nuevo nombre", cat.name);
      const id = prompt("Nuevo id", cat.id);
      if (!name || !/^\d+$/.test(String(id))) return;
      state.categories[bucket][idx] = { name, id: Number(id) };
      await dbPut(`categories/${bucket}`, state.categories[bucket]);
      renderCategoryList();
    };
    row.querySelector("[data-act='d']").onclick = () => {
      openDeleteModal(async () => {
        state.categories[bucket].splice(idx, 1);
        await dbPut(`categories/${bucket}`, state.categories[bucket]);
        renderCategoryList();
        showToast("Categoría eliminada");
      });
    };
    list.appendChild(row);
  });
}

function getCategoriesForCurrentStore() {
  return state.categories[categoryBucket(state.currentStore)] || [];
}

function defaultRow() {
  const row = {};
  storeFields().forEach((f) => row[f] = "");
  row["Transaction Type"] = "purchasable";
  return row;
}

function getCategoryMatches(term) {
  const cats = getCategoriesForCurrentStore();
  const t = term.toLowerCase().trim();
  if (!t) return [];
  return cats.filter((c) => String(c.id).includes(t) || c.name.toLowerCase().includes(t)).slice(0, 8);
}

function renderCategorySuggestions(inputEl, rowIdx) {
  const host = inputEl.parentElement.querySelector(".suggest-host");
  const matches = getCategoryMatches(inputEl.value || "");
  if (!matches.length || document.activeElement !== inputEl) {
    host.innerHTML = "";
    host.classList.add("hidden");
    return;
  }
  host.innerHTML = `<div class='suggest-box'>${matches.map((c) => `<div class='suggest-item' data-row='${rowIdx}' data-id='${c.id}'>${c.id} - ${c.name}</div>`).join("")}</div>`;
  host.classList.remove("hidden");

  host.querySelectorAll(".suggest-item").forEach((item) => {
    item.onmousedown = (e) => {
      e.preventDefault();
      const catId = item.dataset.id;
      state.products[state.currentStore][rowIdx].Category = catId;
      inputEl.value = catId;
      host.innerHTML = "";
      host.classList.add("hidden");
      validateRows();
    };
  });
}

function buildWorkspace() {
  const rows = state.products[state.currentStore] || [defaultRow()];
  const wrap = document.createElement("div");
  wrap.className = "rows-wrap";

  rows.forEach((row, idx) => {
    const rowBox = document.createElement("div");
    rowBox.className = "product-row";
    const fieldsHtml = storeFields().map((field) => {
      const required = REQUIRED_FIELDS.includes(field) ? " *" : "";
      if (field === "Category") {
        return `<div class='field-block'><label>Buscar category id${required}</label><input data-row='${idx}' data-field='Category' value='${row.Category || ""}' placeholder='Buscar category id'><div class='suggest-host hidden'></div></div>`;
      }
      if (field === "Transaction Type") return `<div class='field-block'><label>${field}</label><input class='locked' data-row='${idx}' data-field='${field}' value='purchasable' readonly></div>`;
      return `<div class='field-block'><label>${field}${required}</label><input data-row='${idx}' data-field='${field}' value='${row[field] || ""}'></div>`;
    }).join("");
    rowBox.innerHTML = `<button class='row-delete-btn' data-del-row='${idx}' title='Eliminar fila'>🗑️</button><div class='row-grid'>${fieldsHtml}</div>`;
    wrap.appendChild(rowBox);
  });

  const container = $("tableContainer");
  container.innerHTML = "";
  container.appendChild(wrap);

  container.querySelectorAll("input[data-row]").forEach((input) => {
    const r = Number(input.dataset.row);
    const f = input.dataset.field;

    input.oninput = () => {
      state.products[state.currentStore][r][f] = f === "Transaction Type" ? "purchasable" : input.value;
      if (f === "Category") renderCategorySuggestions(input, r);
      state.draft[state.currentStore] = state.products[state.currentStore];
      localStorage.setItem("ttx_draft", JSON.stringify(state.draft));
      dbPut(`drafts/${state.user}/${state.currentStore}`, state.products[state.currentStore]);
      validateRows();
    };

    if (f === "Category") {
      input.onfocus = () => renderCategorySuggestions(input, r);
      input.onblur = () => {
        setTimeout(() => {
          const host = input.parentElement.querySelector('.suggest-host');
          host.innerHTML = '';
          host.classList.add('hidden');
        }, 120);
      };
    }
  });

  container.querySelectorAll("[data-del-row]").forEach((btn) => {
    btn.onclick = async () => {
      const rowIdx = Number(btn.dataset.delRow);
      const rows = state.products[state.currentStore] || [];
      rows.splice(rowIdx, 1);
      if (!rows.length) rows.push(defaultRow());
      state.products[state.currentStore] = rows;
      state.draft[state.currentStore] = rows;
      localStorage.setItem("ttx_draft", JSON.stringify(state.draft));
      await persistRows();
      buildWorkspace();
    };
  });

  validateRows();
}

function validateRows() {
  let ok = true;
  const skuCount = {};
  document.querySelectorAll("input[data-field='Property SKU']").forEach((el) => {
    const v = el.value.trim();
    if (!v) return;
    skuCount[v] = (skuCount[v] || 0) + 1;
  });

  document.querySelectorAll("input[data-row]").forEach((el) => {
    const field = el.dataset.field;
    const requiredBad = REQUIRED_FIELDS.includes(field) && !el.value.trim();
    let duplicateBad = false;
    if (field === "Property SKU") {
      const v = el.value.trim();
      duplicateBad = !!v && skuCount[v] > 1;
    }

    const bad = requiredBad || duplicateBad;
    el.classList.toggle("error-field", bad);
    if (bad) ok = false;

    const block = el.closest('.field-block');
    if (block) {
      let msg = block.querySelector('.field-error');
      if (!msg) {
        msg = document.createElement('div');
        msg.className = 'field-error';
        block.appendChild(msg);
      }
      msg.textContent = duplicateBad ? 'Sku duplicado' : '';
      msg.classList.toggle('hidden', !duplicateBad);
    }
  });
  return ok;
}
function checkDuplicateSku(rows) {
  const seen = new Set();
  const dup = new Set();
  rows.forEach((r) => {
    const sku = r["Property SKU"];
    if (!sku) return;
    if (seen.has(sku)) dup.add(sku);
    seen.add(sku);
  });
  return [...dup];
}

async function persistRows() {
  await dbPut(`drafts/${state.user}/${state.currentStore}`, state.products[state.currentStore]);
  await dbPut(`products/${state.user}/${state.currentStore}`, state.products[state.currentStore]);
}

async function selectStore(key) {
  state.currentStore = key;
  $("workspaceTitle").textContent = stores.find((s) => s.key === key)?.name || key;
  const remoteProducts = await dbGet(`products/${state.user}/${key}`);
  const remoteDraft = await dbGet(`drafts/${state.user}/${key}`);
  state.products[key] = Array.isArray(remoteProducts) ? remoteProducts : (Array.isArray(remoteDraft) ? remoteDraft : [defaultRow()]);
  state.draft[key] = state.products[key];
  switchView("workspaceView");
  renderStoreSwitchList();
  buildWorkspace();
}

async function exportCsv() {
  const rows = (state.products[state.currentStore] || []).filter((r) => Object.values(r).some((v) => String(v || "").trim()));
  if (!rows.length) return showToast("No hay filas para exportar");
  if (!validateRows()) return showToast("Completá los campos obligatorios");
  const dup = checkDuplicateSku(rows);
  if (dup.length) return showToast(`SKUs repetidos: ${dup.join(", ")}`);

  const headers = storeFields();
  const csvRows = [headers.join(","), ...rows.map((r) => headers.map((h) => `"${(h === "Transaction Type" ? "purchasable" : (r[h] || "")).toString().replaceAll('"', '""')}"`).join(","))];
  const csv = csvRows.join("\n");
  const filename = `tienditax_${state.currentStore}_${nowArgentina()}.csv`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();

  await dbPost(`exports/${state.user}`, { user: state.user, createdAt: nowArgentina(), store: state.currentStore, filename, csv });
  showToast("Export generado");
  loadHistory();
}

async function loadHistory() {
  const entries = await dbGet(`exports/${state.user}`) || {};
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

async function addCategory(bucket, name, id) {
  if (!name || !/^\d+$/.test(String(id))) return showToast("ID debe ser numérico");
  state.categories[bucket] = state.categories[bucket] || [];
  state.categories[bucket].push({ name, id: Number(id) });
  await dbPut(`categories/${bucket}`, state.categories[bucket]);
  renderCategoryList();
  showToast("Categoría agregada correctamente");
}
async function importXlsx(file, bucket) {
  try {
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
    const parsed = rows.filter((r) => r[0] && /^\d+$/.test(String(r[1]))).map((r) => ({ name: String(r[0]), id: Number(r[1]) }));
    state.categories[bucket] = [...(state.categories[bucket] || []), ...parsed];
    await dbPut(`categories/${bucket}`, state.categories[bucket]);
    renderCategoryList();
    showToast("Categorías importadas");
  } catch { showToast("Error al importar XLSX"); }
}

function closeAllDrawers() {
  $("menuDrawer").classList.remove("open");
  $("workspaceDrawer").classList.remove("open");
}

async function init() {
  renderStoreButtons();
  renderCategorySelectOptions();

  const categoriesRemote = await dbGet("categories");
  if (categoriesRemote) state.categories = categoriesRemote;
  // migración suave de estructura vieja
  if (!state.categories.bna_ciudad) {
    state.categories.bna_ciudad = [
      ...(state.categories.bna || []),
      ...(state.categories.ciudad || []),
    ];
  }
  if (!state.categories.macro) state.categories.macro = [];

  state.draft = JSON.parse(localStorage.getItem("ttx_draft") || "{}");
  renderCategoryList();

  const userFromSession = localStorage.getItem("ttx_user");
  if (userFromSession) {
    state.user = userFromSession;
    switchView("storeView");
    loadHistory();
  }
}

$("togglePass").onclick = () => {
  const p = $("loginPass");
  const showing = p.type === "password";
  p.type = showing ? "text" : "password";
  $("togglePass").textContent = showing ? "Ocultar" : "Mostrar";
};

async function doLogin() {
  const remote = await dbGet("user");
  const inputUser = $("loginUser").value.trim();
  const inputPass = $("loginPass").value.trim();

  const credentials = [];
  if (remote?.user && remote?.pass !== undefined) credentials.push({ user: String(remote.user), pass: String(remote.pass) });
  Object.keys(remote || {}).forEach((k) => {
    const m = k.match(/^user(\d+)$/);
    if (!m) return;
    const idx = m[1];
    const passKey = `pass${idx}`;
    if (remote[passKey] !== undefined) credentials.push({ user: String(remote[k]), pass: String(remote[passKey]) });
  });

  const ok = credentials.find((c) => c.user === inputUser && c.pass === inputPass);
  if (ok) {
    state.user = ok.user;
    localStorage.setItem("ttx_user", state.user);
    switchView("storeView");
    loadHistory();
    showToast("Bienvenido");
  } else showToast("Credenciales inválidas");
}

$("loginBtn").onclick = doLogin;
$("loginPass").addEventListener("keydown", (e) => e.key === "Enter" && doLogin());
$("loginUser").addEventListener("keydown", (e) => e.key === "Enter" && doLogin());

$("menuBtn").onclick = () => $("menuDrawer").classList.toggle("open");
$("workspaceMenuBtn").onclick = () => $("workspaceDrawer").classList.toggle("open");
$("closeMenuBtn").onclick = closeAllDrawers;
$("closeWorkspaceMenuBtn").onclick = closeAllDrawers;

$("menuHistorialBtn").onclick = () => { closeAllDrawers(); $("historyModal").classList.remove("hidden"); loadHistory(); };
$("workspaceHistorialBtn").onclick = () => { closeAllDrawers(); $("historyModal").classList.remove("hidden"); loadHistory(); };
$("closeHistoryModal").onclick = () => $("historyModal").classList.add("hidden");

$("menuCategoriesBtn").onclick = () => { closeAllDrawers(); switchView("categoriesView"); renderCategoryList(); };
$("workspaceCategoriesBtn").onclick = () => { closeAllDrawers(); switchView("categoriesView"); renderCategoryList(); };
$("categoriesBackBtn").onclick = () => switchView(state.currentStore ? "workspaceView" : "storeView");

$("changeStoreBtn").onclick = () => { renderStoreSwitchList(); $("storeSwitchModal").classList.remove("hidden"); };
$("closeStoreSwitchModal").onclick = () => $("storeSwitchModal").classList.add("hidden");

$("categoryStoreSelect").onchange = renderCategoryList;
$("addCategoryBtn").onclick = () => addCategory($("categoryStoreSelect").value, $("catName").value.trim(), $("catId").value.trim());
$("xlsxInput").onchange = (e) => e.target.files?.[0] && importXlsx(e.target.files[0], $("categoryStoreSelect").value);

$("confirmDeleteBtn").onclick = async () => {
  if (state.pendingDelete) await state.pendingDelete();
  closeDeleteModal();
};
$("cancelDeleteBtn").onclick = closeDeleteModal;
window.addEventListener("keydown", async (e) => {
  if (e.key === "Enter" && !$("confirmDeleteModal").classList.contains("hidden") && state.pendingDelete) {
    e.preventDefault();
    await state.pendingDelete();
    closeDeleteModal();
  }
});

$("addRowBtn").onclick = () => {
  state.products[state.currentStore] = state.products[state.currentStore] || [defaultRow()];
  state.products[state.currentStore].push(defaultRow());
  buildWorkspace();
};
$("clearFormBtn").onclick = async () => {
  state.products[state.currentStore] = [defaultRow()];
  state.draft[state.currentStore] = state.products[state.currentStore];
  localStorage.setItem("ttx_draft", JSON.stringify(state.draft));
  await persistRows();
  buildWorkspace();
};
$("exportBtn").onclick = async () => {
  await persistRows();
  exportCsv();
};

$("logoutBtn").onclick = () => {
  localStorage.removeItem("ttx_user");
  state.user = null;
  state.currentStore = null;
  switchView("loginView");
};

init();
