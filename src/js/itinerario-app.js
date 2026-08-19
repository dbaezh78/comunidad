import { db } from "./firebase.js";
import { collection, doc, getDoc, getDocs, setDoc, deleteDoc, updateDoc, query, orderBy } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

// DOM
const inputNombre     = document.getElementById("i-nombre");
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
let allStages = [];
let todasRealidades = [];
let defaultRealidadId = "";
let editingId = null;

let currentSortColumn = "nombre";
let currentSortDir = "asc";
let activeFilters = { nombre: [], detalle: [], otros: [] };
let filterHistory = [];

// App Ready
window.addEventListener("app:ready", async () => {
    btnSave.addEventListener("click", saveStage);
    btnCancel.addEventListener("click", resetForm);
    searchInput.addEventListener("input", () => filterStages());
    filterRealidad.addEventListener("change", onFilterRealidadChange);
    setupSortingListeners();

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
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:15px; color:#7f8c8d;">Cargando...</td></tr>';
    try {
        const snap = await getDocs(query(collection(db, "itinerario"), orderBy("createdAt", "asc")));
        
        allStages = [];
        snap.forEach(d => {
            allStages.push({ id: d.id, ...d.data() });
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
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:15px; color:#999;">No se encontraron etapas para esta realidad.</td></tr>';
        return;
    }

    lista.forEach(s => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td><strong class="click-filter" data-col="nombre" style="cursor:pointer; color:var(--primary);">${s.nombre}</strong></td>
            <td><span class="click-filter" data-col="detalle" style="cursor:pointer; text-decoration:none; text-decoration-style:dotted;">${s.detalle || "—"}</span></td>
            <td><span class="click-filter" data-col="otros" style="cursor:pointer; text-decoration:none; text-decoration-style:dotted;">${s.otros || "—"}</span></td>
            <td style="text-align:center;">
                <button class="btn btn-sm btn-outline btn-edit" data-id="${s.id}">✏️</button>
                <button class="btn btn-sm btn-outline btn-delete" style="color:red; border-color:#f5c6cb; margin-left:4px;" data-id="${s.id}">✕</button>
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

        tr.querySelector(".btn-edit").addEventListener("click", () => editStage(s));
        tr.querySelector(".btn-delete").addEventListener("click", () => deleteStage(s.id));
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
        let valA = a[currentSortColumn] || "";
        let valB = b[currentSortColumn] || "";
        
        valA = String(valA).toLowerCase();
        valB = String(valB).toLowerCase();

        if (valA < valB) return currentSortDir === "asc" ? -1 : 1;
        if (valA > valB) return currentSortDir === "asc" ? 1 : -1;
        return 0;
    });

    renderTable(filtered, true);
}

function setupSortingListeners() {
    const headers = ["nombre", "detalle", "otros"];
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

function editStage(s) {
    editingId = s.id;
    inputNombre.value = s.nombre;
    inputDetalle.value = s.detalle || "";
    inputOtros.value = s.otros || "";
    selectRealidad.value = s.realidadId || defaultRealidadId;

    formTitle.textContent = "✏️ Editar Etapa de Itinerario";
    btnCancel.style.display = "inline-block";
    btnSave.textContent = "💾 Guardar Cambios";
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
    editingId = null;
    inputNombre.value = "";
    inputDetalle.value = "";
    inputOtros.value = "";
    selectRealidad.value = defaultRealidadId;

    formTitle.textContent = "📝 Registrar Etapa de Itinerario";
    btnCancel.style.display = "none";
    btnSave.textContent = "💾 Guardar Etapa";
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
