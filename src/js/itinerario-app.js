import { db } from "./firebase.js";
import { collection, doc, getDoc, getDocs, setDoc, deleteDoc, updateDoc, query, orderBy, addDoc, where } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

// DOM
const inputNombre     = document.getElementById("i-nombre");
const inputOrden      = document.getElementById("i-orden");
const inputTemaOrden  = document.getElementById("input-tema-orden");
const inputDetalle    = document.getElementById("i-detalle");
const inputOtros      = document.getElementById("i-otros");
const btnSave         = document.getElementById("btn-save-itinerario");
const btnCancel       = document.getElementById("btn-cancel");
const searchInput     = document.getElementById("search-itinerario");
const tbody           = document.getElementById("itinerario-tbody");
const formTitle       = document.getElementById("form-title");
const globalAlert     = document.getElementById("global-alert");

// New DOM elements
const selectRealidad  = document.getElementById("i-realidad");
const filterRealidad  = document.getElementById("filter-realidad");
const pageTitleHeader = document.getElementById("itinerario-titulo");

// State
window.allStages = [];
let todasRealidades = [];
let defaultRealidadId = "";
let editingId = null;

let currentSortColumn = "orden";
let currentSortDir = "asc";
let activeFilters = { orden: [], nombre: [], detalle: [], otros: [] };
let filterHistory = [];

// State variables for stage themes
let selectedStageForThemes = null;
let currentThemesList = [];
let editingTemaId = null;

// App Ready
window.addEventListener("app:ready", async () => {
    enforcePermissions();
    btnSave.addEventListener("click", saveStage);
    btnCancel.addEventListener("click", resetForm);
    searchInput.addEventListener("input", () => filterStages());
    filterRealidad.addEventListener("change", onFilterRealidadChange);
    setupSortingListeners();

    // Themes card listeners
    document.getElementById("btn-agregar-tema").addEventListener("click", addTemaForSelectedStage);
    document.getElementById("btn-cancelar-tema").addEventListener("click", resetTemaForm);

    await loadRealidades();
    await loadStages();
});

// Helpers
function showAlert(msg, type = "info") {
    globalAlert.textContent = msg;
    globalAlert.className = `alert alert-${type} visible`;
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (type === "success") setTimeout(() => { globalAlert.className = "alert"; }, 3500);
}

// ── CRUD OPERATIONS ────────────────────────────────
// ── REALIDADES LOADING & TITLE UPDATES ─────────────
async function loadRealidades() {
    try {
        const snap = await getDocs(query(collection(db, "realidades"), orderBy("nombre")));
        todasRealidades = [];
        snap.forEach(d => {
            todasRealidades.push({ id: d.id, ...d.data() });
        });

        // Ensure Camino Neocatecumenal exists
        let cnc = todasRealidades.find(r => r.nombre.toLowerCase().includes("camino neocatecumenal") || r.nombre.toLowerCase() === "cnc");
        if (!cnc) {
            const cncRef = doc(db, "realidades", "camino-neocatecumenal");
            await setDoc(cncRef, {
                nombre: "Camino Neocatecumenal",
                createdAt: new Date().toISOString()
            });
            cnc = { id: "camino-neocatecumenal", nombre: "Camino Neocatecumenal" };
            todasRealidades.push(cnc);
        }

        defaultRealidadId = cnc.id;

        // Populate selectors
        selectRealidad.innerHTML = "";
        filterRealidad.innerHTML = "";

        todasRealidades.forEach(r => {
            selectRealidad.appendChild(new Option(r.nombre, r.id));
            filterRealidad.appendChild(new Option(r.nombre, r.id));
        });

        // Set Camino Neocatecumenal as default
        selectRealidad.value = defaultRealidadId;
        filterRealidad.value = defaultRealidadId;
        updatePageTitle();
    } catch(e) {
        console.error("Error loading realidades:", e);
    }
}

function updatePageTitle() {
    const selectedOpt = filterRealidad.options[filterRealidad.selectedIndex];
    const name = selectedOpt ? selectedOpt.text : "Neocatecumenal";
    if (name.toLowerCase().includes("camino neocatecumenal") || name.toLowerCase() === "cnc") {
        pageTitleHeader.textContent = "🗺️ Itinerario Neocatecumenal";
    } else {
        pageTitleHeader.textContent = `🗺️ Itinerario ${name}`;
    }
}

function onFilterRealidadChange() {
    updatePageTitle();
    renderTable(allStages);
}

// ── CRUD OPERATIONS ────────────────────────────────
async function loadStages() {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:15px; color:#7f8c8d;">Cargando...</td></tr>';
    try {
        const snap = await getDocs(query(collection(db, "itinerario"), orderBy("createdAt", "asc")));
        
        allStages = [];
        snap.forEach(d => {
            allStages.push({ id: d.id, ...d.data() });
        });

        // Sort in memory by orden (ascending), then by createdAt (ascending)
        allStages.sort((a, b) => {
            const ordA = a.orden !== undefined && a.orden !== null ? parseInt(a.orden) : 999;
            const ordB = b.orden !== undefined && b.orden !== null ? parseInt(b.orden) : 999;
            if (ordA !== ordB) return ordA - ordB;
            return (a.createdAt || "").localeCompare(b.createdAt || "");
        });

        // Seed default stages under Camino Neocatecumenal if completely empty
        if (allStages.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:15px; color:#7f8c8d;">Inicializando etapas predeterminadas...</td></tr>';
            await seedDefaultStages();
            await loadStages();
            return;
        }

        renderTable(allStages);
    } catch(err) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:red;">Error: ${err.message}</td></tr>`;
    }
}

async function seedDefaultStages() {
    const defaults = [
        "Precatecumenado",
        "Primer Escrutinio",
        "Shema",
        "Segundo Escrutinio",
        "Iniciación a la Oración",
        "Traditio Symboli",
        "Redditio Symboli",
        "Primera parte del Padre Nuestro",
        "Segunda parte del Padre Nuestro",
        "Tercera parte del Padre Nuestro",
        "Elección",
        "Renovación de las Promesas Bautismales"
    ];

    for (let i = 0; i < defaults.length; i++) {
        const name = defaults[i];
        const id = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "-");
        const docRef = doc(db, "itinerario", id);
        await setDoc(docRef, {
            nombre: name,
            orden: i + 1,
            detalle: `Etapa del itinerario neocatecumenal: ${name}.`,
            otros: "",
            realidadId: defaultRealidadId,
            realidadNombre: "Camino Neocatecumenal",
            createdAt: new Date(Date.now() + i * 1000).toISOString()
        });
    }
}

function renderTable(lista, isFilteredCall = false) {
    if (!isFilteredCall) {
        filterStages();
        return;
    }

    tbody.innerHTML = "";

    if (lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:15px; color:#999;">No se encontraron etapas para esta realidad.</td></tr>';
        return;
    }

    lista.forEach(s => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td style="font-weight:700; color:#334155; text-align:center;">${s.orden !== undefined && s.orden !== null ? s.orden : "—"}</td>
            <td><strong class="click-filter" data-col="nombre" style="cursor:pointer; color:var(--primary);">${s.nombre}</strong></td>
            <td><span class="click-filter" data-col="detalle" style="cursor:pointer; text-decoration:none; text-decoration-style:dotted;">${s.detalle || "—"}</span></td>
            <td><span class="click-filter" data-col="otros" style="cursor:pointer; text-decoration:none; text-decoration-style:dotted;">${s.otros || "—"}</span></td>
            <td style="text-align:center;">
                ${window.hasPermission("itinerario_ver") ? `<button class="btn btn-sm btn-outline btn-view" data-id="${s.id}" style="margin-right:4px;">👁️</button>` : ""}
                ${window.hasPermission("itinerario_editar") ? `<button class="btn btn-sm btn-outline btn-edit" data-id="${s.id}">✏️</button>` : ""}
                ${window.hasPermission("itinerario_eliminar") ? `<button class="btn btn-sm btn-outline btn-delete" style="color:red; border-color:#f5c6cb; margin-left:4px;" data-id="${s.id}">✕</button>` : ""}
            </td>
        `;

        tr.querySelectorAll(".click-filter").forEach(el => {
            el.addEventListener("click", () => {
                const col = el.dataset.col;
                const val = el.textContent.trim();
                if (val && val !== "—") {
                    if (!activeFilters[col].includes(val)) {
                        activeFilters[col].push(val);
                    } else {
                        activeFilters[col] = activeFilters[col].filter(v => v !== val);
                    }
                    renderActiveFilterChips();
                    updateHeaderLabels();
                    filterStages();
                }
            });
        });

        const btnView = tr.querySelector(".btn-view");
        if (btnView) {
            btnView.addEventListener("click", () => viewStage(s));
        }

        const btnEdit = tr.querySelector(".btn-edit");
        if (btnEdit) {
            btnEdit.addEventListener("click", () => editStage(s));
        }

        const btnDelete = tr.querySelector(".btn-delete");
        if (btnDelete) {
            btnDelete.addEventListener("click", () => deleteStage(s.id));
        }
        tbody.appendChild(tr);
    });
}

function filterStages() {
    const q = searchInput.value.toLowerCase().trim();
    const activeRealidadId = filterRealidad.value;

    // Filter stages belonging to the currently selected reality
    let filtered = allStages.filter(s => {
        if (!s.realidadId && activeRealidadId === defaultRealidadId) return true;
        return s.realidadId === activeRealidadId;
    });

    // Apply active filter chips
    if (activeFilters.nombre.length > 0) {
        filtered = filtered.filter(s => activeFilters.nombre.includes(s.nombre));
    }
    if (activeFilters.detalle.length > 0) {
        filtered = filtered.filter(s => activeFilters.detalle.includes(s.detalle));
    }
    if (activeFilters.otros.length > 0) {
        filtered = filtered.filter(s => activeFilters.otros.includes(s.otros));
    }

    // Apply text search
    if (q) {
        filtered = filtered.filter(s => {
            const nom = (s.nombre || "").toLowerCase();
            const det = (s.detalle || "").toLowerCase();
            return nom.includes(q) || det.includes(q);
        });
    }

    // Apply sorting
    filtered.sort((a, b) => {
        let valA = a[currentSortColumn];
        let valB = b[currentSortColumn];
        
        if (currentSortColumn === "orden") {
            const numA = valA !== undefined && valA !== null ? parseInt(valA) : 999;
            const numB = valB !== undefined && valB !== null ? parseInt(valB) : 999;
            return currentSortDir === "asc" ? numA - numB : numB - numA;
        }

        valA = String(valA || "").toLowerCase();
        valB = String(valB || "").toLowerCase();

        if (valA < valB) return currentSortDir === "asc" ? -1 : 1;
        if (valA > valB) return currentSortDir === "asc" ? 1 : -1;
        return 0;
    });

    window.currentPrintedStages = filtered;
    renderTable(filtered, true);
}

function setupSortingListeners() {
    const headers = ["orden", "nombre", "detalle", "otros"];
    headers.forEach(h => {
        const th = document.getElementById(`th-${h}`);
        if (th) {
            th.addEventListener("click", () => handleSort(h));
        }
    });
    setupColumnRightClickFilters();
}

function handleSort(col) {
    if (currentSortColumn === col) {
        currentSortDir = currentSortDir === "asc" ? "desc" : "asc";
    } else {
        currentSortColumn = col;
        currentSortDir = "asc";
    }
    updateHeaderLabels();
    filterStages();
}

function updateHeaderLabels() {
    const cols = {
        "orden": "Paso #",
        "nombre": "Nombre de la Etapa",
        "detalle": "Detalle / Descripción",
        "otros": "Otros"
    };
    Object.keys(cols).forEach(k => {
        const th = document.getElementById(`th-${k}`);
        if (!th) return;
        
        let arrow = "↕️";
        if (k === currentSortColumn) {
            arrow = currentSortDir === "asc" ? "▲" : "▼";
        }
        
        let clearBtn = "";
        if (activeFilters[k] && activeFilters[k].length > 0) {
            clearBtn = ` <span style="color:#e74c3c; cursor:pointer; font-weight:bold; margin-left:6px;" onclick="window.clearItinerarioFilter(event, '${k}')" title="Limpiar filtro de esta columna">❌</span>`;
        }

        th.innerHTML = `${cols[k]} ${arrow}${clearBtn}`;
    });
}

window.clearItinerarioFilter = (e, col) => {
    e.stopPropagation();
    activeFilters[col] = [];
    filterHistory = filterHistory.filter(h => h.type !== col);
    renderActiveFilterChips();
    updateHeaderLabels();
    filterStages();
};

function renderActiveFilterChips() {
    const bar = document.getElementById("active-filters-chips-bar");
    if (!bar) return;

    // Sync active filters to history
    Object.keys(activeFilters).forEach(col => {
        activeFilters[col].forEach(val => {
            if (!val) return;
            filterHistory = filterHistory.filter(h => !(h.type === col && h.name === val));
            filterHistory.unshift({ type: col, name: val });
        });
    });

    // Limit to 4
    if (filterHistory.length > 4) {
        filterHistory = filterHistory.slice(0, 4);
    }

    if (filterHistory.length === 0) {
        bar.style.display = "none";
        return;
    }

    bar.innerHTML = "";
    bar.style.display = "flex";

    filterHistory.forEach(item => {
        const isActive = activeFilters[item.type].includes(item.name);
        const chip = document.createElement("span");
        
        if (isActive) {
            chip.style.cssText = "background:transparent; border:none; padding:0; border-radius:0; cursor:pointer; font-weight:600; color:#475569; display:inline-flex; align-items:center; gap:4px; font-size:0.85rem; margin-right:16px;";
            chip.innerHTML = `${item.name} <span style="color:#ef4444; font-weight:bold; font-size:0.75rem; margin-left:2px;">&times;</span>`;
            chip.title = "Remover filtro";
        } else {
            chip.style.cssText = "background:transparent; border:none; padding:0; border-radius:0; cursor:pointer; font-weight:500; color:#94a3b8; display:inline-flex; align-items:center; gap:4px; font-size:0.85rem; margin-right:16px; opacity:0.75;";
            chip.innerHTML = `${item.name}`;
            chip.title = "Re-aplicar este filtro";
        }

        chip.addEventListener("click", () => {
            if (isActive) {
                activeFilters[item.type] = activeFilters[item.type].filter(val => val !== item.name);
            } else {
                activeFilters[item.type].push(item.name);
            }
            renderActiveFilterChips();
            updateHeaderLabels();
            filterStages();
        });
        bar.appendChild(chip);
    });
}

async function saveStage() {
    const nombre = inputNombre.value.trim();
    const orden = inputOrden.value.trim() ? parseInt(inputOrden.value.trim()) : null;
    const detalle = inputDetalle.value.trim();
    const otros = inputOtros.value.trim();
    const realidadId = selectRealidad.value;

    if (!nombre || !realidadId) {
        alert("El nombre de la etapa y la realidad son requeridos.");
        return;
    }

    const realidadNombre = selectRealidad.options[selectRealidad.selectedIndex].text;

    btnSave.disabled = true;
    try {
        const data = {
            nombre,
            orden,
            detalle,
            otros,
            realidadId,
            realidadNombre,
            updatedAt: new Date().toISOString()
        };

        if (editingId) {
            await updateDoc(doc(db, "itinerario", editingId), data);
            showAlert("✅ Etapa actualizada con éxito.", "success");
        } else {
            const id = nombre.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "-") + "-" + realidadId;
            data.createdAt = new Date().toISOString();
            await setDoc(doc(db, "itinerario", id), data);
            showAlert("✅ Etapa registrada.", "success");
        }

        filterRealidad.value = realidadId;
        updatePageTitle();

        resetForm();
        await loadStages();
    } catch(err) {
        showAlert("Error al guardar: " + err.message, "error");
    } finally {
        btnSave.disabled = false;
    }
}

function enableAllInputs() {
    const formCard = document.getElementById("form-card");
    if (formCard) {
        const inputs = formCard.querySelectorAll("input, select, textarea, button");
        inputs.forEach(input => {
            input.disabled = false;
        });
    }
    enforcePermissions();
}

function editStage(s) {
    enableAllInputs();
    editingId = s.id;
    inputNombre.value = s.nombre;
    inputOrden.value = s.orden !== undefined && s.orden !== null ? s.orden : "";
    inputDetalle.value = s.detalle || "";
    inputOtros.value = s.otros || "";
    selectRealidad.value = s.realidadId || defaultRealidadId;

    formTitle.textContent = "✏️ Editar Etapa de Itinerario";
    btnCancel.style.display = "inline-block";
    btnSave.textContent = "💾 Guardar Cambios";

    // Show themes panel inside form (writable mode)
    showTemasForStage(s.nombre, false);
}

function viewStage(s) {
    editStage(s);
    formTitle.textContent = "👁️ Consultar Etapa de Itinerario";
    
    // Disable inputs in formCard except cancel button
    const formCard = document.getElementById("form-card");
    if (formCard) {
        const inputs = formCard.querySelectorAll("input, select, textarea, button:not(#btn-cancel)");
        inputs.forEach(input => {
            input.disabled = true;
        });
    }

    // Show themes panel inside form (read-only mode)
    showTemasForStage(s.nombre, true);
}


async function deleteStage(id) {
    const confirmDelete = await window.customConfirm(
        "Eliminar Etapa",
        "¿Estás seguro de que deseas eliminar permanentemente esta etapa del itinerario?",
        { icon: "🗑️", danger: true }
    );
    if (!confirmDelete) return;

    try {
        await deleteDoc(doc(db, "itinerario", id));
        showAlert("🗑️ Etapa eliminada correctamente.", "success");
        await loadStages();
    } catch(err) {
        showAlert("Error al eliminar: " + err.message, "error");
    }
}

function resetForm() {
    enableAllInputs();
    editingId = null;
    inputNombre.value = "";
    inputOrden.value = "";
    inputDetalle.value = "";
    inputOtros.value = "";
    selectRealidad.value = defaultRealidadId;

    formTitle.textContent = "📝 Registrar Etapa de Itinerario";
    btnCancel.style.display = "none";
    btnSave.textContent = "💾 Guardar Etapa";

    // Hide themes manager block
    const card = document.getElementById("temas-etapa-card");
    if (card) card.style.display = "none";
    selectedStageForThemes = null;
}

// ── Excel-style Column right click filtering ─────
const efMenu = document.getElementById("excel-filter-menu");
const efClose = document.getElementById("ef-close");
const efSearch = document.getElementById("ef-search");
const efList = document.getElementById("ef-list");
const efBtnCancel = document.getElementById("ef-btn-cancel");
const efBtnApply = document.getElementById("ef-btn-apply");

let efCurrentColumn = "";
let efCurrentValues = [];

function setupColumnRightClickFilters() {
    const cols = ["nombre", "detalle", "otros"];
    
    cols.forEach(k => {
        const th = document.getElementById(`th-${k}`);
        if (!th) return;
        
        th.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            openExcelFilter(k, e.clientX, e.clientY);
        });
    });

    if (efSearch) efSearch.addEventListener("input", renderExcelFilterList);
    if (efClose) efClose.addEventListener("click", () => efMenu.style.display = "none");
    if (efBtnCancel) efBtnCancel.addEventListener("click", () => efMenu.style.display = "none");
    if (efBtnApply) efBtnApply.addEventListener("click", applyExcelFilter);

    document.addEventListener("click", (e) => {
        if (efMenu && efMenu.style.display === "block" && !efMenu.contains(e.target)) {
            if (!e.target.closest("th")) {
                efMenu.style.display = "none";
            }
        }
    });
}

function openExcelFilter(colKey, clientX, clientY) {
    efCurrentColumn = colKey;
    efMenu.style.left = `${clientX}px`;
    efMenu.style.top = `${clientY}px`;
    efMenu.style.display = "block";
    efSearch.value = "";

    const uniqueVals = new Set();
    
    const activeRealidadId = filterRealidad.value;
    const currentRealidadStages = allStages.filter(s => {
        if (!s.realidadId && activeRealidadId === defaultRealidadId) return true;
        return s.realidadId === activeRealidadId;
    });

    currentRealidadStages.forEach(s => {
        let val = s[colKey] || "—";
        uniqueVals.add(val);
    });

    efCurrentValues = Array.from(uniqueVals).sort((a, b) => String(a).localeCompare(String(b)));
    renderExcelFilterList();
}

function renderExcelFilterList() {
    const q = efSearch.value.toLowerCase().trim();
    efList.innerHTML = "";

    const allChecked = activeFilters[efCurrentColumn].length === 0 || efCurrentValues.every(val => activeFilters[efCurrentColumn].includes(val));
    
    const selectAllItem = document.createElement("label");
    selectAllItem.className = "ef-item";
    selectAllItem.style.cssText = "display:flex; align-items:center; gap:6px; font-weight:bold; margin-bottom:4px; cursor:pointer;";
    selectAllItem.innerHTML = `
        <input type="checkbox" id="ef-select-all" ${allChecked ? "checked" : ""}>
        <span>(Seleccionar todo)</span>
    `;
    efList.appendChild(selectAllItem);

    const selectAllCheckbox = selectAllItem.querySelector("#ef-select-all");
    selectAllCheckbox.addEventListener("change", () => {
        const boxes = efList.querySelectorAll(".ef-val-check");
        boxes.forEach(cb => cb.checked = selectAllCheckbox.checked);
    });

    efCurrentValues.forEach(val => {
        if (q && !String(val).toLowerCase().includes(q)) return;

        const isChecked = activeFilters[efCurrentColumn].length === 0 || activeFilters[efCurrentColumn].includes(val);
        const item = document.createElement("label");
        item.style.cssText = "display:flex; align-items:center; gap:6px; margin-bottom:4px; cursor:pointer;";
        item.innerHTML = `
            <input type="checkbox" class="ef-val-check" value="${val}" ${isChecked ? "checked" : ""}>
            <span>${val}</span>
        `;
        
        const cb = item.querySelector("input");
        cb.addEventListener("change", () => {
            if (!cb.checked) {
                selectAllCheckbox.checked = false;
            } else {
                const allSingleChecked = Array.from(efList.querySelectorAll(".ef-val-check")).every(c => c.checked);
                selectAllCheckbox.checked = allSingleChecked;
            }
        });

        efList.appendChild(item);
    });
}

function applyExcelFilter() {
    const selected = [];
    const checks = efList.querySelectorAll(".ef-val-check");
    checks.forEach(cb => {
        if (cb.checked) selected.push(cb.value);
    });

    if (selected.length === efCurrentValues.length || selected.length === 0) {
        activeFilters[efCurrentColumn] = [];
    } else {
        activeFilters[efCurrentColumn] = selected;
    }

    efMenu.style.display = "none";
    updateHeaderLabels();
    filterStages();
}

function enforcePermissions() {
    if (!window.hasPermission) return;

    // Crear/Guardar itinerario card visibility
    const formCard = document.getElementById("form-card");
    if (formCard && !window.hasPermission("itinerario_crear") && !window.hasPermission("itinerario_guardar")) {
        formCard.style.display = "none";
    }

    // Hide Save Button in form if no itinerario_guardar permission
    const btnSave = document.getElementById("btn-save-itinerario");
    if (btnSave && !window.hasPermission("itinerario_guardar")) {
        btnSave.style.display = "none";
    }
}

async function showTemasForStage(stageName, isReadOnly = false) {
    selectedStageForThemes = stageName;
    document.getElementById("temas-card-title").textContent = `📚 Temas y Artículos: ${stageName}`;
    document.getElementById("temas-etapa-card").style.display = "block";
    resetTemaForm();

    const input = document.getElementById("input-nuevo-tema");
    const btn = document.getElementById("btn-agregar-tema");
    if (input) input.disabled = isReadOnly;
    if (btn) btn.disabled = isReadOnly;

    await loadTemasForSelectedStage(isReadOnly);
}

async function loadTemasForSelectedStage(isReadOnly = false) {
    const tbodyTemas = document.getElementById("temas-etapa-tbody");
    tbodyTemas.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:10px; color:#7f8c8d;">Cargando temas...</td></tr>';

    try {
        const q = query(
            collection(db, "temas"),
            where("etapa", "==", selectedStageForThemes)
        );
        const snap = await getDocs(q);

        currentThemesList = [];
        tbodyTemas.innerHTML = '';

        snap.forEach(d => {
            currentThemesList.push({ id: d.id, ...d.data() });
        });

        // Sort themes by orden (numerically)
        currentThemesList.sort((a, b) => {
            const ordA = a.orden !== undefined && a.orden !== null ? parseInt(a.orden) : 999;
            const ordB = b.orden !== undefined && b.orden !== null ? parseInt(b.orden) : 999;
            return ordA - ordB;
        });

        if (currentThemesList.length === 0) {
            tbodyTemas.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:10px; color:#999;">No hay temas registrados para esta etapa.</td></tr>';
            return;
        }

        currentThemesList.forEach(t => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td style="padding:8px; font-weight:700; color:#334155; text-align:center;">${t.orden !== undefined && t.orden !== null ? t.orden : "—"}</td>
                <td style="padding:8px; font-size:0.88rem; color:#334155; font-weight:600;">${t.nombre}</td>
                <td style="padding:8px; text-align:center;">
                    <button class="btn btn-sm btn-outline btn-edit-tema" style="padding:4px; margin-right:4px; ${isReadOnly ? 'display:none;' : ''}" data-id="${t.id}">✏️</button>
                    <button class="btn btn-sm btn-outline btn-delete-tema" style="padding:4px; color:red; border-color:#f5c6cb; ${isReadOnly ? 'display:none;' : ''}" data-id="${t.id}">✕</button>
                </td>
            `;

            if (!isReadOnly) {
                tr.querySelector(".btn-edit-tema").addEventListener("click", () => editTemaInline(t.id, t.nombre, t.orden));
                tr.querySelector(".btn-delete-tema").addEventListener("click", () => deleteTemaForSelectedStage(t.id));
            }
            tbodyTemas.appendChild(tr);
        });
    } catch(err) {
        console.error("Error loading themes:", err);
        tbodyTemas.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:10px; color:red;">Error al cargar temas.</td></tr>';
    }
}

function editTemaInline(id, name, orden) {
    editingTemaId = id;
    const input = document.getElementById("input-nuevo-tema");
    if (input) input.value = name;

    if (inputTemaOrden) inputTemaOrden.value = orden !== undefined && orden !== null ? orden : "";
    
    const btn = document.getElementById("btn-agregar-tema");
    if (btn) btn.textContent = "💾 Actualizar";
    
    const cancelBtn = document.getElementById("btn-cancelar-tema");
    if (cancelBtn) cancelBtn.style.display = "inline-block";
}

function resetTemaForm() {
    editingTemaId = null;
    const input = document.getElementById("input-nuevo-tema");
    if (input) input.value = "";

    if (inputTemaOrden) inputTemaOrden.value = "";
    
    const btn = document.getElementById("btn-agregar-tema");
    if (btn) {
        btn.textContent = "➕ Agregar";
        btn.disabled = false;
    }
    
    const cancelBtn = document.getElementById("btn-cancelar-tema");
    if (cancelBtn) cancelBtn.style.display = "none";
}

async function addTemaForSelectedStage() {
    const input = document.getElementById("input-nuevo-tema");
    const val = input.value.trim();
    if (!val || !selectedStageForThemes) return;

    const tOrden = inputTemaOrden.value.trim() ? parseInt(inputTemaOrden.value.trim()) : null;

    const btn = document.getElementById("btn-agregar-tema");
    btn.disabled = true;

    try {
        if (editingTemaId) {
            await updateDoc(doc(db, "temas", editingTemaId), {
                nombre: val,
                orden: tOrden
            });
            resetTemaForm();
        } else {
            await addDoc(collection(db, "temas"), {
                nombre: val,
                orden: tOrden,
                etapa: selectedStageForThemes,
                createdAt: new Date().toISOString()
            });
            input.value = "";
            if (inputTemaOrden) inputTemaOrden.value = "";
        }
        await loadTemasForSelectedStage();
    } catch(err) {
        console.error("Error saving theme:", err);
        alert("Error al guardar tema: " + err.message);
    } finally {
        btn.disabled = false;
    }
}

async function deleteTemaForSelectedStage(id) {
    if (!confirm("¿Está seguro de que desea eliminar este tema?")) return;

    try {
        await deleteDoc(doc(db, "temas", id));
        await loadTemasForSelectedStage();
    } catch(err) {
        console.error("Error deleting theme:", err);
        alert("Error al eliminar tema: " + err.message);
    }
}
