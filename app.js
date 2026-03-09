import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, get, set, push, update, remove } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyAQx5ap3mzQzxVnc6vazBRCt2hBljLkGoA",
  authDomain: "tienditax.firebaseapp.com",
  databaseURL: "https://tienditax-default-rtdb.firebaseio.com",
  projectId: "tienditax",
  storageBucket: "tienditax.firebasestorage.app",
  messagingSenderId: "647088724989",
  appId: "1:647088724989:web:edb9c2fb675dfe93e51794",
  measurementId: "G-KP48K0N9XZ"
};

const fields = ["Title", "Description", "Category", "Transaction Type", "Manufacturer", "Price", "Price Without Taxes", "Available On", "Sale Price", "Sale Price Without Taxes", "sale_on", "sale_until", "Height", "Length", "Width", "Weight", "Property Quantity", "Property Names", "Property Values", "Property SKU", "BRAND", "ORIGIN_OF_PRODUCT"];
const requiredFields = ["Title", "Category", "Price", "Property SKU", "Property Quantity"];
const STORES = ["Tienda BNA", "Tienda Ciudad", "Tienda Macro"];

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
let userSession = null;
let currentStore = STORES[0];
let rows = [];
let autosaveTimer;
let productGrid;
let categoriesGrid;
let historyGrid;

const el = (id) => document.getElementById(id);
const slugStore = (s) => s.toLowerCase().replace(/\s+/g, "_");
const sessionKey = (identifier) => String(identifier || "anon").toLowerCase().replace(/[^a-z0-9_-]/g, "_");
const nowArg = () => new Date().toLocaleString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" }).replace(" ", "_").replace(/:/g, "-");

function toast(msg, type = "ok") {
  const t = document.createElement("div");
  t.className = `toast ${type}`;
  t.textContent = msg;
  el("toastContainer").appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

function switchPage(logged) {
  el("loginPage").classList.toggle("hidden", logged);
  el("appPage").classList.toggle("hidden", !logged);
}

async function verifyUserCredentials(usernameInput, passwordInput) {
  const snap = await get(ref(db, "user"));
  if (!snap.exists()) return null;
  const stored = snap.val() || {};
  if (String(usernameInput || "").trim() !== String(stored.user || "").trim()) return null;
  if (String(passwordInput || "").trim() !== String(stored.pass || "").trim()) return null;
  return { id: sessionKey(usernameInput), user: String(usernameInput).trim() };
}

function renderProductGrid() {
  const columns = fields.map((field) => ({
    name: field,
    formatter: (_, row) => {
      const rowIdx = row.cells[0]?.data ?? row._cells?.[0]?.data;
      const value = rows[rowIdx]?.[field] || "";
      if (field === "Category") {
        return gridjs.html(`<input class="cat-search cell-input" data-row="${rowIdx}" data-field="${field}" value="${escapeHtml(value)}" placeholder="ID categoría" />`);
      }
      return gridjs.html(`<input class="cell-input" data-row="${rowIdx}" data-field="${field}" value="${escapeHtml(value)}" />`);
    }
  }));
  columns.unshift({ name: "#", hidden: true });
  columns.push({
    name: "Acción",
    formatter: (_, row) => {
      const idx = row.cells[0]?.data ?? row._cells?.[0]?.data;
      return gridjs.html(`<button class="ghost-btn" data-remove-row="${idx}">Eliminar</button>`);
    }
  });

  const data = rows.map((row, idx) => [idx, ...fields.map(() => ""), ""]);
  const cfg = { columns, data, sort: false, search: false, pagination: { enabled: true, limit: 8 }, fixedHeader: true, height: "60vh" };

  const wrap = el("productGridWrap");
  wrap.innerHTML = "";
  productGrid = new gridjs.Grid(cfg);
  productGrid.render(wrap);

  setTimeout(applyValidationStyles, 0);
}

function collectRowsFromInputs() {
  const next = rows.map(() => ({}));
  document.querySelectorAll("#productGridWrap .cell-input").forEach((inp) => {
    const idx = Number(inp.dataset.row);
    const field = inp.dataset.field;
    if (!Number.isNaN(idx) && next[idx]) next[idx][field] = inp.value.trim();
  });
  rows = next;
}

function validateRows() {
  collectRowsFromInputs();
  let valid = true;
  const skuCount = {};
  rows.forEach((r) => { if (r["Property SKU"]) skuCount[r["Property SKU"]] = (skuCount[r["Property SKU"]] || 0) + 1; });

  document.querySelectorAll("#productGridWrap .cell-input").forEach((inp) => {
    inp.classList.remove("invalid", "warn");
    const row = rows[Number(inp.dataset.row)] || {};
    if (requiredFields.includes(inp.dataset.field) && !row[inp.dataset.field]) {
      inp.classList.add("invalid");
      valid = false;
    }
    if (inp.dataset.field === "Property SKU" && row["Property SKU"] && skuCount[row["Property SKU"]] > 1) {
      inp.classList.add("warn");
      valid = false;
    }
  });
  return valid;
}

function applyValidationStyles() {
  validateRows();
}

function scheduleDraftSave() {
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(saveDraft, 450);
}

async function saveDraft() {
  if (!userSession) return;
  collectRowsFromInputs();
  await set(ref(db, `drafts/${userSession.id}/${slugStore(currentStore)}`), { rows, updatedAt: Date.now() });
}

async function loadDraft() {
  const snap = await get(ref(db, `drafts/${userSession.id}/${slugStore(currentStore)}`));
  rows = snap.exists() && Array.isArray(snap.val().rows) && snap.val().rows.length ? snap.val().rows : [createEmptyRow()];
  renderProductGrid();
}

function createEmptyRow() {
  const r = {};
  fields.forEach((f) => (r[f] = ""));
  return r;
}

function csvEscape(v) {
  const s = String(v || "");
  if (s.includes('"')) return `"${s.replaceAll('"', '""')}"`;
  return /[",\n]/.test(s) ? `"${s}"` : s;
}

async function exportCSV() {
  if (!validateRows()) return toast("Corregí campos obligatorios o SKUs duplicados", "error");
  collectRowsFromInputs();
  const meaningful = rows.filter((r) => Object.values(r).some(Boolean));
  if (!meaningful.length) return toast("No hay datos para exportar", "error");
  const csv = [fields.join(","), ...meaningful.map((r) => fields.map((f) => csvEscape(r[f])).join(","))].join("\n");
  const fileName = `tienditax_${slugStore(currentStore)}_${nowArg()}.csv`;

  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  a.download = fileName;
  a.click();

  await push(ref(db, `exports/${userSession.id}`), {
    fileName,
    user: userSession.user,
    store: currentStore,
    generatedAt: nowArg(),
    timeZone: "America/Argentina/Buenos_Aires",
    csvBase64: btoa(unescape(encodeURIComponent(csv)))
  });
  toast("Export generado");
}

async function loadCategories() {
  const snap = await get(ref(db, `categories/${slugStore(currentStore)}`));
  return snap.exists() ? Object.entries(snap.val()).map(([key, value]) => ({ key, ...value })) : [];
}

async function renderCategoriesGrid() {
  const list = await loadCategories();
  const data = list.map((c) => [c.name, c.id, c.key]);
  const wrap = el("categoriesGridWrap");
  wrap.innerHTML = "";
  categoriesGrid = new gridjs.Grid({
    columns: ["Nombre", "ID", { name: "Acciones", formatter: (_, row) => gridjs.html(`<button class='ghost-btn' data-edit-cat='${row.cells[2].data}'>Editar</button> <button class='ghost-btn' data-del-cat='${row.cells[2].data}'>Eliminar</button>`) }, { name: "_key", hidden: true }],
    data,
    pagination: { enabled: true, limit: 10 },
    sort: true,
    search: true
  });
  categoriesGrid.render(wrap);
}

async function addCategory(name, id) {
  const node = push(ref(db, `categories/${slugStore(currentStore)}`));
  await set(node, { name: String(name).trim(), id: String(id).trim() });
  toast("Categoría agregada correctamente");
}

async function openHistoryModal() {
  const snap = await get(ref(db, `exports/${userSession.id}`));
  const list = snap.exists() ? Object.entries(snap.val()).map(([k, v]) => ({ key: k, ...v })).reverse() : [];
  const wrap = el("historyGridWrap");
  wrap.innerHTML = "";
  historyGrid = new gridjs.Grid({
    columns: ["Archivo", "Usuario", "Fecha", "Zona horaria", "Tienda", { name: "Descargar", formatter: (_, row) => gridjs.html(`<button class='secondary-btn' data-dl='${row.cells[5].data}'>Descargar</button>`) }, { name: "_csv", hidden: true }],
    data: list.map((r) => [r.fileName, r.user, r.generatedAt, r.timeZone, r.store || "-", r.csvBase64]),
    pagination: { enabled: true, limit: 8 },
    search: true
  });
  historyGrid.render(wrap);
  el("historyModal").classList.remove("hidden");
}

function downloadCsvBase64(base64) {
  const csv = decodeURIComponent(escape(atob(base64)));
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = "export_recuperado.csv";
  a.click();
}

function showView(view) {
  const isProducts = view === "products";
  el("productView").classList.toggle("hidden", !isProducts);
  el("categoryView").classList.toggle("hidden", isProducts);
  el("viewTitle").textContent = isProducts ? "Carga de productos" : "Gestión de categorías";
}

function wireEvents() {
  window.handleLogin = async () => {
    el("error").textContent = "";
    try {
      const session = await verifyUserCredentials(el("user").value, el("pass").value);
      if (!session) return (el("error").textContent = "Credenciales inválidas");
      userSession = session;
      localStorage.setItem("tienditax_session", JSON.stringify(session));
      switchPage(true);
      await loadDraft();
      await renderCategoriesGrid();
    } catch (err) {
      console.error(err);
      el("error").textContent = "No se pudo iniciar sesión";
    }
  };

  el("loginForm").addEventListener("submit", (e) => e.preventDefault());

  el("storeSelect").innerHTML = STORES.map((s) => `<option>${s}</option>`).join("");
  el("storeSelect").onchange = async (e) => {
    currentStore = e.target.value;
    await loadDraft();
    await renderCategoriesGrid();
  };

  el("burgerBtn").onclick = () => el("drawer").classList.add("open");
  el("closeDrawer").onclick = () => el("drawer").classList.remove("open");
  el("goProductsBtn").onclick = () => { showView("products"); el("drawer").classList.remove("open"); };
  el("goCategoriesBtn").onclick = async () => { showView("categories"); await renderCategoriesGrid(); el("drawer").classList.remove("open"); };
  el("openHistoryBtn").onclick = async () => { await openHistoryModal(); el("drawer").classList.remove("open"); };

  el("closeHistoryBtn").onclick = () => el("historyModal").classList.add("hidden");
  el("historyModal").onclick = (e) => { if (e.target.id === "historyModal") el("historyModal").classList.add("hidden"); };

  el("addRowBtn").onclick = () => { collectRowsFromInputs(); rows.push(createEmptyRow()); renderProductGrid(); scheduleDraftSave(); };
  el("clearBtn").onclick = async () => { rows = [createEmptyRow()]; renderProductGrid(); await saveDraft(); toast("Formulario limpiado"); };
  el("exportBtn").onclick = exportCSV;

  el("addCategoryBtn").onclick = async () => {
    if (!el("catNameInput").value || !el("catIdInput").value) return toast("Completá nombre e ID", "error");
    await addCategory(el("catNameInput").value, el("catIdInput").value);
    el("catNameInput").value = "";
    el("catIdInput").value = "";
    await renderCategoriesGrid();
  };

  el("xlsxInput").onchange = async (e) => {
    try {
      const file = e.target.files[0];
      if (!file) return;
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const rowsX = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
      for (const r of rowsX) if (r[0] && r[1]) await addCategory(r[0], r[1]);
      await renderCategoriesGrid();
    } catch {
      toast("Error al importar XLSX", "error");
    }
  };

  el("logoutBtn").onclick = () => {
    userSession = null;
    localStorage.removeItem("tienditax_session");
    switchPage(false);
  };

  document.addEventListener("input", (e) => {
    if (e.target.closest("#productGridWrap .cell-input")) {
      scheduleDraftSave();
      validateRows();
    }
  });

  document.addEventListener("click", async (e) => {
    const removeBtn = e.target.closest("button[data-remove-row]");
    if (removeBtn) {
      collectRowsFromInputs();
      rows.splice(Number(removeBtn.dataset.removeRow), 1);
      if (!rows.length) rows = [createEmptyRow()];
      renderProductGrid();
      return saveDraft();
    }

    const dl = e.target.closest("button[data-dl]");
    if (dl) return downloadCsvBase64(dl.dataset.dl);

    const delCat = e.target.closest("button[data-del-cat]");
    if (delCat) {
      if (!confirm("¿Eliminar categoría?")) return;
      await remove(ref(db, `categories/${slugStore(currentStore)}/${delCat.dataset.delCat}`));
      return renderCategoriesGrid();
    }

    const editCat = e.target.closest("button[data-edit-cat]");
    if (editCat) {
      const name = prompt("Nuevo nombre:");
      const id = prompt("Nuevo ID:");
      if (!name || !id) return;
      await update(ref(db, `categories/${slugStore(currentStore)}/${editCat.dataset.editCat}`), { name, id });
      return renderCategoriesGrid();
    }
  });
}

async function bootstrapSession() {
  const raw = localStorage.getItem("tienditax_session");
  if (!raw) return switchPage(false);
  userSession = JSON.parse(raw);
  if (!userSession?.id) return switchPage(false);
  switchPage(true);
  await loadDraft();
  await renderCategoriesGrid();
}

function escapeHtml(text = "") {
  return String(text).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

wireEvents();
bootstrapSession();
