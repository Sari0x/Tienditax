const DB_URL = "https://tienditax-default-rtdb.firebaseio.com";
const stores = [
  { key: "bna", name: "Tienda BNA", logo: "https://i.ibb.co/4RMk522C/tienda-bna-logo.png" },
  { key: "macro", name: "Tienda Macro", logo: "https://i.ibb.co/XfPPnFs0/tienda-macro-logo.png" },
  { key: "ciudad", name: "Tienda Ciudad", logo: "https://i.ibb.co/3yGTwBCk/tienda-ciudad-logo.png" },
];
const STORE_FIELDS = {
  bna: ["Title", "Description", "Category", "Transaction Type", "Manufacturer", "Price", "Price Without Taxes", "Available On", "Sale Price", "Sale Price Without Taxes", "sale_on", "sale_until", "Height", "Length", "Width", "Weight", "Property Quantity", "Property Names", "Property Values", "Property SKU", "BRAND", "ORIGIN_OF_PRODUCT"],
  ciudad: ["Title", "Description", "Category", "Transaction Type", "Manufacturer", "Price", "Price Without Taxes", "Available On", "Sale Price", "Sale Price Without Taxes", "sale_on", "sale_until", "Height", "Length", "Width", "Weight", "Property Quantity", "Property Names", "Property Values", "Property SKU", "BRAND", "ORIGIN_OF_PRODUCT"],
  macro: ["Title", "Description", "Category", "Transaction Type", "Manufacturer", "Price", "Price Without Taxes", "Available On", "Sale Price", "Sale Price Without Taxes", "sale_on", "sale_until", "Height", "Length", "Width", "Weight", "Property Quantity", "Property Names", "Property Values", "Property SKU"],
};
const REQUIRED_FIELDS = ["Title", "Category", "Price", "Property SKU"];
const DATE_FIELDS = ["Available On", "sale_on", "sale_until"];
const CATEGORY_STORE_OPTIONS = [
  { key: "bna_ciudad", label: "Tienda bna y ciudad" },
  { key: "macro", label: "Tienda Macro" },
];

let state = { user: null, currentStore: null, categories: {}, products: {}, draft: {}, pendingDelete: null, historyPage: 1, skuCatalog: null, loginCredentials: [] };
const $ = (id) => document.getElementById(id);
const dbGet = async (path) => (await fetch(`${DB_URL}/${path}.json`)).json();
const dbPut = async (path, data) => fetch(`${DB_URL}/${path}.json`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
const dbPost = async (path, data) => (await fetch(`${DB_URL}/${path}.json`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })).json();
const dbGetAbsolute = async (url) => (await fetch(url)).json();

function showToast(msg) {
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  $("toastContainer").appendChild(t);
  setTimeout(() => t.remove(), 2500);
}
function switchView(viewId) {
  ["loginView", "storeView", "workspaceView", "categoriesView"].forEach((id) => $(id).classList.toggle("active", id === viewId));
  const footer = document.querySelector("footer");
  if (footer) footer.classList.toggle("hidden", viewId === "loginView");
  const footerLinks = $("footerLinksStack");
  if (footerLinks) footerLinks.classList.toggle("hidden", viewId === "loginView");
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
    row.innerHTML = `<span>${cat.name} (#${cat.id})</span><div class='inline-actions'><button class='icon-action' data-act='e' title='Editar'><i class='bi bi-pencil-square'></i></button><button class='icon-action danger' data-act='d' title='Eliminar'><i class='bi bi-trash3'></i></button></div>`;
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
  if ("Property Values" in row) row["Property Values"] = "TRUE";
  if ("Property Names" in row) row["Property Names"] = "noproperty";
  if ("Property Quantity" in row) row["Property Quantity"] = "0";
  if ("ORIGIN_OF_PRODUCT" in row) row["ORIGIN_OF_PRODUCT"] = "0";
  return row;
}

function getCategoryMatches(term) {
  const cats = getCategoriesForCurrentStore();
  const t = term.toLowerCase().trim();
  if (!t) return [];
  return cats.filter((c) => String(c.id).includes(t) || c.name.toLowerCase().includes(t)).slice(0, 8);
}

function normalizeSkuValue(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function getSkuMatches(term) {
  const list = state.skuCatalog ? Object.keys(state.skuCatalog) : [];
  const t = normalizeSkuValue(term);
  if (!t) return [];
  return list.filter((sku) => {
    const item = state.skuCatalog[sku] || {};
    return normalizeSkuValue(sku).includes(t) || normalizeSkuValue(item.Code || "").includes(t);
  }).slice(0, 8);
}


function findSkuKeyByInput(term) {
  if (!state.skuCatalog) return "";
  const normalizedTerm = normalizeSkuValue(term);
  if (!normalizedTerm) return "";
  return Object.keys(state.skuCatalog).find((key) => {
    const item = state.skuCatalog[key] || {};
    const normalizedKey = normalizeSkuValue(key);
    const normalizedCode = normalizeSkuValue(item.Code || "");
    return normalizedKey === normalizedTerm || normalizedCode === normalizedTerm;
  }) || "";
}

function convertCmToMm(rawValue) {
  const num = Number(rawValue);
  if (!Number.isFinite(num)) return "";
  return String(num * 10);
}

function removeAccentsText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function buildDescriptionFromProperties(properties) {
  if (!properties || typeof properties !== "object") return "";
  const excludedKeys = new Set(["presale", "item_contact_form", "tiempo_espera"]);
  const entries = Object.values(properties)
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const rawKey = String(item.Key || "").trim();
      const rawValue = String(item.Value || "").trim();
      if (!rawKey || !rawValue) return "";
      const cleanKey = removeAccentsText(rawKey.replace(/^_extprop_/i, ""));
      const cleanValue = removeAccentsText(rawValue);
      if (!cleanKey || !cleanValue || excludedKeys.has(cleanKey.toLowerCase())) return "";
      return `${cleanKey}: ${cleanValue}`;
    })
    .filter(Boolean);
  return entries.join(". ") + (entries.length ? "." : "");
}

function applySkuDataToRow(rowIdx, sku) {
  const row = state.products[state.currentStore]?.[rowIdx];
  if (!row || !state.skuCatalog) return;
  const selectedSku = findSkuKeyByInput(sku);
  if (!selectedSku) return;

  const data = state.skuCatalog[selectedSku] || {};
  row["Property SKU"] = data.Code !== undefined && data.Code !== null && String(data.Code).trim() ? String(data.Code).trim() : selectedSku;
  if (data.Brand !== undefined) {
    row.Manufacturer = String(data.Brand);
    if ("BRAND" in row) row.BRAND = String(data.Brand);
  }
  if (data.BoxHeight !== undefined) row.Height = convertCmToMm(data.BoxHeight);
  if (data.BoxLength !== undefined) row.Length = convertCmToMm(data.BoxLength);
  if (data.BoxWeight !== undefined) row.Weight = String(data.BoxWeight);
  if (data.BoxWidth !== undefined) row.Width = convertCmToMm(data.BoxWidth);
  if (data.Name !== undefined) row.Title = removeAccentsText(data.Name);

  const description = buildDescriptionFromProperties(data.Properties);
  if (description) row.Description = description;
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

function renderSkuSuggestions(inputEl, rowIdx) {
  const host = inputEl.parentElement.querySelector(".suggest-host");
  const matches = getSkuMatches(inputEl.value || "");
  if (!matches.length || document.activeElement !== inputEl) {
    host.innerHTML = "";
    host.classList.add("hidden");
    return;
  }

  host.innerHTML = `<div class='suggest-box'>${matches.map((sku) => `<div class='suggest-item' data-row='${rowIdx}' data-sku='${sku}'>${sku}</div>`).join("")}</div>`;
  host.classList.remove("hidden");

  host.querySelectorAll(".suggest-item").forEach((item) => {
    item.onmousedown = async (e) => {
      e.preventDefault();
      const selectedSku = item.dataset.sku;
      applySkuDataToRow(rowIdx, selectedSku);
      buildWorkspace();
      await persistRows();
    };
  });
}

function syncTopScrollbar() {
  const container = $("tableContainer");
  const topScroll = $("tableTopScroll");
  const topInner = $("tableTopScrollInner");
  const rowsWrap = container?.querySelector(".rows-wrap");
  if (!container || !topScroll || !topInner || !rowsWrap) return;
  const fullWidth = Math.max(rowsWrap.scrollWidth, container.scrollWidth);
  topInner.style.width = `${fullWidth}px`;
  const showTopScroll = container.scrollWidth > container.clientWidth;
  topScroll.classList.toggle("hidden", !showTopScroll);
}

function buildWorkspace() {
  const container = $("tableContainer");
  const topScroll = $("tableTopScroll");
  const previousScrollLeft = container?.scrollLeft || 0;
  const previousScrollTop = container?.scrollTop || 0;
  const previousWindowX = window.scrollX;
  const previousWindowY = window.scrollY;
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
      if (field === "Property SKU") {
        return `<div class='field-block'><label>${field}${required}</label><input data-row='${idx}' data-field='${field}' value='${row[field] || ""}' placeholder='Buscar SKU'><div class='suggest-host hidden'></div></div>`;
      }
      if (field === "Transaction Type") return `<div class='field-block'><label>${field}</label><input class='locked' data-row='${idx}' data-field='${field}' value='purchasable' readonly></div>`;
      if (DATE_FIELDS.includes(field)) return `<div class='field-block'><label>${field}${required}</label><input type='text' inputmode='numeric' placeholder='AAAA-MM-DD' data-row='${idx}' data-field='${field}' value='${row[field] || ""}'></div>`;
      if (field === "ORIGIN_OF_PRODUCT") {
        const current = row[field] === undefined || row[field] === "" ? "0" : String(row[field]);
        return `<div class='field-block'><label>${field}</label><select data-row='${idx}' data-field='${field}'><option value='0' ${current === "0" ? "selected" : ""}>0: Nacional</option><option value='1' ${current === "1" ? "selected" : ""}>1: Importado</option><option value='2' ${current === "2" ? "selected" : ""}>2: Ensamblado en Argentina</option></select></div>`;
      }
      return `<div class='field-block'><label>${field}${required}</label><input data-row='${idx}' data-field='${field}' value='${row[field] || ""}'></div>`;
    }).join("");
    rowBox.innerHTML = `<button class='row-delete-btn' data-del-row='${idx}' title='Eliminar fila'><i class='bi bi-trash3'></i></button><div class='row-grid'>${fieldsHtml}</div>`;
    wrap.appendChild(rowBox);
  });

  container.innerHTML = "";
  const topScrollWrap = document.createElement("div");
  topScrollWrap.id = "tableTopScroll";
  topScrollWrap.className = "table-top-scroll hidden";
  topScrollWrap.innerHTML = `<div id="tableTopScrollInner"></div>`;
  container.appendChild(topScrollWrap);
  container.appendChild(wrap);
  const addRowWrap = document.createElement("div");
  addRowWrap.className = "add-row-inline-wrap";
  addRowWrap.innerHTML = `<button id="addRowInlineBtn" class="add-row-inline-btn" title="Agregar fila">+</button>`;
  container.appendChild(addRowWrap);

  syncTopScrollbar();
  requestAnimationFrame(syncTopScrollbar);
  container.onscroll = () => {
    if (topScroll && topScroll.scrollLeft !== container.scrollLeft) topScroll.scrollLeft = container.scrollLeft;
  };
  if (topScroll) {
    topScroll.onscroll = () => {
      if (container.scrollLeft !== topScroll.scrollLeft) container.scrollLeft = topScroll.scrollLeft;
    };
  }
  requestAnimationFrame(() => {
    container.scrollLeft = previousScrollLeft;
    container.scrollTop = previousScrollTop;
    if (topScroll) topScroll.scrollLeft = previousScrollLeft;
    window.scrollTo(previousWindowX, previousWindowY);
  });

  container.querySelectorAll("input[data-row], select[data-row]").forEach((control) => {
    const r = Number(control.dataset.row);
    const f = control.dataset.field;

    const sync = () => {
      state.products[state.currentStore][r][f] = f === "Transaction Type" ? "purchasable" : control.value;
      if (f === "Category") renderCategorySuggestions(control, r);
      if (f === "Property SKU") {
        renderSkuSuggestions(control, r);
        const exactSku = findSkuKeyByInput(control.value);
        if (exactSku) {
          applySkuDataToRow(r, exactSku);
          buildWorkspace();
        }
      }
      state.draft[state.currentStore] = state.products[state.currentStore];
      localStorage.setItem("ttx_draft", JSON.stringify(state.draft));
      dbPut(`drafts/${state.user}/${state.currentStore}`, state.products[state.currentStore]);
      validateRows();
    };

    control.oninput = sync;
    control.onchange = sync;

    if (f === "Category") {
      control.onfocus = () => renderCategorySuggestions(control, r);
      control.onblur = () => {
        setTimeout(() => {
          const host = control.parentElement.querySelector('.suggest-host');
          host.innerHTML = '';
          host.classList.add('hidden');
        }, 120);
      };
    }

    if (f === "Property SKU") {
      control.onfocus = () => renderSkuSuggestions(control, r);
      control.onblur = () => {
        setTimeout(async () => {
          const host = control.parentElement.querySelector('.suggest-host');
          host.innerHTML = '';
          host.classList.add('hidden');
          const exactSku = findSkuKeyByInput(control.value);
          if (exactSku) {
            applySkuDataToRow(r, exactSku);
            buildWorkspace();
            await persistRows();
          }
        }, 120);
      };
    }
  });

  const inlineAddBtn = $("addRowInlineBtn");
  if (inlineAddBtn) inlineAddBtn.onclick = addNewRow;

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

    let dateBad = false;
    if (DATE_FIELDS.includes(field) && el.value.trim()) {
      dateBad = !/^\d{4}-\d{2}-\d{2}$/.test(el.value.trim());
    }

    const bad = requiredBad || duplicateBad || dateBad;
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
      msg.textContent = duplicateBad ? 'Sku duplicado' : (dateBad ? 'Formato fecha: AAAA-MM-DD' : '');
      msg.classList.toggle('hidden', !(duplicateBad || dateBad));
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
  await dbPut(`products/${state.currentStore}`, state.products[state.currentStore]);
}

async function selectStore(key) {
  state.currentStore = key;
  $("workspaceTitle").textContent = stores.find((s) => s.key === key)?.name || key;
  const remoteProducts = await dbGet(`products/${key}`);
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

  await dbPost("exports", { user: state.user, createdAt: nowArgentina(), store: state.currentStore, filename, csv });
  showToast("Export generado");
  state.historyPage = 1;
  loadHistory();
}

async function loadHistory() {
  const entries = await dbGet("exports") || {};
  const history = Object.values(entries).filter(Boolean).reverse();
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(history.length / pageSize));
  state.historyPage = Math.min(Math.max(state.historyPage, 1), totalPages);

  const pagination = $("historyPagination");
  pagination.innerHTML = "";
  if (history.length > pageSize) {
    for (let page = 1; page <= totalPages; page += 1) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `ios-btn small page-btn ${page === state.historyPage ? "active" : ""}`;
      btn.textContent = page;
      btn.onclick = () => {
        state.historyPage = page;
        loadHistory();
      };
      pagination.appendChild(btn);
    }
  }

  const start = (state.historyPage - 1) * pageSize;
  const pageItems = history.slice(start, start + pageSize);

  const box = $("historyList");
  box.innerHTML = "";
  if (!pageItems.length) {
    box.innerHTML = "<p>Sin exportaciones registradas</p>";
    return;
  }

  pageItems.forEach((h) => {
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
  state.skuCatalog = await dbGetAbsolute("https://precios-novogar-default-rtdb.firebaseio.com/ProductosE3porSKU.json") || {};

  window.addEventListener("resize", syncTopScrollbar);

  renderCategoryList();

  const userFromSession = localStorage.getItem("ttx_user");
  if (userFromSession) {
    state.user = userFromSession;
    switchView("storeView");
    loadHistory();
  } else {
    switchView("loginView");
  }
}

$("togglePass").onclick = () => {
  const p = $("loginPass");
  const showing = p.type === "password";
  p.type = showing ? "text" : "password";
  $("togglePass").textContent = showing ? "Ocultar" : "Mostrar";
};

async function loadLoginCredentials() {
  if (state.loginCredentials.length) return state.loginCredentials;
  const remote = await dbGet("user");
  const credentials = [];
  if (remote?.user && remote?.pass !== undefined) credentials.push({ user: String(remote.user), pass: String(remote.pass) });
  Object.keys(remote || {}).forEach((k) => {
    const m = k.match(/^user(\d+)$/);
    if (!m) return;
    const idx = m[1];
    const passKey = `pass${idx}`;
    if (remote[passKey] !== undefined) credentials.push({ user: String(remote[k]), pass: String(remote[passKey]) });
  });
  state.loginCredentials = credentials;
  return credentials;
}

function setLoginLoading(show) {
  const overlay = $("loginLoadingOverlay");
  if (overlay) overlay.classList.toggle("hidden", !show);
}

async function completeLogin(user) {
  state.user = user;
  localStorage.setItem("ttx_user", state.user);
  switchView("storeView");
  loadHistory();
  showToast("Bienvenido");
}

async function doLogin({ showSpinner = true } = {}) {
  const inputUser = $("loginUser").value.trim();
  const inputPass = $("loginPass").value.trim();
  const credentials = await loadLoginCredentials();
  const ok = credentials.find((c) => c.user === inputUser && c.pass === inputPass);

  if (!ok) return showToast("Credenciales inválidas");
  if (showSpinner) {
    setLoginLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 2000));
    setLoginLoading(false);
  }
  await completeLogin(ok.user);
}

let autoLoginTimer = null;
async function scheduleAutoLoginIfValid() {
  clearTimeout(autoLoginTimer);
  if (!$("loginView").classList.contains("active")) return;
  const user = $("loginUser").value.trim();
  const pass = $("loginPass").value.trim();
  if (!user || !pass) return;
  const credentials = await loadLoginCredentials();
  const valid = credentials.some((c) => c.user === user && c.pass === pass);
  if (!valid) return;
  autoLoginTimer = setTimeout(() => {
    if ($("loginView").classList.contains("active")) doLogin({ showSpinner: false });
  }, 2500);
}

$("loginBtn").onclick = () => doLogin({ showSpinner: true });
$("loginPass").addEventListener("input", scheduleAutoLoginIfValid);
$("loginUser").addEventListener("input", scheduleAutoLoginIfValid);
$("loginPass").addEventListener("keydown", (e) => e.key === "Enter" && doLogin({ showSpinner: true }));
$("loginUser").addEventListener("keydown", (e) => e.key === "Enter" && doLogin({ showSpinner: true }));

$("menuBtn").onclick = () => $("menuDrawer").classList.toggle("open");
$("workspaceMenuBtn").onclick = () => $("workspaceDrawer").classList.toggle("open");
$("closeMenuBtn").onclick = closeAllDrawers;
$("closeWorkspaceMenuBtn").onclick = closeAllDrawers;

$("menuHistorialBtn").onclick = () => { closeAllDrawers(); state.historyPage = 1; $("historyModal").classList.remove("hidden"); loadHistory(); };
$("workspaceHistorialBtn").onclick = () => { closeAllDrawers(); state.historyPage = 1; $("historyModal").classList.remove("hidden"); loadHistory(); };
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

function addNewRow() {
  state.products[state.currentStore] = state.products[state.currentStore] || [defaultRow()];
  state.products[state.currentStore].push(defaultRow());
  buildWorkspace();
}

if ($("addRowBtn")) $("addRowBtn").onclick = addNewRow;
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

const doLogout = () => {
  closeAllDrawers();
  localStorage.removeItem("ttx_user");
  state.user = null;
  state.currentStore = null;
  switchView("loginView");
};

$("menuLogoutBtn").onclick = doLogout;
$("workspaceLogoutBtn").onclick = doLogout;

init();
