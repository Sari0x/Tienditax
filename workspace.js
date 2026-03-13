const $ = (id) => document.getElementById(id);

const COMPANY_OPTIONS = [
  { value: "napse", label: "Napse", short: "N", color: "#0ea5e9" },
  { value: "cygnus", label: "Cygnus", short: "C", color: "#14b8a6" },
  { value: "softland", label: "Softland", short: "S", color: "#8b5cf6" },
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
};

function storageKeyProfiles() {
  const user = localStorage.getItem("ttx_user") || "guest";
  return `ttx_workspace_profiles_${user}`;
}

function storageKeyEvents() {
  const user = localStorage.getItem("ttx_user") || "guest";
  return `ttx_workspace_events_${user}`;
}

function randomAvatarColor() {
  const palette = ["#ef4444", "#f59e0b", "#16a34a", "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899"];
  return palette[Math.floor(Math.random() * palette.length)];
}

function initials(name, lastName) {
  return `${(name || "")[0] || ""}${(lastName || "")[0] || ""}`.toUpperCase() || "NA";
}

function loadData() {
  try {
    state.profiles = JSON.parse(localStorage.getItem(storageKeyProfiles()) || "[]");
    state.events = JSON.parse(localStorage.getItem(storageKeyEvents()) || "[]");
  } catch {
    state.profiles = [];
    state.events = [];
  }
}

function saveProfiles() {
  localStorage.setItem(storageKeyProfiles(), JSON.stringify(state.profiles));
}

function saveEvents() {
  localStorage.setItem(storageKeyEvents(), JSON.stringify(state.events));
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
    row.querySelector("button").onclick = () => {
      state.profiles = state.profiles.filter((p) => p.id !== profile.id);
      saveProfiles();
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

function renderCompanyLogo() {
  const company = companyByValue($("eventCompany").value);
  $("eventCompanyLogo").innerHTML = `<span class="logo-badge" style="background:${company.color}" title="${company.label}">${company.short}</span><small>${company.label}</small>`;
}

function renderLinkLogo() {
  const link = linkByValue($("eventLinkType").value);
  $("eventLinkLogo").innerHTML = `<span class="logo-badge" style="background:${link.color}" title="${link.label}"><i class="bi ${link.icon}"></i></span><small>${link.label}</small>`;
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

function eventFromForm() {
  const title = $("eventTitle").value.trim();
  const startInput = $("eventStart").value;
  if (!title || !startInput) return null;
  const allDay = $("eventAllDay").checked;
  const normalized = normalizeDates(startInput, $("eventEnd").value, allDay);
  if (!normalized) return null;
  const assignees = Array.from($("eventAssignees").selectedOptions).map((opt) => opt.value);
  return {
    id: state.editingId || `ws_${Date.now()}`,
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
      linkType: $("eventLinkType").value,
      linkUrl: $("eventLinkUrl").value.trim(),
    },
  };
}

function syncEventsFromCalendar() {
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
    },
  }));
  saveEvents();
}

function resetEventForm() {
  state.editingId = null;
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
  $("deleteEventBtn").classList.add("hidden");
  $("cancelEditEventBtn").classList.add("hidden");
}

function loadEventToForm(ev) {
  state.editingId = ev.id;
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

function createProfile() {
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
  };
  state.profiles.push(profile);
  saveProfiles();
  renderProfiles();
  renderAssigneesSelect();
  $("profileName").value = "";
  $("profileLastName").value = "";
  $("profileMail").value = "";
}

function buildEventTitle(ev) {
  const status = STATUS_MAP[ev.extendedProps?.status || "sin_estado"];
  return `${ev.title} · ${status.label}`;
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
    eventDrop: () => syncEventsFromCalendar(),
    eventResize: () => syncEventsFromCalendar(),
    eventContent: (arg) => {
      const ext = arg.event.extendedProps || {};
      const company = companyByValue(ext.company || "napse");
      const status = STATUS_MAP[ext.status || "sin_estado"];
      const wrap = document.createElement("div");
      wrap.innerHTML = `<div style="display:flex;align-items:center;gap:5px;min-width:0;">
        <span class="logo-badge" style="background:${company.color};width:18px;height:18px;border-radius:6px;font-size:9px">${company.short}</span>
        <span style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${arg.event.title}</span>
      </div>
      <span class="status-pill" style="background:${status.color}">${status.label}</span>`;
      return { domNodes: [wrap] };
    },
    eventDidMount: (arg) => {
      const ext = arg.event.extendedProps || {};
      const assignees = (ext.assignees || [])
        .map((id) => state.profiles.find((p) => p.id === id))
        .filter(Boolean)
        .map((p) => `${p.name} ${p.lastName}`)
        .join(", ");
      arg.el.title = [
        arg.event.title,
        ext.details || "",
        `Empresa: ${companyByValue(ext.company || "napse").label}`,
        `Estado: ${STATUS_MAP[ext.status || "sin_estado"].label}`,
        assignees ? `Asignados: ${assignees}` : "",
        ext.linkUrl ? `Link: ${ext.linkUrl}` : "",
      ].filter(Boolean).join("\n");
    },
  });
  state.calendar.render();
}

function saveEvent() {
  const payload = eventFromForm();
  if (!payload || !state.calendar) return;

  if (state.editingId) {
    const ev = state.calendar.getEventById(state.editingId);
    if (!ev) return;
    ev.setAllDay(payload.allDay);
    ev.setProp("title", payload.title);
    ev.setStart(payload.start);
    ev.setEnd(payload.end);
    ev.setProp("backgroundColor", payload.backgroundColor);
    ev.setProp("borderColor", payload.borderColor);
    ev.setExtendedProp("details", payload.extendedProps.details);
    ev.setExtendedProp("assignees", payload.extendedProps.assignees);
    ev.setExtendedProp("company", payload.extendedProps.company);
    ev.setExtendedProp("status", payload.extendedProps.status);
    ev.setExtendedProp("linkType", payload.extendedProps.linkType);
    ev.setExtendedProp("linkUrl", payload.extendedProps.linkUrl);
  } else {
    state.calendar.addEvent(payload);
  }

  syncEventsFromCalendar();
  resetEventForm();
}

function deleteEvent() {
  if (!state.editingId || !state.calendar) return;
  const ev = state.calendar.getEventById(state.editingId);
  if (!ev) return;
  ev.remove();
  syncEventsFromCalendar();
  resetEventForm();
}

function init() {
  setDarkModeFromAppPreference();
  loadData();
  renderCompanyOptions();
  renderLinkTypeOptions();
  renderProfiles();
  renderAssigneesSelect();
  resetEventForm();
  initCalendar();

  $("eventCompany").onchange = renderCompanyLogo;
  $("eventLinkType").onchange = renderLinkLogo;
  $("eventColor").oninput = (e) => updateColorPreview(e.target.value);
  $("saveEventBtn").onclick = saveEvent;
  $("deleteEventBtn").onclick = deleteEvent;
  $("cancelEditEventBtn").onclick = resetEventForm;
  $("createProfileBtn").onclick = createProfile;
  $("backAppBtn").onclick = () => { window.location.href = "index.html"; };
}

init();
