const ADMIN_USER = "manusario";
const ADMIN_PASS = "mendoza2799";

let currentStore = "";

const fields = [
  "Title",
  "Description",
  "Category",
  "Transaction Type",
  "Manufacturer",
  "Price",
  "Price Without Taxes",
  "Available On",
  "Sale Price",
  "Sale Price Without Taxes",
  "sale_on",
  "sale_until",
  "Height",
  "Length",
  "Width",
  "Weight",
  "Property Quantity",
  "Property Names",
  "Property Values",
  "Property SKU",
  "BRAND",
  "ORIGIN_OF_PRODUCT"
];

// Categorías tomadas de tu sheet.
// Podés ampliar este array con el mismo formato si después querés sumar más.
const categories = [
  { name: "Tecnología", id: "8123" },
  { name: "Tecnología/Tv y Video", id: "8124" },
  { name: "Tecnología/Tv y Video/Accesorios Tv", id: "8125" },
  { name: "Tecnología/Tv y Video/Soportes", id: "8126" },
  { name: "Tecnología/Tv y Video/Proyectores", id: "8127" },
  { name: "Tecnología/Tv y Video/Tv LED y Smart Tv", id: "8128" },
  { name: "Tecnología/Audio y Sonido", id: "8129" },
  { name: "Tecnología/Audio y Sonido/Accesorios de audio", id: "8130" },
  { name: "Tecnología/Audio y Sonido/Auriculares", id: "8131" },
  { name: "Tecnología/Audio y Sonido/Barras de Sonido", id: "8132" },
  { name: "Tecnología/Audio y Sonido/Parlantes", id: "8133" },
  { name: "Tecnología/Audio y Sonido/Radios", id: "8134" },
  { name: "Tecnología/Celulares y Telefonía", id: "8135" },
  { name: "Tecnología/Celulares y Telefonía/Accesorios de celulares", id: "8136" },
  { name: "Tecnología/Celulares y Telefonía/Celulares", id: "8137" },
  { name: "Tecnología/Celulares y Telefonía/Smartwatch", id: "8138" },
  { name: "Tecnología/Celulares y Telefonía/Teléfonos", id: "8139" },
  { name: "Tecnología/Cámaras", id: "8140" },
  { name: "Tecnología/Cámaras/Accesorios de camaras", id: "8141" },
  { name: "Tecnología/Cámaras/Cámaras, filmadoras, lentes y drones", id: "8142" },
  { name: "Tecnología/Cámaras/Cámaras de seguridad", id: "8143" },
  { name: "Tecnología/Computación", id: "8144" },
  { name: "Tecnología/Computación/All in one y PC de escritorio", id: "8145" },
  { name: "Tecnología/Computación/Monitores", id: "8146" },
  { name: "Tecnología/Computación/Notebooks", id: "8147" },
  { name: "Tecnología/Computación/Tablets", id: "8149" },
  { name: "Tecnología/Accesorios de computación", id: "8150" },
  { name: "Tecnología/Accesorios de computación/Almacenamiento", id: "8151" },
  { name: "Tecnología/Accesorios de computación/Cables y adaptadores", id: "8152" },
  { name: "Tecnología/Accesorios de computación/Componentes", id: "8153" },
  { name: "Tecnología/Accesorios de computación/Conectividad", id: "8154" },
  { name: "Tecnología/Accesorios de computación/Fundas y soportes", id: "9730" },
  { name: "Tecnología/Accesorios de computación/Impresoras, scanners y accesorios", id: "8155" },
  { name: "Tecnología/Accesorios de computación/Mouse", id: "8156" },
  { name: "Tecnología/Accesorios de computación/Teclados", id: "8157" },
  { name: "Tecnología/Accesorios de computación/Webcam", id: "8159" },
  { name: "Tecnología/Consolas y videojuegos", id: "8160" },
  { name: "Tecnología/Consolas y videojuegos/Accesorios de consolas", id: "8161" },
  { name: "Tecnología/Consolas y videojuegos/Consolas", id: "8162" },
  { name: "Tecnología/Consolas y videojuegos/Videojuegos", id: "8163" },

  { name: "Electrodomésticos", id: "467" },
  { name: "Electrodomésticos/Pequeños cocina", id: "8410" },
  { name: "Electrodomésticos/Pequeños cocina/Balanzas de cocina", id: "8411" },
  { name: "Electrodomésticos/Pequeños cocina/Batidoras", id: "8412" },
  { name: "Electrodomésticos/Pequeños cocina/Cafeteras", id: "8413" },
  { name: "Electrodomésticos/Pequeños cocina/Jugueras y exprimidores", id: "8414" },
  { name: "Electrodomésticos/Pequeños cocina/Freidoras", id: "8415" },
  { name: "Electrodomésticos/Pequeños cocina/Licuadoras", id: "8473" },
  { name: "Electrodomésticos/Pequeños cocina/Mixers y minipimers", id: "8416" },
  { name: "Electrodomésticos/Pequeños cocina/Pavas Eléctricas", id: "8417" },
  { name: "Electrodomésticos/Pequeños cocina/Panquequeras", id: "8418" },
  { name: "Electrodomésticos/Pequeños cocina/Procesadoras", id: "8419" },
  { name: "Electrodomésticos/Pequeños cocina/Pochocleras", id: "8420" },
  { name: "Electrodomésticos/Pequeños cocina/Purificadores de agua", id: "8421" },
  { name: "Electrodomésticos/Pequeños cocina/Tostadoras y sandwicheras", id: "8422" },
  { name: "Electrodomésticos/Pequeños cocina/Walferas", id: "8423" },
  { name: "Electrodomésticos/Pequeños cocina/Yogurteras", id: "8424" },
  { name: "Electrodomésticos/Pequeños hogar", id: "8425" },
  { name: "Electrodomésticos/Pequeños hogar/Aspiradoras", id: "8426" },
  { name: "Electrodomésticos/Pequeños hogar/Lustraspiradoras", id: "8427" },
  { name: "Electrodomésticos/Pequeños hogar/Maquinas de coser", id: "8428" },
  { name: "Electrodomésticos/Pequeños hogar/Planchas", id: "8429" },
  { name: "Electrodomésticos/Pequeños hogar/Otros", id: "8430" },
  { name: "Electrodomésticos/Hornos y cocinas", id: "492" },
  { name: "Electrodomésticos/Hornos y cocinas/Anafes", id: "8431" },
  { name: "Electrodomésticos/Hornos y cocinas/Cocinas y campanas", id: "493" },
  { name: "Electrodomésticos/Hornos y cocinas/Cocinas electricas y multicocinas", id: "8432" },
  { name: "Electrodomésticos/Hornos y cocinas/Hornos electricos", id: "8433" },
  { name: "Electrodomésticos/Hornos y cocinas/Hornos empotrables", id: "8434" },
  { name: "Electrodomésticos/Hornos y cocinas/Microondas", id: "8435" },
  { name: "Electrodomésticos/Lavado", id: "500" },
  { name: "Electrodomésticos/Lavado/Lavarropas", id: "501" },
  { name: "Electrodomésticos/Lavado/Lavavajillas", id: "502" },
  { name: "Electrodomésticos/Lavado/Secarropas", id: "503" },
  { name: "Electrodomésticos/Lavado/Lavasecarropas", id: "9729" },
  { name: "Electrodomésticos/Climatización", id: "8436" },
  { name: "Electrodomésticos/Climatización/Aires acondicionados", id: "8437" },
  { name: "Electrodomésticos/Climatización/Calefaccion electrica", id: "8438" },
  { name: "Electrodomésticos/Climatización/Calefaccion a gas", id: "8440" },
  { name: "Electrodomésticos/Climatización/Calefaccion a leña", id: "8441" },
  { name: "Electrodomésticos/Climatización/Climatizadores", id: "8442" },
  { name: "Electrodomésticos/Climatización/Purificadores de aire", id: "8443" },
  { name: "Electrodomésticos/Climatización/Ventiladores", id: "8444" },
  { name: "Electrodomésticos/Refrigeracion", id: "1735" },
  { name: "Electrodomésticos/Refrigeracion/Cavas y frigobares", id: "8445" },
  { name: "Electrodomésticos/Refrigeracion/Freezer", id: "8446" },
  { name: "Electrodomésticos/Refrigeracion/Heladeras", id: "8447" },
  { name: "Electrodomésticos/Agua caliente", id: "8448" },
  { name: "Electrodomésticos/Agua caliente/Calefones", id: "8449" },
  { name: "Electrodomésticos/Agua caliente/Termotanques", id: "8450" },

  { name: "Hogar", id: "552" },
  { name: "Hogar/Cocina", id: "573" },
  { name: "Hogar/Cocina/Alacenas", id: "8360" },
  { name: "Hogar/Cocina/Bajo mesadas", id: "8361" },
  { name: "Hogar/Cocina/Cubiertos, vajillas y utensilios", id: "8362" },
  { name: "Hogar/Cocina/Despenseros y portamicroondas", id: "8363" },
  { name: "Hogar/Cocina/Jarras, termos, mates y botellas", id: "8364" },
  { name: "Hogar/Cocina/Mesadas", id: "8365" },
  { name: "Hogar/Cocina/Racks de cocina", id: "8366" }
];

function login() {
  const user = document.getElementById("user").value.trim();
  const pass = document.getElementById("pass").value.trim();
  const error = document.getElementById("error");

  if (user === ADMIN_USER && pass === ADMIN_PASS) {
    error.textContent = "";
    document.getElementById("loginPage").classList.add("hidden");
    document.getElementById("storePage").classList.remove("hidden");
  } else {
    error.textContent = "Usuario o contraseña incorrectos.";
  }
}

function logout() {
  document.getElementById("user").value = "";
  document.getElementById("pass").value = "";
  document.getElementById("error").textContent = "";

  document.getElementById("loginPage").classList.remove("hidden");
  document.getElementById("storePage").classList.add("hidden");
  document.getElementById("productPage").classList.add("hidden");

  document.getElementById("tableBody").innerHTML = "";
  currentStore = "";
}

function openStore(storeName) {
  currentStore = storeName;

  document.getElementById("storeTitle").textContent = storeName;
  document.getElementById("storePage").classList.add("hidden");
  document.getElementById("productPage").classList.remove("hidden");

  const tbody = document.getElementById("tableBody");
  tbody.innerHTML = "";
  addRow();
}

function backToStores() {
  document.getElementById("productPage").classList.add("hidden");
  document.getElementById("storePage").classList.remove("hidden");
  document.getElementById("tableBody").innerHTML = "";
}

function addRow() {
  const tbody = document.getElementById("tableBody");
  const tr = document.createElement("tr");

  fields.forEach((field) => {
    const td = document.createElement("td");

    if (field === "Category") {
      td.appendChild(createCategorySelector());
    } else {
      const input = document.createElement("input");
      input.type = getInputType(field);
      input.placeholder = field;
      input.setAttribute("data-field", field);

      if (
        field === "Price" ||
        field === "Price Without Taxes" ||
        field === "Sale Price" ||
        field === "Sale Price Without Taxes" ||
        field === "Height" ||
        field === "Length" ||
        field === "Width" ||
        field === "Weight" ||
        field === "Property Quantity"
      ) {
        input.classList.add("small-input");
      }

      td.appendChild(input);
    }

    tr.appendChild(td);
  });

  const actionTd = document.createElement("td");
  const removeBtn = document.createElement("button");
  removeBtn.textContent = "Eliminar";
  removeBtn.className = "remove-btn";
  removeBtn.onclick = function () {
    tr.remove();
  };

  actionTd.appendChild(removeBtn);
  tr.appendChild(actionTd);

  tbody.appendChild(tr);
}

function createCategorySelector() {
  const wrapper = document.createElement("div");
  wrapper.className = "category-cell";

  const searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.placeholder = "Buscar categoría...";
  searchInput.className = "category-search";
  searchInput.autocomplete = "off";

  const hiddenId = document.createElement("input");
  hiddenId.type = "hidden";
  hiddenId.setAttribute("data-field", "Category");

  const badge = document.createElement("div");
  badge.className = "category-id-badge";
  badge.textContent = "ID: —";

  const dropdown = document.createElement("div");
  dropdown.className = "category-dropdown";
  dropdown.style.display = "none";

  function renderOptions(term = "") {
    dropdown.innerHTML = "";

    const normalizedTerm = normalizeText(term);
    const filtered = categories.filter((cat) =>
      normalizeText(cat.name).includes(normalizedTerm)
    );

    if (filtered.length === 0) {
      const empty = document.createElement("div");
      empty.className = "category-empty";
      empty.textContent = "No se encontraron categorías.";
      dropdown.appendChild(empty);
      dropdown.style.display = "block";
      return;
    }

    filtered.slice(0, 30).forEach((cat) => {
      const option = document.createElement("div");
      option.className = "category-option";

      option.innerHTML = `
        <div class="category-option-name">${escapeHtml(cat.name)}</div>
        <div class="category-option-id">ID: ${cat.id}</div>
      `;

      option.addEventListener("click", () => {
        searchInput.value = cat.name;
        hiddenId.value = cat.id;
        badge.textContent = `ID: ${cat.id}`;
        dropdown.style.display = "none";
      });

      dropdown.appendChild(option);
    });

    dropdown.style.display = "block";
  }

  searchInput.addEventListener("focus", () => {
    renderOptions(searchInput.value);
  });

  searchInput.addEventListener("input", () => {
    hiddenId.value = "";
    badge.textContent = "ID: —";
    renderOptions(searchInput.value);
  });

  document.addEventListener("click", (e) => {
    if (!wrapper.contains(e.target)) {
      dropdown.style.display = "none";
    }
  });

  wrapper.appendChild(searchInput);
  wrapper.appendChild(hiddenId);
  wrapper.appendChild(badge);
  wrapper.appendChild(dropdown);

  return wrapper;
}

function getInputType(field) {
  const dateFields = ["Available On", "sale_on", "sale_until"];
  const numberFields = [
    "Price",
    "Price Without Taxes",
    "Sale Price",
    "Sale Price Without Taxes",
    "Height",
    "Length",
    "Width",
    "Weight",
    "Property Quantity"
  ];

  if (dateFields.includes(field)) return "date";
  if (numberFields.includes(field)) return "number";
  return "text";
}

function exportCSV() {
  const rows = [];
  rows.push([...fields]);

  const tableRows = document.querySelectorAll("#tableBody tr");

  tableRows.forEach((tr) => {
    const row = [];

    fields.forEach((field) => {
      let value = "";

      if (field === "Category") {
        const categoryInput = tr.querySelector('input[data-field="Category"]');
        value = categoryInput ? categoryInput.value.trim() : "";
      } else {
        const input = tr.querySelector(`input[data-field="${field}"]`);
        value = input ? input.value.trim() : "";
      }

      row.push(escapeCSV(value));
    });

    if (row.some((value) => value !== "")) {
      rows.push(row);
    }
  });

  if (rows.length === 1) {
    alert("No hay datos cargados para exportar.");
    return;
  }

  const csvContent = rows.map((row) => row.join(",")).join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  const safeStoreName = currentStore.replace(/\s+/g, "_").toLowerCase();
  link.href = url;
  link.download = `tienditax_${safeStoreName}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

function escapeCSV(value) {
  if (value.includes('"')) {
    value = value.replace(/"/g, '""');
  }

  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    value = `"${value}"`;
  }

  return value;
}

function normalizeText(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}