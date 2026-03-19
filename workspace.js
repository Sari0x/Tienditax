const $ = (id) => document.getElementById(id);

const FIREBASE_DB_URL = "https://tienditax-default-rtdb.firebaseio.com";
const FIREBASE_STORAGE_BUCKET = "tienditax.appspot.com";

const COMPANY_OPTIONS = [
  { value: "napse", label: "Napse", short: "N", color: "#0ea5e9", logo: "https://i.postimg.cc/wBJSJkWt/napse-logo.png" },
  { value: "cygnus", label: "Cygnus", short: "C", color: "#14b8a6", logo: "https://i.postimg.cc/VNM3MF76/cygnus-logo.png" },
  { value: "softland", label: "Softland", short: "S", color: "#8b5cf6", logo: "https://i.postimg.cc/BvDdDChj/softland-logo.png" },
];

const LINK_OPTIONS = [
  { value: "meet", label: "Google Meet", icon: "bi-camera-video-fill", color: "#16a34a" },
  { value: "teams", label: "Microsoft Teams", icon: "bi-microsoft-teams", color: "#4f46e5" },
  { value: "zoom", label: "Zoom", icon: "bi-camera-video", color: "#2563eb" },
  { value: "otro", label: "Otro", icon: "bi-link-45deg", color: "#64748b" },
];

const STATUS_MAP = {
  sin_estado: { label: "Sin estado", color: "#6b7280" },
  en_proceso: { label: "En proceso", color: "#f59e0b" },
  finalizado: { label: "Finalizado", color: "#16a34a" },
};

const state = {
  profiles: [],
  events: [],
  editingId: null,
  calendar: null,
  pendingFiles: [],
  existingAttachments: [],
};

const syncMeta = {
  profiles: { pending: false, lastError: null },
  events: { pending: false, lastError: null },
};

const TRIGGER_OFFSET_MINUTES = 30;

function currentUser() {
  return localStorage.getItem("ttx_user") || "guest";
}

function sanitizePathPart(value) {
  return String(value || "").replace(/[^a-zA-Z0-9._-]/g, "_");
}

function dbPath(path) {
  return `${FIREBASE_DB_URL}/${path}.json`;
}

async function dbGet(path) {
  return (await fetch(dbPath(path))).json();
}

async function dbPut(path, data) {
  return fetch(dbPath(path), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

async function uploadFileToFirebaseStorage(file, eventId) {
  const user = sanitizePathPart(currentUser());
  const safeName = sanitizePathPart(file.name);
  const objectPath = `workspace/${user}/${eventId}/${Date.now()}_${safeName}`;
  const url = `https://firebasestorage.googleapis.com/v0/b/${FIREBASE_STORAGE_BUCKET}/o?name=${encodeURIComponent(objectPath)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "X-Goog-Upload-Protocol": "raw",
    },
    body: file,
  });

  if (!res.ok) throw new Error(`No se pudo subir ${file.name}`);
  const uploaded = await res.json();

  const encodedName = encodeURIComponent(uploaded.name || objectPath);
  const mediaUrl = uploaded.downloadTokens
    ? `https://firebasestorage.googleapis.com/v0/b/${FIREBASE_STORAGE_BUCKET}/o/${encodedName}?alt=media&token=${uploaded.downloadTokens}`
    : `https://firebasestorage.googleapis.com/v0/b/${FIREBASE_STORAGE_BUCKET}/o/${encodedName}?alt=media`;

  return {
    name: file.name,
    type: file.type || "application/octet-stream",
    size: file.size || 0,
    objectPath: uploaded.name || objectPath,
    downloadUrl: mediaUrl,
    uploadedAt: new Date().toISOString(),
  };
}

function storageKeyProfiles() {
  return `ttx_workspace_profiles_${currentUser()}`;
}

function storageKeyEvents() {
  return `ttx_workspace_events_${currentUser()}`;
}

function storageKeyTriggerConfig() {
  return `ttx_workspace_trigger_cfg_${currentUser()}`;
}

function randomAvatarColor() {
  const palette = ["#ef4444", "#f59e0b", "#16a34a", "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899"];
  return palette[Math.floor(Math.random() * palette.length)];
}

function initials(name, lastName) {
  return `${(name || "")[0] || ""}${(lastName || "")[0] || ""}`.toUpperCase() || "NA";
}

function normalizeEventArray(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter(Boolean);
  return Object.values(raw).filter(Boolean);
}

function withUpdatedAt(item) {
  return {
    ...item,
    updatedAt: item.updatedAt || new Date().toISOString(),
  };
}

function normalizeProfiles(raw) {
  return normalizeEventArray(raw).map((profile) => withUpdatedAt(profile));
}

function normalizeEvents(raw) {
  return normalizeEventArray(raw).map((event) => withUpdatedAt(event));
}

function mergeByNewest(remoteItems, localItems) {
  const map = new Map();
  [...(localItems || []), ...(remoteItems || [])].forEach((item) => {
    if (!item?.id) return;
    const current = map.get(item.id);
    if (!current) {
      map.set(item.id, item);
      return;
    }
    const currentTs = Date.parse(current.updatedAt || 0) || 0;
    const incomingTs = Date.parse(item.updatedAt || 0) || 0;
    if (incomingTs >= currentTs) map.set(item.id, item);
  });
  return [...map.values()];
}

function readLocalArray(key, normalizer) {
  try {
    return normalizer(JSON.parse(localStorage.getItem(key) || "[]"));
  } catch {
    return [];
  }
}

async function loadData() {
  const localProfiles = readLocalArray(storageKeyProfiles(), normalizeProfiles);
  const localEvents = readLocalArray(storageKeyEvents(), normalizeEvents);

  try {
    const [profilesRemote, eventsRemote] = await Promise.all([
      dbGet(`workspace_profiles/${currentUser()}`),
      dbGet(`workspace_events/${currentUser()}`),
    ]);

    const remoteProfiles = normalizeProfiles(profilesRemote);
    const remoteEvents = normalizeEvents(eventsRemote);

    state.profiles = mergeByNewest(remoteProfiles, localProfiles);
    state.events = mergeByNewest(remoteEvents, localEvents);

    localStorage.setItem(storageKeyProfiles(), JSON.stringify(state.profiles));
    localStorage.setItem(storageKeyEvents(), JSON.stringify(state.events));
  } catch {
    state.profiles = localProfiles;
    state.events = localEvents;
  }
}

async function saveProfiles() {
  state.profiles = state.profiles.map((profile) => withUpdatedAt(profile));
  localStorage.setItem(storageKeyProfiles(), JSON.stringify(state.profiles));
  try {
    const res = await dbPut(`workspace_profiles/${currentUser()}`, state.profiles);
    if (!res.ok) throw new Error("Error guardando perfiles");
    syncMeta.profiles.pending = false;
    syncMeta.profiles.lastError = null;
  } catch (error) {
    syncMeta.profiles.pending = true;
    syncMeta.profiles.lastError = error;
  }
}

async function saveEvents() {
  state.events = state.events.map((event) => withUpdatedAt(event));
  localStorage.setItem(storageKeyEvents(), JSON.stringify(state.events));
  try {
    const res = await dbPut(`workspace_events/${currentUser()}`, state.events);
    if (!res.ok) throw new Error("Error guardando eventos");
    syncMeta.events.pending = false;
    syncMeta.events.lastError = null;
  } catch (error) {
    syncMeta.events.pending = true;
    syncMeta.events.lastError = error;
  }
}

async function flushPendingSync() {
  if (syncMeta.profiles.pending) await saveProfiles();
  if (syncMeta.events.pending) await saveEvents();
}

function setDarkModeFromAppPreference() {
  const theme = localStorage.getItem("ttx_theme_last");
  document.body.classList.toggle("dark", theme === "dark");
}

function renderCompanyOptions() {
  $("eventCompany").innerHTML = COMPANY_OPTIONS.map((c) => `<option value="${c.value}">${c.label}</option>`).join("");
}

function renderLinkTypeOptions() {
  $("eventLinkType").innerHTML = LINK_OPTIONS.map((l) => `<option value="${l.value}">${l.label}</option>`).join("");
}

function renderAssigneesSelect() {
  const selected = new Set(Array.from($("eventAssignees").selectedOptions || []).map((opt) => opt.value));
  $("eventAssignees").innerHTML = state.profiles
    .map((p) => `<option value="${p.id}" ${selected.has(p.id) ? "selected" : ""}>${p.name} ${p.lastName}</option>`)
    .join("");
}

function renderProfiles() {
  const list = $("profilesList");
  if (!state.profiles.length) {
    list.innerHTML = "<small>Sin perfiles todavía.</small>";
    return;
  }
  list.innerHTML = "";
  state.profiles.forEach((profile) => {
    const row = document.createElement("div");
    row.className = "profile-item";
    row.innerHTML = `
      <div class="profile-main">
        <span class="avatar" style="background:${profile.avatarColor}">${profile.avatarText}</span>
        <div class="profile-meta">
          <div class="profile-name">${profile.name} ${profile.lastName}</div>
          <div class="profile-mail">${profile.mail}</div>
        </div>
      </div>
      <button class="btn danger" data-id="${profile.id}"><i class="bi bi-trash3"></i></button>
    `;
    row.querySelector("button").onclick = async () => {
      state.profiles = state.profiles.filter((p) => p.id !== profile.id);
      await saveProfiles();
      renderProfiles();
      renderAssigneesSelect();
    };
    list.appendChild(row);
  });
}

function companyByValue(value) {
  return COMPANY_OPTIONS.find((c) => c.value === value) || COMPANY_OPTIONS[0];
}

function linkByValue(value) {
  return LINK_OPTIONS.find((l) => l.value === value) || LINK_OPTIONS[0];
}

function detectLinkTypeFromUrl(urlValue) {
  const raw = String(urlValue || "").trim().toLowerCase();
  if (!raw) return null;

  if (raw.includes("meet.google.com")) return "meet";
  if (raw.includes("teams.microsoft.com") || raw.includes("teams.live.com") || raw.includes("msteams")) return "teams";
  if (raw.includes("zoom.us")) return "zoom";
  return "otro";
}

function companyLogoHtml(company, size = 74) {
  if (company.logo) {
    return `<img src="${company.logo}" alt="${company.label}" style="width:${size}px;height:${size}px;object-fit:contain;border-radius:6px;background:#fff;padding:1px;" />`;
  }
  return `<span class="logo-badge" style="background:${company.color};width:${size}px;height:${size}px;border-radius:6px;font-size:9px">${company.short}</span>`;
}

function renderCompanyLogo() {
  const company = companyByValue($("eventCompany").value);
  $("eventCompanyLogo").innerHTML = companyLogoHtml(company);
}

function renderLinkLogo() {
  const autoType = detectLinkTypeFromUrl($("eventLinkUrl").value);
  if (autoType && $("eventLinkType").value !== autoType) {
    $("eventLinkType").value = autoType;
  }
  const link = linkByValue(autoType || $("eventLinkType").value);
  $("eventLinkLogo").innerHTML = `<span class="logo-badge" style="background:${link.color}" title="${link.label}"><i class="bi ${link.icon}"></i></span>`;
}

function updateColorPreview(value) {
  $("eventColorPreview").style.background = value || "#2563eb";
}

function toLocalInputValue(date) {
  if (!date) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function toYmd(date) {
  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function addDays(date, amount) {
  const d = new Date(date);
  d.setDate(d.getDate() + amount);
  return d;
}

function normalizeDates(startInput, endInput, allDay) {
  if (!allDay) return { start: startInput, end: endInput || null };
  const startDate = new Date(startInput);
  if (Number.isNaN(startDate.getTime())) return null;
  const start = toYmd(startDate);
  if (!endInput) return { start, end: null };
  const endDate = new Date(endInput);
  if (Number.isNaN(endDate.getTime())) return { start, end: null };
  const endExclusive = toYmd(addDays(new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate()), 1));
  return { start, end: endExclusive };
}

function renderAttachmentList() {
  const box = $("eventAttachmentsList");
  const pendingRows = state.pendingFiles.map((file, index) => ({
    kind: "pending",
    key: `pending-${index}`,
    name: file.name,
    size: file.size,
  }));
  const existingRows = (state.existingAttachments || []).map((item, index) => ({
    kind: "existing",
    key: `existing-${index}`,
    name: item.name,
    size: item.size,
    url: item.downloadUrl,
  }));
  const rows = [...existingRows, ...pendingRows];

  if (!rows.length) {
    box.innerHTML = "<small>Sin archivos adjuntos.</small>";
    return;
  }

  box.innerHTML = "";
  rows.forEach((item) => {
    const row = document.createElement("div");
    row.className = "attachment-item";
    const sizeLabel = item.size ? `${Math.max(1, Math.round(item.size / 1024))} KB` : "";
    row.innerHTML = `
      <div class="attachment-meta">
        <strong>${item.name}</strong>
        <small>${item.kind === "pending" ? "Pendiente de subida" : "Ya guardado en Firebase"}${sizeLabel ? ` · ${sizeLabel}` : ""}</small>
      </div>
      <div class="attachment-actions"></div>
    `;

    const actions = row.querySelector(".attachment-actions");
    if (item.url) {
      const openBtn = document.createElement("a");
      openBtn.href = item.url;
      openBtn.target = "_blank";
      openBtn.rel = "noopener noreferrer";
      openBtn.className = "btn ghost attachment-open";
      openBtn.textContent = "Abrir";
      actions.appendChild(openBtn);
    }

    const removeBtn = document.createElement("button");
    removeBtn.className = "btn danger";
    removeBtn.textContent = "Quitar";
    removeBtn.onclick = () => {
      if (item.kind === "pending") {
        const idx = Number(item.key.split("-")[1]);
        state.pendingFiles.splice(idx, 1);
      } else {
        const idx = Number(item.key.split("-")[1]);
        state.existingAttachments.splice(idx, 1);
      }
      renderAttachmentList();
    };
    actions.appendChild(removeBtn);

    box.appendChild(row);
  });
}

function addSelectedFilesToPending(files) {
  const incoming = Array.from(files || []);
  if (!incoming.length) return;
  const known = new Set(state.pendingFiles.map((f) => `${f.name}-${f.size}`));
  incoming.forEach((file) => {
    const key = `${file.name}-${file.size}`;
    if (!known.has(key)) state.pendingFiles.push(file);
  });
  renderAttachmentList();
}

function eventFromForm(eventId, attachments) {
  const title = $("eventTitle").value.trim();
  const startInput = $("eventStart").value;
  if (!title || !startInput) return null;
  const allDay = $("eventAllDay").checked;
  const normalized = normalizeDates(startInput, $("eventEnd").value, allDay);
  if (!normalized) return null;
  const assignees = Array.from($("eventAssignees").selectedOptions).map((opt) => opt.value);

  return {
    id: eventId,
    title,
    start: normalized.start,
    end: normalized.end,
    allDay,
    backgroundColor: $("eventColor").value || "#2563eb",
    borderColor: $("eventColor").value || "#2563eb",
    extendedProps: {
      details: $("eventDetails").value.trim(),
      assignees,
      company: $("eventCompany").value,
      status: $("eventStatus").value,
      linkType: detectLinkTypeFromUrl($("eventLinkUrl").value) || $("eventLinkType").value,
      linkUrl: $("eventLinkUrl").value.trim(),
      attachments: attachments || [],
      reminderTriggerUid: state.editingId ? state.calendar?.getEventById(state.editingId)?.extendedProps?.reminderTriggerUid || "" : "",
    },
  };
}

function loadTriggerConfig() {
  try {
    const raw = JSON.parse(localStorage.getItem(storageKeyTriggerConfig()) || "{}");
    return {
      webhookUrl: String(raw.webhookUrl || "").trim(),
      defaultEmail: String(raw.defaultEmail || "").trim(),
    };
  } catch {
    return { webhookUrl: "", defaultEmail: "" };
  }
}

function renderTriggerConfig() {
  const cfg = loadTriggerConfig();
  $("triggerWebhookUrl").value = cfg.webhookUrl;
  $("triggerDefaultEmail").value = cfg.defaultEmail;
}

function setTriggerStatus(message, isError = false) {
  const node = $("triggerSettingsStatus");
  node.textContent = message || "";
  node.style.color = isError ? "#dc2626" : "#64748b";
}

function saveTriggerConfig() {
  const cfg = {
    webhookUrl: $("triggerWebhookUrl").value.trim(),
    defaultEmail: $("triggerDefaultEmail").value.trim(),
  };
  localStorage.setItem(storageKeyTriggerConfig(), JSON.stringify(cfg));
  setTriggerStatus("Configuración guardada.");
}

function eventStartDate(eventData) {
  if (!eventData?.start) return null;
  const parsed = new Date(eventData.start);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function eventRecipients(eventData, cfg) {
  const ids = eventData?.extendedProps?.assignees || [];
  const uniqueMails = new Set();
  ids.forEach((id) => {
    const profile = state.profiles.find((p) => p.id === id);
    const mail = (profile?.mail || "").trim();
    if (mail) uniqueMails.add(mail);
  });
  const fallback = (cfg.defaultEmail || "").trim();
  if (!uniqueMails.size && fallback) uniqueMails.add(fallback);
  return [...uniqueMails];
}

async function requestEmailReminderTrigger(eventData) {
  const cfg = loadTriggerConfig();
  if (!cfg.webhookUrl) return;

  const startsAt = eventStartDate(eventData);
  if (!startsAt || eventData.allDay) {
    return;
  }

  const remindAt = new Date(startsAt.getTime() - TRIGGER_OFFSET_MINUTES * 60000);
  const recipients = eventRecipients(eventData, cfg);
  const to = recipients[0] || "";
  if (!to && !cfg.defaultEmail) return;

  const response = await fetch(cfg.webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "programar_recordatorio",
      eventId: eventData.id,
      to,
      fallbackEmail: cfg.defaultEmail || "",
      subject: `Recordatorio: ${eventData.title}`,
      eventTitle: eventData.title,
      eventStart: startsAt.toISOString(),
      eventLink: eventData.extendedProps?.linkUrl || "",
      sendAt: remindAt.toISOString(),
    }),
  });

  if (!response.ok) {
    throw new Error("No se pudo crear el trigger de email en Apps Script");
  }

  const payload = await response.json().catch(() => ({}));
  if (payload?.ok === false) {
    throw new Error(payload.message || "Apps Script rechazó la programación del recordatorio");
  }
  eventData.extendedProps.reminderTriggerUid = String(payload?.triggerUid || "");
}

async function syncEventsFromCalendar() {
  state.events = state.calendar.getEvents().map((ev) => ({
    id: ev.id,
    title: ev.title,
    start: ev.startStr,
    end: ev.endStr || null,
    allDay: ev.allDay,
    backgroundColor: ev.backgroundColor,
    borderColor: ev.borderColor,
    extendedProps: {
      details: ev.extendedProps?.details || "",
      assignees: ev.extendedProps?.assignees || [],
      company: ev.extendedProps?.company || "napse",
      status: ev.extendedProps?.status || "sin_estado",
      linkType: ev.extendedProps?.linkType || "otro",
      linkUrl: ev.extendedProps?.linkUrl || "",
      attachments: ev.extendedProps?.attachments || [],
      reminderTriggerUid: ev.extendedProps?.reminderTriggerUid || "",
    },
    updatedAt: new Date().toISOString(),
  }));
  await saveEvents();
}

function resetEventForm() {
  state.editingId = null;
  state.pendingFiles = [];
  state.existingAttachments = [];
  $("eventAttachmentsInput").value = "";
  $("eventFormTitle").textContent = "Nuevo evento/proyecto";
  $("eventTitle").value = "";
  $("eventDetails").value = "";
  $("eventStart").value = "";
  $("eventEnd").value = "";
  $("eventAllDay").checked = false;
  $("eventColor").value = "#2563eb";
  updateColorPreview("#2563eb");
  $("eventStatus").value = "sin_estado";
  $("eventCompany").value = "napse";
  $("eventLinkType").value = "meet";
  $("eventLinkUrl").value = "";
  Array.from($("eventAssignees").options).forEach((opt) => { opt.selected = false; });
  renderCompanyLogo();
  renderLinkLogo();
  renderAttachmentList();
  $("deleteEventBtn").classList.add("hidden");
  $("cancelEditEventBtn").classList.add("hidden");
}

function loadEventToForm(ev) {
  state.editingId = ev.id;
  state.pendingFiles = [];
  state.existingAttachments = [...(ev.extendedProps?.attachments || [])];
  $("eventAttachmentsInput").value = "";

  $("eventFormTitle").textContent = "Editar evento/proyecto";
  $("eventTitle").value = ev.title;
  $("eventDetails").value = ev.extendedProps?.details || "";
  $("eventAllDay").checked = !!ev.allDay;
  $("eventColor").value = ev.backgroundColor || "#2563eb";
  updateColorPreview($("eventColor").value);
  $("eventStatus").value = ev.extendedProps?.status || "sin_estado";
  $("eventCompany").value = ev.extendedProps?.company || "napse";
  $("eventLinkType").value = ev.extendedProps?.linkType || "meet";
  $("eventLinkUrl").value = ev.extendedProps?.linkUrl || "";
  renderCompanyLogo();
  renderLinkLogo();
  renderAttachmentList();

  if (ev.allDay) {
    $("eventStart").value = ev.startStr ? `${ev.startStr}T00:00` : "";
    if (ev.endStr) {
      const endDate = new Date(ev.endStr + "T00:00:00");
      $("eventEnd").value = `${toYmd(addDays(endDate, -1))}T00:00`;
    } else {
      $("eventEnd").value = "";
    }
  } else {
    $("eventStart").value = ev.start ? toLocalInputValue(ev.start) : "";
    $("eventEnd").value = ev.end ? toLocalInputValue(ev.end) : "";
  }

  const selected = new Set(ev.extendedProps?.assignees || []);
  Array.from($("eventAssignees").options).forEach((opt) => { opt.selected = selected.has(opt.value); });

  $("deleteEventBtn").classList.remove("hidden");
  $("cancelEditEventBtn").classList.remove("hidden");
}

async function createProfile() {
  const name = $("profileName").value.trim();
  const lastName = $("profileLastName").value.trim();
  const mail = $("profileMail").value.trim();
  if (!name || !lastName || !mail) return;

  const profile = {
    id: `pf_${Date.now()}`,
    name,
    lastName,
    mail,
    avatarText: initials(name, lastName),
    avatarColor: randomAvatarColor(),
    updatedAt: new Date().toISOString(),
  };

  state.profiles.push(profile);
  await saveProfiles();
  renderProfiles();
  renderAssigneesSelect();
  $("profileName").value = "";
  $("profileLastName").value = "";
  $("profileMail").value = "";
}

function buildTooltip(event) {
  const ext = event.extendedProps || {};
  const assignees = (ext.assignees || [])
    .map((id) => state.profiles.find((p) => p.id === id))
    .filter(Boolean)
    .map((p) => `${p.name} ${p.lastName}`)
    .join(", ");

  return [
    event.title,
    ext.details || "",
    `Empresa: ${companyByValue(ext.company || "napse").label}`,
    `Estado: ${STATUS_MAP[ext.status || "sin_estado"].label}`,
    assignees ? `Asignados: ${assignees}` : "",
    ext.linkUrl ? `Link: ${ext.linkUrl}` : "",
    ext.attachments?.length ? `Adjuntos: ${ext.attachments.length}` : "",
  ].filter(Boolean).join("\n");
}

function initCalendar() {
  state.calendar = new FullCalendar.Calendar($("workspaceCalendar"), {
    locale: "es",
    initialView: "dayGridMonth",
    selectable: true,
    editable: true,
    height: "100%",
    headerToolbar: {
      left: "prev,next today",
      center: "title",
      right: "dayGridMonth,timeGridWeek,timeGridDay,listWeek",
    },
    buttonText: { today: "Hoy", month: "Mes", week: "Semana", day: "Día", list: "Agenda" },
    events: state.events,
    select: (info) => {
      resetEventForm();
      $("eventStart").value = toLocalInputValue(info.start);
      if (info.allDay && info.end) {
        $("eventEnd").value = toLocalInputValue(addDays(info.end, -1));
      } else {
        $("eventEnd").value = info.end ? toLocalInputValue(info.end) : "";
      }
      $("eventAllDay").checked = !!info.allDay;
    },
    eventClick: (info) => loadEventToForm(info.event),
    eventDrop: async () => { await syncEventsFromCalendar(); },
    eventResize: async () => { await syncEventsFromCalendar(); },
    eventContent: (arg) => {
      const ext = arg.event.extendedProps || {};
      const company = companyByValue(ext.company || "napse");
      const status = STATUS_MAP[ext.status || "sin_estado"];
      const attachmentMark = ext.attachments?.length ? "📎" : "";
      const wrap = document.createElement("div");
      wrap.className = "calendar-event-card";
      wrap.innerHTML = `<div class="calendar-event-main">
        ${companyLogoHtml(company, 24)}
        <span class="calendar-event-title">${arg.event.title} ${attachmentMark}</span>
      </div>
      <span class="status-pill calendar-event-status" style="background:${status.color}">${status.label}</span>`;
      return { domNodes: [wrap] };
    },
    eventDidMount: (arg) => {
      arg.el.title = buildTooltip(arg.event);
    },
  });
  state.calendar.render();
}

async function saveEvent() {
  if (!state.calendar) return;

  const eventId = state.editingId || `ws_${Date.now()}`;
  let targetEvent = null;
  $("saveEventBtn").disabled = true;
  $("saveEventBtn").textContent = "Guardando...";

  try {
    const uploadedAttachments = [];
    for (const file of state.pendingFiles) {
      const uploaded = await uploadFileToFirebaseStorage(file, eventId);
      uploadedAttachments.push(uploaded);
    }

    const allAttachments = [...state.existingAttachments, ...uploadedAttachments];
    const payload = eventFromForm(eventId, allAttachments);
    if (!payload) throw new Error("Completá título y fecha de inicio");

    if (state.editingId) {
      const ev = state.calendar.getEventById(state.editingId);
      if (!ev) throw new Error("No se encontró el evento a editar");
      ev.setAllDay(payload.allDay);
      ev.setProp("title", payload.title);
      ev.setStart(payload.start);
      ev.setEnd(payload.end);
      ev.setProp("backgroundColor", payload.backgroundColor);
      ev.setProp("borderColor", payload.borderColor);
      Object.entries(payload.extendedProps).forEach(([key, value]) => ev.setExtendedProp(key, value));
      targetEvent = ev;
    } else {
      targetEvent = state.calendar.addEvent(payload);
    }

    await requestEmailReminderTrigger(payload);
    if (targetEvent) {
      targetEvent.setExtendedProp("reminderTriggerUid", payload.extendedProps.reminderTriggerUid || "");
    }

    await syncEventsFromCalendar();
    resetEventForm();
  } catch (err) {
    window.alert(err.message || "No se pudo guardar el evento");
  } finally {
    $("saveEventBtn").disabled = false;
    $("saveEventBtn").textContent = "Guardar";
  }
}

async function deleteEvent() {
  if (!state.editingId || !state.calendar) return;
  const ev = state.calendar.getEventById(state.editingId);
  if (!ev) return;
  ev.remove();
  await syncEventsFromCalendar();
  resetEventForm();
}

async function init() {
  setDarkModeFromAppPreference();
  await loadData();
  renderCompanyOptions();
  renderLinkTypeOptions();
  renderProfiles();
  renderAssigneesSelect();
  renderTriggerConfig();
  resetEventForm();
  initCalendar();

  $("eventCompany").onchange = renderCompanyLogo;
  $("eventLinkType").onchange = renderLinkLogo;
  $("eventLinkUrl").oninput = renderLinkLogo;
  $("eventLinkUrl").onblur = renderLinkLogo;
  $("eventColor").oninput = (e) => updateColorPreview(e.target.value);
  $("eventAttachmentsInput").onchange = (e) => addSelectedFilesToPending(e.target.files);
  $("saveEventBtn").onclick = saveEvent;
  $("deleteEventBtn").onclick = deleteEvent;
  $("cancelEditEventBtn").onclick = resetEventForm;
  $("createProfileBtn").onclick = createProfile;
  $("saveTriggerSettingsBtn").onclick = saveTriggerConfig;
  $("backAppBtn").onclick = () => { window.location.href = "index.html"; };
  window.addEventListener("online", flushPendingSync);
}

init();
