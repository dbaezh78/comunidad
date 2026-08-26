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
const inputFechaInicio = document.getElementById("asistente-fecha-inicio");
const btnEjecutarSorteo = document.getElementById("btn-ejecutar-sorteo");
const resultadosContainer = document.getElementById("resultados-sorteo-container");
const resultadosGrid = document.getElementById("resultados-grupos-grid");
const btnGuardarSorteo = document.getElementById("btn-guardar-sorteo");

// Tab 2: Historial
const historialListaContainer = document.getElementById("historial-lista-container");

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
    
    // Tema form submit
    temaForm.addEventListener("submit", saveTema);
    btnCancelTema.addEventListener("click", resetTemaForm);

    // Initial themes load
    await loadTemas();
});

// App ready listener from Auth
window.addEventListener("app:ready", async (e) => {
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
    selectedParroquiaId = selectParroquia.value;
    selectComunidad.innerHTML = '<option value="">— Primero parroquia —</option>';
    selectComunidad.disabled = true;
    labelEtapaActual.textContent = "—";
    headsCheckboxesList.innerHTML = '<span style="font-size:0.82rem; color:#94a3b8; font-style:italic;">Seleccione la comunidad primero...</span>';
    
    if (!selectedParroquiaId) return;

    try {
        const snap = await getDocs(collection(db, "parroquias", selectedParroquiaId, "comunidades"));
        selectComunidad.innerHTML = '<option value="">— Seleccionar Comunidad —</option>';
        selectComunidad.disabled = false;
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

// Comunidad Change
async function onComunidadChange() {
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
    }

    // Load Sibling list of the selected community
    await loadHermanosComunidad();

    // Populate heads list
    populateHeadsList();

    // Enable/disable steps based on selectedComunidadEtapa
    configureSorteoSteps();

    // Load History
    await loadHistorialSorteos();
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
    if (val === "Temas" || val === "Articulo") {
        paramSimpleGroup.style.display = "none";
        paramTemasGroup.style.display = "block";
        populateTemasDropdown(val === "Articulo" ? "Traditio Symboli" : null);
    } else {
        paramSimpleGroup.style.display = "block";
        paramTemasGroup.style.display = "none";
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
}

// Populate themes dropdown
function populateTemasDropdown(overrideStage = null) {
    selectTema.innerHTML = '<option value="">— Seleccionar Tema —</option>';
    const targetStage = overrideStage || selectedComunidadEtapa;
    const filtered = allTemas.filter(t => t.etapa && t.etapa.toLowerCase() === targetStage.toLowerCase());
    
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

    // Determine group size automatically if simple draw and auto-sizing is chosen
    if (tipo === "Simple" && targetSize === "auto") {
        const total = allHermanos.length;
        if (total >= 30) {
            targetSize = 6;
        } else if (total >= 20) {
            targetSize = 5;
        } else {
            targetSize = 4;
        }
    } else if (tipo === "Eucaristia") {
        const total = allHermanos.length;
        if (total <= 13) {
            targetSize = 4;
        } else {
            targetSize = 5;
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
        groupsCount = Math.max(1, Math.floor(allHermanos.length / targetSize));
        
        // Randomly select G heads from the list, avoiding picking active spouses together if possible
        const shuffled = [...remainingHermanos].sort(() => Math.random() - 0.5);
        for (let i = 0; i < groupsCount; i++) {
            if (shuffled.length > 0) {
                const picked = shuffled.shift();
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
        groups.push({
            nombreGrupo: `Grupo de ${headHno.name}`,
            cabezasIds: [headHno.id],
            cabezasNames: [headHno.name],
            integrantesIds: [],
            integrantesNames: [],
            temaId: "",
            temaNombre: "",
            fechaPresentacion: ""
        });
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

        const initialThemeObj = allTemas.find(t => t.id === themeId);
        const stageThemes = allTemas.filter(t => t.etapa.toLowerCase() === selectedComunidadEtapa.toLowerCase());
        
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
    }

    currentResults = groups;
    renderResultsGrid();
}

function renderResultsGrid() {
    resultadosGrid.innerHTML = '';
    resultadosContainer.style.display = "block";

    currentResults.forEach((g, idx) => {
        const card = document.createElement("div");
        card.className = "sorteo-group-card";

        let membersHTML = '';
        
        // Heads
        g.cabezasNames.forEach(hName => {
            membersHTML += `
                <div class="sorteo-member-item">
                    <span>👤 <strong>${hName}</strong></span>
                    <span class="badge-role badge-head">Cabeza</span>
                </div>
            `;
        });

        // Members
        g.integrantesNames.forEach(mName => {
            const isSpouse = mName.includes("(Cónyuge)");
            membersHTML += `
                <div class="sorteo-member-item">
                    <span>👤 ${mName.replace(" (Cónyuge)", "")}</span>
                    <span class="badge-role ${isSpouse ? 'badge-spouse' : 'badge-member'}">${isSpouse ? 'Cónyuge' : 'Integrante'}</span>
                </div>
            `;
        });

        let footerHTML = '';
        if (g.temaNombre) {
            // Formatear la fecha
            const parts = g.fechaPresentacion.split("-");
            const formattedDate = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : g.fechaPresentacion;
            footerHTML = `
                <div style="margin-top:12px; padding-top:10px; border-top:1px solid #f1f5f9; font-size:0.85rem; color:#475569;">
                    <div style="margin-bottom:3px;">📚 <strong>Tema:</strong> ${g.temaNombre}</div>
                    <div>📅 <strong>Fecha:</strong> ${formattedDate}</div>
                </div>
            `;
        }

        card.innerHTML = `
            <div class="sorteo-group-header">
                <span>${g.nombreGrupo}</span>
                <span style="font-size:0.85rem; color:#64748b;">(${g.cabezasIds.length + g.integrantesIds.length} pers.)</span>
            </div>
            <div style="display:flex; flex-direction:column; gap:4px;">
                ${membersHTML}
            </div>
            ${footerHTML}
        `;
        resultadosGrid.appendChild(card);
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
        alert("🎉 Sorteo guardado correctamente.");
        resultadosContainer.style.display = "none";
        currentResults = null;
        
        await loadHistorialSorteos();
    } catch(err) {
        console.error("Error saving drawing:", err);
        alert("Error al guardar sorteo: " + err.message);
    } finally {
        btnGuardarSorteo.disabled = false;
    }
}

// Load Historial
async function loadHistorialSorteos() {
    historialListaContainer.innerHTML = '';
    selectReutilizar.innerHTML = '<option value="">— Seleccionar sorteo anterior —</option>';
    savedSorteos = [];

    if (!selectedComunidadId) return;

    try {
        const q = query(
            collection(db, "sorteos"), 
            where("comunidadId", "==", selectedComunidadId),
            orderBy("fechaSorteo", "desc")
        );
        const snap = await getDocs(q);

        if (snap.empty) {
            historialListaContainer.innerHTML = '<span style="font-size:0.88rem; color:#64748b; font-style:italic;">No hay sorteos anteriores registrados para esta comunidad.</span>';
            return;
        }

        snap.forEach(d => {
            const data = d.data();
            const s = { id: d.id, ...data };
            savedSorteos.push(s);

            // Populate reuse select option
            const fDate = new Date(data.fechaSorteo).toLocaleDateString();
            selectReutilizar.appendChild(new Option(`${data.tipo} (${fDate}) - ${data.grupos.length} grupos`, d.id));

            // Create card in historial
            const card = document.createElement("div");
            card.style.cssText = "border: 1px solid #cbd5e1; border-radius: 6px; padding: 12px; margin-bottom: 12px; background: white;";
            
            let gruposSummary = '';
            data.grupos.forEach(g => {
                gruposSummary += `
                    <div style="margin-top:8px; padding-left:12px; border-left:3px solid var(--primary);">
                        <strong style="font-size:0.85rem; color:var(--primary);">${g.nombreGrupo}</strong>
                        <div style="font-size:0.8rem; color:#475569;">
                            Cabezas: ${g.cabezasNames?.join(", ") || "—"} <br>
                            Integrantes: ${g.integrantesNames?.map(n => n.replace(" (Cónyuge)", "")).join(", ") || "Ninguno"}
                            ${g.temaNombre ? `<br>📚 Tema: ${g.temaNombre} | 📅 Fecha: ${g.fechaPresentacion}` : ''}
                        </div>
                    </div>
                `;
            });

            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #e2e8f0; padding-bottom:6px; margin-bottom:6px;">
                    <strong style="color:#1e293b;">🎯 Sorteo ${data.tipo} (${data.etapa})</strong>
                    <span style="font-size:0.75rem; color:#64748b;">${new Date(data.fechaSorteo).toLocaleString()}</span>
                </div>
                ${gruposSummary}
            `;
            historialListaContainer.appendChild(card);
        });
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
            tr.innerHTML = `
                <td style="padding:8px; font-size:0.85rem; color:#1e293b; font-weight:600;">${labelNombre}</td>
                <td style="padding:8px; font-size:0.82rem; color:#64748b;">${t.etapa}</td>
                <td style="padding:8px; text-align:center;">
                    <button class="btn-edit-tema" data-id="${t.id}" style="background:none; border:none; color:var(--primary); cursor:pointer; font-weight:600; font-size:0.8rem; margin-right:8px;">Editar</button>
                    <button class="btn-delete-tema" data-id="${t.id}" style="background:none; border:none; color:#ef4444; cursor:pointer; font-weight:600; font-size:0.8rem;">Eliminar</button>
                </td>
            `;

            tr.querySelector(".btn-edit-tema").addEventListener("click", () => startEditTema(t));
            tr.querySelector(".btn-delete-tema").addEventListener("click", () => deleteTema(t.id));

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
    if (!confirm("¿Está seguro de que desea eliminar este tema?")) return;
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
