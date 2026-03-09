import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getDatabase,
  ref,
  get,
  set,
  push,
  update,
  remove
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

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

const STORES = ["Tienda BNA", "Tienda Ciudad", "Tienda Macro"];
const fields = ["Title", "Description", "Category", "Transaction Type", "Manufacturer", "Price", "Price Without Taxes", "Available On", "Sale Price", "Sale Price Without Taxes", "sale_on", "sale_until", "Height", "Length", "Width", "Weight", "Property Quantity", "Property Names", "Property Values", "Property SKU", "BRAND", "ORIGIN_OF_PRODUCT"];
const requiredFields = ["Title", "Category", "Price", "Property SKU", "Property Quantity"];
let currentStore = STORES[0];
let userSession = null;
let autosaveTimer;
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);
await setPersistence(auth, browserLocalPersistence);

const el = (id) => document.getElementById(id);
const slugStore = (s) => s.toLowerCase().replace(/\s+/g, "_");
const nowArg = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "short", timeStyle: "medium" }).format(new Date());

function toast(msg, type = "ok") {
  const t = document.createElement("div");
  t.className = `toast ${type}`;
  t.textContent = msg;
  el("toastContainer").appendChild(t);
  setTimeout(() => t.remove(), 2800);
}

function switchPage(logged) {
  el("loginPage").classList.toggle("hidden", logged);
  el("appPage").classList.toggle("hidden", !logged);
}

function buildTableHead() {
  el("tableHead").innerHTML = `${fields.map((f) => `<th>${f}</th>`).join("")}<th>Acción</th>`;
}

function inputType(field) {
  if (["Available On", "sale_on", "sale_until"].includes(field)) return "date";
  if (["Price", "Price Without Taxes", "Sale Price", "Sale Price Without Taxes", "Height", "Length", "Width", "Weight", "Property Quantity"].includes(field)) return "number";
  return "text";
}

async function loadCategories(store = currentStore) {
  const snap = await get(ref(db, `categories/${slugStore(store)}`));
  return snap.exists() ? Object.entries(snap.val()).map(([key, value]) => ({ key, ...value })) : [];
}

async function saveCategory(store, name, id) {
  const node = push(ref(db, `categories/${slugStore(store)}`));
  await set(node, { name: String(name).trim(), id: String(id).trim() });
  toast("Categoría agregada correctamente");
}

async function refreshCategoriesPanel() {
  const s = el("categoryStoreSelect").value;
  const list = await loadCategories(s);
  el("categoriesList").innerHTML = list
    .map((c) => `<div class="category-item"><input data-k="${c.key}" data-f="name" value="${escapeHtml(c.name)}"/><input data-k="${c.key}" data-f="id" value="${escapeHtml(c.id)}"/><div class="inline"><button class="secondary-btn" data-act="save" data-k="${c.key}">Guardar</button><button class="ghost-btn" data-act="del" data-k="${c.key}">Eliminar</button></div></div>`)
    .join("");
}

async function addRow(initial = {}) {
  const tr = document.createElement("tr");
  const categories = await loadCategories(currentStore);

  fields.forEach((field) => {
    const td = document.createElement("td");
    if (field === "Category") {
      td.appendChild(createCategorySelector(categories, initial[field] || ""));
    } else {
      const inp = document.createElement("input");
      inp.type = inputType(field);
      inp.dataset.field = field;
      inp.value = initial[field] || "";
      inp.placeholder = field;
      inp.addEventListener("input", scheduleDraftSave);
      td.appendChild(inp);
    }
    tr.appendChild(td);
  });

  const act = document.createElement("td");
  act.className = "row-actions";
  act.innerHTML = `<button class="remove-btn">Eliminar</button>`;
  act.querySelector("button").onclick = () => {
    tr.remove();
    scheduleDraftSave();
    validateRows();
  };
  tr.appendChild(act);
  el("tableBody").appendChild(tr);
}

function createCategorySelector(categories, selectedId = "") {
  const wrap = document.createElement("div");
  wrap.className = "category-cell";
  const search = document.createElement("input");
  search.placeholder = "Buscar categoría";
  const hidden = document.createElement("input");
  hidden.type = "hidden";
  hidden.dataset.field = "Category";
  hidden.value = selectedId;
  const badge = document.createElement("div");
  badge.className = "category-id-badge";
  const drop = document.createElement("div");
  drop.className = "category-dropdown hidden";

  const paint = (term = "") => {
    const options = categories.filter((c) => c.name.toLowerCase().includes(term.toLowerCase()));
    drop.innerHTML = options.slice(0, 30).map((c) => `<div class="category-option" data-id="${c.id}" data-name="${escapeHtml(c.name)}">${escapeHtml(c.name)} <small>#${c.id}</small></div>`).join("") + '<div class="category-option" data-manual="1">+ Agregar manualmente</div>';
    drop.classList.remove("hidden");
  };

  const selected = categories.find((c) => c.id === selectedId);
  search.value = selected?.name || "";
  badge.textContent = selectedId ? `ID: ${selectedId}` : "ID: —";

  search.onfocus = () => paint(search.value);
  search.oninput = () => {
    hidden.value = "";
    badge.textContent = "ID: —";
    paint(search.value);
    scheduleDraftSave();
  };
  drop.onclick = async (e) => {
    const opt = e.target.closest(".category-option");
    if (!opt) return;
    if (opt.dataset.manual) {
      const manual = prompt("ID numérico de categoría");
      if (!manual || Number.isNaN(Number(manual))) return toast("ID inválido", "error");
      await saveCategory(currentStore, `Manual ${manual}`, manual);
      search.value = `Manual ${manual}`;
      hidden.value = manual;
      badge.textContent = `ID: ${manual}`;
    } else {
      search.value = opt.dataset.name;
      hidden.value = opt.dataset.id;
      badge.textContent = `ID: ${opt.dataset.id}`;
    }
    drop.classList.add("hidden");
    scheduleDraftSave();
    validateRows();
  };

  wrap.append(search, hidden, badge, drop);
  document.addEventListener("click", (e) => !wrap.contains(e.target) && drop.classList.add("hidden"));
  return wrap;
}

function collectRows() {
  return [...document.querySelectorAll("#tableBody tr")].map((tr) => {
    const obj = {};
    fields.forEach((f) => {
      const inp = tr.querySelector(`[data-field="${f}"]`);
      obj[f] = (inp?.value || "").trim();
    });
    return { tr, data: obj };
  });
}

function validateRows() {
  const rows = collectRows();
  const skuCount = {};
  rows.forEach(({ data }) => { if (data["Property SKU"]) skuCount[data["Property SKU"]] = (skuCount[data["Property SKU"]] || 0) + 1; });

  let valid = true;
  rows.forEach(({ tr, data }) => {
    tr.querySelectorAll("input").forEach((i) => i.classList.remove("invalid", "warn"));
    requiredFields.forEach((f) => {
      if (!data[f]) {
        tr.querySelector(`[data-field="${f}"]`)?.classList.add("invalid");
        valid = false;
      }
    });
    if (data["Property SKU"] && skuCount[data["Property SKU"]] > 1) {
      tr.querySelector('[data-field="Property SKU"]')?.classList.add("warn");
      valid = false;
    }
  });
  return valid;
}

function toCSVValue(v) {
  if (v.includes('"')) v = v.replaceAll('"', '""');
  return /[",\n]/.test(v) ? `"${v}"` : v;
}

async function exportCSV() {
  if (!validateRows()) return toast("Corregí campos obligatorios o SKUs duplicados", "error");
  const rows = collectRows().map((r) => r.data).filter((r) => Object.values(r).some(Boolean));
  if (!rows.length) return toast("No hay datos para exportar", "error");
  const csv = [fields.join(","), ...rows.map((r) => fields.map((f) => toCSVValue(r[f])).join(","))].join("\n");
  const arg = new Date().toLocaleString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" }).replace(" ", "_").replace(/:/g, "-");
  const fileName = `tienditax_${slugStore(currentStore)}_${arg}.csv`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  a.click();

  await push(ref(db, `exports/${userSession.uid}`), {
    user: userSession.email,
    store: currentStore,
    fileName,
    csvBase64: btoa(unescape(encodeURIComponent(csv))),
    generatedAt: nowArg(),
    timeZone: "America/Argentina/Buenos_Aires"
  });
  await loadExportHistory();
  toast("Export generado");
}

async function loadExportHistory() {
  const snap = await get(ref(db, `exports/${userSession.uid}`));
  const list = snap.exists() ? Object.values(snap.val()).reverse() : [];
  el("exportsHistory").innerHTML = list.map((r) => `<div class="export-item"><strong>${escapeHtml(r.fileName)}</strong><br/>${escapeHtml(r.user)}<br/>${escapeHtml(r.generatedAt)} (${r.timeZone})<br/><button class="secondary-btn" data-csv="${r.csvBase64}">Descargar</button></div>`).join("") || "<small>Sin exports aún.</small>";
}

async function saveDraft() {
  if (!userSession) return;
  const rows = collectRows().map((r) => r.data);
  await set(ref(db, `drafts/${userSession.uid}/${slugStore(currentStore)}`), { store: currentStore, rows, updatedAt: Date.now() });
}

function scheduleDraftSave() {
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(saveDraft, 500);
}

async function loadDraft() {
  el("tableBody").innerHTML = "";
  const snap = await get(ref(db, `drafts/${userSession.uid}/${slugStore(currentStore)}`));
  if (!snap.exists() || !snap.val().rows?.length) return addRow();
  for (const row of snap.val().rows) await addRow(row);
  validateRows();
}

async function clearForm() {
  el("tableBody").innerHTML = "";
  await set(ref(db, `drafts/${userSession.uid}/${slugStore(currentStore)}`), null);
  await addRow();
  toast("Formulario limpiado");
}

function wireUI() {
  buildTableHead();
  el("togglePassword").onclick = () => {
    el("pass").type = el("pass").type === "password" ? "text" : "password";
    el("togglePassword").textContent = el("pass").type === "password" ? "Mostrar" : "Ocultar";
  };
  el("loginForm").onsubmit = async (e) => {
    e.preventDefault();
    el("error").textContent = "";
    el("loginBtn").disabled = true;
    try {
      await signInWithEmailAndPassword(auth, el("user").value.trim(), el("pass").value.trim());
    } catch {
      el("error").textContent = "Credenciales inválidas o sin permisos";
    } finally {
      el("loginBtn").disabled = false;
    }
  };

  el("burgerBtn").onclick = () => el("drawer").classList.add("open");
  el("closeDrawer").onclick = () => el("drawer").classList.remove("open");
  el("addRowBtn").onclick = () => addRow();
  el("exportBtn").onclick = exportCSV;
  el("clearBtn").onclick = clearForm;
  el("logoutBtn").onclick = () => signOut(auth);

  const storeOptions = STORES.map((s) => `<option>${s}</option>`).join("");
  el("storeSelect").innerHTML = storeOptions;
  el("categoryStoreSelect").innerHTML = storeOptions;

  el("storeSelect").onchange = async (e) => {
    currentStore = e.target.value;
    el("storeTitle").textContent = currentStore;
    await loadDraft();
  };
  el("categoryStoreSelect").onchange = refreshCategoriesPanel;

  el("createStoreBtn").onclick = () => {
    const name = el("newStoreInput").value.trim();
    if (!name) return;
    ["storeSelect", "categoryStoreSelect"].forEach((id) => el(id).insertAdjacentHTML("beforeend", `<option>${escapeHtml(name)}</option>`));
    el("newStoreInput").value = "";
    toast("Nueva tienda creada");
  };

  el("addCategoryBtn").onclick = async () => {
    await saveCategory(el("categoryStoreSelect").value, el("catNameInput").value, el("catIdInput").value);
    el("catNameInput").value = "";
    el("catIdInput").value = "";
    await refreshCategoriesPanel();
  };

  el("categoriesList").onclick = async (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const key = btn.dataset.k;
    const store = slugStore(el("categoryStoreSelect").value);
    if (btn.dataset.act === "del") {
      if (!confirm("¿Eliminar categoría?")) return;
      await remove(ref(db, `categories/${store}/${key}`));
    } else {
      const item = btn.closest(".category-item");
      await update(ref(db, `categories/${store}/${key}`), {
        name: item.querySelector('[data-f="name"]').value,
        id: item.querySelector('[data-f="id"]').value
      });
    }
    await refreshCategoriesPanel();
  };

  el("exportsHistory").onclick = (e) => {
    const b = e.target.closest("button[data-csv]");
    if (!b) return;
    const csv = decodeURIComponent(escape(atob(b.dataset.csv)));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `export_recuperado.csv`;
    a.click();
  };

  const fileInput = el("xlsxInput");
  const handleFile = async (file) => {
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
      for (const r of rows) if (r[0] && r[1]) await saveCategory(el("categoryStoreSelect").value, r[0], r[1]);
      await refreshCategoriesPanel();
    } catch {
      toast("Error al importar XLSX", "error");
    }
  };
  fileInput.onchange = (e) => e.target.files[0] && handleFile(e.target.files[0]);
  const dz = el("dropZone");
  dz.ondragover = (e) => { e.preventDefault(); dz.classList.add("dragover"); };
  dz.ondragleave = () => dz.classList.remove("dragover");
  dz.ondrop = (e) => {
    e.preventDefault();
    dz.classList.remove("dragover");
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  };
}

onAuthStateChanged(auth, async (user) => {
  userSession = user;
  if (!user) return switchPage(false);
  switchPage(true);
  currentStore = el("storeSelect").value || STORES[0];
  el("storeTitle").textContent = currentStore;
  await refreshCategoriesPanel();
  await loadExportHistory();
  await loadDraft();
});

function escapeHtml(text = "") {
  return String(text).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

wireUI();
