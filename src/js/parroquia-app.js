// ================================================
// PARROQUIA-APP.JS — Logica de parroquia.html
// ================================================
import { db } from "./firebase.js";
import { collection, doc, getDoc, getDocs, addDoc,
         updateDoc, deleteDoc, query,
         orderBy } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

// ── DOM ──────────────────────────────────────────
const selParroquia         = document.getElementById("sel-parroquia");
const btnNueva             = document.getElementById("btn-nueva-parroquia");
const loadingState         = document.getElementById("loading-state");
const globalAlert          = document.getElementById("global-alert");

// Form
const formPanel            = document.getElementById("parroquia-form-panel");
const formTitulo           = document.getElementById("parroquia-form-titulo");
const btnSave              = document.getElementById("btn-save-parroquia");
const btnCancel            = document.getElementById("btn-cancel-parroquia");
const btnDeleteParroquia   = document.getElementById("btn-delete-parroquia");

const pNombre              = document.getElementById("p-nombre");
const pDireccion           = document.getElementById("p-direccion");
const pTelefono            = document.getElementById("p-telefono");
const pLat                 = document.getElementById("p-lat");
const pLng                 = document.getElementById("p-lng");
const btnLocation          = document.getElementById("btn-location");
const locationStatus       = document.getElementById("location-status");
const pParroco             = document.getElementById("p-parroco");
const pRealidadParroco     = document.getElementById("p-realidad-parroco");
const pDiacono             = document.getElementById("p-diacono");
const pRealidadDiacono     = document.getElementById("p-realidad-diacono");
const realidadesCheckGrid  = document.getElementById("realidades-check-grid");
const loadingRealidades    = document.getElementById("loading-realidades");
const noRealidades         = document.getElementById("no-realidades");

// Vista
const viewPanel            = document.getElementById("parroquia-view-panel");
const btnEditParroquia     = document.getElementById("btn-edit-parroquia");
const pvNombre             = document.getElementById("pv-nombre");
const pvNombreTxt          = document.getElementById("pv-nombre-txt");
const pvDir                = document.getElementById("pv-dir");
const pvTel                = document.getElementById("pv-tel");
const pvLoc                = document.getElementById("pv-loc");
const pvParroco            = document.getElementById("pv-parroco");
const pvRealParroco        = document.getElementById("pv-realidad-parroco");
const pvDiacono            = document.getElementById("pv-diacono");
const pvRealDiacono        = document.getElementById("pv-realidad-diacono");
const pvRealidades         = document.getElementById("pv-realidades");

// Estado
let todasRealidades     = [];    // docs de Firestore
let todasParroquias     = [];
let editingParroquiaId  = null;

let currentSortColumn   = "nombre";
let currentSortDir      = "asc";
let activeFilters       = { nombre: [], parroco: [], telefono: [], direccion: [] };
let filterHistory       = [];

// ── App ready ────────────────────────────────────
window.addEventListener("app:ready", async () => {
    enforcePermissions();
    await loadRealidades();
    await loadParroquias();
    setupSortingListeners();
    
    const searchInput = document.getElementById("search-parroquias");
    if (searchInput) {
        searchInput.addEventListener("input", () => filterParroquias());
    }
});

// ── Cargar realidades (para selects y checkboxes) ─
async function loadRealidades() {
    const snap = await getDocs(query(collection(db, "realidades"), orderBy("nombre")));
    todasRealidades = [];
    snap.forEach(d => todasRealidades.push({ id: d.id, ...d.data() }));

    // Llenar selects de párroco y diácono
    [pRealidadParroco, pRealidadDiacono].forEach(sel => {
        sel.innerHTML = '<option value="">— Sin asignar —</option>';
        todasRealidades.forEach(r => {
            sel.appendChild(new Option(r.nombre, r.id));
        });
    });
}

// ── Renderizar checkboxes de realidades ───────────
function renderRealidadesChecks(selectedIds = []) {
    loadingRealidades.style.display  = "none";

    if (todasRealidades.length === 0) {
        noRealidades.style.display       = "block";
        realidadesCheckGrid.style.display = "none";
        return;
    }

    noRealidades.style.display        = "none";
    realidadesCheckGrid.style.display = "grid";
    realidadesCheckGrid.innerHTML     = "";

    todasRealidades.forEach(r => {
        const label = document.createElement("label");
        label.className = "realidad-check-item";
        const checked = selectedIds.includes(r.id) ? "checked" : "";
        label.innerHTML = `
            <input type="checkbox" name="realidad-check" value="${r.id}" ${checked}>
            ${r.nombre}
        `;
        realidadesCheckGrid.appendChild(label);
    });
}

function getSelectedRealidades() {
    return Array.from(
        document.querySelectorAll('input[name="realidad-check"]:checked')
    ).map(cb => cb.value);
}

// ── Cargar parroquias ─────────────────────────────
async function loadParroquias() {
    const snap = await getDocs(query(collection(db, "parroquias"), orderBy("nombre")));
    todasParroquias = [];
    selParroquia.innerHTML = '<option value="">— Seleccionar parroquia —</option>';

    snap.forEach(d => {
        todasParroquias.push({ id: d.id, ...d.data() });
        selParroquia.appendChild(new Option(d.data().nombre, d.id));
    });

    renderParroquiasTable(todasParroquias);
}

async function consultParroquiaById(id) {
    if (!id) { viewPanel.style.display = "none"; formPanel.style.display = "none"; return; }
    showLoading(true);
    const snap = await getDoc(doc(db, "parroquias", id));
    showLoading(false);
    if (snap.exists()) {
        showViewPanel({ id: snap.id, ...snap.data() });
        viewPanel.scrollIntoView({ behavior: "smooth" });
    }
}

selParroquia.addEventListener("change", async () => {
    await consultParroquiaById(selParroquia.value);
});

// ── Nueva parroquia ───────────────────────────────
btnNueva.addEventListener("click", () => {
    editingParroquiaId = null;
    clearForm();
    renderRealidadesChecks([]);
    formTitulo.textContent = "⛪ Nueva Parroquia";
    btnDeleteParroquia.style.display = "none";
    viewPanel.style.display  = "none";
    formPanel.style.display  = "block";
    formPanel.scrollIntoView({ behavior: "smooth" });
});

// ── Editar ────────────────────────────────────────
btnEditParroquia.addEventListener("click", () => {
    const id = selParroquia.value;
    if (!id) return;
    const p = todasParroquias.find(x => x.id === id);
    if (!p) return;
    openEditForm(p);
});

function openEditForm(p) {
    editingParroquiaId         = p.id;
    pNombre.value              = p.nombre      || "";
    pDireccion.value           = p.direccion   || "";
    pTelefono.value            = p.telefono    || "";
    pParroco.value             = p.parroco     || "";
    pRealidadParroco.value     = p.realidadParrocoId  || "";
    pDiacono.value             = p.diacono     || "";
    pRealidadDiacono.value     = p.realidadDiaconoId  || "";

    if (p.location?.lat) {
        pLat.value = p.location.lat;
        pLng.value = p.location.lng;
        locationStatus.textContent = `📍 ${p.location.lat.toFixed(5)}, ${p.location.lng.toFixed(5)}`;
        btnLocation.textContent    = "📍 Actualizar ubicación";
        btnLocation.classList.add("got");
    }

    renderRealidadesChecks(p.realidadesIds || []);
    formTitulo.textContent          = `✏️ Editar: ${p.nombre}`;
    btnDeleteParroquia.style.display = "inline-flex";
    viewPanel.style.display  = "none";
    formPanel.style.display  = "block";
    formPanel.scrollIntoView({ behavior: "smooth" });
}

function clearForm() {
    pNombre.value          = "";
    pDireccion.value       = "";
    pTelefono.value        = "";
    pParroco.value         = "";
    pRealidadParroco.value = "";
    pDiacono.value         = "";
    pRealidadDiacono.value = "";
    pLat.value = pLng.value = "";
    locationStatus.textContent = "";
    btnLocation.textContent = "📍 Obtener ubicación actual";
    btnLocation.classList.remove("got");
}

// ── Geolocalización ───────────────────────────────
btnLocation.addEventListener("click", () => {
    if (!navigator.geolocation) { locationStatus.textContent = "❌ No disponible."; return; }
    locationStatus.textContent = "📡 Obteniendo ubicación...";
    btnLocation.disabled = true;
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            pLat.value = pos.coords.latitude;
            pLng.value = pos.coords.longitude;
            locationStatus.textContent = `✅ ${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
            btnLocation.textContent = "📍 Ubicación guardada ✓";
            btnLocation.classList.add("got");
            btnLocation.disabled = false;
        },
        (err) => { locationStatus.textContent = `❌ ${err.message}`; btnLocation.disabled = false; },
        { enableHighAccuracy: true, timeout: 10000 }
    );
});

// ── Cancelar ──────────────────────────────────────
btnCancel.addEventListener("click", () => {
    formPanel.style.display = "none";
    if (selParroquia.value) {
        const p = todasParroquias.find(x => x.id === selParroquia.value);
        if (p) showViewPanel(p);
    }
});

// ── Guardar ───────────────────────────────────────
btnSave.addEventListener("click", async () => {
    if (!pNombre.value.trim()) { showAlert("El nombre de la parroquia es obligatorio.", "error"); return; }

    // Obtener nombre de las realidades seleccionadas para denormalizar
    const selectedIds = getSelectedRealidades();
    const realidadParrocoNombre  = todasRealidades.find(r => r.id === pRealidadParroco.value)?.nombre || null;
    const realidadDiaconoNombre  = todasRealidades.find(r => r.id === pRealidadDiacono.value)?.nombre || null;

    const data = {
        nombre:               pNombre.value.trim(),
        direccion:            pDireccion.value.trim(),
        telefono:             pTelefono.value.trim(),
        location:             pLat.value ? { lat: parseFloat(pLat.value), lng: parseFloat(pLng.value) } : null,
        parroco:              pParroco.value.trim(),
        realidadParrocoId:    pRealidadParroco.value   || null,
        realidadParrocoNombre,
        diacono:              pDiacono.value.trim(),
        realidadDiaconoId:    pRealidadDiacono.value   || null,
        realidadDiaconoNombre,
        realidadesIds:        selectedIds,
        updatedAt: new Date().toISOString(),
    };

    btnSave.disabled = true;
    try {
        if (editingParroquiaId) {
            await updateDoc(doc(db, "parroquias", editingParroquiaId), data);
            showAlert("✅ Parroquia actualizada.", "success");
        } else {
            data.createdAt = new Date().toISOString();
            const ref = await addDoc(collection(db, "parroquias"), data);
            editingParroquiaId = ref.id;
            // Agregar al selector
            selParroquia.appendChild(new Option(data.nombre, ref.id));
            selParroquia.value = ref.id;
            showAlert("✅ Parroquia creada.", "success");
        }
        // Actualizar estado local
        const idx = todasParroquias.findIndex(x => x.id === editingParroquiaId);
        const full = { id: editingParroquiaId, ...data };
        if (idx >= 0) todasParroquias[idx] = full; else todasParroquias.push(full);

        // Render table list
        renderParroquiasTable(todasParroquias);

        formPanel.style.display = "none";
        showViewPanel(full);
    } catch (err) {
        showAlert("Error: " + err.message, "error");
    } finally {
        btnSave.disabled = false;
    }
});

// ── Eliminar ──────────────────────────────────────
btnDeleteParroquia.addEventListener("click", async () => {
    if (!editingParroquiaId) return;
    deleteParroquiaById(editingParroquiaId);
});

// ── Vista de parroquia ────────────────────────────
function showViewPanel(p) {
    viewPanel.style.display = "block";
    formPanel.style.display = "none";

    pvNombre.textContent    = `⛪ ${p.nombre}`;
    pvNombreTxt.textContent = p.nombre    || "—";
    pvDir.textContent       = p.direccion || "—";
    pvTel.textContent       = p.telefono  || "—";
    pvParroco.textContent   = p.parroco   || "—";
    pvDiacono.textContent   = p.diacono   || "—";
    pvRealParroco.textContent  = p.realidadParrocoNombre  || "—";
    pvRealDiacono.textContent  = p.realidadDiaconoNombre  || "—";

    if (p.location?.lat) {
        pvLoc.innerHTML = `<a href="https://www.google.com/maps?q=${p.location.lat},${p.location.lng}" target="_blank" class="btn btn-sm btn-outline" style="text-decoration:none;">📍 Ver en Google Maps</a>`;
    } else { pvLoc.textContent = "—"; }

    // Realidades activas
    pvRealidades.innerHTML = "";
    const ids = p.realidadesIds || [];
    if (!ids.length) {
        pvRealidades.innerHTML = `<p style="color:#7f8c8d;font-family:'Segoe UI',sans-serif;font-size:0.88rem;">Sin realidades asignadas.</p>`;
        return;
    }
    ids.forEach(id => {
        const r = todasRealidades.find(x => x.id === id);
        if (!r) return;
        const card = document.createElement("div");
        card.className = "realidad-card";
        card.innerHTML = `
            <div class="rc-nombre">📚 ${r.nombre}</div>
            <div class="rc-catequista">🎓 ${r.catequistaNombre || "—"}</div>
        `;
        pvRealidades.appendChild(card);
    });
}

// ── Helpers ───────────────────────────────────────
function showLoading(state) {
    loadingState.style.display = state ? "flex" : "none";
}

function showAlert(msg, type = "info") {
    globalAlert.textContent = msg;
    globalAlert.className   = `alert alert-${type} visible`;
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (type === "success") setTimeout(() => { globalAlert.className = "alert"; }, 3500);
}

function renderParroquiasTable(lista, isFilteredCall = false) {
    if (!isFilteredCall) {
        filterParroquias();
        return;
    }

    const tbody = document.getElementById("parroquia-tbody");
    if (!tbody) return;
    tbody.innerHTML = "";

    if (lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:15px; color:#999;">No se encontraron parroquias.</td></tr>';
        return;
    }

    lista.forEach(p => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td><strong class="click-filter" data-col="nombre" style="cursor:pointer; color:var(--primary);">${p.nombre}</strong></td>
            <td><span class="click-filter" data-col="parroco" style="cursor:pointer; text-decoration:none; text-decoration-style:dotted;">${p.parroco || "—"}</span></td>
            <td><span class="click-filter" data-col="telefono" style="cursor:pointer; text-decoration:none; text-decoration-style:dotted;">${p.telefono || "—"}</span></td>
            <td><span class="click-filter" data-col="direccion" style="cursor:pointer; text-decoration:none; text-decoration-style:dotted;">${p.direccion || "—"}</span></td>
            <td style="text-align:center;">
                ${window.hasPermission("parroquia_consultar") ? `<button class="btn btn-sm btn-outline btn-view-table" data-id="${p.id}" title="Consultar parroquia" style="margin-right:4px;">👁️</button>` : ""}
                ${window.hasPermission("parroquia_editar") ? `<button class="btn btn-sm btn-outline btn-edit-table" data-id="${p.id}" title="Editar parroquia">✏️</button>` : ""}
                ${window.hasPermission("parroquia_eliminar") ? `<button class="btn btn-sm btn-outline btn-delete-table" style="color:red; border-color:#f5c6cb; margin-left:4px;" data-id="${p.id}" title="Eliminar parroquia">✕</button>` : ""}
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
                    filterParroquias();
                }
            });
        });

        const btnView = tr.querySelector(".btn-view-table");
        if (btnView) {
            btnView.addEventListener("click", () => {
                selParroquia.value = p.id;
                consultParroquiaById(p.id);
            });
        }

        const btnEdit = tr.querySelector(".btn-edit-table");
        if (btnEdit) {
            btnEdit.addEventListener("click", () => {
                selParroquia.value = p.id;
                openEditForm(p);
            });
        }

        const btnDelete = tr.querySelector(".btn-delete-table");
        if (btnDelete) {
            btnDelete.addEventListener("click", () => {
                deleteParroquiaById(p.id);
            });
        }

        tbody.appendChild(tr);
    });
}

function filterParroquias() {
    const q = document.getElementById("search-parroquias").value.toLowerCase().trim();
    
    let filtered = [...todasParroquias];

    // Apply active filter chips
    if (activeFilters.nombre.length > 0) {
        filtered = filtered.filter(p => activeFilters.nombre.includes(p.nombre));
    }
    if (activeFilters.parroco.length > 0) {
        filtered = filtered.filter(p => activeFilters.parroco.includes(p.parroco));
    }
    if (activeFilters.telefono.length > 0) {
        filtered = filtered.filter(p => activeFilters.telefono.includes(p.telefono));
    }
    if (activeFilters.direccion.length > 0) {
        filtered = filtered.filter(p => activeFilters.direccion.includes(p.direccion));
    }

    // Apply text search
    if (q) {
        filtered = filtered.filter(p => {
            const nom = (p.nombre || "").toLowerCase();
            const pr = (p.parroco || "").toLowerCase();
            const dir = (p.direccion || "").toLowerCase();
            return nom.includes(q) || pr.includes(q) || dir.includes(q);
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

    renderParroquiasTable(filtered, true);
}

function setupSortingListeners() {
    const headers = ["nombre", "parroco", "telefono", "direccion"];
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
    filterParroquias();
}

function updateHeaderLabels() {
    const cols = {
        "nombre": "Nombre de la Parroquia",
        "parroco": "Párroco",
        "telefono": "Teléfono",
        "direccion": "Dirección"
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
            clearBtn = ` <span style="color:#e74c3c; cursor:pointer; font-weight:bold; margin-left:6px;" onclick="window.clearParroquiaFilter(event, '${k}')" title="Limpiar filtro de esta columna">❌</span>`;
        }

        th.innerHTML = `${cols[k]} ${arrow}${clearBtn}`;
    });
}

window.clearParroquiaFilter = (e, col) => {
    e.stopPropagation();
    activeFilters[col] = [];
    filterHistory = filterHistory.filter(h => h.type !== col);
    renderActiveFilterChips();
    updateHeaderLabels();
    filterParroquias();
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
            filterParroquias();
        });
        bar.appendChild(chip);
    });
}

async function deleteParroquiaById(id) {
    const confirmDelete = await window.customConfirm(
        "Eliminar Parroquia",
        "¿Estás seguro de que deseas eliminar permanentemente esta parroquia? Esta acción no se puede deshacer.",
        { icon: "🗑️", danger: true }
    );
    if (!confirmDelete) return;

    try {
        await deleteDoc(doc(db, "parroquias", id));
        
        // Quitar del selector
        const opt = selParroquia.querySelector(`option[value="${id}"]`);
        if (opt) opt.remove();

        todasParroquias = todasParroquias.filter(x => x.id !== id);
        
        if (editingParroquiaId === id) {
            editingParroquiaId = null;
            formPanel.style.display = "none";
        }
        if (selParroquia.value === id) {
            selParroquia.value = "";
            viewPanel.style.display = "none";
        }

        renderParroquiasTable(todasParroquias);
        showAlert("🗑️ Parroquia eliminada.", "success");
    } catch (err) {
        showAlert("Error: " + err.message, "error");
    }
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
    const cols = ["nombre", "parroco", "telefono", "direccion"];
    
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
    todasParroquias.forEach(p => {
        let val = p[colKey] || "—";
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
    filterParroquias();
}

function enforcePermissions() {
    if (!window.hasPermission) return;

    // crear Nueva parroquia
    const btnNueva = document.getElementById("btn-nueva-parroquia");
    if (btnNueva && !window.hasPermission("parroquia_crear")) {
        btnNueva.style.display = "none";
    }

    // Seleccionar parroquia para consultar
    const selParroquia = document.getElementById("sel-parroquia");
    if (selParroquia && !window.hasPermission("parroquia_consultar")) {
        selParroquia.disabled = true;
    }

    // Editar parroquia
    const btnEditParroquia = document.getElementById("btn-edit-parroquia");
    if (btnEditParroquia && !window.hasPermission("parroquia_editar")) {
        btnEditParroquia.style.display = "none";
    }

    // Buscar en Parroquia
    const searchWrap = document.getElementById("search-parroquias");
    if (searchWrap && !window.hasPermission("parroquia_buscar")) {
        searchWrap.style.display = "none";
    }

    // Filtrar
    if (!window.hasPermission("parroquia_filtrar")) {
        // Disable column headers click/contextmenu sorting
        const headers = ["nombre", "parroco", "telefono", "direccion"];
        headers.forEach(h => {
            const th = document.getElementById(`th-${h}`);
            if (th) {
                th.style.pointerEvents = "none";
                th.style.cursor = "default";
            }
        });
    }
}



