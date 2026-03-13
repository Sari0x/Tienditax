const DB_URL = "https://tienditax-default-rtdb.firebaseio.com";
const stores = [
  { key: "bna", name: "Tienda BNA", logo: "https://i.ibb.co/N8YkLZq/tienda-bna-logo.png" },
  { key: "macro", name: "Tienda Macro", logo: "https://i.ibb.co/cXFYN9bx/tienda-macro-logo.png" },
  { key: "ciudad", name: "Tienda Ciudad", logo: "https://i.ibb.co/Gf90gWxd/tienda-ciudad-logo.png" },
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

const ADMIN_USER = "manusario";

let state = { user: null, currentStore: null, categories: {}, products: {}, draft: {}, pendingDelete: null, historyPage: 1, conversionHistoryPage: 1, sessionsPage: 1, historyMode: "exports", skuCatalog: null, loginCredentials: [], activeSessionId: null, theme: "light", calendarEvents: [], calendarEditingId: null };
let calendarInstance = null;
const $ = (id) => document.getElementById(id);
const dbGet = async (path) => (await fetch(`${DB_URL}/${path}.json`)).json();
const dbPut = async (path, data) => fetch(`${DB_URL}/${path}.json`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
const dbPost = async (path, data) => (await fetch(`${DB_URL}/${path}.json`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })).json();
const dbGetAbsolute = async (url) => (await fetch(url)).json();


function preferenceThemeKey(user) {
  return `ttx_theme_${user || "guest"}`;
}

function loadUserThemePreference(user) {
  const byUser = user ? localStorage.getItem(preferenceThemeKey(user)) : null;
  const lastTheme = localStorage.getItem("ttx_theme_last");
  const saved = byUser ?? lastTheme;
  state.theme = saved === "dark" ? "dark" : "light";
}

function applyUserPreferences() {
  const darkEnabled = state.theme === "dark";
  document.body.classList.toggle("dark", darkEnabled);
  ["themeToggleMenu", "themeToggleWorkspace"].forEach((id) => {
    if ($(id)) $(id).checked = darkEnabled;
  });
}

function persistUserPreferences() {
  localStorage.setItem(preferenceThemeKey(state.user), state.theme);
  localStorage.setItem("ttx_theme_last", state.theme);
}

function setTheme(theme) {
  state.theme = theme === "dark" ? "dark" : "light";
  applyUserPreferences();
  persistUserPreferences();
}

function bindPreferenceSwitch(id, onChange) {
  const el = $(id);
  if (!el) return;
  el.onchange = (e) => onChange(e.target.checked);
}

function calendarStorageKey() {
  return `ttx_calendar_events_${state.user || "guest"}`;
}

function loadCalendarEvents() {
  try {
    const raw = localStorage.getItem(calendarStorageKey());
    const parsed = JSON.parse(raw || "[]");
    state.calendarEvents = Array.isArray(parsed) ? parsed : [];
  } catch {
    state.calendarEvents = [];
  }
}

function persistCalendarEvents() {
  localStorage.setItem(calendarStorageKey(), JSON.stringify(state.calendarEvents));
}

function resetCalendarForm() {
  state.calendarEditingId = null;
  $("calendarFormTitle").textContent = "Nuevo evento";
  $("calendarEventTitle").value = "";
  $("calendarEventDetails").value = "";
  $("calendarEventStart").value = "";
  $("calendarEventEnd").value = "";
  $("calendarEventColor").value = "#0a53d0";
  $("calendarEventAllDay").checked = false;
  $("calendarDeleteBtn").classList.add("hidden");
  $("calendarCancelEditBtn").classList.add("hidden");
}

function toLocalDateTimeValue(date) {
  if (!date) return "";
  return new Date(date.getTime() - (date.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
}

function parseYmdAsLocalDate(value) {
  if (!value) return null;
  const [year, month, day] = String(value).split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function toYmd(date) {
  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function normalizeCalendarEventDates(startInput, endInput, allDay) {
  if (!allDay) {
    return { start: startInput, end: endInput || null };
  }

  const startDate = new Date(startInput);
  if (Number.isNaN(startDate.getTime())) return null;

  const startYmd = toYmd(startDate);
  if (!endInput) return { start: startYmd, end: null };

  const endDateRaw = new Date(endInput);
  if (Number.isNaN(endDateRaw.getTime())) return { start: startYmd, end: null };

  const startDay = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const endDay = new Date(endDateRaw.getFullYear(), endDateRaw.getMonth(), endDateRaw.getDate());
  const inclusiveEnd = endDay < startDay ? startDay : endDay;
  const exclusiveEnd = addDays(inclusiveEnd, 1);

  return { start: startYmd, end: toYmd(exclusiveEnd) };
}

function syncCalendarEventsFromInstance() {
  if (!calendarInstance) return;
  state.calendarEvents = calendarInstance.getEvents().map((event) => ({
    id: event.id,
    title: event.title,
    start: event.startStr,
    end: event.endStr || null,
    allDay: event.allDay,
    color: event.backgroundColor || event.borderColor || "#0a53d0",
    details: event.extendedProps?.details || "",
  }));
  persistCalendarEvents();
}

function loadEventInForm(event) {
  state.calendarEditingId = event.id;
  $("calendarFormTitle").textContent = "Editar evento";
  $("calendarEventTitle").value = event.title || "";
  $("calendarEventDetails").value = event.extendedProps?.details || "";
  $("calendarEventColor").value = event.backgroundColor || event.borderColor || "#0a53d0";
  $("calendarEventAllDay").checked = !!event.allDay;

  if (event.allDay) {
    $("calendarEventStart").value = event.startStr ? `${event.startStr}T00:00` : "";
    if (event.endStr) {
      const endDate = parseYmdAsLocalDate(event.endStr);
      $("calendarEventEnd").value = endDate ? `${toYmd(addDays(endDate, -1))}T00:00` : "";
    } else {
      $("calendarEventEnd").value = "";
    }
  } else {
    $("calendarEventStart").value = event.start ? toLocalDateTimeValue(event.start) : "";
    $("calendarEventEnd").value = event.end ? toLocalDateTimeValue(event.end) : "";
  }

  $("calendarDeleteBtn").classList.remove("hidden");
  $("calendarCancelEditBtn").classList.remove("hidden");
}

function prefillCalendarFormFromSelection(info) {
  resetCalendarForm();
  $("calendarEventStart").value = info.start ? toLocalDateTimeValue(info.start) : "";
  if (info.allDay && info.end) {
    const inclusiveEnd = addDays(info.end, -1);
    $("calendarEventEnd").value = toLocalDateTimeValue(inclusiveEnd);
  } else {
    $("calendarEventEnd").value = info.end ? toLocalDateTimeValue(info.end) : "";
  }
  $("calendarEventAllDay").checked = !!info.allDay;
}

function initCalendar() {
  if (calendarInstance || !window.FullCalendar || !$("calendarContainer")) return;
  calendarInstance = new FullCalendar.Calendar($("calendarContainer"), {
    locale: "es",
    initialView: "dayGridMonth",
    height: "auto",
    selectable: true,
    editable: true,
    headerToolbar: {
      left: "prev,next today",
      center: "title",
      right: "dayGridMonth,timeGridWeek,timeGridDay,listWeek",
    },
    buttonText: {
      today: "Hoy",
      month: "Mes",
      week: "Semana",
      day: "Día",
      list: "Agenda",
    },
    events: state.calendarEvents,
    select: (info) => prefillCalendarFormFromSelection(info),
    eventClick: (info) => loadEventInForm(info.event),
    eventDrop: () => syncCalendarEventsFromInstance(),
    eventResize: () => syncCalendarEventsFromInstance(),
    eventDidMount: (info) => {
      const details = info.event.extendedProps?.details;
      if (details) info.el.title = details;
    },
  });
  calendarInstance.render();
}

function openCalendarModal() {
  closeAllDrawers();
  loadCalendarEvents();
  $("calendarModal").classList.remove("hidden");
  resetCalendarForm();
  initCalendar();
  if (calendarInstance) {
    calendarInstance.removeAllEvents();
    calendarInstance.addEventSource(state.calendarEvents);
    calendarInstance.updateSize();
  }
}

function saveCalendarEvent() {
  if (!calendarInstance) return;
  const title = $("calendarEventTitle").value.trim();
  const details = $("calendarEventDetails").value.trim();
  const startInput = $("calendarEventStart").value;
  const endInput = $("calendarEventEnd").value;
  const color = $("calendarEventColor").value || "#0a53d0";
  const allDay = $("calendarEventAllDay").checked;
  if (!title || !startInput) return showToast("Completá título y fecha de inicio");

  const normalizedDates = normalizeCalendarEventDates(startInput, endInput, allDay);
  if (!normalizedDates) return showToast("Fecha inválida");

  if (state.calendarEditingId) {
    const existing = calendarInstance.getEventById(state.calendarEditingId);
    if (!existing) return;
    existing.setAllDay(allDay);
    existing.setProp("title", title);
    existing.setStart(normalizedDates.start);
    existing.setEnd(normalizedDates.end);
    existing.setExtendedProp("details", details);
    existing.setProp("backgroundColor", color);
    existing.setProp("borderColor", color);
  } else {
    calendarInstance.addEvent({
      id: `ev_${Date.now()}`,
      title,
      start: normalizedDates.start,
      end: normalizedDates.end,
      allDay,
      backgroundColor: color,
      borderColor: color,
      extendedProps: { details },
    });
  }

  syncCalendarEventsFromInstance();
  resetCalendarForm();
  showToast("Evento guardado");
}

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


function conversionTimestamp() {
  return new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).replace(",", "");
}

function buildConversionLabel() {
  return `${state.user} - ${conversionTimestamp()} - conversion`;
}

function sanitizeFilename(value) {
  return String(value || "").replace(/[\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim();
}

function isAdminUser() {
  return state.user === ADMIN_USER;
}

function updateHistoryTabs() {
  const exportsTab = $("historyExportsTab");
  const conversionsTab = $("historyConversionsTab");
  const sessionsTab = $("historySessionsTab");
  if (!exportsTab || !conversionsTab || !sessionsTab) return;
  exportsTab.classList.toggle("active", state.historyMode === "exports");
  conversionsTab.classList.toggle("active", state.historyMode === "conversions");
  sessionsTab.classList.toggle("active", state.historyMode === "sessions");
}





async function confirmAction(title, text) {
  if (window.Swal?.fire) {
    const res = await Swal.fire({ title, text, icon: "warning", showCancelButton: true, confirmButtonText: "Confirmar", cancelButtonText: "Cancelar" });
    return res.isConfirmed;
  }
  return window.confirm(`${title}\n${text}`);
}

async function askSessionAction() {
  if (window.Swal?.fire) {
    const res = await Swal.fire({
      title: "Sesión de carga",
      text: "Elegí cómo querés continuar",
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Continuar hoja actual",
      cancelButtonText: "Nueva hoja de carga",
      reverseButtons: true,
      allowOutsideClick: false,
    });
    return res.isConfirmed ? "continue" : "new";
  }
  return window.confirm("Aceptar: continuar hoja actual. Cancelar: crear nueva hoja") ? "continue" : "new";
}

async function getUserSessions(status = null) {
  const entries = await dbGet("sessions") || {};
  const list = Object.entries(entries).map(([id, value]) => ({ id, ...(value || {}) }))
    .filter((item) => item.usuario === state.user);
  const filtered = status ? list.filter((item) => item.estado === status) : list;
  return filtered.sort((a, b) => String(b.fechaCreacion || "").localeCompare(String(a.fechaCreacion || "")));
}

async function getActiveSessionForCurrentStore() {
  const sessions = await getUserSessions("activa");
  return sessions.find((session) => session.store === state.currentStore) || null;
}

function ensureRowsArray(rows) {
  return Array.isArray(rows) && rows.length ? rows : [defaultRow()];
}

async function createNewSessionForStore() {
  const payload = {
    sessionId: "",
    usuario: state.user,
    fechaCreacion: nowArgentina(),
    estado: "activa",
    store: state.currentStore,
    productos: [],
  };
  const created = await dbPost("sessions", payload);
  const sessionId = created?.name;
  if (!sessionId) throw new Error("No se pudo crear la sesión");
  payload.sessionId = sessionId;
  await dbPut(`sessions/${sessionId}`, payload);
  state.activeSessionId = sessionId;
  state.products[state.currentStore] = [defaultRow()];
  state.draft[state.currentStore] = state.products[state.currentStore];
  localStorage.setItem("ttx_draft", JSON.stringify(state.draft));
  localStorage.setItem(`ttx_active_session_${state.user}_${state.currentStore}`, sessionId);
  await persistRows();
  showToast("Sesión creada");
}

async function loadSessionById(sessionId, feedback = true) {
  const session = await dbGet(`sessions/${sessionId}`);
  if (!session || session.usuario !== state.user) return showToast("No tenés permisos para esta sesión");
  state.activeSessionId = sessionId;
  const targetStore = session.store || state.currentStore;
  if (targetStore && targetStore !== state.currentStore) {
    state.currentStore = targetStore;
    $("workspaceTitle").textContent = stores.find((s) => s.key === targetStore)?.name || targetStore;
    renderStoreSwitchList();
  }
  state.products[state.currentStore] = ensureRowsArray(session.productos);
  state.draft[state.currentStore] = state.products[state.currentStore];
  localStorage.setItem("ttx_draft", JSON.stringify(state.draft));
  localStorage.setItem(`ttx_active_session_${state.user}_${state.currentStore}`, sessionId);
  buildWorkspace();
  if (feedback) showToast("Sesión cargada");
}

async function resolveSessionOnStoreOpen() {
  const remembered = localStorage.getItem(`ttx_active_session_${state.user}_${state.currentStore}`);
  if (remembered) {
    const stored = await dbGet(`sessions/${remembered}`);
    if (stored && stored.usuario === state.user && stored.estado === "activa" && (stored.store || state.currentStore) === state.currentStore) {
      await loadSessionById(remembered, false);
      showToast("Sesión restaurada");
      return;
    }
  }

  const action = await askSessionAction();
  if (action === "continue") {
    const active = await getActiveSessionForCurrentStore();
    if (active) {
      await loadSessionById(active.id);
      return;
    }
    showToast("No hay sesión activa. Se creará una nueva.");
  }
  await createNewSessionForStore();
  buildWorkspace();
}



function excelSerialToDateString(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return "";
  const parsed = XLSX.SSF?.parse_date_code ? XLSX.SSF.parse_date_code(num) : null;
  if (!parsed || !parsed.y || !parsed.m || !parsed.d) return "";
  const yyyy = String(parsed.y).padStart(4, "0");
  const mm = String(parsed.m).padStart(2, "0");
  const dd = String(parsed.d).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function normalizeDateFieldValue(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const serialLike = /^\d+(\.\d+)?$/.test(raw);
  if (!serialLike) return raw;

  const serialConverted = excelSerialToDateString(raw);
  return serialConverted || raw;
}

function normalizeEditableExportRow(row, targetStore) {
  const fields = STORE_FIELDS[targetStore] || STORE_FIELDS.bna;
  const normalized = defaultRow();
  fields.forEach((field) => {
    if (row[field] === undefined) return;
    const value = DATE_FIELDS.includes(field) ? normalizeDateFieldValue(row[field]) : String(row[field] ?? "");
    normalized[field] = value;
  });
  normalized["Transaction Type"] = "purchasable";
  return normalized;
}

function parseStoredCsvToProducts(csv, targetStore) {
  if (!csv || typeof csv !== "string") return [];
  try {
    const workbook = XLSX.read(csv, { type: "string" });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: "" });
    if (!Array.isArray(rows) || rows.length < 2) return [];
    const [headers, ...body] = rows;
    return body
      .filter((row) => Array.isArray(row) && row.some((cell) => String(cell ?? "").trim()))
      .map((row) => {
        const mapped = {};
        headers.forEach((header, idx) => {
          mapped[String(header || "")] = row[idx] ?? "";
        });
        return normalizeEditableExportRow(mapped, targetStore);
      });
  } catch (err) {
    console.error("No se pudo parsear CSV guardado", err);
    return [];
  }
}

function extractEditableProductsFromExport(exportItem, targetStore) {
  if (Array.isArray(exportItem?.productos) && exportItem.productos.length) {
    return exportItem.productos.map((row) => normalizeEditableExportRow(row, targetStore));
  }
  return parseStoredCsvToProducts(exportItem?.csv, targetStore);
}

function setConverterFilesAccept() {
  const source = $("sourceFormatSelect")?.value || "xlsx";
  const map = { xlsx: ".xlsx", xls: ".xls", csv: ".csv", txt: ".txt", json: ".json" };
  if ($("converterFilesInput")) $("converterFilesInput").accept = map[source] || "";
}

function setConverterFilesInfo() {
  const files = $("converterFilesInput")?.files || [];
  $("converterFilesInfo").textContent = files.length ? `${files.length} archivo(s) seleccionado(s)` : "Sin archivos seleccionados";
}

function addConverterLog(text, loading = false) {
  const logs = $("converterLogs");
  const row = document.createElement("div");
  row.className = "converter-log-item";
  if (loading) {
    row.innerHTML = `<img src="https://i.postimg.cc/fbH7b8Vt/spinner-tienditax.png" alt="Cargando" class="mini-spinner"> <span>${text}</span>`;
  } else {
    row.innerHTML = `<span>${text}</span>`;
  }
  logs.appendChild(row);
  logs.scrollTop = logs.scrollHeight;
  return row;
}

function completeConverterLog(row, text) {
  if (!row) return;
  const spinner = row.querySelector(".mini-spinner");
  if (spinner) spinner.classList.add("stopped");
  const textNode = row.querySelector("span");
  if (textNode) textNode.textContent = text;
}

function clearConverterLogs() {
  $("converterLogs").innerHTML = "";
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  bytes.forEach((b) => binary += String.fromCharCode(b));
  return btoa(binary);
}

function base64ToBlob(base64, mimeType) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

function textToRows(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length);
  return lines.map((line) => line.split(",").map((cell) => cell.trim()));
}

function rowsToCsv(rows) {
  return rows.map((r) => r.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
}

function rowsToObjects(rows) {
  if (!rows.length) return [];
  const [headers, ...body] = rows;
  return body.map((row) => Object.fromEntries(headers.map((h, idx) => [String(h || `col_${idx + 1}`), row[idx] ?? ""])));
}

async function parseInputFile(file, sourceFormat) {
  if (sourceFormat === "xlsx" || sourceFormat === "xls") {
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
    return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });
  }
  if (sourceFormat === "json") {
    const parsed = JSON.parse(await file.text());
    if (!Array.isArray(parsed)) throw new Error("JSON inválido");
    if (!parsed.length) return [[]];
    if (Array.isArray(parsed[0])) return parsed;
    const headers = Object.keys(parsed[0] || {});
    const body = parsed.map((item) => headers.map((h) => item[h] ?? ""));
    return [headers, ...body];
  }
  const text = await file.text();
  return textToRows(text);
}

async function buildConvertedFile(file, sourceFormat, targetFormat) {
  const rows = await parseInputFile(file, sourceFormat);
  const baseName = file.name.replace(/\.[^.]+$/, "") || "archivo";

  if (targetFormat === "csv") {
    const csv = rowsToCsv(rows);
    return { filename: `${baseName}.csv`, mime: "text/csv;charset=utf-8;", blob: new Blob([csv], { type: "text/csv;charset=utf-8;" }) };
  }
  if (targetFormat === "txt") {
    const txt = rows.map((r) => r.join("\t")).join("\n");
    return { filename: `${baseName}.txt`, mime: "text/plain;charset=utf-8;", blob: new Blob([txt], { type: "text/plain;charset=utf-8;" }) };
  }
  if (targetFormat === "json") {
    const json = JSON.stringify(rowsToObjects(rows), null, 2);
    return { filename: `${baseName}.json`, mime: "application/json;charset=utf-8;", blob: new Blob([json], { type: "application/json;charset=utf-8;" }) };
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Datos");
  const array = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return { filename: `${baseName}.xlsx`, mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", blob: new Blob([array], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }) };
}

async function startConversion() {
  const files = Array.from($("converterFilesInput").files || []);
  const sourceFormat = $("sourceFormatSelect").value;
  const targetFormat = $("targetFormatSelect").value;

  if (!files.length) return showToast("Seleccioná al menos un archivo");
  if (sourceFormat === targetFormat) return showToast("Elegí formatos distintos");

  clearConverterLogs();
  const prepLog = addConverterLog(`Preparando ${files.length} archivo(s) para convertir de ${sourceFormat.toUpperCase()} a ${targetFormat.toUpperCase()}...`, true);

  const waitLog = addConverterLog("⏳ Procesando conversión (aprox. 3 segundos)...", true);
  await new Promise((resolve) => setTimeout(resolve, 3000));

  const converted = [];
  for (const file of files) {
    const loadingLog = addConverterLog(`Convirtiendo ${file.name}...`, true);
    const output = await buildConvertedFile(file, sourceFormat, targetFormat);
    converted.push(output);
    completeConverterLog(loadingLog, `✅ ${file.name} convertido a ${output.filename}`);
  }
  completeConverterLog(prepLog, "✅ Preparación finalizada");
  completeConverterLog(waitLog, "✅ Tiempo de procesamiento completado");

  const label = buildConversionLabel();
  const safeLabel = sanitizeFilename(label);

  let payload = null;
  if (converted.length === 1) {
    const only = converted[0];
    const link = document.createElement("a");
    link.href = URL.createObjectURL(only.blob);
    link.download = only.filename;
    link.click();
    payload = { type: "single", filename: only.filename, mime: only.mime, contentBase64: arrayBufferToBase64(await only.blob.arrayBuffer()) };
    addConverterLog(`Archivo exportado: ${only.filename}`);
  } else {
    const zip = new JSZip();
    for (const file of converted) zip.file(file.filename, await file.blob.arrayBuffer());
    const zipBlob = await zip.generateAsync({ type: "blob" });
    const zipFilename = `${safeLabel}.zip`;
    const link = document.createElement("a");
    link.href = URL.createObjectURL(zipBlob);
    link.download = zipFilename;
    link.click();
    payload = { type: "zip", filename: zipFilename, mime: "application/zip", contentBase64: arrayBufferToBase64(await zipBlob.arrayBuffer()) };
    addConverterLog(`ZIP exportado: ${zipFilename}`);
  }

  await dbPost("conversions", {
    user: state.user,
    usuario: state.user,
    createdAt: nowArgentina(),
    fecha: nowArgentina(),
    archivoURL: null,
    label,
    sourceFormat,
    targetFormat,
    totalFiles: files.length,
    payload,
  });

  addConverterLog("Conversión finalizada con éxito ✨");
  showToast("Conversión finalizada");
  state.conversionHistoryPage = 1;
  if (state.historyMode === "conversions") loadHistory();
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
      persistRows();
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
    rowBox.innerHTML = `<div class='row-grid'>${fieldsHtml}</div><div class='row-actions'><button class='row-delete-btn' data-del-row='${idx}' title='Eliminar fila'><i class='bi bi-trash3'></i></button><button class='add-row-inline-btn' data-add-row='${idx}' title='Agregar fila'>+</button></div>`;
    wrap.appendChild(rowBox);
  });

  container.innerHTML = "";
  const topScrollWrap = document.createElement("div");
  topScrollWrap.id = "tableTopScroll";
  topScrollWrap.className = "table-top-scroll hidden";
  topScrollWrap.innerHTML = `<div id="tableTopScrollInner"></div>`;
  container.appendChild(topScrollWrap);
  container.appendChild(wrap);

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
      persistRows();
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

  container.querySelectorAll("[data-add-row]").forEach((btn) => {
    btn.onclick = () => {
      const rowIdx = Number(btn.dataset.addRow);
      addNewRow(rowIdx + 1);
    };
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
  state.draft[state.currentStore] = state.products[state.currentStore];
  await dbPut(`drafts/${state.user}/${state.currentStore}`, state.products[state.currentStore]);
  if (state.activeSessionId) {
    await dbPut(`sessions/${state.activeSessionId}/productos`, state.products[state.currentStore]);
  }
}

async function selectStore(key) {
  state.currentStore = key;
  state.activeSessionId = null;
  localStorage.setItem(`ttx_store_${state.user}`, key);
  $("workspaceTitle").textContent = stores.find((s) => s.key === key)?.name || key;
  switchView("workspaceView");
  renderStoreSwitchList();
  await resolveSessionOnStoreOpen();
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

  await dbPost("exports", {
    sessionId: state.activeSessionId || null,
    usuario: state.user,
    fechaExport: nowArgentina(),
    archivoURL: null,
    filename,
    csv,
    store: state.currentStore,
    productos: rows,
  });

  if (state.activeSessionId) {
    await dbPut(`sessions/${state.activeSessionId}/estado`, "finalizada");
    localStorage.removeItem(`ttx_active_session_${state.user}_${state.currentStore}`);
  }

  state.activeSessionId = null;
  state.products[state.currentStore] = [defaultRow()];
  await persistRows();
  buildWorkspace();

  showToast("Export realizado");
  showToast("Sesión finalizada");
  state.historyPage = 1;
  if (state.historyMode === "exports") loadHistory();
}

async function loadHistory() {
  const path = state.historyMode === "exports" ? "exports" : (state.historyMode === "conversions" ? "conversions" : "sessions");
  const entries = await dbGet(path) || {};
  let history = [];

  if (state.historyMode === "exports") {
    history = Object.entries(entries)
      .map(([id, item]) => ({ id, ...(item || {}) }))
      .filter((item) => isAdminUser() || (item.usuario || item.user) === state.user)
      .reverse();
  } else if (state.historyMode === "conversions") {
    history = Object.entries(entries)
      .map(([id, item]) => ({ id, ...(item || {}) }))
      .filter((item) => isAdminUser() || item.user === state.user || item.usuario === state.user)
      .reverse();
  } else {
    history = Object.entries(entries)
      .map(([id, item]) => ({ id, ...(item || {}) }))
      .filter((item) => item.usuario === state.user && item.estado === "activa")
      .sort((a, b) => String(b.fechaCreacion || "").localeCompare(String(a.fechaCreacion || "")));
  }

  const pageSize = 10;
  const currentPageKey = state.historyMode === "exports" ? "historyPage" : (state.historyMode === "conversions" ? "conversionHistoryPage" : "sessionsPage");
  const totalPages = Math.max(1, Math.ceil(history.length / pageSize));
  state[currentPageKey] = Math.min(Math.max(state[currentPageKey], 1), totalPages);

  const pagination = $("historyPagination");
  pagination.innerHTML = "";
  if (history.length > pageSize) {
    for (let page = 1; page <= totalPages; page += 1) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `ios-btn small page-btn ${page === state[currentPageKey] ? "active" : ""}`;
      btn.textContent = page;
      btn.onclick = () => {
        state[currentPageKey] = page;
        loadHistory();
      };
      pagination.appendChild(btn);
    }
  }

  const start = (state[currentPageKey] - 1) * pageSize;
  const pageItems = history.slice(start, start + pageSize);

  const box = $("historyList");
  box.innerHTML = "";
  if (!pageItems.length) {
    box.innerHTML = state.historyMode === "exports"
      ? "<p>Sin exportaciones registradas</p>"
      : (state.historyMode === "conversions" ? "<p>Sin conversiones registradas</p>" : "<p>Sin sesiones activas</p>");
    return;
  }

  if (state.historyMode === "exports") {
    pageItems.forEach((h) => {
      const row = document.createElement("div");
      row.className = "list-item";
      row.innerHTML = `<span>${h.usuario || h.user || "Usuario"} - ${h.fechaExport || h.createdAt || "sin fecha"} - ${h.filename || "sin nombre"}</span><div class='inline-actions'><button class='ios-btn small' data-act='download'>Descargar</button><button class='ios-btn small' data-act='open'>Abrir</button>${isAdminUser() ? "<button class='ios-btn danger small' data-act='delete'>Eliminar</button>" : ""}</div>`;
      row.querySelector("[data-act='download']").onclick = () => {
        const blob = new Blob([h.csv || ""], { type: "text/csv;charset=utf-8;" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = h.filename || "export.csv";
        a.click();
      };
      row.querySelector("[data-act='open']").onclick = async () => {
        const targetStore = h.store || state.currentStore;
        if (targetStore !== state.currentStore) {
          state.currentStore = targetStore;
          $("workspaceTitle").textContent = stores.find((s) => s.key === targetStore)?.name || targetStore;
          renderStoreSwitchList();
        }
        const editableRows = extractEditableProductsFromExport(h, targetStore);
        if (!editableRows.length) {
          showToast("No se pudo recuperar productos editables de este export");
          return;
        }

        state.activeSessionId = null;
        await createNewSessionForStore();
        state.products[state.currentStore] = ensureRowsArray(editableRows);
        await persistRows();
        buildWorkspace();
        $("historyModal").classList.add("hidden");
        showToast("Export cargado para edición");
      };
      if (isAdminUser()) {
        row.querySelector("[data-act='delete']").onclick = async () => {
          const ok = await confirmAction("Eliminar export", "Se eliminará el registro y su archivo asociado.");
          if (!ok) return;
          await dbPut(`exports/${h.id}`, null);
          showToast("Registro eliminado");
          loadHistory();
        };
      }
      box.appendChild(row);
    });
    return;
  }

  if (state.historyMode === "conversions") {
    pageItems.forEach((h) => {
      const row = document.createElement("div");
      row.className = "list-item";
      const outputName = h.payload?.filename || "archivo";
      row.innerHTML = `<span>${h.label || `${h.user} - ${h.createdAt} - conversion`} (${h.sourceFormat || "?"} → ${h.targetFormat || "?"}) - ${outputName}</span><div class='inline-actions'><button class='ios-btn small' data-act='download'>Descargar</button>${isAdminUser() ? "<button class='ios-btn danger small' data-act='delete'>Eliminar</button>" : ""}</div>`;
      row.querySelector("[data-act='download']").onclick = () => {
        if (!h.payload?.contentBase64 || !h.payload?.mime) return showToast("No hay archivo guardado");
        const blob = base64ToBlob(h.payload.contentBase64, h.payload.mime);
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = h.payload.filename || "conversion";
        a.click();
      };
      if (isAdminUser()) {
        row.querySelector("[data-act='delete']").onclick = async () => {
          const ok = await confirmAction("Eliminar conversión", "Se eliminará el registro y su archivo asociado.");
          if (!ok) return;
          await dbPut(`conversions/${h.id}`, null);
          showToast("Conversión eliminada");
          loadHistory();
        };
      }
      box.appendChild(row);
    });
    return;
  }

  pageItems.forEach((session) => {
    const row = document.createElement("div");
    row.className = "list-item";
    row.innerHTML = `<span>${session.usuario} - ${session.fechaCreacion || "sin fecha"} - ${session.estado || ""}</span><div class='inline-actions'><button class='ios-btn small' data-act='open'>Abrir sesión</button><button class='icon-action danger' data-act='delete' title='Eliminar sesión'><i class='bi bi-trash3'></i></button></div>`;
    row.querySelector("[data-act='open']").onclick = async () => {
      await loadSessionById(session.id);
      $("historyModal").classList.add("hidden");
    };
    row.querySelector("[data-act='delete']").onclick = async () => {
      const ok = await confirmAction("Eliminar sesión", "¿Estás seguro de eliminar esta sesión?");
      if (!ok) return;
      await dbPut(`sessions/${session.id}`, null);
      if (state.activeSessionId === session.id) {
        state.activeSessionId = null;
        localStorage.removeItem(`ttx_active_session_${state.user}_${state.currentStore}`);
      }
      showToast("Sesión eliminada");
      loadHistory();
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

  loadUserThemePreference();
  applyUserPreferences();
  loadCalendarEvents();

  window.addEventListener("resize", syncTopScrollbar);

  renderCategoryList();
  setConverterFilesAccept();
  setConverterFilesInfo();
  updateHistoryTabs();

  const userFromSession = localStorage.getItem("ttx_user");
  if (userFromSession) {
    state.user = userFromSession;
    loadUserThemePreference(state.user);
    applyUserPreferences();
    loadCalendarEvents();
    const rememberedStore = localStorage.getItem(`ttx_store_${state.user}`);
    if (rememberedStore) {
      await selectStore(rememberedStore);
    } else {
      switchView("storeView");
    }
    loadHistory();
  } else {
    const lastUser = localStorage.getItem("ttx_last_user");
    loadUserThemePreference(lastUser);
    applyUserPreferences();
    loadCalendarEvents();
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
  state.activeSessionId = null;
  localStorage.setItem("ttx_user", state.user);
  localStorage.setItem("ttx_last_user", state.user);
  loadUserThemePreference(state.user);
  applyUserPreferences();
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

bindPreferenceSwitch("themeToggleMenu", (checked) => setTheme(checked ? "dark" : "light"));
bindPreferenceSwitch("themeToggleWorkspace", (checked) => setTheme(checked ? "dark" : "light"));

$("menuBtn").onclick = () => $("menuDrawer").classList.toggle("open");
$("workspaceMenuBtn").onclick = () => $("workspaceDrawer").classList.toggle("open");
$("closeMenuBtn").onclick = closeAllDrawers;
$("closeWorkspaceMenuBtn").onclick = closeAllDrawers;

$("menuHistorialBtn").onclick = () => { closeAllDrawers(); state.historyMode = "exports"; state.historyPage = 1; updateHistoryTabs(); $("historyModal").classList.remove("hidden"); loadHistory(); };
$("workspaceHistorialBtn").onclick = () => { closeAllDrawers(); state.historyMode = "exports"; state.historyPage = 1; updateHistoryTabs(); $("historyModal").classList.remove("hidden"); loadHistory(); };
$("closeHistoryModal").onclick = () => $("historyModal").classList.add("hidden");
$("historyExportsTab").onclick = () => { state.historyMode = "exports"; state.historyPage = 1; updateHistoryTabs(); loadHistory(); };
$("historyConversionsTab").onclick = () => { state.historyMode = "conversions"; state.conversionHistoryPage = 1; updateHistoryTabs(); loadHistory(); };
$("historySessionsTab").onclick = () => { state.historyMode = "sessions"; state.sessionsPage = 1; updateHistoryTabs(); loadHistory(); };

$("menuCategoriesBtn").onclick = () => { closeAllDrawers(); switchView("categoriesView"); renderCategoryList(); };
$("workspaceCategoriesBtn").onclick = () => { closeAllDrawers(); switchView("categoriesView"); renderCategoryList(); };
$("menuConverterBtn").onclick = () => { closeAllDrawers(); $("converterModal").classList.remove("hidden"); };
$("workspaceConverterBtn").onclick = () => { closeAllDrawers(); $("converterModal").classList.remove("hidden"); };
$("closeConverterModal").onclick = () => $("converterModal").classList.add("hidden");
$("menuCalendarBtn").onclick = openCalendarModal;
$("workspaceCalendarBtn").onclick = openCalendarModal;
$("closeCalendarModal").onclick = () => $("calendarModal").classList.add("hidden");
$("calendarSaveBtn").onclick = saveCalendarEvent;
$("calendarCancelEditBtn").onclick = resetCalendarForm;
$("calendarDeleteBtn").onclick = () => {
  if (!calendarInstance || !state.calendarEditingId) return;
  const event = calendarInstance.getEventById(state.calendarEditingId);
  if (!event) return;
  event.remove();
  syncCalendarEventsFromInstance();
  resetCalendarForm();
  showToast("Evento eliminado");
};
$("categoriesBackBtn").onclick = () => switchView(state.currentStore ? "workspaceView" : "storeView");

$("changeStoreBtn").onclick = () => { renderStoreSwitchList(); $("storeSwitchModal").classList.remove("hidden"); };
$("closeStoreSwitchModal").onclick = () => $("storeSwitchModal").classList.add("hidden");

$("categoryStoreSelect").onchange = renderCategoryList;
$("addCategoryBtn").onclick = () => addCategory($("categoryStoreSelect").value, $("catName").value.trim(), $("catId").value.trim());
$("xlsxInput").onchange = (e) => e.target.files?.[0] && importXlsx(e.target.files[0], $("categoryStoreSelect").value);
$("sourceFormatSelect").onchange = setConverterFilesAccept;
$("converterFilesInput").onchange = setConverterFilesInfo;
$("startConversionBtn").onclick = async () => {
  try {
    await startConversion();
  } catch (err) {
    console.error(err);
    addConverterLog("❌ Error durante la conversión");
    showToast("No se pudo convertir el/los archivo(s)");
  }
};

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

function addNewRow(insertAt = null) {
  state.products[state.currentStore] = state.products[state.currentStore] || [defaultRow()];
  if (insertAt === null || Number.isNaN(insertAt) || insertAt < 0 || insertAt > state.products[state.currentStore].length) {
    state.products[state.currentStore].push(defaultRow());
  } else {
    state.products[state.currentStore].splice(insertAt, 0, defaultRow());
  }
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
  state.activeSessionId = null;
  resetCalendarForm();
  switchView("loginView");
};

$("menuLogoutBtn").onclick = doLogout;
$("workspaceLogoutBtn").onclick = doLogout;

init();
