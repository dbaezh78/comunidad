// ================================================
// HERMANOS-APP.JS — Logica de hermanos.html (CRUD Completo)
// ================================================
import { db, auth } from "./firebase.js";
import { collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc, query, orderBy, collectionGroup } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

// ── DOM ──────────────────────────────────────────
const btnNuevo       = document.getElementById("btn-nuevo-hermano");
const searchInput    = document.getElementById("search-input");
const listPanel      = document.getElementById("list-panel");
const formPanel      = document.getElementById("form-panel");
const loadingState   = document.getElementById("loading-state");
const emptyState     = document.getElementById("empty-state");
const tableCard      = document.getElementById("table-card");
const tbody          = document.getElementById("hermanos-tbody");
const globalAlert    = document.getElementById("global-alert");

// Form
const formTitle      = document.getElementById("form-title");
const btnSave        = document.getElementById("btn-save");
const btnCancel      = document.getElementById("btn-cancel");
const btnDelete      = document.getElementById("btn-delete");

const hActivo        = document.getElementById("h-activo");
const hMision        = document.getElementById("h-mision");
const hParroquia     = document.getElementById("h-parroquia");
const hComunidad     = document.getElementById("h-comunidad");
const hSexo          = document.getElementById("h-sexo");
const hFechaNac      = document.getElementById("h-fecha-nacimiento");
const hRazon         = document.getElementById("h-razon");
const hEstadoCivil   = document.getElementById("h-estado-civil");
const hNombre1       = document.getElementById("h-nombre1");
const hNombre2       = document.getElementById("h-nombre2");
const hApellido1     = document.getElementById("h-apellido1");
const hApellido2     = document.getElementById("h-apellido2");
const hCorreo        = document.getElementById("h-correo");
const hTelefono      = document.getElementById("h-telefono");
const hDireccion     = document.getElementById("h-direccion");
const btnLocation    = document.getElementById("btn-location");
const locStatus      = document.getElementById("location-status");
const hLat           = document.getElementById("h-lat");
const hLng           = document.getElementById("h-lng");

// Nuevos inputs
const hEsposoGroup   = document.getElementById("h-esposo-group");
const hEsposoSelect  = document.getElementById("h-esposo-select");
const hNumRespGroup  = document.getElementById("h-num-responsable-group");
const hNumResp       = document.getElementById("h-num-responsable");
const hHijosCant     = document.getElementById("h-hijos-cantidad");
const hHijosTablaGrp = document.getElementById("h-hijos-tabla-group");
const hHijosTbody    = document.getElementById("h-hijos-tbody");
const carismasGrid   = document.getElementById("h-carismas-check-grid");

// Estado
let todosHermanos        = [];
let todosCarismas        = [];
let cachedParroquias     = {}; // id -> nombre
let cachedComunidades    = {}; // id -> nombre (Comunidad X)
let catechistMap         = {}; // hermanoId -> array of community names
let currentSortColumn    = "nombre";
let currentSortDir       = "asc";
let activeFilters        = { nombre: [], parroquia: [], comunidad: [], telefono: [], responsable: [] };
let editingId            = null;
let originalSpouseId     = null;
let currentHijosList     = []; // Lista temporal de hijos para edicion [{nombre, cumple}]
let currentUserRole      = "hermano";
let currentUserComunidadId = null;
window.currentPrintedHermanos = [];

window.addEventListener("app:ready", async (e) => {
    const user = e.detail;
    try {
        const uSnap = await getDoc(doc(db, "autenticados", user.email.toLowerCase()));
        if (uSnap.exists()) {
            currentUserRole = uSnap.data().rol || "hermano";
            currentUserComunidadId = uSnap.data().comunidadId || null;
        }
    } catch(err) { console.error(err); }

    enforcePermissions();
    await loadParroquias();
    await cacheAllComunidades();
    await loadCarismas();
    await loadMisiones();
    await loadHermanos();
    setupCivilStateToggle();
    setupHijosTableTrigger();
    setupRazonToggle();
    setupSortingListeners();
    setupColumnRightClickFilters();
    makeTableResizable(document.getElementById("hermanos-table"));

    
    // Recargar conyuges si cambia comunidad o sexo
    hComunidad.addEventListener("change", reloadConyugesDropdown);
    hSexo.addEventListener("change", reloadConyugesDropdown);

    hTelefono.addEventListener("input", (e) => {
        e.target.value = formatPhoneString(e.target.value);
    });
});

function formatPhoneString(phone) {
    if (!phone) return "";
    const clean = phone.replace(/\D/g, "");
    if (clean.length === 10) {
        return `(${clean.slice(0, 3)}) ${clean.slice(3, 6)}-${clean.slice(6)}`;
    }
    return phone;
}

async function cacheAllComunidades() {
    try {
        const snap = await getDocs(collectionGroup(db, "comunidades"));
        catechistMap = {};
        snap.forEach(d => {
            const data = d.data();
            const cName = `Comunidad ${data.numero || d.id}`;
            cachedComunidades[d.id] = cName;
            
            if (data.catequistaId) {
                const parroquiaId = d.ref.parent.parent.id;
                const pNombre = cachedParroquias[parroquiaId] || "Parroquia Desconocida";
                const cNum = data.numero || d.id;
                
                if (!catechistMap[data.catequistaId]) {
                    catechistMap[data.catequistaId] = {};
                }
                if (!catechistMap[data.catequistaId][pNombre]) {
                    catechistMap[data.catequistaId][pNombre] = [];
                }
                catechistMap[data.catequistaId][pNombre].push(cNum);
            }
        });
    } catch(e) {
        console.error("Error caching communities:", e);
    }
}

function setupSortingListeners() {
    document.getElementById("th-nombre").addEventListener("click", () => handleSort("nombre"));
    document.getElementById("th-parroquia").addEventListener("click", () => handleSort("parroquia"));
    document.getElementById("th-comunidad").addEventListener("click", () => handleSort("comunidad"));
    document.getElementById("th-telefono").addEventListener("click", () => handleSort("telefono"));
    document.getElementById("th-responsable").addEventListener("click", () => handleSort("responsable"));
}

const efMenu = document.getElementById("excel-filter-menu");
const efClose = document.getElementById("ef-close");
const efSearch = document.getElementById("ef-search");
const efList = document.getElementById("ef-list");
const efBtnCancel = document.getElementById("ef-btn-cancel");
const efBtnApply = document.getElementById("ef-btn-apply");

let efCurrentColumn = "";
let efCurrentValues = [];

function updateHeaderLabels() {
    const cols = {
        "nombre": "Nombre Completo",
        "parroquia": "Parroquia",
        "comunidad": "Comunidad",
        "telefono": "Teléfono",
        "responsable": "Responsable"
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
            clearBtn = ` <span style="color:#e74c3c; cursor:pointer; font-weight:bold; margin-left:6px;" onclick="window.clearColumnFilter(event, '${k}')" title="Limpiar filtro de esta columna">❌</span>`;
        }

        th.innerHTML = `${cols[k]} ${arrow}${clearBtn}`;
    });
}

window.clearColumnFilter = (e, col) => {
    e.stopPropagation();
    activeFilters[col] = [];
    updateHeaderLabels();
    
    const q = searchInput.value.toLowerCase().trim();
    if (q) {
        triggerSearch(q);
    } else {
        renderTable(todosHermanos);
    }
};

function setupColumnRightClickFilters() {
    const cols = ["nombre", "parroquia", "comunidad", "telefono", "responsable"];
    
    cols.forEach(k => {
        const th = document.getElementById(`th-${k}`);
        if (!th) return;
        
        th.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            openExcelFilter(k, e.clientX, e.clientY);
        });
    });

    // Eventos del menú flotante de Excel
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

    let filteredList = [...todosHermanos];
    const loggedEmail = auth.currentUser?.email;
    if (loggedEmail) {
        const me = todosHermanos.find(h => h.correo?.toLowerCase() === loggedEmail.toLowerCase());
        const isCreator = loggedEmail.toLowerCase().includes("dbaezh");
        if (me && me.comunidadId && !isCreator) {
            filteredList = filteredList.filter(h => h.comunidadId === me.comunidadId);
        }
    }

    const uniqueVals = new Set();
    filteredList.forEach(h => {
        let val = "";
        if (colKey === "nombre") {
            val = `${h.primerNombre} ${h.segundoNombre||""} ${h.primerApellido} ${h.segundoApellido||""}`.replace(/\s+/g, ' ').trim();
        } else if (colKey === "parroquia") {
            val = cachedParroquias[h.parroquiaId] || "—";
        } else if (colKey === "comunidad") {
            val = cachedComunidades[h.comunidadId] || "—";
        } else if (colKey === "telefono") {
            val = h.telefono || "—";
        } else if (colKey === "responsable") {
            val = h.razon || "Hermano";
            if (h.razon === "Responsable" && h.posicionResponsable) {
                val = `Responsable (${h.posicionResponsable}°)`;
            } else if (h.razon === "Comunidad Celeste") {
                val = "👼 Celeste";
            }
        }
        uniqueVals.add(val);
    });

    efCurrentValues = Array.from(uniqueVals).sort((a, b) => a.localeCompare(b));
    renderExcelFilterList();
}

function renderExcelFilterList() {
    const q = efSearch.value.toLowerCase().trim();
    efList.innerHTML = "";

    const allChecked = activeFilters[efCurrentColumn].length === 0 || efCurrentValues.every(val => activeFilters[efCurrentColumn].includes(val));
    
    const selectAllItem = document.createElement("label");
    selectAllItem.className = "ef-item";
    selectAllItem.style.fontWeight = "bold";
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
        if (q && !val.toLowerCase().includes(q)) return;

        const isChecked = activeFilters[efCurrentColumn].length === 0 || activeFilters[efCurrentColumn].includes(val);
        const item = document.createElement("label");
        item.className = "ef-item";
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
    
    const q = searchInput.value.toLowerCase().trim();
    if (q) {
        triggerSearch(q);
    } else {
        renderTable(todosHermanos);
    }
}

function handleSort(column) {
    if (currentSortColumn === column) {
        currentSortDir = currentSortDir === "asc" ? "desc" : "asc";
    } else {
        currentSortColumn = column;
        currentSortDir = "asc";
    }
    
    updateHeaderLabels();
    
    const q = searchInput.value.toLowerCase().trim();
    if (q) {
        triggerSearch(q);
    } else {
        renderTable(todosHermanos);
    }
}

// ── Cargar Carismas para el formulario ────────────
async function loadCarismas() {
    try {
        const snap = await getDocs(query(collection(db, "carismas"), orderBy("nombre")));
        todosCarismas = [];
        snap.forEach(d => todosCarismas.push({ id: d.id, ...d.data() }));
        renderCarismasChecks();
    } catch(e) {
        console.error("Error al cargar carismas:", e);
    }
}

// ── Cargar Misiones para el formulario ────────────
let todosMisiones = [];
async function loadMisiones() {
    try {
        const snap = await getDocs(query(collection(db, "misiones"), orderBy("nombre")));
        todosMisiones = [];
        if (hMision) {
            hMision.innerHTML = '<option value="">— Ninguna —</option>';
            snap.forEach(d => {
                const data = d.data();
                todosMisiones.push({ id: d.id, ...data });
                hMision.appendChild(new Option(data.nombre, data.nombre));
            });
        }
    } catch(e) {
        console.error("Error al cargar misiones:", e);
    }
}

function renderCarismasChecks() {
    carismasGrid.innerHTML = "";
    todosCarismas.forEach(c => {
        const label = document.createElement("label");
        label.className = "realidad-check-item";
        label.innerHTML = `
            <input type="checkbox" name="h-carisma-check" value="${c.nombre}">
            ${c.icono || "🔘"} ${c.nombre}
        `;
        carismasGrid.appendChild(label);
    });
}

function getSelectedCarismas() {
    return Array.from(document.querySelectorAll('input[name="h-carisma-check"]:checked')).map(cb => cb.value);
}

function setSelectedCarismas(lista = []) {
    document.querySelectorAll('input[name="h-carisma-check"]').forEach(cb => {
        cb.checked = lista.includes(cb.value);
    });
}

// ── Cargar Parroquias / Comunidades ───────────────
async function loadParroquias() {
    const snap = await getDocs(query(collection(db, "parroquias"), orderBy("nombre")));
    hParroquia.innerHTML = '<option value="">— Seleccionar parroquia —</option>';
    snap.forEach(d => {
        cachedParroquias[d.id] = d.data().nombre;
        hParroquia.appendChild(new Option(d.data().nombre, d.id));
    });
}

async function loadComunidadesForParroquia(pid) {
    hComunidad.innerHTML = '<option value="">— Seleccionar comunidad —</option>';
    if (!pid) { hComunidad.disabled = true; return; }
    
    hComunidad.disabled = true;
    hComunidad.innerHTML = '<option value="">Cargando...</option>';
    try {
        const snap = await getDocs(collection(db, "parroquias", pid, "comunidades"));
        hComunidad.innerHTML = '<option value="">— Seleccionar comunidad —</option>';
        
        let comunidades = [];
        snap.forEach(d => comunidades.push({ id: d.id, numero: d.data().numero || d.id }));
        comunidades.sort((a,b) => a.numero - b.numero);
        
        comunidades.forEach(c => {
            hComunidad.appendChild(new Option(`Comunidad ${c.numero}`, c.id));
        });
        hComunidad.disabled = false;
    } catch(e) {
        console.error("Error al cargar comunidades:", e);
        hComunidad.innerHTML = '<option value="">Error al cargar</option>';
    }
}

hParroquia.addEventListener("change", async () => {
    await loadComunidadesForParroquia(hParroquia.value);
});

// ── Cargar Hermanos ───────────────────────────────
async function loadHermanos() {
    loadingState.style.display = "flex";
    tableCard.style.display = "none";
    emptyState.style.display = "none";

    const snap = await getDocs(collection(db, "hermanos"));
    todosHermanos = [];
    snap.forEach(d => {
        todosHermanos.push({ id: d.id, ...d.data() });
    });

    todosHermanos.sort((a, b) => {
        const nomA = `${a.primerNombre || ""} ${a.primerApellido || ""}`.toLowerCase();
        const nomB = `${b.primerNombre || ""} ${b.primerApellido || ""}`.toLowerCase();
        return nomA.localeCompare(nomB);
    });

    loadingState.style.display = "none";
    renderTable(todosHermanos);
}

function renderTable(lista) {
    renderActiveFilterChips();
    let filteredList = [...lista];
    const loggedEmail = auth.currentUser?.email;
    if (loggedEmail) {
        const me = todosHermanos.find(h => h.correo?.toLowerCase() === loggedEmail.toLowerCase());
        const isCreator = loggedEmail.toLowerCase().includes("dbaezh");
        if (me && me.comunidadId && !isCreator) {
            filteredList = filteredList.filter(h => h.comunidadId === me.comunidadId);
        }
    }

    // Aplicar filtros por columna
    if (activeFilters.nombre && activeFilters.nombre.length > 0) {
        filteredList = filteredList.filter(h => {
            const full = `${h.primerNombre} ${h.segundoNombre||""} ${h.primerApellido} ${h.segundoApellido||""}`.replace(/\s+/g, ' ').trim();
            return activeFilters.nombre.includes(full);
        });
    }
    if (activeFilters.parroquia && activeFilters.parroquia.length > 0) {
        filteredList = filteredList.filter(h => {
            const pNombre = cachedParroquias[h.parroquiaId] || "—";
            return activeFilters.parroquia.includes(pNombre);
        });
    }
    if (activeFilters.comunidad && activeFilters.comunidad.length > 0) {
        filteredList = filteredList.filter(h => {
            const cNombre = cachedComunidades[h.comunidadId] || "—";
            return activeFilters.comunidad.includes(cNombre);
        });
    }
    if (activeFilters.telefono && activeFilters.telefono.length > 0) {
        filteredList = filteredList.filter(h => {
            const tel = h.telefono || "—";
            return activeFilters.telefono.includes(tel);
        });
    }
    if (activeFilters.responsable && activeFilters.responsable.length > 0) {
        filteredList = filteredList.filter(h => {
            let role = h.razon || "Hermano";
            if (h.razon === "Responsable" && h.posicionResponsable) {
                role = `Responsable (${h.posicionResponsable}°)`;
            } else if (h.razon === "Comunidad Celeste") {
                role = "👼 Celeste";
            }
            return activeFilters.responsable.includes(role);
        });
    }

    if (filteredList.length === 0) {
        tableCard.style.display = "none";
        emptyState.style.display = "block";
        return;
    }

    // Ordenar por columna seleccionada
    filteredList.sort((a, b) => {
        let valA = "";
        let valB = "";

        if (currentSortColumn === "nombre") {
            valA = `${a.primerNombre || ""} ${a.primerApellido || ""}`.toLowerCase();
            valB = `${b.primerNombre || ""} ${b.primerApellido || ""}`.toLowerCase();
        } else if (currentSortColumn === "parroquia") {
            valA = (cachedParroquias[a.parroquiaId] || "").toLowerCase();
            valB = (cachedParroquias[b.parroquiaId] || "").toLowerCase();
        } else if (currentSortColumn === "comunidad") {
            valA = (cachedComunidades[a.comunidadId] || "").toLowerCase();
            valB = (cachedComunidades[b.comunidadId] || "").toLowerCase();
        } else if (currentSortColumn === "telefono") {
            valA = (a.telefono || "").toLowerCase();
            valB = (b.telefono || "").toLowerCase();
        } else if (currentSortColumn === "responsable") {
            valA = (a.razon || "").toLowerCase() + (a.posicionResponsable || "");
            valB = (b.razon || "").toLowerCase() + (b.posicionResponsable || "");
        }

        if (currentSortDir === "asc") {
            return valA.localeCompare(valB);
        } else {
            return valB.localeCompare(valA);
        }
    });

    window.currentPrintedHermanos = filteredList;
    emptyState.style.display = "none";
    tableCard.style.display = "block";
    tbody.innerHTML = "";
    
    filteredList.forEach(h => {
        const nombreCompl = `${h.primerNombre} ${h.segundoNombre||""} ${h.primerApellido} ${h.segundoApellido||""}`.replace(/\s+/g, ' ').trim();
        const pNombre = cachedParroquias[h.parroquiaId] || "—";
        const cNombre = formatComunidadName(cachedComunidades[h.comunidadId] || "—");
        const tr = document.createElement("tr");
        
        const locIcon = h.location?.lat 
            ? `<a href="https://maps.google.com/?q=${h.location.lat},${h.location.lng}" target="_blank" style="text-decoration:none;">📍</a>` 
            : `<span style="color:#ccc;">—</span>`;

        // Render tags de carismas con iconos
        let carismasTags = "";
        if (h.carismas && h.carismas.length > 0) {
            carismasTags = `<div class="carismas-list">` + h.carismas.map(name => {
                const info = todosCarismas.find(tc => tc.nombre === name);
                const ico = info?.icono || "🔘";
                return `<span class="carisma-tag">${ico} ${name}</span>`;
            }).join("") + `</div>`;
        }

        // Tag de razon / responsable
        let razonBadge = `<span class="badge-rol badge-hno">${h.razon || "Hermano"}</span>`;
        if (h.razon === "Comunidad Celeste") {
            razonBadge = `<span class="badge-rol" style="background: gold; color: white; font-weight: bold;">👼 Celeste</span>`;
        } else if (h.razon === "Responsable") {
            let label = "Responsable";
            let suffix = h.posicionResponsable ? ` (${h.posicionResponsable}°)` : "";
            if (window.innerWidth < 992) {
                label = "RESP.";
                suffix = h.posicionResponsable ? ` ${h.posicionResponsable}°` : "";
            }
            razonBadge = `<span class="badge-rol badge-1ro">${label}${suffix}</span>`;
        }

        // Badge de activo / inactivo
        let activoBadge = "";
        if (h.activo === false) {
            activoBadge = `<span style="margin-left:8px; font-size:0.68rem; background:#f8d7da; color:#721c24; padding:2px 6px; border-radius:4px; font-weight:600; font-family:'Segoe UI',sans-serif;">Inactivo</span>`;
        }

        const hId = h.id;
        const isCatequista = catechistMap[hId] && Object.keys(catechistMap[hId]).length > 0;
        let tooltipText = "";
        if (isCatequista) {
            const pParts = [];
            for (const [pName, cNums] of Object.entries(catechistMap[hId])) {
                pParts.push(`${pName} (${cNums.sort().join(', ')})`);
            }
            tooltipText = `Catequista de: ${pParts.join(', ')}`;
        }
        const catequistaAsterisk = isCatequista 
            ? `<span style="color:#28a745; font-weight:bold; cursor:help; font-size:1.15rem; margin-left:4px;" title="${tooltipText}">*</span>`
            : "";

        tr.innerHTML = `
            <td>
                <div><strong>${nombreCompl}</strong>${catequistaAsterisk} ${activoBadge}</div>
            </td>
            <td>${pNombre}</td>
            <td>${cNombre}</td>
            <td>${h.telefono ? `<a href="${getWhatsAppLink(h.telefono)}" target="_blank" style="text-decoration:none; color:inherit; font-weight:600;" title="Abrir chat de WhatsApp">${formatPhoneString(h.telefono)}</a>` : "—"}</td>
            <td style="text-align:center;">${razonBadge}</td>
            <td style="text-align:center;">${locIcon}</td>
            <td style="text-align:center;">
                ${window.hasPermission("hermanos_ver") ? `<button class="btn btn-sm btn-outline btn-view" data-id="${h.id}" title="Ver hermano" style="margin-right:4px;">👁️</button>` : ""}
                ${window.hasPermission("hermanos_editar") ? `<button class="btn btn-sm btn-outline btn-edit" data-id="${h.id}">✏️</button>` : ""}
            </td>
        `;
        
        const cellNombre = tr.querySelector("td:first-child");
        if (cellNombre) {
            cellNombre.style.cursor = "pointer";
            cellNombre.addEventListener("click", (e) => {
                if (e.target.tagName !== "A" && e.target.tagName !== "BUTTON") {
                    openViewForm(h);
                }
            });
        }

        const btnView = tr.querySelector(".btn-view");
        if (btnView) {
            btnView.addEventListener("click", (e) => {
                e.stopPropagation();
                openViewForm(h);
            });
        }

        const btnEdit = tr.querySelector(".btn-edit");
        if (btnEdit) {
            btnEdit.addEventListener("click", (e) => {
                e.stopPropagation();
                openEditForm(h);
            });
        }
        tbody.appendChild(tr);
    });
}

// ── Búsqueda ──────────────────────────────────────
function triggerSearch(q) {
    const filtrados = todosHermanos.filter(h => {
        const full = `${h.primerNombre} ${h.segundoNombre||""} ${h.primerApellido} ${h.segundoApellido||""}`.toLowerCase();
        const parroquia = (cachedParroquias[h.parroquiaId] || "").toLowerCase();
        const comunidad = (cachedComunidades[h.comunidadId] || "").toLowerCase();
        const telefono = (h.telefono || "").toLowerCase();
        const razon = (h.razon || "").toLowerCase();
        return full.includes(q) || parroquia.includes(q) || comunidad.includes(q) || telefono.includes(q) || razon.includes(q);
    });
    renderTable(filtrados);
}

searchInput.addEventListener("input", () => {
    const q = searchInput.value.toLowerCase().trim();
    if (!q) { renderTable(todosHermanos); return; }
    triggerSearch(q);
});

// ── Toggles de Estado Civil ────────────────────────
function setupCivilStateToggle() {
    hEstadoCivil.addEventListener("change", () => {
        if (hEstadoCivil.value === "Casado") {
            hEsposoGroup.style.display = "flex";
            reloadConyugesDropdown();
        } else {
            hEsposoGroup.style.display = "none";
            hEsposoSelect.value = "";
        }
    });

    hEsposoSelect.addEventListener("change", () => {
        const spouseId = hEsposoSelect.value;
        if (!spouseId) return;

        const spouse = todosHermanos.find(h => h.id === spouseId);
        if (spouse && spouse.hijos && spouse.hijos.length > 0) {
            if (parseInt(hHijosCant.value) === 0) {
                hHijosCant.value = spouse.hijos.length;
                renderHijosTableRows(spouse.hijos.length, spouse.hijos);
            }
        }
    });
}

// ── Toggles de Razón Responsable ───────────────────
function setupRazonToggle() {
    hRazon.addEventListener("change", () => {
        if (hRazon.value === "Responsable") {
            hNumRespGroup.style.display = "flex";
        } else {
            hNumRespGroup.style.display = "none";
            hNumResp.value = "1";
        }
    });
}

// Recargar los hermanos/as de la comunidad que tengan el sexo opuesto
function reloadConyugesDropdown() {
    const comId = hComunidad.value;
    const sexo = hSexo.value;
    
    hEsposoSelect.innerHTML = '<option value="">— Seleccionar cónyuge —</option>';
    if (!comId) return;

    // Buscar sexo opuesto
    const sexoOpuesto = sexo === "M" ? "F" : "M";

    // Filtrar candidatos
    const candidatos = todosHermanos.filter(h => 
        h.comunidadId === comId && 
        h.sexo === sexoOpuesto && 
        h.id !== editingId
    );

    candidatos.forEach(c => {
        const nombre = `${c.primerNombre} ${c.primerApellido}`;
        hEsposoSelect.appendChild(new Option(nombre, c.id));
    });
}

function setupHijosTableTrigger() {
    hHijosCant.addEventListener("input", () => {
        const cant = parseInt(hHijosCant.value) || 0;
        
        // Conservar los valores escritos actualmente en las celdas
        const currentVals = [];
        const rows = hHijosTbody.querySelectorAll("tr");
        rows.forEach(tr => {
            const nomInput = tr.querySelector(".hijo-nombre-row");
            const cumInput = tr.querySelector(".hijo-cumple-row");
            currentVals.push({
                nombre: nomInput ? nomInput.value : "",
                cumple: cumInput ? cumInput.value : ""
            });
        });
        
        renderHijosTableRows(cant, currentVals);
    });
}

function renderHijosTableRows(cantidad, dataPrevia = []) {
    if (cantidad <= 0) {
        hHijosTablaGrp.style.display = "none";
        hHijosTbody.innerHTML = "";
        return;
    }

    hHijosTablaGrp.style.display = "flex";
    hHijosTbody.innerHTML = "";

    for (let i = 0; i < cantidad; i++) {
        const prev = dataPrevia[i] || { nombre: "", cumple: "" };
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td><input type="text" class="hijo-nombre-row" value="${prev.nombre}" placeholder="Nombre del hijo/a" style="width:100%; padding:6px; border:1px solid var(--border); border-radius:4px;"></td>
            <td><input type="date" class="hijo-cumple-row" value="${prev.cumple}" style="width:100%; padding:6px; border:1px solid var(--border); border-radius:4px;"></td>
        `;
        hHijosTbody.appendChild(tr);
    }
}

function getHijosTableData() {
    const rows = hHijosTbody.querySelectorAll("tr");
    const lista = [];
    rows.forEach(tr => {
        const nom = tr.querySelector(".hijo-nombre-row").value.trim();
        const cum = tr.querySelector(".hijo-cumple-row").value;
        if (nom) {
            lista.push({ nombre: nom, cumple: cum || null });
        }
    });
    return lista;
}

// ── Nuevo / Editar / Cancelar ─────────────────────
btnNuevo.addEventListener("click", () => {
    editingId = null;
    clearForm();
    formTitle.textContent = "📋 Registrar Nuevo Hermano";
    btnDelete.style.display = "none";
    listPanel.style.display = "none";
    formPanel.style.display = "block";
});

async function openEditForm(h) {
    editingId = h.id;
    clearForm();
    formTitle.textContent = `✏️ Editar: ${h.primerNombre} ${h.primerApellido}`;
    
    hActivo.value = h.activo === false ? "false" : "true";
    hMision.value = h.mision || "";
    hParroquia.value = h.parroquiaId || "";
    if (h.parroquiaId) {
        await loadComunidadesForParroquia(h.parroquiaId);
        hComunidad.value = h.comunidadId || "";
    }
    
    hSexo.value = h.sexo || "M";
    hFechaNac.value = h.fechaNacimiento || "";
    hRazon.value = h.razon || "Hermano";
    hRazon.dispatchEvent(new Event('change'));
    if (h.razon === "Responsable") {
        hNumResp.value = h.posicionResponsable ? String(h.posicionResponsable) : "1";
    }
    hEstadoCivil.value = h.estadoCivil || "Soltero";
    
    // Forzar render del dropdown de cónyuge
    hEstadoCivil.dispatchEvent(new Event('change'));
    if (h.estadoCivil === "Casado") {
        hEsposoSelect.value = h.esposoId || "";
        originalSpouseId = h.esposoId || null;
    } else {
        originalSpouseId = null;
    }

    hNombre1.value = h.primerNombre || "";
    hNombre2.value = h.segundoNombre || "";
    hApellido1.value = h.primerApellido || "";
    hApellido2.value = h.segundoApellido || "";
    hCorreo.value = h.correo || "";
    hTelefono.value = h.telefono || "";
    hDireccion.value = h.direccion || "";
    
    // Hijos table rendering
    const listaHijos = h.hijos || [];
    hHijosCant.value = listaHijos.length || h.hijosCantidad || 0;
    renderHijosTableRows(parseInt(hHijosCant.value), listaHijos);

    setSelectedCarismas(h.carismas || []);

    if (h.location?.lat) {
        hLat.value = h.location.lat;
        hLng.value = h.location.lng;
        locStatus.textContent = `📍 Registrada`;
        btnLocation.textContent = "📍 Actualizar ubicación";
        btnLocation.classList.add("got");
    }
    
    btnDelete.style.display = (window.hasPermission && window.hasPermission("hermanos_eliminar")) ? "inline-flex" : "none";
    listPanel.style.display = "none";
    formPanel.style.display = "block";
}

async function openViewForm(h) {
    await openEditForm(h);
    formTitle.textContent = `👁️ Consultar: ${h.primerNombre} ${h.primerApellido}`;
    
    // Disable all inputs in the form
    const inputs = formPanel.querySelectorAll("input, select, textarea, button:not(#btn-cancel)");
    inputs.forEach(input => {
        if (input.id === "btn-delete") return;
        input.disabled = true;
    });

    // Hide save button
    const btnSave = document.getElementById("btn-save");
    if (btnSave) btnSave.style.display = "none";
    
    // Hide delete button
    const btnDelete = document.getElementById("btn-delete");
    if (btnDelete) btnDelete.style.display = "none";
}

btnCancel.addEventListener("click", () => {
    formPanel.style.display = "none";
    listPanel.style.display = "block";
});

function clearForm() {
    const inputs = formPanel.querySelectorAll("input, select, textarea, button");
    inputs.forEach(input => {
        input.disabled = false;
    });

    // Re-enforce normal permissions (like if they don't have hermanos_cambiar_activo)
    enforcePermissions();

    hActivo.value = "true";
    hMision.value = "";
    hParroquia.value = "";
    hComunidad.innerHTML = '<option value="">— Primero parroquia —</option>';
    hComunidad.disabled = true;
    hSexo.value = "M";
    hRazon.value = "Hermano";
    hRazon.dispatchEvent(new Event('change'));
    hEstadoCivil.value = "Soltero";
    originalSpouseId = null;
    hEstadoCivil.dispatchEvent(new Event('change'));

    hFechaNac.value = hNombre1.value = hNombre2.value = "";
    hApellido1.value = hApellido2.value = hCorreo.value = "";
    hTelefono.value = hDireccion.value = hLat.value = hLng.value = "";
    
    hHijosCant.value = 0;
    renderHijosTableRows(0);

    setSelectedCarismas([]);
    
    locStatus.textContent = "";
    btnLocation.textContent = "📍 Obtener ubicación actual";
    btnLocation.classList.remove("got");
}

// ── Geolocalización ───────────────────────────────
btnLocation.addEventListener("click", () => {
    if (!navigator.geolocation) { locStatus.textContent = "❌ No disponible en este navegador."; return; }
    locStatus.textContent = "📡 Obteniendo ubicación...";
    btnLocation.disabled = true;
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            hLat.value = pos.coords.latitude;
            hLng.value = pos.coords.longitude;
            locStatus.textContent = `✅ Listo`;
            btnLocation.textContent = "📍 Ubicación guardada ✓";
            btnLocation.classList.add("got");
            btnLocation.disabled = false;
        },
        (err) => { locStatus.textContent = `❌ Error: ${err.message}`; btnLocation.disabled = false; },
        { enableHighAccuracy: true, timeout: 10000 }
    );
});

// ── Guardar ───────────────────────────────────────
btnSave.addEventListener("click", async () => {
    if (!hParroquia.value || !hComunidad.value || !hNombre1.value.trim() || !hApellido1.value.trim()) {
        showAlert("Llene los campos obligatorios (*).", "error");
        return;
    }

    const conyugeId = hEstadoCivil.value === "Casado" ? hEsposoSelect.value : null;
    const conyugeOpt = hEsposoSelect.querySelector(`option[value="${conyugeId}"]`);
    const conyugeNombre = conyugeOpt ? conyugeOpt.textContent : null;

    const listaHijosFinal = getHijosTableData();

    const data = {
        activo: hActivo.value === "true",
        mision: hMision.value || null,
        parroquiaId: hParroquia.value,
        comunidadId: hComunidad.value,
        sexo: hSexo.value,
        fechaNacimiento: hFechaNac.value || null,
        razon: hRazon.value,
        posicionResponsable: hRazon.value === "Responsable" ? parseInt(hNumResp.value) : null,
        estadoCivil: hEstadoCivil.value,
        esposoId: conyugeId,
        esposoNombre: conyugeNombre,
        hijosCantidad: listaHijosFinal.length,
        hijos: listaHijosFinal,
        carismas: getSelectedCarismas(),
        primerNombre: hNombre1.value.trim(),
        segundoNombre: hNombre2.value.trim(),
        primerApellido: hApellido1.value.trim(),
        segundoApellido: hApellido2.value.trim(),
        correo: hCorreo.value.trim(),
        telefono: hTelefono.value.trim(),
        direccion: hDireccion.value.trim(),
        location: hLat.value ? { lat: parseFloat(hLat.value), lng: parseFloat(hLng.value) } : null,
        updatedAt: new Date().toISOString()
    };

    btnSave.disabled = true;
    try {
        let savedId = editingId;
        if (editingId) {
            await updateDoc(doc(db, "hermanos", editingId), data);
            showAlert("✅ Hermano actualizado.", "success");
        } else {
            data.createdAt = new Date().toISOString();
            const docRef = await addDoc(collection(db, "hermanos"), data);
            savedId = docRef.id;
            showAlert("✅ Hermano registrado.", "success");
        }

        // Sincronizar cambios de comunidad al usuario autenticado (si ya se ha logueado)
        if (data.correo) {
            try {
                const uDocRef = doc(db, "autenticados", data.correo.toLowerCase());
                const uSnap = await getDoc(uDocRef);
                if (uSnap.exists()) {
                    await updateDoc(uDocRef, {
                        comunidadId: data.comunidadId,
                        parroquiaId: data.parroquiaId
                    });
                }
            } catch (e) {
                console.error("Error syncing community to user profile:", e);
            }
        }

        // --- ACTUALIZACIONES BIDIRECCIONALES DE PAREJA ---
        const miNombreCompleto = `${data.primerNombre} ${data.primerApellido}`;

        // Caso 1: Tenía pareja anterior y cambió/se eliminó. Limpiar a la ex-pareja.
        if (originalSpouseId && originalSpouseId !== conyugeId) {
            try {
                await updateDoc(doc(db, "hermanos", originalSpouseId), {
                    esposoId: null,
                    esposoNombre: null,
                    estadoCivil: "Soltero"
                });
            } catch(e) { console.error("Error al desvincular pareja anterior:", e); }
        }

        // Caso 2: Tiene una pareja asignada. Vincularla de forma recíproca, sincronizar hijos y rol de responsable.
        if (conyugeId) {
            try {
                const spouseData = todosHermanos.find(x => x.id === conyugeId);
                let spouseRazon = data.razon;
                if (data.razon !== "Responsable") {
                    spouseRazon = (spouseData?.sexo === "F") ? "Hermana" : "Hermano";
                }

                await updateDoc(doc(db, "hermanos", conyugeId), {
                    esposoId: savedId,
                    esposoNombre: miNombreCompleto,
                    estadoCivil: "Casado",
                    hijosCantidad: data.hijosCantidad,
                    hijos: data.hijos,
                    razon: spouseRazon,
                    posicionResponsable: data.posicionResponsable
                });
            } catch(e) { console.error("Error al vincular pareja, hijos y rol de forma recíproca:", e); }
        }

        formPanel.style.display = "none";
        listPanel.style.display = "block";
        await loadHermanos();
    } catch (err) {
        showAlert("Error: " + err.message, "error");
    } finally {
        btnSave.disabled = false;
    }
});

// ── Eliminar (Borrado definitivo) ──────────────────
btnDelete.addEventListener("click", async () => {
    if (!editingId) return;
    const confirmDelete = await window.customConfirm(
        "Eliminar Hermano",
        "¿Seguro que deseas ELIMINAR permanentemente a este hermano/a de la base de datos? Esta acción no se puede deshacer.",
        { icon: "🗑️", danger: true }
    );
    if (!confirmDelete) return;
    
    try {
        await deleteDoc(doc(db, "hermanos", editingId));
        formPanel.style.display = "none";
        listPanel.style.display = "block";
        showAlert("🗑️ Hermano eliminado permanentemente.", "success");
        await loadHermanos();
    } catch (err) {
        showAlert("Error: " + err.message, "error");
    }
});

// ── Helpers ───────────────────────────────────────
function showAlert(msg, type = "info") {
    globalAlert.textContent = msg;
    globalAlert.className = `alert alert-${type} visible`;
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (type === "success") setTimeout(() => { globalAlert.className = "alert"; }, 3500);
}

function makeTableResizable(table) {
    if (!table) return;
    const cols = table.querySelectorAll("th");
    cols.forEach(col => {
        if (col.textContent.includes("Ubic.") || col.textContent.includes("Acciones")) return;
        
        const existing = col.querySelector(".resizer");
        if (existing) existing.remove();

        const resizer = document.createElement("div");
        resizer.className = "resizer";
        col.appendChild(resizer);

        createResizableColumn(col, resizer);
    });
}

function createResizableColumn(col, resizer) {
    let x = 0;
    let w = 0;

    const mouseMoveHandler = function (e) {
        const dx = e.clientX - x;
        col.style.width = `${w + dx}px`;
    };

    const mouseUpHandler = function () {
        resizer.classList.remove("resizing");
        document.removeEventListener("mousemove", mouseMoveHandler);
        document.removeEventListener("mouseup", mouseUpHandler);
    };

    resizer.addEventListener("mousedown", function (e) {
        e.preventDefault();
        e.stopPropagation();
        
        x = e.clientX;
        const styles = window.getComputedStyle(col);
        w = parseInt(styles.width, 10);

        resizer.classList.add("resizing");

        document.addEventListener("mousemove", mouseMoveHandler);
        document.addEventListener("mouseup", mouseUpHandler);
    });
}

function getWhatsAppLink(phone) {
    if (!phone) return "";
    const cleaned = phone.replace(/\D/g, "");
    if (cleaned.length === 10) {
        return `https://wa.me/1${cleaned}`;
    }
    return `https://wa.me/${cleaned}`;
}

let filterHistory = []; // { type: 'parroquia'|'comunidad', name: string }

function renderActiveFilterChips() {
    const bar = document.getElementById("active-filters-chips-bar");
    if (!bar) return;

    if (currentUserRole !== "admin") {
        bar.style.display = "none";
        return;
    }

    // Sync active filters to history (bubbling recently activated filters to the front)
    activeFilters.parroquia.forEach(p => {
        filterHistory = filterHistory.filter(h => !(h.type === 'parroquia' && h.name === p));
        filterHistory.unshift({ type: 'parroquia', name: p });
    });
    activeFilters.comunidad.forEach(c => {
        filterHistory = filterHistory.filter(h => !(h.type === 'comunidad' && h.name === c));
        filterHistory.unshift({ type: 'comunidad', name: c });
    });

    // Limit to exactly the last 4 interacted items
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
        const isParroquia = item.type === 'parroquia';
        const isActive = isParroquia 
            ? activeFilters.parroquia.includes(item.name)
            : activeFilters.comunidad.includes(item.name);

        const chip = document.createElement("span");
        
        if (isActive) {
            if (isParroquia) {
                chip.style.cssText = "background:transparent; border:none; padding:0; border-radius:0; cursor:pointer; font-weight:600; color:#475569; display:inline-flex; align-items:center; gap:4px; font-size:0.85rem; margin-right:16px;";
            } else {
                chip.style.cssText = "background:transparent; border:none; padding:0; border-radius:0; cursor:pointer; font-weight:600; color:#dc3545; display:inline-flex; align-items:center; gap:4px; font-size:0.85rem; margin-right:16px;";
            }
            chip.innerHTML = `${item.name} <span style="color:#ef4444; font-weight:bold; font-size:0.75rem; margin-left:2px;">&times;</span>`;
            chip.title = "Remover filtro";
        } else {
            chip.style.cssText = "background:transparent; border:none; padding:0; border-radius:0; cursor:pointer; font-weight:500; color:#94a3b8; display:inline-flex; align-items:center; gap:4px; font-size:0.85rem; margin-right:16px; opacity:0.75;";
            chip.innerHTML = `${item.name}`;
            chip.title = "Re-aplicar este filtro";
        }

        chip.addEventListener("click", () => {
            if (isActive) {
                if (isParroquia) {
                    activeFilters.parroquia = activeFilters.parroquia.filter(val => val !== item.name);
                } else {
                    activeFilters.comunidad = activeFilters.comunidad.filter(val => val !== item.name);
                }
            } else {
                if (isParroquia) {
                    activeFilters.parroquia.push(item.name);
                } else {
                    activeFilters.comunidad.push(item.name);
                }
            }
            renderActiveFilterChips();
            renderTable(todosHermanos);
        });
        bar.appendChild(chip);
    });
}

function enforcePermissions() {
    if (!window.hasPermission) return;

    // Buscar
    const searchWrap = document.getElementById("search-input");
    if (searchWrap && !window.hasPermission("hermanos_buscar")) {
        searchWrap.style.display = "none";
    }

    // crear Nuevo Hermano
    const btnNuevo = document.getElementById("btn-nuevo-hermano");
    if (btnNuevo && !window.hasPermission("hermanos_crear")) {
        btnNuevo.style.display = "none";
    }

    // Eliminar hermano Creado
    const btnDelete = document.getElementById("btn-delete");
    if (btnDelete && !window.hasPermission("hermanos_eliminar")) {
        btnDelete.style.display = "none";
    }

    // Guardar Hermano creado o modificado
    const btnSave = document.getElementById("btn-save");
    if (btnSave && !window.hasPermission("hermanos_guardar")) {
        btnSave.style.display = "none";
    }

    // Cambiar de Activo a No Activo en edicion de hermano
    const hActivo = document.getElementById("h-activo");
    if (hActivo && !window.hasPermission("hermanos_cambiar_activo")) {
        hActivo.disabled = true;
    }
}

function formatComunidadName(name) {
    if (!name) return "—";
    if (window.innerWidth < 992) {
        return name.replace(/Comunidad\s+/gi, "COM ");
    }
    return name;
}

window.addEventListener("resize", () => {
    if (todosHermanos && todosHermanos.length > 0) {
        renderTable(todosHermanos);
    }
});
