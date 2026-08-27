// ================================================
// COMUNIDAD-APP.JS — Logica de comunidad.html
// ================================================
import { db } from "./firebase.js";
import { collection, doc, getDoc, setDoc, addDoc,
         getDocs, updateDoc, query, where,
         orderBy, deleteDoc }  from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

// ── DOM ──────────────────────────────────────────
const selParroquia       = document.getElementById("sel-parroquia");
const selComunidad       = document.getElementById("sel-comunidad");
const btnNueva           = document.getElementById("btn-nueva-comunidad");
const loadingState       = document.getElementById("loading-state");
const mainPanel          = document.getElementById("main-panel");
const globalAlert        = document.getElementById("global-alert");

// Datos card
const btnToggleDatos     = document.getElementById("btn-toggle-datos");
const datosView          = document.getElementById("datos-view");
const datosForm          = document.getElementById("datos-form");
const btnSaveDatos       = document.getElementById("btn-save-datos");
const btnCancelDatos     = document.getElementById("btn-cancel-datos");
const cNumero            = document.getElementById("c-numero");
const cFecha             = document.getElementById("c-fecha");
const cTipo              = document.getElementById("c-tipo");
const cOrigen            = document.getElementById("c-origen");
const origenWrap         = document.getElementById("origen-wrap");
const cCatequistaParroquia = document.getElementById("c-catequista-parroquia");
const cCatequistaComunidad = document.getElementById("c-catequista-comunidad");
const cCatequistaHermano   = document.getElementById("c-catequista-hermano");
const dCatequista        = document.getElementById("d-catequista");
const dEtapa             = document.getElementById("d-etapa");
const cEtapa             = document.getElementById("c-etapa");
const cDiaCelebracion    = document.getElementById("c-dia-celebracion");
const cSalonCelebracion  = document.getElementById("c-salon-celebracion");
const cHoraCelebracion   = document.getElementById("c-hora-celebracion");
const dDiaCelebracion    = document.getElementById("d-dia-celebracion");
const dSalonCelebracion  = document.getElementById("d-salon-celebracion");
const dHoraCelebracion   = document.getElementById("d-hora-celebracion");
const dActivos           = document.getElementById("d-activos");
const dInactivos         = document.getElementById("d-inactivos");

// Responsables
const respTbody          = document.getElementById("resp-tbody");
const cardResponsables   = document.getElementById("card-responsables");
const cardHermanos       = document.getElementById("card-hermanos");
const btnDeleteComunidad = document.getElementById("btn-delete-comunidad");

// Hermanos lista
const hermanosTable      = document.getElementById("hermanos-table");
const hermanosTbody      = document.getElementById("hermanos-tbody");
const hermanosEmpty      = document.getElementById("hermanos-empty");
const hermanosLoading    = document.getElementById("hermanos-loading");
const hermanosCount      = document.getElementById("hermanos-count");

// Estado
let currentParroquiaId   = null;
let currentComunidadId   = null;
let currentComunidadData = null;
let allHermanos          = [];        // hermanos del sistema para busqueda
let responsablesAsignados = {};       // { 1: {hermanoId, parejaId, esCasado}, ... }
let cachedParroquias     = {};        // parroquiaId -> nombre
window.todasComunidades     = [];        // all communities in system
let isCreatingNew        = false;
let allItinerarios       = [];
let loggedInUserComunidadId = null;
let loggedInUserParroquiaId = null;
let loggedInUserRole      = "hermano";

let currentSortColumn   = "parroquiaNombre";
let currentSortDir      = "asc";
let activeFilters       = { parroquiaNombre: [], numero: [], etapaNombre: [], catequistaNombre: [] };
let filterHistory       = [];

const NUMS_RESP = ["","1ro","2do","3ro","4to","5to","6to","7mo","8vo"];

// ── App ready ────────────────────────────────────
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
            console.error("Error loading user profile in comunidad:", err);
        }
    }

    await loadParroquias();
    await loadItinerarios();
    await loadAllComunidades();
    setupCatequistaSelectors();
    setupSortingListeners();
    enforcePermissions();

    const isNotAdmin = !window.userPermissions?.adminTotal && window.userPermissions?.rol !== "admin" && !window.hasPermission("comunidad_consultar");
    if (isNotAdmin && loggedInUserParroquiaId && loggedInUserComunidadId) {
        selParroquia.value = loggedInUserParroquiaId;
        currentParroquiaId = loggedInUserParroquiaId;
        
        // Populate selComunidad with only the user's community
        selComunidad.innerHTML = '<option value="">— Seleccionar comunidad —</option>';
        const snap = await getDocs(collection(db, "parroquias", currentParroquiaId, "comunidades"));
        snap.forEach(d => {
            if (d.id === loggedInUserComunidadId) {
                const num = d.data().numero || d.id;
                selComunidad.appendChild(new Option(`Comunidad ${num}`, d.id));
            }
        });
        selComunidad.value = loggedInUserComunidadId;
        selComunidad.disabled = false;
        currentComunidadId = loggedInUserComunidadId;
        await loadComunidad();
    }

    const searchInput = document.getElementById("search-comunidades");
    if (searchInput) {
        searchInput.addEventListener("input", () => filterComunidades());
    }
});

async function loadItinerarios() {
    cEtapa.innerHTML = '<option value="">— Seleccionar Etapa —</option>';
    allItinerarios = [];
    try {
        const snap = await getDocs(query(collection(db, "itinerario"), orderBy("createdAt", "asc")));
        snap.forEach(d => {
            const data = { id: d.id, nombre: d.data().nombre };
            allItinerarios.push(data);
            cEtapa.appendChild(new Option(data.nombre, data.id));
        });
        renderEtapasFechasTable();
    } catch(e) {
        console.error("Error loading stages list:", e);
    }
}

function renderEtapasFechasTable() {
    const tbody = document.getElementById("comunidad-etapas-fechas-tbody");
    if (!tbody) return;
    tbody.innerHTML = '';
    
    const canSaveFechas = !window.hasPermission || window.hasPermission("comunidad_guardar_fechas");
    
    allItinerarios.forEach(it => {
        const row = document.createElement("tr");
        row.style.borderBottom = "1px solid #e2e8f0";
        row.innerHTML = `
            <td style="padding: 8px 6px; color: #334155; font-weight: 500;">${it.nombre}</td>
            <td style="padding: 8px 6px;">
                <input type="date" class="comunidad-etapa-date-input" data-etapa-id="${it.id}" ${canSaveFechas ? "" : "disabled"} style="width: 100%; padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 0.8rem; font-family: sans-serif;">
            </td>
        `;
        tbody.appendChild(row);
    });
}

// ── Parroquias ────────────────────────────────────
async function loadParroquias() {
    const snap = await getDocs(collection(db, "parroquias"));
    selParroquia.innerHTML = '<option value="">— Seleccionar —</option>';
    cCatequistaParroquia.innerHTML = '<option value="">— Seleccionar parroquia —</option>';
    cachedParroquias = {};
    
    const isNotAdmin = !window.userPermissions?.adminTotal && window.userPermissions?.rol !== "admin" && !window.hasPermission("comunidad_consultar");

    snap.forEach(d => {
        if (isNotAdmin && loggedInUserParroquiaId && d.id !== loggedInUserParroquiaId) {
            return;
        }
        const opt = new Option(d.data().nombre, d.id);
        selParroquia.appendChild(opt);
        cCatequistaParroquia.appendChild(new Option(d.data().nombre, d.id));
        cachedParroquias[d.id] = d.data().nombre;
    });
}

async function loadComunidadesForCatequista(pid) {
    cCatequistaComunidad.innerHTML = '<option value="">— Seleccionar comunidad —</option>';
    cCatequistaComunidad.disabled = true;
    cCatequistaHermano.innerHTML = '<option value="">— Seleccionar hermano —</option>';
    cCatequistaHermano.disabled = true;
    if (!pid) return;

    cCatequistaComunidad.innerHTML = '<option value="">Cargando...</option>';
    try {
        const snap = await getDocs(collection(db, "parroquias", pid, "comunidades"));
        cCatequistaComunidad.innerHTML = '<option value="">— Seleccionar comunidad —</option>';
        snap.forEach(d => {
            const num = d.data().numero || d.id;
            cCatequistaComunidad.appendChild(new Option(`Comunidad ${num}`, d.id));
        });
        cCatequistaComunidad.disabled = false;
    } catch(e) {
        console.error(e);
        cCatequistaComunidad.innerHTML = '<option value="">Error</option>';
    }
}

async function loadHermanosForCatequista(cid) {
    cCatequistaHermano.innerHTML = '<option value="">— Seleccionar hermano —</option>';
    cCatequistaHermano.disabled = true;
    if (!cid) return;

    cCatequistaHermano.innerHTML = '<option value="">Cargando...</option>';
    try {
        const snap = await getDocs(query(collection(db, "hermanos"), where("comunidadId", "==", cid)));
        cCatequistaHermano.innerHTML = '<option value="">— Seleccionar hermano —</option>';
        snap.forEach(d => {
            const h = d.data();
            if (h.activo !== false) {
                const nombre = `${h.primerNombre} ${h.primerApellido}`;
                cCatequistaHermano.appendChild(new Option(nombre, d.id));
            }
        });
        cCatequistaHermano.disabled = false;
    } catch(e) {
        console.error(e);
        cCatequistaHermano.innerHTML = '<option value="">Error</option>';
    }
}

function setupCatequistaSelectors() {
    cCatequistaParroquia.addEventListener("change", () => loadComunidadesForCatequista(cCatequistaParroquia.value));
    cCatequistaComunidad.addEventListener("change", () => loadHermanosForCatequista(cCatequistaComunidad.value));
}

selParroquia.addEventListener("change", async () => {
    currentParroquiaId = selParroquia.value;
    selComunidad.innerHTML = '<option value="">— Cargando... —</option>';
    selComunidad.disabled = true;
    mainPanel.style.display = "none";
    if (!currentParroquiaId) return;

    const snap = await getDocs(
        collection(db, "parroquias", currentParroquiaId, "comunidades")
    );
    selComunidad.innerHTML = '<option value="">— Seleccionar comunidad —</option>';
    
    const isNotAdmin = !window.userPermissions?.adminTotal && window.userPermissions?.rol !== "admin" && !window.hasPermission("comunidad_consultar");

    snap.forEach(d => {
        if (isNotAdmin && loggedInUserComunidadId && d.id !== loggedInUserComunidadId) {
            return;
        }
        const num = d.data().numero || d.id;
        selComunidad.appendChild(new Option(`Comunidad ${num}`, d.id));
    });
    selComunidad.disabled = false;
});

selComunidad.addEventListener("change", async () => {
    currentComunidadId = selComunidad.value;
    if (!currentComunidadId) { mainPanel.style.display = "none"; return; }
    await loadComunidad();
});

// ── Nueva comunidad ───────────────────────────────
btnNueva.addEventListener("click", async () => {
    if (!currentParroquiaId) { showAlert("Selecciona primero una parroquia.", "error"); return; }

    isCreatingNew = true;
    
    // Calcular el siguiente número disponible de comunidad
    let maxNum = 0;
    Array.from(selComunidad.options).forEach(opt => {
        if (!opt.value) return;
        const match = opt.textContent.match(/\d+/);
        if (match) {
            const val = parseInt(match[0]);
            if (val > maxNum) maxNum = val;
        }
    });
    const nextNum = maxNum + 1;

    // Inicializar el formulario para creación
    cNumero.value = nextNum;
    cFecha.value  = "";
    cTipo.value   = "normal";
    cOrigen.value = "";
    cEtapa.value  = "";
    origenWrap.style.display = "none";

    // Clear stages dates in form
    document.querySelectorAll(".comunidad-etapa-date-input").forEach(input => {
        input.value = "";
    });

    // Limpiar Catequista
    cCatequistaParroquia.value = "";
    cCatequistaComunidad.innerHTML = '<option value="">— Seleccionar comunidad —</option>';
    cCatequistaComunidad.disabled = true;
    cCatequistaHermano.innerHTML = '<option value="">— Seleccionar hermano —</option>';
    cCatequistaHermano.disabled = true;

    // Configurar paneles
    mainPanel.style.display = "block";
    datosView.style.display = "none";
    datosForm.style.display = "block";
    cardResponsables.style.display = "none";
    cardHermanos.style.display = "none";
    btnDeleteComunidad.style.display = "none";
});

// ── Cargar comunidad ──────────────────────────────
async function loadComunidad() {
    showLoading(true);
    mainPanel.style.display = "none";

    const cRef  = doc(db, "parroquias", currentParroquiaId, "comunidades", currentComunidadId);
    const cSnap = await getDoc(cRef);

    if (!cSnap.exists()) { showAlert("Comunidad no encontrada.", "error"); showLoading(false); return; }

    currentComunidadData = { id: cSnap.id, ...cSnap.data() };
    responsablesAsignados = {};

    // Cargar nombre parroquia
    const pSnap = await getDoc(doc(db, "parroquias", currentParroquiaId));
    const nombreParroquia = pSnap.exists() ? pSnap.data().nombre : currentParroquiaId;

    renderDatosView(currentComunidadData, nombreParroquia);
    await loadCommunityCode(currentComunidadId);
    await loadHermanos();

    mainPanel.style.display = "block";
    showLoading(false);
    datosForm.style.display = "none";
    datosView.style.display = "block";
    cardResponsables.style.display = "block";
    cardHermanos.style.display = "block";
    btnDeleteComunidad.style.display = (window.hasPermission && window.hasPermission("comunidad_eliminar")) ? "block" : "none";
}

// ── Vista datos ───────────────────────────────────
function renderDatosView(c, nombreParroquia) {
    document.getElementById("d-parroquia").textContent = nombreParroquia;
    document.getElementById("d-numero").textContent    = `Comunidad ${c.numero}`;
    document.getElementById("d-fecha").textContent     = c.fechaFormacion
        ? new Date(c.fechaFormacion + "T00:00:00").toLocaleDateString("es-DO", {day:"2-digit",month:"long",year:"numeric"})
        : "—";
    const tipoMap = { normal:"Normal", union:"Unión", fusion:"Fusión" };
    document.getElementById("d-tipo").textContent      = tipoMap[c.tipo] || "Normal";
    
    // Mostrar nombre y teléfono del catequista
    dCatequista.textContent = c.catequistaNombre 
        ? (c.catequistaTelefono ? `${c.catequistaNombre} (${c.catequistaTelefono})` : c.catequistaNombre) 
        : "—";

    // Mostrar etapa
    dEtapa.textContent = c.etapaNombre || "—";
    dDiaCelebracion.textContent = c.diaCelebracion || "—";
    dSalonCelebracion.textContent = c.salonCelebracion || "—";
    dHoraCelebracion.textContent = c.horaCelebracion || "—";

    const origenWrapView = document.getElementById("d-origen-wrap");
    if (c.comunidadesOrigen?.length) {
        document.getElementById("d-origen").textContent = c.comunidadesOrigen.join(", ");
        origenWrapView.style.display = "block";
    } else {
        origenWrapView.style.display = "none";
    }

    // Render read-only stages completed
    const readList = document.getElementById("read-comunidad-etapas-list");
    if (readList) {
        readList.innerHTML = '';
        const stagesFechas = c.etapasFechas || {};
        const completedStages = [];
        
        allItinerarios.forEach(it => {
            if (stagesFechas[it.id]) {
                const formatted = stagesFechas[it.id].split("-").reverse().join("/");
                completedStages.push({ nombre: it.nombre, fecha: formatted });
            }
        });
        
        if (completedStages.length === 0) {
            readList.innerHTML = '<span style="font-size:0.82rem; color:#64748b; font-style:italic;">No hay registros de etapas concluidas.</span>';
        } else {
            completedStages.forEach(cs => {
                const badge = document.createElement("span");
                badge.style.cssText = "background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 4px; padding: 4px 8px; font-size: 0.8rem; font-weight: 500; color: #475569;";
                badge.innerHTML = `🎓 <strong>${cs.nombre}</strong> (${cs.fecha})`;
                readList.appendChild(badge);
            });
        }
    }
}

// ── Editor datos ──────────────────────────────────
btnToggleDatos.addEventListener("click", async () => {
    const editing = datosForm.style.display !== "none";
    if (editing) { datosForm.style.display = "none"; datosView.style.display = "block"; return; }

    isCreatingNew = false;
    btnDeleteComunidad.style.display = (window.hasPermission && window.hasPermission("comunidad_eliminar")) ? "block" : "none";

    const c = currentComunidadData;
    cNumero.value = c.numero || "";
    cFecha.value  = c.fechaFormacion || "";
    cTipo.value   = c.tipo || "normal";
    cOrigen.value = (c.comunidadesOrigen || []).join(", ");
    cEtapa.value  = c.etapaId || "";
    cDiaCelebracion.value = c.diaCelebracion || "";
    cSalonCelebracion.value = c.salonCelebracion || "";
    cHoraCelebracion.value = c.horaCelebracion || "";
    origenWrap.style.display = (c.tipo !== "normal") ? "block" : "none";

    // Load stages dates in form
    const stagesFechas = c.etapasFechas || {};
    document.querySelectorAll(".comunidad-etapa-date-input").forEach(input => {
        const stageId = input.getAttribute("data-etapa-id");
        input.value = stagesFechas[stageId] || "";
    });

    // Pre-cargar selectores de catequista si tiene uno guardado
    cCatequistaParroquia.value = "";
    cCatequistaComunidad.innerHTML = '<option value="">— Seleccionar comunidad —</option>';
    cCatequistaComunidad.disabled = true;
    cCatequistaHermano.innerHTML = '<option value="">— Seleccionar hermano —</option>';
    cCatequistaHermano.disabled = true;

    if (c.catequistaId) {
        try {
            const hSnap = await getDoc(doc(db, "hermanos", c.catequistaId));
            if (hSnap.exists()) {
                const h = hSnap.data();
                cCatequistaParroquia.value = h.parroquiaId || "";
                
                if (h.parroquiaId) {
                    await loadComunidadesForCatequista(h.parroquiaId);
                    cCatequistaComunidad.value = h.comunidadId || "";
                    
                    if (h.comunidadId) {
                        await loadHermanosForCatequista(h.comunidadId);
                        cCatequistaHermano.value = c.catequistaId;
                    }
                }
            }
        } catch(e) {
            console.error("Error al pre-cargar catequista:", e);
        }
    }

    datosView.style.display = "none";
    datosForm.style.display = "block";
});

cTipo.addEventListener("change", () => {
    origenWrap.style.display = cTipo.value !== "normal" ? "block" : "none";
});

btnCancelDatos.addEventListener("click", () => {
    datosForm.style.display = "none";
    if (isCreatingNew) {
        isCreatingNew = false;
        mainPanel.style.display = "none";
    } else {
        datosView.style.display = "block";
    }
});

btnSaveDatos.addEventListener("click", async () => {
    if (!cNumero.value) { showAlert("El numero de comunidad es obligatorio.", "error"); return; }

    const numToSave = parseInt(cNumero.value);

    // Validar duplicados en la misma parroquia
    if (isCreatingNew) {
        const exists = Array.from(selComunidad.options).some(opt => opt.textContent === `Comunidad ${numToSave}`);
        if (exists) {
            showAlert(`La Comunidad ${numToSave} ya existe en esta parroquia.`, "error");
            return;
        }
    } else {
        if (numToSave !== currentComunidadData.numero) {
            const exists = Array.from(selComunidad.options).some(opt => opt.value !== currentComunidadId && opt.textContent === `Comunidad ${numToSave}`);
            if (exists) {
                showAlert(`La Comunidad ${numToSave} ya existe en esta parroquia.`, "error");
                return;
            }
        }
    }

    const catId = cCatequistaHermano.value || null;
    let catNombre = null;
    let catTelefono = null;

    if (catId) {
        try {
            const hSnap = await getDoc(doc(db, "hermanos", catId));
            if (hSnap.exists()) {
                const hData = hSnap.data();
                catNombre = `${hData.primerNombre} ${hData.primerApellido}`;
                catTelefono = hData.telefono || null;
            }
        } catch(e) {
            console.error("Error al buscar datos del catequista:", e);
        }
    }

    const etapaId = cEtapa.value || null;
    const etapaNombre = etapaId ? cEtapa.options[cEtapa.selectedIndex].text : null;

    // Collect stage dates
    const etapasFechas = {};
    document.querySelectorAll(".comunidad-etapa-date-input").forEach(input => {
        const stageId = input.getAttribute("data-etapa-id");
        if (input.value) {
            etapasFechas[stageId] = input.value;
        }
    });

    const data = {
        numero:             numToSave,
        fechaFormacion:     cFecha.value || null,
        tipo:               cTipo.value,
        etapaId:            etapaId,
        etapaNombre:        etapaNombre,
        diaCelebracion:     cDiaCelebracion.value || null,
        salonCelebracion:   cSalonCelebracion.value.trim() || null,
        horaCelebracion:    cHoraCelebracion.value || null,
        catequistaId:       catId,
        catequistaNombre:   catNombre,
        catequistaTelefono: catTelefono,
        comunidadesOrigen:  cTipo.value !== "normal"
                            ? cOrigen.value.split(",").map(s => s.trim()).filter(Boolean)
                            : [],
        etapasFechas:       etapasFechas,
        updatedAt: new Date().toISOString(),
    };

    btnSaveDatos.disabled = true;
    try {
        if (isCreatingNew) {
            data.createdAt = new Date().toISOString();
            const nuevaRef = await addDoc(
                collection(db, "parroquias", currentParroquiaId, "comunidades"),
                data
            );
            
            // Agregar al selector
            const opt = new Option(`Comunidad ${numToSave}`, nuevaRef.id);
            selComunidad.appendChild(opt);
            selComunidad.value = nuevaRef.id;
            currentComunidadId = nuevaRef.id;
            isCreatingNew = false;
            
            await loadComunidad();
            showAlert("✅ Comunidad creada exitosamente.", "success");
        } else {
            await updateDoc(
                doc(db, "parroquias", currentParroquiaId, "comunidades", currentComunidadId),
                data
            );
            
            // Actualizar texto del selector
            const opt = selComunidad.querySelector(`option[value="${currentComunidadId}"]`);
            if (opt) opt.textContent = `Comunidad ${numToSave}`;
            
            Object.assign(currentComunidadData, data);
            const pSnap = await getDoc(doc(db, "parroquias", currentParroquiaId));
            renderDatosView(currentComunidadData, pSnap.data().nombre);
            datosForm.style.display = "none";
            datosView.style.display = "block";
            showAlert("✅ Datos guardados.", "success");
        }
        await loadAllComunidades();
    } catch (err) { showAlert("Error: " + err.message, "error"); }
    finally { btnSaveDatos.disabled = false; }
});

btnDeleteComunidad.addEventListener("click", async () => {
    if (!currentComunidadId) return;

    const confirmClear = await window.customConfirm(
        "Eliminar Comunidad",
        "¿Estás seguro de que deseas eliminar esta comunidad permanentemente? Se perderán todos sus datos y los hermanos de esta comunidad quedarán sin comunidad asignada.",
        { icon: "⚠️", danger: true }
    );
    if (!confirmClear) return;

    btnDeleteComunidad.disabled = true;
    try {
        const snap = await getDocs(query(
            collection(db, "hermanos"),
            where("comunidadId", "==", currentComunidadId)
        ));
        
        const batchUpdates = [];
        snap.forEach(d => {
            batchUpdates.push(updateDoc(doc(db, "hermanos", d.id), {
                comunidadId: null,
                esResponsable: false,
                posicionResponsable: null
            }));
        });
        await Promise.all(batchUpdates);

        await deleteDoc(doc(db, "parroquias", currentParroquiaId, "comunidades", currentComunidadId));

        const opt = selComunidad.querySelector(`option[value="${currentComunidadId}"]`);
        if (opt) opt.remove();

        selComunidad.value = "";
        currentComunidadId = null;
        currentComunidadData = null;

        mainPanel.style.display = "none";
        await loadAllComunidades();
        showAlert("🗑️ Comunidad eliminada permanentemente.", "success");
    } catch(err) {
        showAlert("Error al eliminar comunidad: " + err.message, "error");
    } finally {
        btnDeleteComunidad.disabled = false;
    }
});

// ── Vista responsables ────────────────────────────
function renderResponsablesView(responsables) {
    respTbody.innerHTML = "";
    let hayAlguno = false;

    for (let pos = 1; pos <= 8; pos++) {
        const r = responsables[pos];
        if (!r?.hermanoId) continue;
        hayAlguno = true;

        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td><span class="badge-rol badge-${pos === 1 ? "1ro" : pos === 2 ? "2do" : "nro"}">${NUMS_RESP[pos]}</span></td>
            <td><strong>${r.nombreHead || "—"}</strong></td>
            <td>${r.esCasado ? "💍 Casado/a" : "🔘 Soltero/a"}</td>
            <td>${r.nombrePareja || "—"}</td>
        `;
        respTbody.appendChild(tr);
    }

    if (!hayAlguno) {
        respTbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:#7f8c8d;padding:20px;">Sin responsables asignados</td></tr>`;
    }
}

async function loadHermanos() {
    hermanosLoading.style.display = "flex";
    hermanosTable.style.display   = "none";
    hermanosEmpty.style.display   = "none";

    const snap = await getDocs(query(
        collection(db, "hermanos"),
        where("comunidadId", "==", currentComunidadId)
    ));

    hermanosLoading.style.display = "none";
    const comHermanos = [];
    snap.forEach(d => {
        const data = d.data();
        if (data.razon !== "Comunidad Celeste") {
            comHermanos.push({ id: d.id, ...data });
        }
    });

    if (comHermanos.length === 0) {
        hermanosEmpty.style.display = "block";
        hermanosCount.textContent   = "(0 hermanos)";
        dActivos.textContent = "0";
        dInactivos.textContent = "0";
        return;
    }

    const activos = comHermanos.filter(h => h.activo !== false);
    const inactivos = comHermanos.filter(h => h.activo === false);

    dActivos.textContent = activos.length;
    dInactivos.textContent = inactivos.length;
    hermanosCount.textContent = `(${comHermanos.length} hermanos)`;

    comHermanos.sort((a, b) => {
        const nomA = `${a.primerApellido || ""} ${a.primerNombre || ""}`.toLowerCase();
        const nomB = `${b.primerApellido || ""} ${b.primerNombre || ""}`.toLowerCase();
        return nomA.localeCompare(nomB);
    });

    // Construir responsables dinámicamente desde la lista de hermanos de esta comunidad
    const responsablesDinamicos = {};
    const hermanosResponsables = comHermanos.filter(h => h.razon === "Responsable" && h.posicionResponsable && h.activo !== false);
    
    hermanosResponsables.forEach(h => {
        const pos = h.posicionResponsable;
        if (!responsablesDinamicos[pos] || (h.sexo === "M" && h.estadoCivil === "Casado")) {
            if (h.estadoCivil === "Casado") {
                if (h.sexo === "M") {
                    responsablesDinamicos[pos] = {
                        hermanoId: h.id,
                        esCasado: true,
                        parejaId: h.esposoId,
                        nombreHead: `${h.primerNombre} ${h.primerApellido}`,
                        nombrePareja: h.esposoNombre
                    };
                } else {
                    responsablesDinamicos[pos] = {
                        hermanoId: h.esposoId,
                        esCasado: true,
                        parejaId: h.id,
                        nombreHead: h.esposoNombre,
                        nombrePareja: `${h.primerNombre} ${h.primerApellido}`
                    };
                }
            } else {
                responsablesDinamicos[pos] = {
                    hermanoId: h.id,
                    esCasado: false,
                    parejaId: null,
                    nombreHead: `${h.primerNombre} ${h.primerApellido}`,
                    nombrePareja: ""
                };
            }
        }
    });

    responsablesAsignados = responsablesDinamicos;
    renderResponsablesView(responsablesDinamicos);

    const rolMap = {};
    for (let pos = 1; pos <= 8; pos++) {
        const r = responsablesDinamicos[pos];
        if (r?.hermanoId) rolMap[r.hermanoId] = pos;
        if (r?.parejaId)  rolMap[r.parejaId]  = pos;
    }

    hermanosTbody.innerHTML = "";
    comHermanos.forEach(h => {
        const cumple = h.fechaNacimiento
            ? new Date(h.fechaNacimiento + "T00:00:00").toLocaleDateString("es-DO", { day:"2-digit", month:"short" })
            : "—";

        const posicion   = rolMap[h.id];
        const badgeClass = posicion === 1 ? "badge-1ro" : posicion === 2 ? "badge-2do" : posicion ? "badge-nro" : "badge-hno";
        let rolTexto     = posicion ? NUMS_RESP[posicion] : (h.sexo === "F" ? "Hermana" : "Hermano");
        
        if (h.activo === false) {
            rolTexto += " (Inactivo)";
        }

        const mapsIcon = h.location?.lat
            ? `<a href="https://www.google.com/maps?q=${h.location.lat},${h.location.lng}" target="_blank" class="icon-maps" title="Ver en Google Maps">📍</a>`
            : `<span style="color:#dde1e7;">—</span>`;

        const tr = document.createElement("tr");
        if (h.activo === false) {
            tr.style.opacity = "0.55";
        }
        
        const nombreCompl = `${h.primerNombre} ${h.segundoNombre || ""} ${h.primerApellido} ${h.segundoApellido || ""}`.replace(/\s+/g, ' ').trim();

        tr.innerHTML = `
            <td><strong>${nombreCompl}</strong></td>
            <td>${cumple}</td>
            <td>${h.telefono ? formatPhoneString(h.telefono) : "—"}</td>
            <td style="text-align:center;">${mapsIcon}</td>
            <td style="text-align:center;"><span class="badge-rol ${badgeClass}">${rolTexto}</span></td>
        `;
        hermanosTbody.appendChild(tr);
    });

    hermanosTable.style.display = "table";
}

function formatPhoneString(phone) {
    if (!phone) return "";
    const clean = phone.replace(/\D/g, "");
    if (clean.length === 10) {
        return `(${clean.slice(0, 3)}) ${clean.slice(3, 6)}-${clean.slice(6)}`;
    }
    return phone;
}

async function loadAllHermanos() {
    if (allHermanos.length > 0) return;
    const snap = await getDocs(collection(db, "hermanos"));
    allHermanos = [];
    snap.forEach(d => {
        if (d.data().activo !== false) {
            allHermanos.push({ id: d.id, ...d.data() });
        }
    });
}

function setupCatequistaSearch() {
    const input   = cCatequistaInput;
    const results = cCatequistaResults;
    const hidden  = cCatequistaId;
    if (!input || !results || !hidden) return;

    if (input.dataset.bound) return;
    input.dataset.bound = "true";

    input.addEventListener("input", () => {
        const q = input.value.toLowerCase().trim();
        if (q.length < 2) { results.classList.remove("open"); return; }

        const matches = allHermanos.filter(h =>
            `${h.primerNombre} ${h.primerApellido}`.toLowerCase().includes(q) ||
            `${h.primerApellido} ${h.primerNombre}`.toLowerCase().includes(q)
        ).slice(0, 8);

        results.innerHTML = "";
        if (!matches.length) {
            results.innerHTML = `<div class="search-result-item" style="color:#7f8c8d;">Sin resultados</div>`;
        } else {
            matches.forEach(h => {
                const item = document.createElement("div");
                item.className = "search-result-item";
                item.textContent = `${h.primerNombre} ${h.segundoNombre || ""} ${h.primerApellido} ${h.segundoApellido || ""}`.trim();
                item.addEventListener("click", () => {
                    hidden.value  = h.id;
                    input.value   = `${h.primerNombre} ${h.primerApellido}`;
                    results.classList.remove("open");
                });
                results.appendChild(item);
            });
        }
        results.classList.add("open");
    });

    document.addEventListener("click", (e) => {
        if (!input.contains(e.target)) results.classList.remove("open");
    });
}

// ── Helpers ───────────────────────────────────────
function showLoading(state) {
    if (loadingState) loadingState.style.display = state ? "flex" : "none";
}

function showAlert(msg, type = "info") {
    globalAlert.textContent = msg;
    globalAlert.className   = `alert alert-${type} visible`;
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (type === "success") setTimeout(() => { globalAlert.className = "alert"; }, 3500);
}

async function loadCommunityCode(comunidadId) {
    const canSeeCode = window.hasPermission && (window.hasPermission("comunidad_codigo") || window.hasPermission("codigo_ver"));
    if (!comunidadId || !canSeeCode) {
        document.getElementById("comunidad-codigo-widget").style.display = "none";
        return;
    }
    document.getElementById("comunidad-codigo-widget").style.display = "flex";
    
    const codeInput = document.getElementById("comunidad-codigo-val");
    codeInput.value = "Cargando...";
    
    try {
        const snap = await getDocs(query(collection(db, "codigos"), where("comunidadId", "==", comunidadId)));
        let latestCodeDoc = null;
        snap.forEach(d => {
            const data = d.data();
            if (!latestCodeDoc || data.createdAt > latestCodeDoc.createdAt) {
                latestCodeDoc = { id: d.id, ...data };
            }
        });
        
        if (latestCodeDoc && !latestCodeDoc.usadoPorEmail) {
            codeInput.value = latestCodeDoc.id;
            codeInput.style.background = "#e8f5e9";
            codeInput.title = "Código activo y listo para usar";
        } else {
            codeInput.value = "";
            codeInput.placeholder = latestCodeDoc?.usadoPorEmail ? "Código usado (Generar nuevo)" : "Sin código generado";
            codeInput.style.background = "#ffebee";
            codeInput.title = latestCodeDoc?.usadoPorEmail ? `El último código fue usado por: ${latestCodeDoc.usadoPorEmail}` : "";
        }
    } catch(e) {
        console.error("Error loading code:", e);
        codeInput.value = "Error al cargar";
    }
}

function generateUUID32() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let result = "";
    for (let i = 0; i < 32; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

document.getElementById("btn-generate-code").addEventListener("click", async () => {
    if (!currentComunidadId) return;
    if (!confirm("¿Deseas generar un nuevo código de invitación de 32 caracteres para esta comunidad?")) return;
    
    const newCode = generateUUID32();
    try {
        await setDoc(doc(db, "codigos", newCode), {
            comunidadId: currentComunidadId,
            parroquiaId: currentParroquiaId,
            createdAt: new Date().toISOString(),
            usadoPorEmail: null
        });
        await loadCommunityCode(currentComunidadId);
        showAlert("🔑 Código generado con éxito.", "success");
    } catch(e) {
        showAlert("Error al generar código: " + e.message, "error");
    }
});

document.getElementById("btn-copy-code").addEventListener("click", () => {
    const val = document.getElementById("comunidad-codigo-val").value;
    if (!val || val === "Sin código" || val.startsWith("Cargando")) return;
    navigator.clipboard.writeText(val);
    showAlert("📋 Código copiado al portapapeles.", "success");
});

// ── Listado General de Comunidades ────────────────
import { collectionGroup } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

async function loadAllComunidades() {
    try {
        const snap = await getDocs(collectionGroup(db, "comunidades"));
        todasComunidades = [];
        snap.forEach(d => {
            const data = d.data();
            const parroquiaId = d.ref.parent.parent.id;
            const pNombre = cachedParroquias[parroquiaId] || "Parroquia Desconocida";
            
            const isNotAdmin = !window.userPermissions?.adminTotal && window.userPermissions?.rol !== "admin" && !window.hasPermission("comunidad_consultar");
            if (isNotAdmin && loggedInUserComunidadId && d.id !== loggedInUserComunidadId) {
                return;
            }

            todasComunidades.push({
                id: d.id,
                parroquiaId,
                parroquiaNombre: pNombre,
                ...data
            });
        });

        // sorting is done inside filterComunidades
        renderComunidadesTable(todasComunidades);
    } catch(e) {
        console.error("Error al cargar listado de comunidades:", e);
    }
}

function renderComunidadesTable(lista, isFilteredCall = false) {
    if (!isFilteredCall) {
        filterComunidades();
        return;
    }

    const tbody = document.getElementById("comunidad-tbody");
    if (!tbody) return;
    tbody.innerHTML = "";

    if (lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:15px; color:#999;">No se encontraron comunidades.</td></tr>';
        return;
    }

    lista.forEach(c => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td><strong class="click-filter" data-col="parroquiaNombre" style="cursor:pointer; color:var(--primary);">${c.parroquiaNombre}</strong></td>
            <td><span class="click-filter" data-col="numero" style="cursor:pointer; text-decoration:none; text-decoration-style:dotted;">${formatComunidadName(`Comunidad ${c.numero}`)}</span></td>
            <td><span class="click-filter" data-col="etapaNombre" style="cursor:pointer; text-decoration:none; text-decoration-style:dotted; font-weight:600; color:#475569;">${c.etapaNombre || "—"}</span></td>
            <td><span class="click-filter" data-col="catequistaNombre" style="cursor:pointer; text-decoration:none; text-decoration-style:dotted;">${c.catequistaNombre || "—"}</span></td>
            <td style="text-align:center;">
                ${(window.hasPermission("comunidad_consultar") || window.hasPermission("comunidad_ver_hermanos")) ? `<button class="btn btn-sm btn-outline btn-view-table" data-id="${c.id}" title="Ver comunidad" style="margin-right:4px;">👁️</button>` : ""}
                ${window.hasPermission("comunidad_editar") ? `<button class="btn btn-sm btn-outline btn-edit-table" data-id="${c.id}" title="Editar comunidad">✏️</button>` : ""}
                ${window.hasPermission("comunidad_eliminar") ? `<button class="btn btn-sm btn-outline btn-delete-table" style="color:red; border-color:#f5c6cb; margin-left:4px;" data-id="${c.id}">✕</button>` : ""}
            </td>
        `;

        tr.querySelectorAll(".click-filter").forEach(el => {
            el.addEventListener("click", () => {
                const col = el.dataset.col;
                let val = el.textContent.trim();
                if (col === "numero") val = val.replace(/Comunidad\s+|COM\s+/gi, "");
                if (val && val !== "—") {
                    if (!activeFilters[col].includes(val)) {
                        activeFilters[col].push(val);
                    } else {
                        activeFilters[col] = activeFilters[col].filter(v => v !== val);
                    }
                    renderActiveFilterChips();
                    updateHeaderLabels();
                    filterComunidades();
                }
            });
        });

        const btnView = tr.querySelector(".btn-view-table");
        if (btnView) {
            btnView.addEventListener("click", () => {
                consultComunidadById(c.id, c.parroquiaId);
            });
        }

        const btnEdit = tr.querySelector(".btn-edit-table");
        if (btnEdit) {
            btnEdit.addEventListener("click", () => {
                selectAndEditCommunity(c);
            });
        }

        const btnDelete = tr.querySelector(".btn-delete-table");
        if (btnDelete) {
            btnDelete.addEventListener("click", async () => {
                const confirmDelete = await window.customConfirm(
                    "Eliminar Comunidad",
                    `¿Estás seguro de que deseas eliminar la Comunidad ${c.numero} de la parroquia ${c.parroquiaNombre}?\nSe desvincularán todos sus hermanos.`,
                    { icon: "⚠️", danger: true }
                );
                if (!confirmDelete) return;

                try {
                    const hSnap = await getDocs(query(collection(db, "hermanos"), where("comunidadId", "==", c.id)));
                    const batch = [];
                    hSnap.forEach(hd => {
                        batch.push(updateDoc(doc(db, "hermanos", hd.id), {
                            comunidadId: null,
                            esResponsable: false,
                            posicionResponsable: null
                        }));
                    });
                    await Promise.all(batch);

                    await deleteDoc(doc(db, "parroquias", c.parroquiaId, "comunidades", c.id));

                    if (currentComunidadId === c.id) {
                        currentComunidadId = null;
                        currentComunidadData = null;
                        mainPanel.style.display = "none";
                        selComunidad.value = "";
                    }

                    const opt = selComunidad.querySelector(`option[value="${c.id}"]`);
                    if (opt) opt.remove();

                    await loadAllComunidades();
                    showAlert("🗑️ Comunidad eliminada.", "success");
                } catch(err) {
                    showAlert("Error: " + err.message, "error");
                }
            });
        }

        tbody.appendChild(tr);
    });
}

function filterComunidades() {
    const q = document.getElementById("search-comunidades").value.toLowerCase().trim();
    
    let filtered = [...todasComunidades];

    // Apply active filter chips
    if (activeFilters.parroquiaNombre.length > 0) {
        filtered = filtered.filter(c => activeFilters.parroquiaNombre.includes(c.parroquiaNombre));
    }
    if (activeFilters.numero.length > 0) {
        filtered = filtered.filter(c => activeFilters.numero.includes(String(c.numero)));
    }
    if (activeFilters.etapaNombre.length > 0) {
        filtered = filtered.filter(c => activeFilters.etapaNombre.includes(c.etapaNombre));
    }
    if (activeFilters.catequistaNombre.length > 0) {
        filtered = filtered.filter(c => activeFilters.catequistaNombre.includes(c.catequistaNombre));
    }

    // Apply text search
    if (q) {
        filtered = filtered.filter(c => {
            const pNom = (c.parroquiaNombre || "").toLowerCase();
            const cNum = `comunidad ${c.numero}`.toLowerCase();
            const cEtapa = (c.etapaNombre || "").toLowerCase();
            const cCat = (c.catequistaNombre || "").toLowerCase();
            return pNom.includes(q) || cNum.includes(q) || cEtapa.includes(q) || cCat.includes(q);
        });
    }

    // Apply sorting
    filtered.sort((a, b) => {
        let valA = a[currentSortColumn] || "";
        let valB = b[currentSortColumn] || "";

        if (currentSortColumn === "numero") {
            return currentSortDir === "asc" ? Number(valA) - Number(valB) : Number(valB) - Number(valA);
        }
        
        valA = String(valA).toLowerCase();
        valB = String(valB).toLowerCase();

        if (valA < valB) return currentSortDir === "asc" ? -1 : 1;
        if (valA > valB) return currentSortDir === "asc" ? 1 : -1;
        return 0;
    });

    window.currentPrintedComunidades = filtered;
    renderComunidadesTable(filtered, true);
}

function setupSortingListeners() {
    const headers = ["parroquia", "numero", "etapa", "catequista"];
    headers.forEach(h => {
        const th = document.getElementById(`th-${h}`);
        if (th) {
            th.addEventListener("click", () => {
                let key = h;
                if (h === "parroquia") key = "parroquiaNombre";
                if (h === "etapa") key = "etapaNombre";
                if (h === "catequista") key = "catequistaNombre";
                handleSort(key);
            });
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
    filterComunidades();
}

function updateHeaderLabels() {
    const cols = {
        "parroquia": { label: "Parroquia", key: "parroquiaNombre" },
        "numero": { label: "No. Comunidad", key: "numero" },
        "etapa": { label: "Etapa", key: "etapaNombre" },
        "catequista": { label: "Catequista", key: "catequistaNombre" }
    };
    Object.keys(cols).forEach(k => {
        const th = document.getElementById(`th-${k}`);
        if (!th) return;
        
        const key = cols[k].key;
        let arrow = "↕️";
        if (key === currentSortColumn) {
            arrow = currentSortDir === "asc" ? "▲" : "▼";
        }
        
        let clearBtn = "";
        if (activeFilters[key] && activeFilters[key].length > 0) {
            clearBtn = ` <span style="color:#e74c3c; cursor:pointer; font-weight:bold; margin-left:6px;" onclick="window.clearComunidadFilter(event, '${key}')" title="Limpiar filtro de esta columna">❌</span>`;
        }

        th.innerHTML = `${cols[k].label} ${arrow}${clearBtn}`;
    });
}

window.clearComunidadFilter = (e, col) => {
    e.stopPropagation();
    activeFilters[col] = [];
    filterHistory = filterHistory.filter(h => h.type !== col);
    renderActiveFilterChips();
    updateHeaderLabels();
    filterComunidades();
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
            chip.innerHTML = `${item.type === 'numero' ? 'Comunidad ' : ''}${item.name} <span style="color:#ef4444; font-weight:bold; font-size:0.75rem; margin-left:2px;">&times;</span>`;
            chip.title = "Remover filtro";
        } else {
            chip.style.cssText = "background:transparent; border:none; padding:0; border-radius:0; cursor:pointer; font-weight:500; color:#94a3b8; display:inline-flex; align-items:center; gap:4px; font-size:0.85rem; margin-right:16px; opacity:0.75;";
            chip.innerHTML = `${item.type === 'numero' ? 'Comunidad ' : ''}${item.name}`;
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
            filterComunidades();
        });
        bar.appendChild(chip);
    });
}

async function loadComunidadesDropdownForParroquia(pid) {
    const snap = await getDocs(collection(db, "parroquias", pid, "comunidades"));
    selComunidad.innerHTML = '<option value="">— Seleccionar comunidad —</option>';
    
    const isNotAdmin = !window.userPermissions?.adminTotal && window.userPermissions?.rol !== "admin" && !window.hasPermission("comunidad_consultar");

    snap.forEach(d => {
        if (isNotAdmin && loggedInUserComunidadId && d.id !== loggedInUserComunidadId) {
            return;
        }
        const num = d.data().numero || d.id;
        selComunidad.appendChild(new Option(`Comunidad ${num}`, d.id));
    });
    selComunidad.disabled = false;
}

async function selectAndEditCommunity(c) {
    selParroquia.value = c.parroquiaId;
    currentParroquiaId = c.parroquiaId;
    await loadComunidadesDropdownForParroquia(c.parroquiaId);
    
    selComunidad.value = c.id;
    currentComunidadId = c.id;
    
    await loadComunidad();
    
    // Cambiar al panel de edición inmediatamente
    const editing = datosForm.style.display !== "none";
    if (!editing) {
        btnToggleDatos.click();
    }
}

async function consultComunidadById(id, parroquiaId) {
    selParroquia.value = parroquiaId;
    currentParroquiaId = parroquiaId;
    await loadComunidadesDropdownForParroquia(parroquiaId);
    
    selComunidad.value = id;
    currentComunidadId = id;
    
    await loadComunidad();
    
    // Asegurar que está en modo visualización (no edición)
    const editing = datosForm.style.display !== "none";
    if (editing) {
        btnCancelDatos.click();
    }
    
    // Scroll suave hasta el detalle de comunidad
    const detailCard = document.querySelector(".page-content > .card:nth-of-type(2)");
    if (detailCard) {
        detailCard.scrollIntoView({ behavior: "smooth" });
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
    const cols = ["parroquiaNombre", "numero", "etapaNombre", "catequistaNombre"];
    
    const elementIds = {
        "parroquiaNombre": "parroquia",
        "numero": "numero",
        "etapaNombre": "etapa",
        "catequistaNombre": "catequista"
    };

    Object.keys(elementIds).forEach(k => {
        const th = document.getElementById(`th-${elementIds[k]}`);
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
    todasComunidades.forEach(c => {
        let val = c[colKey] || "—";
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
            <span>${efCurrentColumn === 'numero' ? 'Comunidad ' : ''}${val}</span>
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
    filterComunidades();
}

function enforcePermissions() {
    if (!window.hasPermission) return;

    // +Nueva Comunidad button
    const btnNueva = document.getElementById("btn-nueva-comunidad");
    if (btnNueva) {
        btnNueva.style.display = window.hasPermission("comunidad_crear") ? "inline-block" : "none";
    }

    // Editar button
    const btnToggleDatos = document.getElementById("btn-toggle-datos");
    if (btnToggleDatos) {
        btnToggleDatos.style.display = window.hasPermission("comunidad_editar") ? "inline-block" : "none";
    }

    // Generar código button
    const btnGenerateCode = document.getElementById("btn-generate-code");
    if (btnGenerateCode) {
        btnGenerateCode.style.display = window.hasPermission("comunidad_codigo") ? "inline-block" : "none";
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
    if (todasComunidades && todasComunidades.length > 0) {
        renderComunidadesTable(todasComunidades);
    }
});
