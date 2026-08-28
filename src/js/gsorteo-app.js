import { db } from "./firebase.js";
import { 
    collection, doc, getDocs, getDoc, addDoc, updateDoc, deleteDoc, query, where, orderBy 
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

// DOM Elements
const selectParroquia = document.getElementById("sorteo-parroquia");
const selectComunidad = document.getElementById("sorteo-comunidad");
const labelEtapaActual = document.getElementById("sorteo-etapa-actual");

const tabs = document.querySelectorAll(".tab-btn");
const tabContents = document.querySelectorAll(".tab-content");

// Tab 1: Sorteo
const selectTipoSorteo = document.getElementById("asistente-tipo-sorteo");
const chkReutilizar = document.getElementById("chk-reutilizar-sorteo");
const selectReutilizar = document.getElementById("reutilizar-sorteo-select");
const reuseContainer = document.getElementById("reutilizar-sorteo-container");
const headsCheckboxesList = document.getElementById("heads-checkboxes-list");
const selectTamanoGrupos = document.getElementById("asistente-tamano-grupos");
const paramSimpleGroup = document.getElementById("param-simple-group");
const paramTemasGroup = document.getElementById("param-temas-group");
const selectTema = document.getElementById("asistente-tema-select");
const paramSalmosGroup = document.getElementById("param-salmos-group");
const selectSalmo = document.getElementById("asistente-salmo-select");
const inputFechaInicio = document.getElementById("asistente-fecha-inicio");
const btnEjecutarSorteo = document.getElementById("btn-ejecutar-sorteo");
const resultadosContainer = document.getElementById("resultados-sorteo-container");
const resultadosGrid = document.getElementById("resultados-grupos-grid");
const btnGuardarSorteo = document.getElementById("btn-guardar-sorteo");
const modalEncuestaTraditio = document.getElementById("modal-encuesta-traditio");
const modalEncuestaCardContainer = document.getElementById("modal-encuesta-card-container");
const btnCloseModalEncuesta = document.getElementById("btn-close-modal-encuesta");

// Tab 2: Historial
const historialListaContainer = document.getElementById("historial-lista-container");

// Tab 3: Presentados
const presentadosListaContainer = document.getElementById("presentados-lista-container");

// Tab 3: Temas
const temaForm = document.getElementById("tema-form");
const inputTemaNombre = document.getElementById("tema-nombre");
const selectTemaEtapa = document.getElementById("tema-etapa");
const btnCancelTema = document.getElementById("btn-cancel-tema");
const btnSaveTema = document.getElementById("btn-save-tema");
const temasTbody = document.getElementById("temas-tbody");
const temaFormTitle = document.getElementById("tema-form-title");

// App State
let allParroquias = [];
let allComunidades = [];
let allHermanos = [];
let cachedParroquias = {};
let cachedComunidades = {};
let selectedParroquiaId = "";
let selectedComunidadId = "";
let selectedComunidadNombre = "";
let selectedComunidadEtapa = "";
let currentEligibleHermanos = [];
let currentResults = null;
let editingTemaId = null;
let savedSorteos = [];
let allTemas = [];
let catalogTemas = [];
let allCatalogos = [];

let loggedInUserComunidadId = null;
let loggedInUserParroquiaId = null;
let loggedInUserRole = "hermano";

// App Init
document.addEventListener("DOMContentLoaded", async () => {
    // 1. Loader check
    const appContent = document.getElementById("app-content");
    if (appContent) appContent.style.display = "block";

    // 2. Tab switching
    tabs.forEach(t => {
        t.addEventListener("click", () => {
            tabs.forEach(tab => tab.classList.remove("active"));
            tabContents.forEach(content => content.classList.remove("active"));
            t.classList.add("active");
            const target = document.getElementById(t.dataset.tab);
            if (target) target.classList.add("active");
        });
    });

    // 3. Load Parroquias
    await loadParroquias();

    // 4. Set listeners
    selectParroquia.addEventListener("change", onParroquiaChange);
    selectComunidad.addEventListener("change", onComunidadChange);
    selectTipoSorteo.addEventListener("change", onTipoSorteoChange);
    chkReutilizar.addEventListener("change", onChkReutilizarChange);
    btnEjecutarSorteo.addEventListener("click", ejecutarSorteo);
    btnGuardarSorteo.addEventListener("click", guardarSorteoResultados);

    // Sorteos Externos Listeners
    const btnAgregarGrupoExterno = document.getElementById("btn-externo-agregar-grupo");
    if (btnAgregarGrupoExterno) {
        btnAgregarGrupoExterno.addEventListener("click", addExternoGroupCard);
    }
    const formSorteoExterno = document.getElementById("form-sorteo-externo");
    if (formSorteoExterno) {
        formSorteoExterno.addEventListener("submit", saveSorteoExterno);
    }
    const selectExternoTipoSorteo = document.getElementById("externo-tipo-sorteo");
    if (selectExternoTipoSorteo) {
        selectExternoTipoSorteo.addEventListener("change", () => {
            const container = document.getElementById("externo-grupos-list-container");
            if (container) container.innerHTML = "";
            externoGroupCounter = 0;
        });
    }

    if (btnCloseModalEncuesta) {
        btnCloseModalEncuesta.addEventListener("click", () => {
            modalEncuestaTraditio.classList.remove("open");
        });
    }
    if (modalEncuestaTraditio) {
        modalEncuestaTraditio.addEventListener("click", (e) => {
            if (e.target === modalEncuestaTraditio) {
                modalEncuestaTraditio.classList.remove("open");
            }
        });
    }
    
    // Tema form submit
    temaForm.addEventListener("submit", saveTema);
    btnCancelTema.addEventListener("click", resetTemaForm);

    // Populate Psalms select element
    if (selectSalmo) {
        selectSalmo.innerHTML = '<option value="">— Seleccionar Salmo —</option>';
        for (let i = 1; i <= 150; i++) {
            selectSalmo.appendChild(new Option(`Salmo ${i}`, i));
        }
    }

    // Initial themes load
    await loadTemas();
});

// App ready listener from Auth
window.addEventListener("app:ready", async (e) => {
    await loadCatalogosForSorteo();
    const user = e.detail;
    if (user && user.email) {
        try {
            const uSnap = await getDoc(doc(db, "autenticados", user.email.toLowerCase()));
            if (uSnap.exists()) {
                loggedInUserComunidadId = uSnap.data().comunidadId || null;
                loggedInUserParroquiaId = uSnap.data().parroquiaId || null;
                loggedInUserRole = uSnap.data().rol || "hermano";
            }
        } catch(err) {
            console.error("Error loading user profile in gsorteo:", err);
        }
    }

    if (loggedInUserParroquiaId && loggedInUserComunidadId) {
        selectParroquia.value = loggedInUserParroquiaId;
        await onParroquiaChange();
        
        selectComunidad.value = loggedInUserComunidadId;
        await onComunidadChange();

        const isNotAdmin = !window.userPermissions?.adminTotal && window.userPermissions?.rol !== "admin" && !window.hasPermission("sortear_ver");
        if (isNotAdmin) {
            const selectorCard = document.getElementById("selector-card");
            if (selectorCard) selectorCard.style.display = "none";

            selectParroquia.disabled = true;
            selectComunidad.disabled = true;

            const userBanner = document.getElementById("sorteo-user-banner");
            if (userBanner) {
                userBanner.innerHTML = `🏠 ${selectedComunidadNombre} &nbsp;|&nbsp; 🗺️ Etapa: ${selectedComunidadEtapa}`;
                userBanner.style.display = "block";
            }
        }
    }

    enforcePermissions();
});

// Load Parroquias
async function loadParroquias() {
    try {
        const snap = await getDocs(collection(db, "parroquias"));
        selectParroquia.innerHTML = '<option value="">— Seleccionar Parroquia —</option>';
        allParroquias = [];
        cachedParroquias = {};
        
        snap.forEach(d => {
            allParroquias.push({ id: d.id, ...d.data() });
            cachedParroquias[d.id] = d.data().nombre;
            selectParroquia.appendChild(new Option(d.data().nombre, d.id));
        });
    } catch(err) {
        console.error("Error loading parroquias:", err);
    }
}

// Parroquia Change
async function onParroquiaChange() {
    // Security Guard: Prevent F12 attribute manipulation
    if (window.hasPermission && !window.hasPermission("sortear_seleccionar_parroquia")) {
        if (selectParroquia.value !== loggedInUserParroquiaId) {
            alert("Acceso denegado: No tiene permiso para cambiar de parroquia.");
            selectParroquia.value = loggedInUserParroquiaId || "";
            return;
        }
    }

    selectedParroquiaId = selectParroquia.value;
    selectComunidad.innerHTML = '<option value="">— Primero parroquia —</option>';
    selectComunidad.disabled = true;
    labelEtapaActual.textContent = "—";
    headsCheckboxesList.innerHTML = '<span style="font-size:0.82rem; color:#94a3b8; font-style:italic;">Seleccione la comunidad primero...</span>';
    
    if (!selectedParroquiaId) return;

    try {
        const snap = await getDocs(collection(db, "parroquias", selectedParroquiaId, "comunidades"));
        selectComunidad.innerHTML = '<option value="">— Seleccionar Comunidad —</option>';
        selectComunidad.disabled = window.hasPermission && !window.hasPermission("sortear_seleccionar_comunidad");
        allComunidades = [];
        cachedComunidades = {};

        snap.forEach(d => {
            const data = d.data();
            allComunidades.push({ id: d.id, ...data });
            cachedComunidades[d.id] = `Comunidad ${data.numero || d.id}`;
            selectComunidad.appendChild(new Option(`Comunidad ${data.numero || d.id}`, d.id));
        });
    } catch(err) {
        console.error("Error loading communities:", err);
    }
}

async function loadCatalogosForSorteo() {
    try {
        const snap = await getDocs(collection(db, "catalogos"));
        allCatalogos = [];
        snap.forEach(d => {
            allCatalogos.push({ id: d.id, ...d.data() });
        });
    } catch(err) {
        console.error("Error loading catalogs for sorteo:", err);
    }
}

async function loadTemasForCurrentComunidad() {
    if (!selectedComunidadId) return;
    const com = allComunidades.find(c => c.id === selectedComunidadId);
    if (!com) return;
    
    // Find matching catalog for the community's stage
    const matchingCatalog = allCatalogos.find(cat => cat.etapaId === com.etapaId);
    catalogTemas = [];
    
    if (matchingCatalog) {
        try {
            const snap = await getDocs(collection(db, matchingCatalog.code));
            snap.forEach(d => {
                const data = d.data();
                catalogTemas.push({
                    id: d.id,
                    nombre: data.nombre,
                    descripcion: data.descripcion || "",
                    orden: data.orden !== undefined ? data.orden : 999,
                    etapa: selectedComunidadEtapa // map it so populateTemasDropdown correctly matches selectedComunidadEtapa
                });
            });
            console.log(`Loaded ${catalogTemas.length} themes from dynamic catalog: ${matchingCatalog.nombre}`);
            return;
        } catch(err) {
            console.error("Error loading themes from catalog:", err);
        }
    }
    
    // Fallback: Populate catalogTemas from global allTemas collection for current stage
    if (allTemas && allTemas.length > 0) {
        catalogTemas = allTemas.filter(t => t.etapa && t.etapa.toLowerCase() === selectedComunidadEtapa.toLowerCase());
        console.log(`Loaded ${catalogTemas.length} fallback themes from global collection for stage ${selectedComunidadEtapa}`);
    }
}

// Comunidad Change
async function onComunidadChange() {
    // Security Guard: Prevent F12 attribute manipulation
    if (window.hasPermission && !window.hasPermission("sortear_seleccionar_comunidad")) {
        if (selectComunidad.value !== loggedInUserComunidadId) {
            alert("Acceso denegado: No tiene permiso para cambiar de comunidad.");
            selectComunidad.value = loggedInUserComunidadId || "";
            return;
        }
    }

    selectedComunidadId = selectComunidad.value;
    labelEtapaActual.textContent = "—";
    headsCheckboxesList.innerHTML = '';
    resultadosContainer.style.display = "none";
    currentResults = null;

    if (!selectedComunidadId) return;

    const com = allComunidades.find(c => c.id === selectedComunidadId);
    if (com) {
        selectedComunidadNombre = `Comunidad ${com.numero || com.id}`;
        selectedComunidadEtapa = com.etapaNombre || "Formación";
        labelEtapaActual.textContent = selectedComunidadEtapa;
        
        const userBanner = document.getElementById("sorteo-user-banner");
        if (userBanner && userBanner.style.display !== "none") {
            userBanner.innerHTML = `🏠 ${selectedComunidadNombre} &nbsp;|&nbsp; 🗺️ Etapa: ${selectedComunidadEtapa}`;
        }

        if (com.diaCelebracion && inputFechaInicio) {
            inputFechaInicio.value = getNextCelebrationDate(com.diaCelebracion);
        }
    }

    // Load Sibling list of the selected community
    await loadHermanosComunidad();

    // Populate heads list
    populateHeadsList();

    // Load Temas for current community stage
    await loadTemasForCurrentComunidad();

    // Load History & Presentados
    await loadHistorialSorteos();
    await loadPresentados();

    // Enable/disable steps based on selectedComunidadEtapa
    configureSorteoSteps();

    if (selectTipoSorteo.value === "Salmos") {
        updateSalmosRaffleUI();
    }
}

function getNextCelebrationDate(diaSemana) {
    if (!diaSemana) return "";
    const daysMap = {
        "domingo": 0, "dom": 0,
        "lunes": 1, "lun": 1,
        "martes": 2, "mar": 2,
        "miércoles": 3, "miercoles": 3, "mie": 3,
        "jueves": 4, "jue": 4,
        "viernes": 5, "vie": 5,
        "sábado": 6, "sabado": 6, "sab": 6
    };

    const targetDay = daysMap[diaSemana.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")];
    if (targetDay === undefined) return "";

    const today = new Date();
    const todayDay = today.getDay();

    let daysUntil = targetDay - todayDay;
    if (daysUntil <= 0) {
        daysUntil += 7;
    }

    const nextDate = new Date(today.getTime() + daysUntil * 24 * 60 * 60 * 1000);
    const yyyy = nextDate.getFullYear();
    const mm = String(nextDate.getMonth() + 1).padStart(2, '0');
    const dd = String(nextDate.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

// Fetch Sibling List
async function loadHermanosComunidad() {
    try {
        const snap = await getDocs(collection(db, "hermanos"));
        allHermanos = [];
        snap.forEach(d => {
            const h = d.data();
            const hasMision = h.mision && h.mision.trim() !== "";
            if (h.comunidadId === selectedComunidadId && h.parroquiaId === selectedParroquiaId && h.activo !== false && h.razon !== "Comunidad Celeste" && !hasMision) {
                const nombre = `${h.primerNombre} ${h.primerApellido || ""}`.trim();
                allHermanos.push({
                    id: d.id,
                    name: nombre,
                    phone: h.telefono || "",
                    data: h
                });
            }
        });
        // Sort alphabetically
        allHermanos.sort((a, b) => a.name.localeCompare(b.name));
    } catch(err) {
        console.error("Error loading hermanos:", err);
    }
}

// Populate Heads checklist
function populateHeadsList() {
    headsCheckboxesList.innerHTML = '';
    if (allHermanos.length === 0) {
        headsCheckboxesList.innerHTML = '<span style="font-size:0.82rem; color:#94a3b8; font-style:italic;">No hay hermanos activos en esta comunidad...</span>';
        return;
    }

    allHermanos.forEach(h => {
        const label = document.createElement("label");
        label.className = "heads-checkbox-label";
        label.innerHTML = `
            <input type="checkbox" class="chk-head-candidate" value="${h.id}">
            <span>${h.name}</span>
        `;
        headsCheckboxesList.appendChild(label);
    });
}

// Show/hide UI inputs depending on type
function onTipoSorteoChange() {
    const val = selectTipoSorteo.value;
    paramSimpleGroup.style.display = "block"; // Always visible
    if (val === "Temas" || val === "Articulo") {
        paramTemasGroup.style.display = "block";
        populateTemasDropdown(val === "Articulo" ? "Traditio Symboli" : null);
    } else {
        paramTemasGroup.style.display = "none";
    }

    if (val === "Salmos") {
        if (paramSalmosGroup) paramSalmosGroup.style.display = "block";
        updateSalmosRaffleUI();
    } else {
        if (paramSalmosGroup) paramSalmosGroup.style.display = "none";
    }
}

function updateSalmosRaffleUI() {
    let lastSalmo = 0;
    if (savedSorteos && savedSorteos.length > 0) {
        const salmoSorteos = savedSorteos.filter(s => s.tipo === "Salmos");
        if (salmoSorteos.length > 0) {
            salmoSorteos.sort((a, b) => {
                const dateA = a.fechaSorteo || a.createdAt || "";
                const dateB = b.fechaSorteo || b.createdAt || "";
                return dateB.localeCompare(dateA);
            });
            const lastSorteo = salmoSorteos[0];
            if (lastSorteo.grupos && lastSorteo.grupos.length > 0) {
                const groupWithSalmo = lastSorteo.grupos.find(g => g.temaNombre && g.temaNombre.startsWith("Salmo "));
                if (groupWithSalmo) {
                    const numStr = groupWithSalmo.temaNombre.replace("Salmo ", "").trim();
                    lastSalmo = parseInt(numStr) || 0;
                }
            }
        }
    }

    const badge = document.getElementById("ultimo-salmo-badge");
    if (badge) {
        badge.textContent = lastSalmo > 0 ? lastSalmo : "—";
    }

    if (selectSalmo) {
        const nextSalmo = lastSalmo > 0 ? (lastSalmo % 150) + 1 : 1;
        selectSalmo.value = nextSalmo;
    }
}

function onChkReutilizarChange() {
    selectReutilizar.disabled = !chkReutilizar.checked;
}

// Configure steps by spiritual stage
function configureSorteoSteps() {
    // 1. Show reuse draw option if step is at least Shema (Step 3) or higher
    const stepOrder = [
        "Formación", "Primer Escrutinio", "Shema", "Segundo Escrutinio", 
        "Iniciacion a la oración", "Traditio Symboli", "ReTraditio Symboli",
        "Redditio Symboli", "Primera parte del Padre Nuestro", 
        "Segunda parte del Padre Nuestro", "Tercera parte del Padre Nuestro",
        "Elección", "Renovación de las Promesas Bautismales"
    ];

    const currentIdx = stepOrder.indexOf(selectedComunidadEtapa);
    
    // Reuse control
    if (currentIdx >= 2) { // Shema is index 2
        reuseContainer.style.display = "block";
    } else {
        reuseContainer.style.display = "none";
        chkReutilizar.checked = false;
        selectReutilizar.disabled = true;
    }

    // Default option configurations
    selectTipoSorteo.innerHTML = '';
    selectTipoSorteo.appendChild(new Option("Sorteo Simple de Grupos", "Simple"));

    if (currentIdx >= 1) { // From Primer Escrutinio onwards
        selectTipoSorteo.appendChild(new Option("Sorteo para Eucaristía", "Eucaristia"));
    }
    if (currentIdx >= 3) { // From Segundo Escrutinio onwards
        selectTipoSorteo.appendChild(new Option("Sorteo de Temas con Fechas", "Temas"));
    }
    if (currentIdx >= 4) { // From Iniciacion a la oración onwards
        selectTipoSorteo.appendChild(new Option("Sorteo para Escrutar Salmos", "Salmos"));
    }
    if (currentIdx >= 5) { // From Traditio Symboli onwards
        selectTipoSorteo.appendChild(new Option("Sorteo de Artículos (Traditio)", "Articulo"));
    }

    // Set default value based on stage
    const lowerEtapa = selectedComunidadEtapa.toLowerCase();
    if (lowerEtapa.includes("traditio") || lowerEtapa.includes("redditio")) {
        selectTipoSorteo.value = "Articulo";
    } else if (lowerEtapa.includes("oración") || lowerEtapa.includes("oracion")) {
        selectTipoSorteo.value = "Salmos";
    } else if (lowerEtapa.includes("segundo escrutinio")) {
        selectTipoSorteo.value = "Temas";
    } else {
        selectTipoSorteo.value = "Simple";
    }
    onTipoSorteoChange();
}

// Populate themes dropdown
function populateTemasDropdown(overrideStage = null) {
    selectTema.innerHTML = '<option value="">— Seleccionar Tema —</option>';
    
    const val = selectTipoSorteo.value;
    const sourceArray = val === "Temas" ? catalogTemas : allTemas;
    const targetStage = overrideStage || selectedComunidadEtapa;

    // Filter themes belonging to this stage
    const stageThemes = sourceArray.filter(t => t.etapa && t.etapa.toLowerCase() === targetStage.toLowerCase());

    const stageThemeIds = new Set(stageThemes.map(t => t.id));

    // Initialize counts for each theme in this stage
    const counts = {};
    stageThemes.forEach(t => {
        counts[t.id] = { drawn: 0, pending: 0, presented: 0 };
    });

    // Populate counts from savedSorteos
    if (savedSorteos) {
        savedSorteos.forEach(s => {
            if (s.grupos) {
                s.grupos.forEach(g => {
                    if (g.temaId && stageThemeIds.has(g.temaId)) {
                        counts[g.temaId].drawn++;
                        if (!g.presentado) {
                            counts[g.temaId].pending++;
                        }
                    }
                });
            }
        });
    }

    // Calculate presented counts and find the minimum presented count
    let minPresented = Infinity;
    stageThemes.forEach(t => {
        const c = counts[t.id];
        c.presented = c.drawn - c.pending;
        if (c.presented < minPresented) {
            minPresented = c.presented;
        }
    });

    // Filter themes matching stage and matching cycle requirements
    const filtered = stageThemes.filter(t => {
        const c = counts[t.id];
        // Theme is available if it has no pending presentations AND its presented count is at the minimum level (i.e. has not advanced to the next cycle yet)
        return c.pending === 0 && c.presented === minPresented;
    });
    
    // Sort by order number
    filtered.sort((a, b) => {
        const ordA = a.orden !== undefined && a.orden !== null ? parseInt(a.orden) : 999;
        const ordB = b.orden !== undefined && b.orden !== null ? parseInt(b.orden) : 999;
        return ordA - ordB;
    });

    filtered.forEach(t => {
        const label = t.orden !== undefined && t.orden !== null ? `${t.orden}. ${t.nombre}` : t.nombre;
        selectTema.appendChild(new Option(label, t.id));
    });

    if (filtered.length > 0) {
        selectTema.value = filtered[0].id;
    }
}

// ── SORTEO ENGINE ALGORITHM ────────────────────────
function ejecutarSorteo() {
    if (!selectedComunidadId) {
        alert("Por favor, seleccione una parroquia y comunidad destino.");
        return;
    }
    if (allHermanos.length === 0) {
        alert("La comunidad no tiene hermanos activos para sortear.");
        return;
    }

    // Get checked head candidates
    const checkedHeads = Array.from(document.querySelectorAll(".chk-head-candidate:checked")).map(chk => chk.value);
    const tipo = selectTipoSorteo.value;

    let groupsCount = checkedHeads.length;
    let targetSize = selectTamanoGrupos.value;

    // Determine group size automatically if auto-sizing is chosen
    if (targetSize === "auto") {
        const total = allHermanos.length;
        if (tipo === "Eucaristia") {
            if (total <= 13) {
                targetSize = 4;
            } else {
                targetSize = 5;
            }
        } else {
            if (total > 24) {
                targetSize = 6;
                if (groupsCount === 0) groupsCount = Math.ceil(total / 6);
            } else if (total > 12) {
                targetSize = 5;
                if (groupsCount === 0) groupsCount = Math.ceil(total / 5);
            } else {
                targetSize = 4;
                if (groupsCount === 0) groupsCount = Math.ceil(total / 4);
            }
        }
    } else {
        targetSize = parseInt(targetSize) || 5;
    }

    // If reuse check is selected
    if (chkReutilizar.checked && selectReutilizar.value) {
        reutilizarSorteoPrevio(selectReutilizar.value);
        return;
    }

    // Build the groups dynamically
    let groups = [];
    const remainingHermanos = [...allHermanos];
    const heads = [];

    // Extract manual heads
    checkedHeads.forEach(hId => {
        const idx = remainingHermanos.findIndex(h => h.id === hId);
        if (idx !== -1) {
            heads.push(remainingHermanos.splice(idx, 1)[0]);
        }
    });

    // If no heads selected, select heads automatically
    if (heads.length === 0) {
        if (groupsCount === 0) {
            groupsCount = Math.max(1, Math.ceil(allHermanos.length / targetSize));
        }
        
        // Randomly select G heads from the list, avoiding picking spouses of already selected heads
        const shuffled = [...remainingHermanos].sort(() => Math.random() - 0.5);
        for (let i = 0; i < groupsCount; i++) {
            if (shuffled.length > 0) {
                let pickedIdx = -1;
                for (let s = 0; s < shuffled.length; s++) {
                    const candidate = shuffled[s];
                    const isSpouseOfExistingHead = heads.some(head => 
                        head.data.esposoId === candidate.id || (candidate.data.estadoCivil === "Casado" && candidate.data.esposoId === head.id)
                    );
                    if (!isSpouseOfExistingHead) {
                        pickedIdx = s;
                        break;
                    }
                }
                if (pickedIdx === -1) pickedIdx = 0;

                const picked = shuffled.splice(pickedIdx, 1)[0];
                const origIdx = remainingHermanos.findIndex(h => h.id === picked.id);
                if (origIdx !== -1) {
                    heads.push(remainingHermanos.splice(origIdx, 1)[0]);
                }
            }
        }
    } else {
        groupsCount = heads.length;
    }

    // Initialize groups
    for (let i = 0; i < groupsCount; i++) {
        const headHno = heads[i];
        const group = {
            nombreGrupo: `Grupo de ${headHno.name}`,
            cabezasIds: [headHno.id],
            cabezasNames: [headHno.name],
            integrantesIds: [],
            integrantesNames: [],
            temaId: "",
            temaNombre: "",
            fechaPresentacion: ""
        };

        // If the head has a spouse and the spouse is in remaining pool, auto-assign to same group
        if (headHno.data.estadoCivil === "Casado" && headHno.data.esposoId) {
            const spouseIdx = remainingHermanos.findIndex(h => h.id === headHno.data.esposoId);
            if (spouseIdx !== -1) {
                const spouseHno = remainingHermanos.splice(spouseIdx, 1)[0];
                group.integrantesIds.push(spouseHno.id);
                group.integrantesNames.push(`${spouseHno.name} (Cónyuge)`);
            }
        }
        groups.push(group);
    }

    // Identify conyugal pairs among remaining siblings
    const pairs = [];
    const singles = [];

    const processedIds = new Set();
    remainingHermanos.forEach(h => {
        if (processedIds.has(h.id)) return;

        if (h.data.estadoCivil === "Casado" && h.data.esposoId) {
            const spouse = remainingHermanos.find(sp => sp.id === h.data.esposoId);
            if (spouse && !processedIds.has(spouse.id)) {
                pairs.push({ husband: h, wife: spouse });
                processedIds.add(h.id);
                processedIds.add(spouse.id);
            } else {
                singles.push(h);
                processedIds.add(h.id);
            }
        } else {
            singles.push(h);
            processedIds.add(h.id);
        }
    });

    // Shuffle pairs and singles
    pairs.sort(() => Math.random() - 0.5);
    singles.sort(() => Math.random() - 0.5);

    // Distribute pairs to groups (at least 1 couple per group if possible)
    let currentGroupIdx = 0;
    pairs.forEach(pair => {
        // Find group with least couples, or just cycle
        const targetGroup = groups[currentGroupIdx % groups.length];
        targetGroup.integrantesIds.push(pair.husband.id, pair.wife.id);
        targetGroup.integrantesNames.push(pair.husband.name, `${pair.wife.name} (Cónyuge)`);
        currentGroupIdx++;
    });

    // Distribute singles to groups to balance the total members size
    singles.forEach(single => {
        // Find the group with the least total members (head + integrantes)
        groups.sort((a, b) => {
            const totalA = a.cabezasIds.length + a.integrantesIds.length;
            const totalB = b.cabezasIds.length + b.integrantesIds.length;
            return totalA - totalB;
        });

        const targetGroup = groups[0];
        targetGroup.integrantesIds.push(single.id);
        targetGroup.integrantesNames.push(single.name);
    });

    // Assign themes and dates if applicable
    if (tipo === "Temas" || tipo === "Articulo") {
        const themeId = selectTema.value;
        const startDateStr = inputFechaInicio.value;

        if (!themeId || !startDateStr) {
            alert("Por favor, seleccione un tema inicial y una fecha de presentación para continuar.");
            return;
        }

        const sourceArray = tipo === "Temas" ? catalogTemas : allTemas;
        const targetStage = tipo === "Articulo" ? "Traditio Symboli" : selectedComunidadEtapa;

        const initialThemeObj = sourceArray.find(t => t.id === themeId);
        const stageThemes = sourceArray.filter(t => t.etapa.toLowerCase() === targetStage.toLowerCase());
        
        let startMoment = new Date(startDateStr + "T00:00:00");

        groups.forEach((group, idx) => {
            // Assign sequentially starting from chosen theme
            const themeIndex = stageThemes.findIndex(t => t.id === themeId);
            const targetTheme = stageThemes[(themeIndex + idx) % stageThemes.length] || initialThemeObj;
            
            group.temaId = targetTheme.id;
            group.temaNombre = targetTheme.nombre;

            // Increment date by 1 month for each subsequent group
            const currentPresentationDate = new Date(startMoment);
            currentPresentationDate.setMonth(startMoment.getMonth() + idx);
            
            // Format YYYY-MM-DD
            const yyyy = currentPresentationDate.getFullYear();
            const mm = String(currentPresentationDate.getMonth() + 1).padStart(2, '0');
            const dd = String(currentPresentationDate.getDate()).padStart(2, '0');
            group.fechaPresentacion = `${yyyy}-${mm}-${dd}`;
        });

        // If Articulo (Traditio), pre-generate survey sub-groups (encuestas) for every member
        if (tipo === "Articulo") {
            groups.forEach(group => {
                const groupMembers = [];
                group.cabezasIds.forEach((id, i) => {
                    groupMembers.push({ id, name: group.cabezasNames[i] });
                });
                group.integrantesIds.forEach((id, i) => {
                    groupMembers.push({ id, name: group.integrantesNames[i] });
                });

                const groupMemberIds = new Set(groupMembers.map(m => m.id));
                const poolToSurvey = allHermanos.filter(h => !groupMemberIds.has(h.id));
                distributeEncuestas(group, groupMembers, poolToSurvey);
            });
        }
    }

    if (tipo === "Salmos") {
        const salmoId = selectSalmo ? selectSalmo.value : "";
        if (!salmoId) {
            alert("Por favor, seleccione un salmo inicial para continuar.");
            return;
        }
        const startSalmoNum = parseInt(salmoId);
        
        let startMoment = null;
        const com = allComunidades.find(c => c.id === selectedComunidadId);
        if (com && com.diaCelebracion) {
            const nextCelebrationDateStr = getNextCelebrationDate(com.diaCelebracion);
            if (nextCelebrationDateStr) {
                startMoment = new Date(nextCelebrationDateStr + "T00:00:00");
            }
        }
        if (!startMoment) {
            startMoment = new Date();
        }

        groups.forEach((group, idx) => {
            group.temaNombre = `Salmo ${startSalmoNum}`;
            group.temaId = `salmo_${startSalmoNum}`;

            // Same celebration date for all groups in this celebration
            const presentationDate = new Date(startMoment.getTime());
            const yyyy = presentationDate.getFullYear();
            const mm = String(presentationDate.getMonth() + 1).padStart(2, '0');
            const dd = String(presentationDate.getDate()).padStart(2, '0');
            group.fechaPresentacion = `${yyyy}-${mm}-${dd}`;
        });
    }

    currentResults = groups;
    renderResultsGrid();
}

function distributeEncuestas(group, groupMembers, poolToSurvey) {
    // 1. Identify pairs (couples) and singles in the surveyed pool
    const pairs = [];
    const singles = [];
    const processedIds = new Set();

    poolToSurvey.forEach(h => {
        if (processedIds.has(h.id)) return;

        if (h.data && h.data.estadoCivil === "Casado" && h.data.esposoId) {
            const spouse = poolToSurvey.find(sp => sp.id === h.data.esposoId);
            if (spouse && !processedIds.has(spouse.id)) {
                const husband = h.data.sexo === "M" ? h : spouse;
                const wife = h.data.sexo === "M" ? spouse : h;
                pairs.push({ husband, wife });
                processedIds.add(h.id);
                processedIds.add(spouse.id);
            } else {
                singles.push(h);
                processedIds.add(h.id);
            }
        } else {
            singles.push(h);
            processedIds.add(h.id);
        }
    });

    // 2. Shuffle pairs and singles
    pairs.sort(() => Math.random() - 0.5);
    singles.sort(() => Math.random() - 0.5);

    // 3. Initialize encuestas structure
    group.encuestas = {};
    groupMembers.forEach(m => {
        group.encuestas[m.id] = {
            responsableId: m.id,
            responsableNombre: (m.name || "Hermano").replace(" (Cónyuge)", ""),
            encuestadosIds: [],
            encuestadosNames: [],
            temaNombre: group.temaNombre || "",
            fechaPresentacion: group.fechaPresentacion || ""
        };
    });

    if (groupMembers.length === 0) return;

    // 4. Distribute married couples together (never separate husband and wife in encuestas)
    let currentMemberIdx = 0;
    pairs.forEach(pair => {
        const targetMember = groupMembers[currentMemberIdx % groupMembers.length];
        const enc = group.encuestas[targetMember.id];
        if (enc) {
            enc.encuestadosIds.push(pair.husband.id, pair.wife.id);
            enc.encuestadosNames.push(pair.husband.name, `${pair.wife.name} (Cónyuge)`);
        }
        currentMemberIdx++;
    });

    // 5. Distribute singles to balance group sizes
    singles.forEach(single => {
        const sortedMembers = [...groupMembers].sort((a, b) => {
            const countA = group.encuestas[a.id].encuestadosIds.length;
            const countB = group.encuestas[b.id].encuestadosIds.length;
            return countA - countB;
        });

        const targetMember = sortedMembers[0];
        const enc = group.encuestas[targetMember.id];
        if (enc) {
            enc.encuestadosIds.push(single.id);
            enc.encuestadosNames.push(single.name);
        }
    });
}

function getOrCreateEncuesta(group, memberId, memberName) {
    if (group.encuestas) {
        if (memberId && group.encuestas[memberId]) return group.encuestas[memberId];
        if (memberName) {
            const cleanTarget = memberName.toLowerCase().replace(" (cónyuge)", "").trim();
            const foundKey = Object.keys(group.encuestas).find(k => {
                const resp = (group.encuestas[k].responsableNombre || "").toLowerCase().trim();
                return resp === cleanTarget || resp.includes(cleanTarget) || cleanTarget.includes(resp);
            });
            if (foundKey) return group.encuestas[foundKey];
        }
    }
    
    // Generate dynamically if missing
    const groupMembers = [];
    group.cabezasIds?.forEach((id, i) => {
        groupMembers.push({ id, name: group.cabezasNames[i] });
    });
    group.integrantesIds?.forEach((id, i) => {
        groupMembers.push({ id, name: group.integrantesNames[i] });
    });

    const groupMemberIds = new Set(groupMembers.map(m => m.id));
    
    // Pool of siblings to survey: all community siblings except group members
    let poolToSurvey = allHermanos.filter(h => !groupMemberIds.has(h.id));
    
    // Fallback if allHermanos is empty
    if (poolToSurvey.length === 0 && currentResults && currentResults.length > 0) {
        const otherGroups = currentResults.filter(og => og !== group);
        otherGroups.forEach(og => {
            og.cabezasIds?.forEach((id, i) => poolToSurvey.push({ id, name: og.cabezasNames[i], data: { estadoCivil: "Soltero" } }));
            og.integrantesIds?.forEach((id, i) => poolToSurvey.push({ id, name: og.integrantesNames[i], data: { estadoCivil: og.integrantesNames[i].includes("(Cónyuge)") ? "Casado" : "Soltero" } }));
        });
    }

    distributeEncuestas(group, groupMembers, poolToSurvey);

    if (memberId && group.encuestas[memberId]) return group.encuestas[memberId];
    if (memberName) {
        const cleanTarget = memberName.toLowerCase().replace(" (cónyuge)", "").trim();
        const foundKey = Object.keys(group.encuestas).find(k => {
            const resp = (group.encuestas[k].responsableNombre || "").toLowerCase().trim();
            return resp === cleanTarget || resp.includes(cleanTarget) || cleanTarget.includes(resp);
        });
        if (foundKey) return group.encuestas[foundKey];
    }

    return Object.values(group.encuestas)[0] || null;
}

function getSpouseMap() {
    const spouseMap = {};
    if (Array.isArray(allHermanos)) {
        allHermanos.forEach(h => {
            if (h.data && h.data.esposoId) {
                spouseMap[h.id] = h.data.esposoId;
                spouseMap[h.data.esposoId] = h.id;
            }
        });
    }
    return spouseMap;
}

function getGroupCouples(group, spouseMap) {
    const couples = [];
    const allMembers = [];
    group.cabezasIds?.forEach((id, idx) => {
        allMembers.push({ id, name: group.cabezasNames[idx] });
    });
    group.integrantesIds?.forEach((id, idx) => {
        allMembers.push({ id, name: group.integrantesNames[idx] });
    });

    const used = new Set();
    // 1. Match by spouseMap
    for (let i = 0; i < allMembers.length; i++) {
        const m1 = allMembers[i];
        if (!m1.id || used.has(m1.id)) continue;
        const spouseId = spouseMap[m1.id];
        if (spouseId) {
            const m2 = allMembers.find(m => m.id === spouseId);
            if (m2 && !used.has(m2.id)) {
                couples.push([m1.id, m2.id]);
                used.add(m1.id);
                used.add(m2.id);
            }
        }
    }

    // 2. Fallback matching " (Cónyuge)" suffix
    for (let i = 0; i < allMembers.length; i++) {
        const m1 = allMembers[i];
        if (!m1.id || used.has(m1.id)) continue;
        if (m1.name.includes("(Cónyuge)")) {
            let partner = null;
            const idx = allMembers.indexOf(m1);
            if (idx > 0 && !used.has(allMembers[idx - 1].id)) {
                partner = allMembers[idx - 1];
            } else if (idx < allMembers.length - 1 && !used.has(allMembers[idx + 1].id)) {
                partner = allMembers[idx + 1];
            } else {
                partner = allMembers.find(m => m.id && !used.has(m.id) && m.id !== m1.id);
            }

            if (partner) {
                couples.push([m1.id, partner.id]);
                used.add(m1.id);
                used.add(partner.id);
            }
        }
    }

    return couples;
}

function getMemberBadgeAndStyle(id, name, isCabeza, coupleIdx) {
    const coupleColors = [
        { bg: "#dbeafe", text: "#1e40af" }, // Light Blue
        { bg: "#dcfce7", text: "#166534" }, // Light Green
        { bg: "#ffe4e6", text: "#9f1239" }, // Light Pink
        { bg: "#fef9c3", text: "#854d0e" }, // Light Yellow
        { bg: "#f3e8ff", text: "#6b21a8" }  // Light Purple
    ];

    if (coupleIdx !== undefined) {
        const color = coupleColors[coupleIdx % coupleColors.length];
        return {
            badgeHTML: `<span class="badge-role" style="background:${color.bg}; color:${color.text}; border: none;">Matrimonio</span>`,
            style: `cursor:pointer; border-radius:4px; padding:3px 6px; background-color: ${color.bg}15;`
        };
    } else {
        return {
            badgeHTML: isCabeza 
                ? `<span class="badge-role badge-head">Cabeza</span>` 
                : `<span class="badge-role badge-member">Integrante</span>`,
            style: `cursor:pointer; border-radius:4px; padding:3px 6px;`
        };
    }
}

function openEncuestaModal(group, memberId, memberName) {
    const enc = getOrCreateEncuesta(group, memberId, memberName);
    if (!enc) {
        console.error("No se pudo obtener la encuesta para:", memberId, memberName);
        return;
    }

    const parts = (enc.fechaPresentacion || group.fechaPresentacion || "").split("-");
    const formattedDate = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : (enc.fechaPresentacion || group.fechaPresentacion || "—");

    const spouseMap = getSpouseMap();
    const surveyGroupObj = {
        cabezasIds: [enc.responsableId],
        cabezasNames: [enc.responsableNombre],
        integrantesIds: enc.encuestadosIds || [],
        integrantesNames: enc.encuestadosNames || []
    };
    const surveyCouples = getGroupCouples(surveyGroupObj, spouseMap);
    const surveyMemberCoupleIdx = {};
    surveyCouples.forEach((couple, cIdx) => {
        couple.forEach(id => {
            surveyMemberCoupleIdx[id] = cIdx;
        });
    });

    let encuestadosHTML = '';
    if (!enc.encuestadosNames || enc.encuestadosNames.length === 0) {
        encuestadosHTML = `<div style="font-size:0.85rem; color:#64748b; font-style:italic; padding:6px 0;">No hay hermanos asignados para encuestar.</div>`;
    } else {
        enc.encuestadosNames.forEach((name, mIdx) => {
            const mId = enc.encuestadosIds ? enc.encuestadosIds[mIdx] : "";
            const cleanName = name.replace(" (Cónyuge)", "");
            const coupleIdx = surveyMemberCoupleIdx[mId];
            const badgeData = getMemberBadgeAndStyle(mId, cleanName, false, coupleIdx);

            encuestadosHTML += `
                <div class="sorteo-member-item" style="${badgeData.style}">
                    <span>👤 ${cleanName}</span>
                    ${badgeData.badgeHTML}
                </div>
            `;
        });
    }

    const respCoupleIdx = surveyMemberCoupleIdx[enc.responsableId];
    const respBadgeData = getMemberBadgeAndStyle(enc.responsableId, enc.responsableNombre, true, respCoupleIdx);

    modalEncuestaCardContainer.innerHTML = `
        <div class="sorteo-group-card" style="margin:0; box-shadow:none; border:1px solid #e2e8f0; background:#ffffff;">
            <div class="sorteo-group-header">
                <span>Grupo de ${enc.responsableNombre}</span>
                <span style="font-size:0.85rem; color:#64748b;">(${enc.encuestadosNames.length + 1} pers.)</span>
            </div>
            <div style="display:flex; flex-direction:column; gap:4px;">
                <div class="sorteo-member-item" style="${respBadgeData.style}">
                    <span>👤 <strong>${enc.responsableNombre}</strong></span>
                    ${respBadgeData.badgeHTML}
                </div>
                ${encuestadosHTML}
            </div>
            <div style="margin-top:12px; padding-top:10px; border-top:1px solid #f1f5f9; font-size:0.85rem; color:#475569;">
                <div style="margin-bottom:3px;">📚 <strong>Tema:</strong> ${enc.temaNombre || group.temaNombre || "—"}</div>
                <div>📅 <strong>Fecha:</strong> ${formattedDate}</div>
            </div>
        </div>
    `;

    if (modalEncuestaTraditio) {
        modalEncuestaTraditio.classList.add("open");
    }
}

function renderResultsGrid() {
    resultadosGrid.innerHTML = '';
    resultadosContainer.style.display = "block";

    const spouseMap = getSpouseMap();

    currentResults.forEach((g, idx) => {
        const card = document.createElement("div");
        card.className = "sorteo-group-card";
        if (selectTipoSorteo.value === "Salmos") {
            card.style.backgroundColor = "#f4e73d14";
        } else if (selectTipoSorteo.value === "Temas") {
            card.style.backgroundColor = "#3b82f614";
        } else if (selectTipoSorteo.value === "Articulo") {
            card.style.backgroundColor = "#f43d3d14";
        }

        const groupCouples = getGroupCouples(g, spouseMap);
        const memberCoupleIdx = {};
        groupCouples.forEach((couple, cIdx) => {
            couple.forEach(id => {
                memberCoupleIdx[id] = cIdx;
            });
        });

        let membersHTML = '';
        
        // Heads
        g.cabezasNames.forEach((hName, hIdx) => {
            const hId = g.cabezasIds ? g.cabezasIds[hIdx] : "";
            const coupleIdx = memberCoupleIdx[hId];
            const badgeData = getMemberBadgeAndStyle(hId, hName, true, coupleIdx);

            membersHTML += `
                <div class="sorteo-member-item clickable-encuesta-member" data-group-idx="${idx}" data-member-id="${hId}" data-member-name="${hName}" style="${badgeData.style}" title="Ver grupo de encuesta de ${hName}">
                    <span>👤 <strong>${hName}</strong></span>
                    ${badgeData.badgeHTML}
                </div>
            `;
        });

        // Members
        g.integrantesNames.forEach((mName, mIdx) => {
            const mId = g.integrantesIds ? g.integrantesIds[mIdx] : "";
            const cleanName = mName.replace(" (Cónyuge)", "");
            const coupleIdx = memberCoupleIdx[mId];
            const badgeData = getMemberBadgeAndStyle(mId, cleanName, false, coupleIdx);

            membersHTML += `
                <div class="sorteo-member-item clickable-encuesta-member" data-group-idx="${idx}" data-member-id="${mId}" data-member-name="${cleanName}" style="${badgeData.style}" title="Ver grupo de encuesta de ${cleanName}">
                    <span>👤 ${cleanName}</span>
                    ${badgeData.badgeHTML}
                </div>
            `;
        });

        let dropdownOptions = '';
        currentResults.forEach((otherG, otherIdx) => {
            const isSelected = otherIdx === idx ? 'selected' : '';
            const headName = otherG.cabezasNames && otherG.cabezasNames[0] ? otherG.cabezasNames[0] : `Grupo ${otherIdx + 1}`;
            dropdownOptions += `<option value="${otherIdx}" ${isSelected}>${headName}</option>`;
        });

        let footerHTML = '';
        if (g.fechaPresentacion !== undefined) {
            footerHTML = `
                <div style="margin-top:12px; padding-top:10px; border-top:1px solid #f1f5f9; font-size:0.85rem; color:#475569;">
                    ${g.temaNombre ? `<div style="margin-bottom:6px;">📚 <strong>Tema:</strong> ${g.temaNombre}</div>` : ''}
                    <div style="display:flex; align-items:center; gap:6px;">
                        <span>📅 <strong>Fecha:</strong></span>
                        <input type="date" class="group-date-input" data-group-idx="${idx}" value="${g.fechaPresentacion}" style="padding:3px 6px; font-size:0.8rem; border-radius:4px; border:1px solid #ccc; width:130px; font-family:sans-serif;">
                    </div>
                </div>
            `;
        }

        card.innerHTML = `
            <div class="sorteo-group-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                <div style="display:flex; align-items:center; gap:4px; max-width:70%;">
                    <select class="swap-group-head-select" data-group-idx="${idx}" style="font-size:1rem; font-weight:bold; color:var(--primary); border:none; background:transparent; padding:0; margin:0; cursor:pointer; width:100%; outline:none; -webkit-appearance:none; -moz-appearance:none; appearance:none; font-family:inherit;">
                        ${dropdownOptions}
                    </select>
                </div>
                <span style="font-size:0.85rem; color:#64748b; white-space:nowrap;">(${g.cabezasIds.length + g.integrantesIds.length} pers.)</span>
            </div>
            <div style="display:flex; flex-direction:column; gap:4px;">
                ${membersHTML}
            </div>
            ${footerHTML}
        `;
        resultadosGrid.appendChild(card);
    });

    // Add change listeners to sync edited dates
    document.querySelectorAll(".group-date-input").forEach(input => {
        input.addEventListener("change", (e) => {
            const gIdx = parseInt(input.getAttribute("data-group-idx"));
            if (currentResults && currentResults[gIdx]) {
                currentResults[gIdx].fechaPresentacion = e.target.value;
            }
        });
    });

    // Add change listeners to swap group heads
    document.querySelectorAll(".swap-group-head-select").forEach(select => {
        select.addEventListener("change", (e) => {
            const fromIdx = parseInt(select.getAttribute("data-group-idx"));
            const toIdx = parseInt(e.target.value);
            if (fromIdx === toIdx) return;

            const g1 = currentResults[fromIdx];
            const g2 = currentResults[toIdx];

            // Swap group heads
            const tempCabezasIds = g1.cabezasIds;
            const tempCabezasNames = g1.cabezasNames;
            g1.cabezasIds = g2.cabezasIds;
            g1.cabezasNames = g2.cabezasNames;
            g2.cabezasIds = tempCabezasIds;
            g2.cabezasNames = tempCabezasNames;

            // Swap integrantes
            const tempIntegrantesIds = g1.integrantesIds;
            const tempIntegrantesNames = g1.integrantesNames;
            g1.integrantesIds = g2.integrantesIds;
            g1.integrantesNames = g2.integrantesNames;
            g2.integrantesIds = tempIntegrantesIds;
            g2.integrantesNames = tempIntegrantesNames;

            // Swap group names
            const tempNombreGrupo = g1.nombreGrupo;
            g1.nombreGrupo = g2.nombreGrupo;
            g2.nombreGrupo = tempNombreGrupo;

            // Swap encuestas
            const tempEncuestas = g1.encuestas || null;
            g1.encuestas = g2.encuestas || null;
            g2.encuestas = tempEncuestas;

            // Re-render
            renderResultsGrid();
        });
    });

    document.querySelectorAll(".clickable-encuesta-member").forEach(el => {
        const originalBg = el.style.backgroundColor || "transparent";
        el.addEventListener("mouseenter", () => {
            el.style.backgroundColor = "#f1f5f9";
        });
        el.addEventListener("mouseleave", () => {
            el.style.backgroundColor = originalBg;
        });
        el.addEventListener("click", (e) => {
            e.stopPropagation();
            const groupIdx = parseInt(el.getAttribute("data-group-idx"));
            const memberId = el.getAttribute("data-member-id");
            const memberName = el.getAttribute("data-member-name");
            const group = currentResults[groupIdx];
            if (group) {
                openEncuestaModal(group, memberId, memberName);
            }
        });
    });
}

// Load reuse dropdown and draw previous groups
async function reutilizarSorteoPrevio(sorteoId) {
    const prev = savedSorteos.find(s => s.id === sorteoId);
    if (!prev) return;

    // Verify siblings currently active match those of the previous drawing
    const activeIds = new Set(allHermanos.map(h => h.id));
    
    // Build groups copying the previous members, only keeping those who are active now
    const newGroups = prev.grupos.map(g => {
        const activeCabezas = g.cabezasIds.filter(id => activeIds.has(id));
        const activeIntegrantes = g.integrantesIds.filter(id => activeIds.has(id));

        return {
            nombreGrupo: g.nombreGrupo,
            cabezasIds: activeCabezas,
            cabezasNames: activeCabezas.map(id => allHermanos.find(h => h.id === id)?.name || "Hermano Desconocido"),
            integrantesIds: activeIntegrantes,
            integrantesNames: activeIntegrantes.map(id => {
                const spouseVal = allHermanos.find(h => h.id === id)?.data?.estadoCivil === "Casado" ? " (Cónyuge)" : "";
                return (allHermanos.find(h => h.id === id)?.name || "Hermano Desconocido") + spouseVal;
            }),
            temaId: "",
            temaNombre: "",
            fechaPresentacion: ""
        };
    });

    currentResults = newGroups;
    renderResultsGrid();
}

// Save draw results to Firestore
async function guardarSorteoResultados() {
    if (!currentResults || currentResults.length === 0) return;

    btnGuardarSorteo.disabled = true;
    try {
        const sorteoData = {
            comunidadId: selectedComunidadId,
            parroquiaId: selectedParroquiaId,
            tipo: selectTipoSorteo.value,
            etapa: selectedComunidadEtapa,
            fechaSorteo: new Date().toISOString(),
            grupos: currentResults
        };

        await addDoc(collection(db, "sorteos"), sorteoData);
        window.showAlert("🎉 Sorteo guardado correctamente.", "success");
        resultadosContainer.style.display = "none";
        currentResults = null;
        
        await loadHistorialSorteos();
        await loadPresentados();
    } catch(err) {
        console.error("Error saving drawing:", err);
        window.showAlert("Error al guardar sorteo: " + err.message, "error");
    } finally {
        btnGuardarSorteo.disabled = false;
    }
}

// Load Historial
async function loadHistorialSorteos() {
    const canCambiarFecha = !window.hasPermission || window.hasPermission("sortear_cambiar_fecha");
    const canActivarPresentado = !window.hasPermission || window.hasPermission("sortear_activar_presentado");

    historialListaContainer.innerHTML = '';
    selectReutilizar.innerHTML = '<option value="">— Seleccionar sorteo anterior —</option>';
    savedSorteos = [];

    if (!selectedComunidadId) return;

    try {
        const q = query(
            collection(db, "sorteos"), 
            where("comunidadId", "==", selectedComunidadId)
        );
        const snap = await getDocs(q);

        if (snap.empty) {
            historialListaContainer.innerHTML = '<span style="font-size:0.88rem; color:#64748b; font-style:italic;">No hay sorteos anteriores registrados para esta comunidad.</span>';
            return;
        }

        const rawList = [];
        snap.forEach(d => {
            rawList.push({ id: d.id, ...d.data() });
        });

        // Sort in memory by fechaSorteo desc
        rawList.sort((a, b) => {
            const dateA = a.fechaSorteo || "";
            const dateB = b.fechaSorteo || "";
            return dateB.localeCompare(dateA);
        });

        rawList.forEach(data => {
            savedSorteos.push(data);
            // Populate reuse select option
            const fDate = data.fechaSorteo ? new Date(data.fechaSorteo).toLocaleDateString() : "—";
            selectReutilizar.appendChild(new Option(`${data.tipo} (${fDate}) - ${data.grupos.length} grupos`, data.id));
        });

        // Group sorteos by tipo for display
        const tipoOrder = ["Temas", "Salmos", "Articulo", "Simple", "Eucaristia"];
        const groupedByTipo = {};
        rawList.forEach(data => {
            const t = data.tipo || "Simple";
            if (!groupedByTipo[t]) groupedByTipo[t] = [];
            groupedByTipo[t].push(data);
        });

        const tiposToRender = tipoOrder.filter(t => groupedByTipo[t]);
        const remainingTipos = Object.keys(groupedByTipo).filter(t => !tipoOrder.includes(t));
        const renderOrder = [...tiposToRender, ...remainingTipos];

        const canCambiarFecha = !window.hasPermission || window.hasPermission("sortear_cambiar_fecha");
        const canActivarPresentado = !window.hasPermission || window.hasPermission("sortear_activar_presentado");

        renderOrder.forEach(tipo => {
            const sorteosDeTipo = groupedByTipo[tipo];
            const spouseMap = getSpouseMap();

            // Check if there's at least one active group across all sorteos of this tipo
            const hasActiveGroups = sorteosDeTipo.some(data => data.grupos.some(g => !g.presentado));
            if (!hasActiveGroups) return;

            // Determine color for tipo
            let tipoBg = "white";
            let tipoLabelColor = "var(--primary)";
            if (tipo === "Salmos") { tipoBg = "#f4e73d14"; }
            else if (tipo === "Temas") { tipoBg = "#3b82f614"; }
            else if (tipo === "Articulo") { tipoBg = "#f43d3d14"; }

            // Create section wrapper
            const section = document.createElement("div");
            section.className = "card";
            section.style.cssText = "margin-bottom: 24px; padding: 20px;";

            const tipoLabel = tipo === "Articulo" ? "Artículos (Traditio)" : tipo === "Temas" ? "Temas con Fechas" : tipo === "Salmos" ? "Salmos (Traditio Symboli)" : tipo;

            // Use most recent date
            const latestDate = sorteosDeTipo[0].fechaSorteo;
            const dateStr = latestDate ? new Date(latestDate).toLocaleString() : "";

            const headerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #e2e8f0; padding-bottom:10px; margin-bottom:15px; flex-wrap:wrap; gap:10px;">
                    <strong style="color:${tipoLabelColor}; font-size:1.05rem;">🎯 Sorteo ${tipoLabel}</strong>
                    <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                        <span style="font-size:0.8rem; color:#64748b;">${dateStr}</span>
                    </div>
                </div>
            `;

            const gridDiv = document.createElement("div");
            gridDiv.className = "carSort";

            sorteosDeTipo.forEach(data => {
                data.grupos.forEach((g, gIdx) => {
                    if (g.presentado) return;

                    const groupCouples = getGroupCouples(g, spouseMap);
                    const memberCoupleIdx = {};
                    groupCouples.forEach((couple, cIdx) => {
                        couple.forEach(id => { memberCoupleIdx[id] = cIdx; });
                    });

                    let membersHTML = '';
                    g.cabezasNames?.forEach((hName, hIdx) => {
                        const hId = g.cabezasIds ? g.cabezasIds[hIdx] : "";
                        const coupleIdx = memberCoupleIdx[hId];
                        const badgeData = getMemberBadgeAndStyle(hId, hName, true, coupleIdx);
                        membersHTML += `
                            <div class="sorteo-member-item clickable-encuesta-member hist-clickable-encuesta" data-sorteo-id="${data.id}" data-group-idx="${gIdx}" data-member-id="${hId}" data-member-name="${hName}" style="${badgeData.style} cursor:pointer;" title="Ver grupo de encuesta de ${hName}">
                                <span>👤 <strong>${hName}</strong></span>
                                ${badgeData.badgeHTML}
                            </div>
                        `;
                    });
                    g.integrantesNames?.forEach((mName, mIdx) => {
                        const mId = g.integrantesIds ? g.integrantesIds[mIdx] : "";
                        const cleanName = mName.replace(" (Cónyuge)", "");
                        const coupleIdx = memberCoupleIdx[mId];
                        const badgeData = getMemberBadgeAndStyle(mId, cleanName, false, coupleIdx);
                        membersHTML += `
                            <div class="sorteo-member-item clickable-encuesta-member hist-clickable-encuesta" data-sorteo-id="${data.id}" data-group-idx="${gIdx}" data-member-id="${mId}" data-member-name="${cleanName}" style="${badgeData.style} cursor:pointer;" title="Ver grupo de encuesta de ${cleanName}">
                                <span>👤 ${cleanName}</span>
                                ${badgeData.badgeHTML}
                            </div>
                        `;
                    });

                    let dropdownOptions = '';
                    data.grupos.forEach((otherG, otherIdx) => {
                        const isSelected = otherIdx === gIdx ? 'selected' : '';
                        const headName = otherG.cabezasNames && otherG.cabezasNames[0] ? otherG.cabezasNames[0] : `Grupo ${otherIdx + 1}`;
                        dropdownOptions += `<option value="${otherIdx}" ${isSelected}>${headName}</option>`;
                    });

                    let footerHTML = '';
                    if (g.fechaPresentacion !== undefined) {
                        footerHTML = `
                            <div style="margin-top:12px; padding-top:10px; border-top:1px solid #f1f5f9; font-size:0.85rem; color:#475569; display:flex; flex-direction:column; gap:8px;">
                                ${g.temaNombre ? `<div>📚 <strong>Tema:</strong> ${g.temaNombre}</div>` : ''}
                                <div style="display:flex; align-items:center; gap:6px;">
                                    <span>📅 <strong>Fecha:</strong></span>
                                    <input type="date" class="hist-group-date-input" data-sorteo-id="${data.id}" data-group-idx="${gIdx}" value="${g.fechaPresentacion}" style="padding:3px 6px; font-size:0.8rem; border-radius:4px; border:1px solid #ccc; width:130px; font-family:sans-serif;" ${canCambiarFecha ? "" : "disabled"}>
                                    ${canCambiarFecha ? `
                                        <button class="btn-save-group-date" data-sorteo-id="${data.id}" data-group-idx="${gIdx}" style="background:none; border:none; cursor:pointer; font-size:1.15rem; padding:0; display:inline-flex; align-items:center; justify-content:center; color:#5c6bc0; transition: transform 0.1s;" title="Guardar fecha de este grupo" onmouseover="this.style.transform='scale(1.15)'" onmouseout="this.style.transform='scale(1)'">💾</button>
                                    ` : ''}
                                </div>
                                <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px;">
                                    <label style="display:inline-flex; align-items:center; gap:6px; cursor:pointer; font-weight:600; color:var(--success); font-size:0.85rem;">
                                        <input type="checkbox" class="hist-group-presented-chk" data-sorteo-id="${data.id}" data-group-idx="${gIdx}" style="width:16px; height:16px; margin:0;" ${canActivarPresentado ? "" : "disabled"}>
                                        <span>Presentado</span>
                                    </label>
                                </div>
                            </div>
                        `;
                    }

                    const hasDeleteSorteo = !window.hasPermission || window.hasPermission("sortear_eliminar");
                    const deleteSorteoBtn = hasDeleteSorteo ? `<span class="delete-sorteo-btn" data-sorteo-id="${data.id}" style="color:#ef4444; font-weight:bold; cursor:pointer; margin-right:8px; font-family:sans-serif; font-size:1.1rem; vertical-align:middle;" title="Eliminar todo este sorteo">x</span>` : '';

                    const gCard = document.createElement("div");
                    gCard.className = "sorteo-group-card";
                    gCard.style.margin = "0";
                    gCard.style.backgroundColor = tipoBg;

                    gCard.innerHTML = `
                        <div class="sorteo-group-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                            <div style="display:flex; align-items:center; gap:4px; max-width:70%;">
                                ${deleteSorteoBtn}
                                <select class="hist-swap-group-head-select" data-sorteo-id="${data.id}" data-group-idx="${gIdx}" style="font-size:1rem; font-weight:bold; color:var(--primary); border:none; background:transparent; padding:0; margin:0; cursor:pointer; width:100%; outline:none; -webkit-appearance:none; -moz-appearance:none; appearance:none; font-family:inherit;">
                                    ${dropdownOptions}
                                </select>
                            </div>
                            <span style="font-size:0.85rem; color:#64748b; white-space:nowrap;">(${g.cabezasIds.length + g.integrantesIds.length} pers.)</span>
                        </div>
                        <div style="display:flex; flex-direction:column; gap:4px;">
                            ${membersHTML}
                        </div>
                        ${footerHTML}
                    `;
                    gridDiv.appendChild(gCard);
                });
            });

            section.innerHTML = headerHTML;
            section.appendChild(gridDiv);
            historialListaContainer.appendChild(section);

            // Bind date change listeners
            section.querySelectorAll(".hist-group-date-input").forEach(input => {
                input.addEventListener("change", (e) => {
                    const sId = input.getAttribute("data-sorteo-id");
                    const gIdx = parseInt(input.getAttribute("data-group-idx"));
                    const data = savedSorteos.find(s => s.id === sId);
                    if (data && data.grupos[gIdx]) {
                        data.grupos[gIdx].fechaPresentacion = e.target.value;
                        if (data.grupos[gIdx].encuestas) {
                            Object.keys(data.grupos[gIdx].encuestas).forEach(key => {
                                data.grupos[gIdx].encuestas[key].fechaPresentacion = e.target.value;
                            });
                        }
                    }
                });
            });

            // Bind presented checkboxes
            section.querySelectorAll(".hist-group-presented-chk").forEach(chk => {
                chk.addEventListener("change", async (e) => {
                    if (window.hasPermission && !window.hasPermission("sortear_activar_presentado")) {
                        alert("No tiene permiso para marcar temas como presentados.");
                        chk.checked = false;
                        return;
                    }
                    const isChecked = e.target.checked;
                    const sId = chk.getAttribute("data-sorteo-id");
                    const gIdx = parseInt(chk.getAttribute("data-group-idx"));
                    const data = savedSorteos.find(s => s.id === sId);
                    if (!data) return;
                    try {
                        data.grupos[gIdx].presentado = isChecked;
                        const sorteoRef = doc(db, "sorteos", sId);
                        await updateDoc(sorteoRef, { grupos: data.grupos });
                        window.showAlert(isChecked ? "✅ Tema marcado como presentado." : "🔄 Tema devuelto al historial.", "success");
                        await loadHistorialSorteos();
                        await loadPresentados();
                    } catch(err) {
                        console.error("Error updating presented state:", err);
                        window.showAlert("❌ Error al actualizar el estado: " + err.message, "error");
                        chk.checked = !isChecked;
                    }
                });
            });

            // Bind save dates buttons per group
            section.querySelectorAll(".btn-save-group-date").forEach(btnSave => {
                btnSave.addEventListener("click", async () => {
                    if (window.hasPermission && !window.hasPermission("sortear_cambiar_fecha")) {
                        window.showAlert("❌ No tiene permiso para actualizar las fechas.", "error");
                        return;
                    }
                    btnSave.disabled = true;
                    const sId = btnSave.getAttribute("data-sorteo-id");
                    const data = savedSorteos.find(s => s.id === sId);
                    if (!data) { btnSave.disabled = false; return; }
                    try {
                        const sorteoRef = doc(db, "sorteos", sId);
                        await updateDoc(sorteoRef, { grupos: data.grupos });
                        window.showAlert("✅ Fecha del grupo guardada correctamente.", "success");
                    } catch(e) {
                        console.error("Error updating history date for group:", e);
                        window.showAlert("❌ Error al guardar la fecha: " + e.message, "error");
                    } finally {
                        btnSave.disabled = false;
                    }
                });
            });

            // Bind delete buttons
            section.querySelectorAll(".delete-sorteo-btn").forEach(btn => {
                btn.addEventListener("click", async (e) => {
                    e.stopPropagation();
                    const sId = btn.getAttribute("data-sorteo-id");
                    const confirmed = await window.showCustomConfirm("¿Está seguro de que desea eliminar este sorteo por completo del historial? Esta acción no se puede deshacer.");
                    if (!confirmed) return;
                    try {
                        await deleteDoc(doc(db, "sorteos", sId));
                        window.showAlert("🎉 Sorteo eliminado correctamente.", "success");
                        await loadHistorialSorteos();
                        await loadPresentados();
                    } catch(err) {
                        console.error("Error deleting drawing:", err);
                        window.showAlert("❌ Error al eliminar el sorteo: " + err.message, "error");
                    }
                });
            });

            // Bind swap head selects
            section.querySelectorAll(".hist-swap-group-head-select").forEach(select => {
                select.addEventListener("change", async (e) => {
                    if (window.hasPermission && !window.hasPermission("sortear_guardar")) {
                        alert("No tiene permiso para modificar el estado de los sorteos.");
                        select.value = select.getAttribute("data-group-idx");
                        return;
                    }
                    const sId = select.getAttribute("data-sorteo-id");
                    const fromIdx = parseInt(select.getAttribute("data-group-idx"));
                    const toIdx = parseInt(e.target.value);
                    if (fromIdx === toIdx) return;
                    const data = savedSorteos.find(s => s.id === sId);
                    if (!data) return;
                    const g1 = data.grupos[fromIdx];
                    const g2 = data.grupos[toIdx];

                    [g1.cabezasIds, g2.cabezasIds] = [g2.cabezasIds, g1.cabezasIds];
                    [g1.cabezasNames, g2.cabezasNames] = [g2.cabezasNames, g1.cabezasNames];
                    [g1.integrantesIds, g2.integrantesIds] = [g2.integrantesIds, g1.integrantesIds];
                    [g1.integrantesNames, g2.integrantesNames] = [g2.integrantesNames, g1.integrantesNames];
                    [g1.nombreGrupo, g2.nombreGrupo] = [g2.nombreGrupo, g1.nombreGrupo];
                    const tmpEnc = g1.encuestas || null;
                    g1.encuestas = g2.encuestas || null;
                    g2.encuestas = tmpEnc;

                    try {
                        const sorteoRef = doc(db, "sorteos", sId);
                        await updateDoc(sorteoRef, { grupos: data.grupos });
                        window.showAlert("✅ Grupos intercambiados correctamente.", "success");
                        await loadHistorialSorteos();
                        await loadPresentados();
                    } catch(err) {
                        console.error("Error swapping history group heads:", err);
                        window.showAlert("❌ Error al intercambiar: " + err.message, "error");
                        await loadHistorialSorteos();
                    }
                });
            });
        });

        // Add click listener for historial encuestas
        document.querySelectorAll(".hist-clickable-encuesta").forEach(el => {
            const originalBg = el.style.backgroundColor || "transparent";
            el.addEventListener("mouseenter", () => {
                el.style.backgroundColor = "#f1f5f9";
            });
            el.addEventListener("mouseleave", () => {
                el.style.backgroundColor = originalBg;
            });
            el.addEventListener("click", (e) => {
                e.stopPropagation();
                const sId = el.getAttribute("data-sorteo-id");
                const gIdx = parseInt(el.getAttribute("data-group-idx"));
                const mId = el.getAttribute("data-member-id");
                const mName = el.getAttribute("data-member-name");
                const s = savedSorteos.find(item => item.id === sId);
                if (s && s.grupos && s.grupos[gIdx]) {
                    openEncuestaModal(s.grupos[gIdx], mId, mName);
                }
            });
        });

        // Repopulate temas dropdown to filter out used themes
        if (selectedComunidadId) {
            populateTemasDropdown(selectTipoSorteo.value === "Articulo" ? "Traditio Symboli" : null);
        }
    } catch(err) {
        console.error("Error loading history:", err);
        historialListaContainer.innerHTML = '<span style="font-size:0.88rem; color:#ef4444;">Error al cargar el historial.</span>';
    }
}

// ── CRUD BANCO DE TEMAS ────────────────────────────
async function loadTemas() {
    try {
        const snap = await getDocs(collection(db, "temas"));
        allTemas = [];
        temasTbody.innerHTML = '';

        snap.forEach(d => {
            const t = { id: d.id, ...d.data() };
            allTemas.push(t);
        });

        // Sort by stage name and order number
        allTemas.sort((a, b) => {
            const stageA = a.etapa || "";
            const stageB = b.etapa || "";
            const stageComp = stageA.localeCompare(stageB);
            if (stageComp !== 0) return stageComp;
            
            const ordA = a.orden !== undefined && a.orden !== null ? parseInt(a.orden) : 999;
            const ordB = b.orden !== undefined && b.orden !== null ? parseInt(b.orden) : 999;
            return ordA - ordB;
        });

        allTemas.forEach(t => {
            const tr = document.createElement("tr");
            const labelNombre = t.orden !== undefined && t.orden !== null ? `${t.orden}. ${t.nombre}` : t.nombre;
            
            const hasEdit = !window.hasPermission || window.hasPermission("sortear_temas_editar");
            const hasDelete = !window.hasPermission || window.hasPermission("sortear_temas_eliminar");

            const editBtn = hasEdit ? `<button class="btn-edit-tema" data-id="${t.id}" style="background:none; border:none; color:var(--primary); cursor:pointer; font-weight:600; font-size:0.8rem; margin-right:8px;">Editar</button>` : '';
            const deleteBtn = hasDelete ? `<button class="btn-delete-tema" data-id="${t.id}" style="background:none; border:none; color:#ef4444; cursor:pointer; font-weight:600; font-size:0.8rem;">Eliminar</button>` : '';
            const noActions = !hasEdit && !hasDelete ? '<span style="font-size:0.8rem; color:#94a3b8; font-style:italic;">Sin permisos</span>' : '';

            tr.innerHTML = `
                <td style="padding:8px; font-size:0.85rem; color:#1e293b; font-weight:600;">${labelNombre}</td>
                <td style="padding:8px; font-size:0.82rem; color:#64748b;">${t.etapa}</td>
                <td style="padding:8px; text-align:center;">
                    ${editBtn}
                    ${deleteBtn}
                    ${noActions}
                </td>
            `;

            if (hasEdit) tr.querySelector(".btn-edit-tema").addEventListener("click", () => startEditTema(t));
            if (hasDelete) tr.querySelector(".btn-delete-tema").addEventListener("click", () => deleteTema(t.id));

            temasTbody.appendChild(tr);
        });

        // Re-populate dropdowns if active
        if (selectedComunidadId) {
            populateTemasDropdown(selectTipoSorteo.value === "Articulo" ? "Traditio Symboli" : null);
        }
    } catch(err) {
        console.error("Error loading themes:", err);
    }
}

async function saveTema(e) {
    e.preventDefault();
    const nombre = inputTemaNombre.value.trim();
    const etapa = selectTemaEtapa.value;

    if (!nombre || !etapa) return;

    if (editingTemaId) {
        if (!window.hasPermission("sortear_temas_editar")) {
            alert("No tiene permiso para editar temas.");
            return;
        }
    } else {
        if (!window.hasPermission("sortear_temas_crear")) {
            alert("No tiene permiso para crear nuevos temas.");
            return;
        }
    }

    btnSaveTema.disabled = true;
    try {
        if (editingTemaId) {
            // Update
            await updateDoc(doc(db, "temas", editingTemaId), { nombre, etapa });
        } else {
            // Create
            await addDoc(collection(db, "temas"), { nombre, etapa, createdAt: new Date().toISOString() });
        }
        resetTemaForm();
        await loadTemas();
    } catch(err) {
        console.error("Error saving theme:", err);
        alert("Error al guardar tema: " + err.message);
    } finally {
        btnSaveTema.disabled = false;
    }
}

function startEditTema(t) {
    if (!window.hasPermission("sortear_temas_editar")) {
        alert("No tiene permiso para editar temas.");
        return;
    }
    editingTemaId = t.id;
    inputTemaNombre.value = t.nombre;
    selectTemaEtapa.value = t.etapa;
    btnCancelTema.style.display = "inline-block";
    btnSaveTema.textContent = "💾 Actualizar Tema";
    temaFormTitle.textContent = "✏️ Editar Tema";
}

function resetTemaForm() {
    editingTemaId = null;
    temaForm.reset();
    btnCancelTema.style.display = "none";
    btnSaveTema.textContent = "💾 Guardar Tema";
    temaFormTitle.textContent = "📝 Registrar Nuevo Tema";
}

async function deleteTema(id) {
    if (!window.hasPermission("sortear_temas_eliminar")) {
        alert("No tiene permiso para eliminar temas.");
        return;
    }
    const confirmed = await window.showCustomConfirm("¿Está seguro de que desea eliminar este tema?");
    if (!confirmed) return;
    try {
        await deleteDoc(doc(db, "temas", id));
        await loadTemas();
    } catch(err) {
        console.error("Error deleting theme:", err);
        alert("Error al eliminar tema: " + err.message);
    }
}

function formatPhoneString(phone) {
    if (!phone) return "";
    const clean = phone.replace(/\D/g, "");
    if (clean.length === 10) {
        return `(${clean.slice(0, 3)}) ${clean.slice(3, 6)}-${clean.slice(6)}`;
    }
    return phone;
}

function enforcePermissions() {
    if (!window.hasPermission) return;

    // Seleccionar Parroquia
    if (!window.hasPermission("sortear_seleccionar_parroquia")) {
        selectParroquia.disabled = true;
    } else {
        selectParroquia.disabled = false;
    }

    // Seleccionar Comunidad
    if (!window.hasPermission("sortear_seleccionar_comunidad")) {
        selectComunidad.disabled = true;
    } else {
        // Only enable if parroquia is selected
        selectComunidad.disabled = !selectedParroquiaId;
    }

    // Ejecutar Sorteo
    const canEjecutar = window.hasPermission("sortear_sortear") || window.hasPermission("sortear_ejecutar");
    if (!canEjecutar) {
        btnEjecutarSorteo.disabled = true;
        btnEjecutarSorteo.style.opacity = "0.5";
        btnEjecutarSorteo.style.cursor = "not-allowed";
        btnEjecutarSorteo.title = "No tiene permiso para ejecutar sorteos";
    } else {
        btnEjecutarSorteo.disabled = false;
        btnEjecutarSorteo.style.opacity = "1";
        btnEjecutarSorteo.style.cursor = "pointer";
        btnEjecutarSorteo.title = "";
    }

    // Guardar Resultados
    const canGuardar = window.hasPermission("sortear_sortear") || window.hasPermission("sortear_guardar");
    if (!canGuardar) {
        btnGuardarSorteo.style.display = "none";
    } else {
        btnGuardarSorteo.style.display = "inline-block";
    }

    // Crear/Guardar Temas
    const formCard = document.getElementById("tema-form")?.closest(".card");
    if (formCard) {
        if (!window.hasPermission("sortear_temas_crear") && !window.hasPermission("sortear_temas_editar") && !window.hasPermission("sortear_banco_temas")) {
            formCard.style.display = "none";
        } else {
            formCard.style.display = "block";
        }
    }

    // Enforce Tab Visibility
    const tabHistorial = document.querySelector('.tab-btn[data-tab="tab-historial"]');
    if (tabHistorial) {
        tabHistorial.style.display = window.hasPermission("sortear_ver_sorteados") ? "inline-block" : "none";
    }

    const tabAsistente = document.querySelector('.tab-btn[data-tab="tab-asistente"]');
    if (tabAsistente) {
        tabAsistente.style.display = (window.hasPermission("sortear_sortear") || window.hasPermission("sortear_ejecutar")) ? "inline-block" : "none";
    }

    const tabExternos = document.querySelector('.tab-btn[data-tab="tab-externos"]');
    if (tabExternos) {
        tabExternos.style.display = window.hasPermission("sortear_externos") ? "inline-block" : "none";
    }

    const tabPresentados = document.querySelector('.tab-btn[data-tab="tab-presentados"]');
    if (tabPresentados) {
        tabPresentados.style.display = window.hasPermission("sortear_presentados") ? "inline-block" : "none";
    }

    const tabTemas = document.querySelector('.tab-btn[data-tab="tab-temas"]');
    if (tabTemas) {
        tabTemas.style.display = window.hasPermission("sortear_banco_temas") ? "inline-block" : "none";
    }

    // If active tab is hidden, switch to the first visible tab
    const activeTabBtn = document.querySelector('.tab-btn.active');
    if (activeTabBtn && activeTabBtn.style.display === "none") {
        const firstVisibleTabBtn = Array.from(document.querySelectorAll('.tab-btn')).find(btn => btn.style.display !== "none");
        if (firstVisibleTabBtn) {
            firstVisibleTabBtn.click();
        }
    }
}

async function loadPresentados() {
    const canDevolver = !window.hasPermission || window.hasPermission("sortear_devolver");
    presentadosListaContainer.innerHTML = '';

    if (!selectedComunidadId) return;

    try {
        const q = query(
            collection(db, "sorteos"), 
            where("comunidadId", "==", selectedComunidadId)
        );
        const snap = await getDocs(q);

        if (snap.empty) {
            presentadosListaContainer.innerHTML = '<span style="font-size:0.88rem; color:#64748b; font-style:italic;">No hay temas presentados registrados para esta comunidad.</span>';
            return;
        }

        const rawList = [];
        snap.forEach(d => {
            rawList.push({ id: d.id, ...d.data() });
        });

        // Sort in memory desc
        rawList.sort((a, b) => {
            const dateA = a.fechaSorteo || "";
            const dateB = b.fechaSorteo || "";
            return dateB.localeCompare(dateA);
        });

        let totalPresentedGroups = 0;

        rawList.forEach(data => {
            const presentedGroups = data.grupos.filter(g => g.presentado);
            if (presentedGroups.length === 0) return;

            totalPresentedGroups += presentedGroups.length;

            const spouseMap = getSpouseMap();

            data.grupos.forEach((g, gIdx) => {
                if (!g.presentado) return;

                const isTraditio = data.tipo === "Articulo" || !!g.encuestas;
                const groupCouples = getGroupCouples(g, spouseMap);
                const memberCoupleIdx = {};
                groupCouples.forEach((couple, cIdx) => {
                    couple.forEach(id => {
                        memberCoupleIdx[id] = cIdx;
                    });
                });

                let membersHTML = '';

                // Heads
                g.cabezasNames?.forEach((hName, hIdx) => {
                    const hId = g.cabezasIds ? g.cabezasIds[hIdx] : "";
                    const coupleIdx = memberCoupleIdx[hId];
                    const badgeData = getMemberBadgeAndStyle(hId, hName, true, coupleIdx);
                    membersHTML += `
                        <div class="sorteo-member-item clickable-encuesta-member hist-clickable-encuesta" data-sorteo-id="${data.id}" data-group-idx="${gIdx}" data-member-id="${hId}" data-member-name="${hName}" style="${badgeData.style} cursor:pointer;" title="Ver grupo de encuesta de ${hName}">
                            <span>👤 <strong>${hName}</strong></span>
                            ${badgeData.badgeHTML}
                        </div>
                    `;
                });

                // Members
                g.integrantesNames?.forEach((mName, mIdx) => {
                    const mId = g.integrantesIds ? g.integrantesIds[mIdx] : "";
                    const cleanName = mName.replace(" (Cónyuge)", "");
                    const coupleIdx = memberCoupleIdx[mId];
                    const badgeData = getMemberBadgeAndStyle(mId, cleanName, false, coupleIdx);
                    membersHTML += `
                        <div class="sorteo-member-item clickable-encuesta-member hist-clickable-encuesta" data-sorteo-id="${data.id}" data-group-idx="${gIdx}" data-member-id="${mId}" data-member-name="${cleanName}" style="${badgeData.style} cursor:pointer;" title="Ver grupo de encuesta de ${cleanName}">
                            <span>👤 ${cleanName}</span>
                            ${badgeData.badgeHTML}
                        </div>
                    `;
                });

                const formattedDate = g.fechaPresentacion ? g.fechaPresentacion.split("-").reverse().join("/") : "";

                let dropdownOptions = '';
                data.grupos.forEach((otherG, otherIdx) => {
                    const isSelected = otherIdx === gIdx ? 'selected' : '';
                    const headName = otherG.cabezasNames && otherG.cabezasNames[0] ? otherG.cabezasNames[0] : `Grupo ${otherIdx + 1}`;
                    dropdownOptions += `<option value="${otherIdx}" ${isSelected}>${headName}</option>`;
                });

                // One card per group — goes directly into the CSS grid
                const card = document.createElement("div");
                card.className = "card";
                
                let cardBg = "white";
                if (data.tipo === "Salmos") {
                    cardBg = "#f4e73d14";
                } else if (data.tipo === "Temas") {
                    cardBg = "#3b82f614";
                } else if (data.tipo === "Articulo") {
                    cardBg = "#f43d3d14";
                }
                card.style.cssText = `padding:16px; background:${cardBg}; border:1px solid #e2e8f0; border-radius:8px; margin:0; height: -webkit-fill-available;`;

                card.innerHTML = `
                    <!-- Sorteo header -->
                    <div style="border-bottom:1px solid #e2e8f0; padding-bottom:8px; margin-bottom:12px;">
                        <div style="font-weight:600; color:var(--primary); font-size:0.95rem;">🎯 Sorteo ${data.tipo} (${data.etapa})</div>
                        <div style="font-size:0.78rem; color:#64748b;">${new Date(data.fechaSorteo).toLocaleString()}</div>
                    </div>
                    <!-- Group header -->
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                        <div style="display:flex; align-items:center; gap:4px; max-width:70%;">
                            <select class="hist-swap-group-head-select" data-sorteo-id="${data.id}" data-group-idx="${gIdx}" style="font-size:1rem; font-weight:bold; color:var(--primary); border:none; background:transparent; padding:0; margin:0; cursor:pointer; width:100%; outline:none; -webkit-appearance:none; -moz-appearance:none; appearance:none; font-family:inherit;">
                                ${dropdownOptions}
                            </select>
                        </div>
                        <span style="font-size:0.85rem; color:#64748b; white-space:nowrap;">(${g.cabezasIds.length + g.integrantesIds.length} pers.)</span>
                    </div>
                    <!-- Members -->
                    <div style="display:flex; flex-direction:column; gap:4px;">
                        ${membersHTML}
                    </div>
                    <!-- Footer -->
                    <div style="margin-top:10px; padding-top:8px; border-top:1px solid #f1f5f9; font-size:0.85rem; color:#475569;">
                        ${g.temaNombre ? `<div style="margin-bottom:5px;">📚 <strong>Tema:</strong> ${g.temaNombre}</div>` : ''}
                        <div style="display:flex; align-items:center; justify-content:space-between; gap:6px;">
                            <span>📅 <strong>Fecha:</strong> ${formattedDate}</span>
                            <label style="display:inline-flex; align-items:center; gap:4px; cursor:pointer; font-weight:600; color:#ef4444; font-size:0.82rem;">
                                <input type="checkbox" class="hist-group-unpresent-chk" data-sorteo-id="${data.id}" data-group-idx="${gIdx}" checked style="width:16px; height:16px;" ${canDevolver ? "" : "disabled"}>
                                <span>Devolver</span>
                            </label>
                        </div>
                    </div>
                `;

                presentadosListaContainer.appendChild(card);

            }); // end data.grupos.forEach

        }); // end rawList.forEach

        if (totalPresentedGroups === 0) {
            presentadosListaContainer.innerHTML = '<span style="font-size:0.88rem; color:#64748b; font-style:italic;">No hay temas presentados registrados para esta comunidad.</span>';
        }

        // ── Event listeners (attached once after all cards rendered) ──

        // Devolver (unpresent) checkbox
        presentadosListaContainer.querySelectorAll(".hist-group-unpresent-chk").forEach(chk => {
            chk.addEventListener("change", async (e) => {
                if (window.hasPermission && !window.hasPermission("sortear_devolver")) {
                    alert("No tiene permiso para modificar el estado de los sorteos.");
                    chk.checked = true;
                    return;
                }
                const sId = chk.getAttribute("data-sorteo-id");
                const gIdx = parseInt(chk.getAttribute("data-group-idx"));
                const sorteoData = rawList.find(d => d.id === sId);
                if (!sorteoData) return;
                try {
                    sorteoData.grupos[gIdx].presentado = false;
                    const sorteoRef = doc(db, "sorteos", sId);
                    await updateDoc(sorteoRef, { grupos: sorteoData.grupos });
                    window.showAlert("🔄 Tema devuelto al historial de sorteos.", "success");
                    await loadHistorialSorteos();
                    await loadPresentados();
                } catch(err) {
                    console.error("Error reverting presented state:", err);
                    window.showAlert("❌ Error: " + err.message, "error");
                    chk.checked = true;
                }
            });
        });

        // Intercambio de grupo (select cabeza)
        presentadosListaContainer.querySelectorAll(".hist-swap-group-head-select").forEach(select => {
            select.addEventListener("change", async (e) => {
                if (window.hasPermission && !window.hasPermission("sortear_guardar")) {
                    alert("No tiene permiso para modificar el estado de los sorteos.");
                    select.value = select.getAttribute("data-group-idx");
                    return;
                }
                const sId = select.getAttribute("data-sorteo-id");
                const fromIdx = parseInt(select.getAttribute("data-group-idx"));
                const toIdx = parseInt(e.target.value);
                if (fromIdx === toIdx) return;
                const sorteoData = rawList.find(d => d.id === sId);
                if (!sorteoData) return;

                const g1 = sorteoData.grupos[fromIdx];
                const g2 = sorteoData.grupos[toIdx];

                const tempCabezasIds = g1.cabezasIds; const tempCabezasNames = g1.cabezasNames;
                g1.cabezasIds = g2.cabezasIds; g1.cabezasNames = g2.cabezasNames;
                g2.cabezasIds = tempCabezasIds; g2.cabezasNames = tempCabezasNames;

                const tempIntegrantesIds = g1.integrantesIds; const tempIntegrantesNames = g1.integrantesNames;
                g1.integrantesIds = g2.integrantesIds; g1.integrantesNames = g2.integrantesNames;
                g2.integrantesIds = tempIntegrantesIds; g2.integrantesNames = tempIntegrantesNames;

                const tempNombreGrupo = g1.nombreGrupo;
                g1.nombreGrupo = g2.nombreGrupo; g2.nombreGrupo = tempNombreGrupo;

                const tempEncuestas = g1.encuestas || null;
                g1.encuestas = g2.encuestas || null; g2.encuestas = tempEncuestas;

                try {
                    await updateDoc(doc(db, "sorteos", sId), { grupos: sorteoData.grupos });
                    window.showAlert("✅ Grupos intercambiados correctamente.", "success");
                    await loadHistorialSorteos();
                    await loadPresentados();
                } catch(err) {
                    console.error("Error swapping presentados group heads:", err);
                    window.showAlert("❌ Error al intercambiar: " + err.message, "error");
                    await loadPresentados();
                }
            });
        });



        // Add click listener for historial encuestas
        document.querySelectorAll(".hist-clickable-encuesta").forEach(el => {
            const originalBg = el.style.backgroundColor || "transparent";
            el.addEventListener("mouseenter", () => {
                el.style.backgroundColor = "#f1f5f9";
            });
            el.addEventListener("mouseleave", () => {
                el.style.backgroundColor = originalBg;
            });
            el.addEventListener("click", (e) => {
                e.stopPropagation();
                const sId = el.getAttribute("data-sorteo-id");
                const gIdx = parseInt(el.getAttribute("data-group-idx"));
                const mId = el.getAttribute("data-member-id");
                const mName = el.getAttribute("data-member-name");
                const s = savedSorteos.find(item => item.id === sId);
                if (s && s.grupos && s.grupos[gIdx]) {
                    openEncuestaModal(s.grupos[gIdx], mId, mName);
                }
            });
        });

    } catch(err) {
        console.error("Error loading presentados:", err);
        presentadosListaContainer.innerHTML = '<span style="font-size:0.88rem; color:#ef4444;">Error al cargar temas presentados.</span>';
    }
}

let externoGroupCounter = 0;

function addExternoGroupCard() {
    const container = document.getElementById("externo-grupos-list-container");
    const gIdx = externoGroupCounter++;

    const card = document.createElement("div");
    card.className = "card";
    card.id = `externo-group-card-${gIdx}`;
    card.style.cssText = "padding: 16px; border: 1px solid #cbd5e1; border-radius: 8px; background: #f8fafc; position: relative; margin-bottom: 12px;";

    // Cabeza Options
    let cabezaOptions = '<option value="">— Seleccionar Cabeza —</option>';
    allHermanos.forEach(h => {
        cabezaOptions += `<option value="${h.id}">${h.name}</option>`;
    });

    // Tema Options
    let temaOptions = '<option value="">— Seleccionar Tema —</option>';
    const extTipoSelect = document.getElementById("externo-tipo-sorteo");
    const extTipo = extTipoSelect ? extTipoSelect.value : "Temas";

    if (extTipo === "Temas" || extTipo === "Articulo") {
        const sourceArray = extTipo === "Temas" ? catalogTemas : allTemas;
        const targetStage = extTipo === "Articulo" ? "Traditio Symboli" : selectedComunidadEtapa;
        const stageThemes = sourceArray.filter(t => t.etapa && t.etapa.toLowerCase() === targetStage.toLowerCase());
        stageThemes.sort((a, b) => {
            const ordA = a.orden !== undefined && a.orden !== null ? parseInt(a.orden) : 999;
            const ordB = b.orden !== undefined && b.orden !== null ? parseInt(b.orden) : 999;
            return ordA - ordB;
        });
        stageThemes.forEach(t => {
            const label = t.orden !== undefined && t.orden !== null ? `${t.orden}. ${t.nombre}` : t.nombre;
            temaOptions += `<option value="${t.id}" data-name="${t.nombre}">${label}</option>`;
        });
    } else if (extTipo === "Salmos") {
        for (let i = 1; i <= 150; i++) {
            temaOptions += `<option value="salmo_${i}" data-name="Salmo ${i}">Salmo ${i}</option>`;
        }
    }

    const showTemaField = (extTipo !== "Simple" && extTipo !== "Eucaristia");
    const temaColStyle = showTemaField ? "" : "display: none;";

    // Integrantes Checklist HTML
    let integrantesChecklist = '';
    allHermanos.forEach(h => {
        integrantesChecklist += `
            <label style="display:flex; align-items:center; gap:6px; font-size:0.82rem; color:#334155; cursor:pointer;">
                <input type="checkbox" class="externo-member-chk" value="${h.id}" data-name="${h.name}">
                <span>${h.name}</span>
            </label>
        `;
    });

    card.innerHTML = `
        <button type="button" class="btn-remove-externo-group" data-gidx="${gIdx}" style="position:absolute; top:12px; right:12px; background:none; border:none; color:#ef4444; font-weight:bold; cursor:pointer; font-size:0.9rem;">✕ Quitar</button>
        <div style="font-weight:bold; color:var(--primary); margin-bottom:12px; font-size:0.92rem;">Grupo #${container.children.length + 1}</div>
        
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:15px; margin-bottom:12px;">
            <div>
                <label style="font-weight:600; color:#475569; font-size:0.8rem; display:block; margin-bottom:4px;">Cabeza del Grupo *</label>
                <select class="externo-cabeza-select" required style="width:100%; padding:6px; border-radius:4px; border:1px solid #ccc; font-size:0.82rem; background:white; height:32px;">
                    ${cabezaOptions}
                </select>
            </div>
            <div id="externo-tema-col-${gIdx}" style="${temaColStyle}">
                <label style="font-weight:600; color:#475569; font-size:0.8rem; display:block; margin-bottom:4px;">Tema/Artículo</label>
                <select class="externo-tema-select" style="width:100%; padding:6px; border-radius:4px; border:1px solid #ccc; font-size:0.82rem; background:white; height:32px;">
                    ${temaOptions}
                </select>
            </div>
            <div>
                <label style="font-weight:600; color:#475569; font-size:0.8rem; display:block; margin-bottom:4px;">Fecha de Presentación</label>
                <input type="date" class="externo-fecha-pres" style="width:100%; padding:6px; border-radius:4px; border:1px solid #ccc; font-size:0.82rem; height:32px; font-family:sans-serif;">
            </div>
            <div style="display:flex; align-items:center; padding-top:18px;">
                <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-weight:600; color:var(--success); font-size:0.82rem;">
                    <input type="checkbox" class="externo-presentado-chk" style="width:16px; height:16px;">
                    <span>Marcar como Presentado</span>
                </label>
            </div>
        </div>

        <div>
            <label style="font-weight:600; color:#475569; font-size:0.8rem; display:block; margin-bottom:4px;">Integrantes del Grupo</label>
            <div style="border:1px solid #ccc; border-radius:4px; background:white; padding:8px; max-height:max-content; overflow-y:auto; display:grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap:6px;">
                ${integrantesChecklist}
            </div>
        </div>
    `;

    container.appendChild(card);

    // Remove group listener
    card.querySelector(".btn-remove-externo-group").addEventListener("click", () => {
        container.removeChild(card);
        // Rename remaining headers
        Array.from(container.children).forEach((child, index) => {
            child.querySelector("div").textContent = `Grupo #${index + 1}`;
        });
    });
}

async function saveSorteoExterno(e) {
    e.preventDefault();
    if (window.hasPermission && !window.hasPermission("sortear_externos")) {
        window.showAlert("No tiene permiso para registrar sorteos externos.", "error");
        return;
    }
    if (!selectedComunidadId) {
        window.showAlert("Por favor, seleccione una comunidad antes de registrar un sorteo.", "error");
        return;
    }

    const type = document.getElementById("externo-tipo-sorteo").value;
    const drawingDate = document.getElementById("externo-fecha-sorteo").value;

    const groupCards = document.querySelectorAll("#externo-grupos-list-container > div");
    if (groupCards.length === 0) {
        window.showAlert("Por favor, añada al menos un grupo al sorteo.", "error");
        return;
    }

    const grupos = [];
    let isValid = true;

    groupCards.forEach(card => {
        const cabezaSelect = card.querySelector(".externo-cabeza-select");
        const cabezaId = cabezaSelect.value;
        const cabezaName = cabezaSelect.options[cabezaSelect.selectedIndex].text;

        if (!cabezaId) {
            isValid = false;
            return;
        }

        const temaSelect = card.querySelector(".externo-tema-select");
        const temaId = temaSelect.value || "";
        const temaNombre = temaSelect.selectedIndex > 0 ? temaSelect.options[temaSelect.selectedIndex].getAttribute("data-name") : "";

        const fechaPres = card.querySelector(".externo-fecha-pres").value || "";
        const presentado = card.querySelector(".externo-presentado-chk").checked;

        // Collect integrantes
        const cabezasIds = [cabezaId];
        const cabezasNames = [cabezaName];
        const integrantesIds = [];
        const integrantesNames = [];

        card.querySelectorAll(".externo-member-chk:checked").forEach(chk => {
            const mId = chk.value;
            const mName = chk.getAttribute("data-name");
            if (mId !== cabezaId) { // avoid duplicate head in members
                integrantesIds.push(mId);
                integrantesNames.push(mName);
            }
        });

        grupos.push({
            nombreGrupo: `Grupo de ${cabezaName}`,
            cabezasIds,
            cabezasNames,
            integrantesIds,
            integrantesNames,
            temaId,
            temaNombre,
            fechaPresentacion: fechaPres,
            presentado
        });
    });

    if (!isValid) {
        window.showAlert("Por favor, complete la cabeza de todos los grupos.", "error");
        return;
    }

    const btnSubmit = document.getElementById("btn-save-externo");
    btnSubmit.disabled = true;

    try {
        const sorteoData = {
            comunidadId: selectedComunidadId,
            parroquiaId: selectedParroquiaId,
            tipo: type,
            etapa: selectedComunidadEtapa,
            fechaSorteo: drawingDate ? new Date(drawingDate).toISOString() : "",
            grupos: grupos,
            externo: true
        };

        await addDoc(collection(db, "sorteos"), sorteoData);
        window.showAlert("✅ Sorteo manual/externo registrado con éxito.", "success");
        
        // Reset form
        document.getElementById("form-sorteo-externo").reset();
        document.getElementById("externo-grupos-list-container").innerHTML = '';
        
        // Reload history & presentados
        await loadHistorialSorteos();
        await loadPresentados();
    } catch(err) {
        console.error("Error saving external drawing:", err);
        window.showAlert("❌ Error al guardar sorteo externo: " + err.message, "error");
    } finally {
        btnSubmit.disabled = false;
    }
}
