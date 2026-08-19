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
let todasComunidades     = [];        // all communities in system
let isCreatingNew        = false;

const NUMS_RESP = ["","1ro","2do","3ro","4to","5to","6to","7mo","8vo"];

// ── App ready ────────────────────────────────────
window.addEventListener("app:ready", async () => {
    await loadParroquias();
    await loadItinerarios();
    await loadAllComunidades();
    setupCatequistaSelectors();

    const searchInput = document.getElementById("search-comunidades");
    if (searchInput) {
        searchInput.addEventListener("input", filterComunidades);
    }
});

async function loadItinerarios() {
    cEtapa.innerHTML = '<option value="">— Seleccionar Etapa —</option>';
    try {
        const snap = await getDocs(query(collection(db, "itinerario"), orderBy("createdAt", "asc")));
        snap.forEach(d => {
            cEtapa.appendChild(new Option(d.data().nombre, d.id));
        });
    } catch(e) {
        console.error("Error loading stages list:", e);
    }
}

// ── Parroquias ────────────────────────────────────
async function loadParroquias() {
    const snap = await getDocs(collection(db, "parroquias"));
    selParroquia.innerHTML = '<option value="">— Seleccionar —</option>';
    cCatequistaParroquia.innerHTML = '<option value="">— Seleccionar parroquia —</option>';
    cachedParroquias = {};
    snap.forEach(d => {
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
    snap.forEach(d => {
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
    btnDeleteComunidad.style.display = "block";
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

    const origenWrapView = document.getElementById("d-origen-wrap");
    if (c.comunidadesOrigen?.length) {
        document.getElementById("d-origen").textContent = c.comunidadesOrigen.join(", ");
        origenWrapView.style.display = "block";
    } else {
        origenWrapView.style.display = "none";
    }
}

// ── Editor datos ──────────────────────────────────
btnToggleDatos.addEventListener("click", async () => {
    const editing = datosForm.style.display !== "none";
    if (editing) { datosForm.style.display = "none"; datosView.style.display = "block"; return; }

    isCreatingNew = false;
    btnDeleteComunidad.style.display = "block";

    const c = currentComunidadData;
    cNumero.value = c.numero || "";
    cFecha.value  = c.fechaFormacion || "";
    cTipo.value   = c.tipo || "normal";
    cOrigen.value = (c.comunidadesOrigen || []).join(", ");
    cEtapa.value  = c.etapaId || "";
    origenWrap.style.display = (c.tipo !== "normal") ? "block" : "none";

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

    const data = {
        numero:             numToSave,
        fechaFormacion:     cFecha.value || null,
        tipo:               cTipo.value,
        etapaId:            etapaId,
        etapaNombre:        etapaNombre,
        catequistaId:       catId,
        catequistaNombre:   catNombre,
        catequistaTelefono: catTelefono,
        comunidadesOrigen:  cTipo.value !== "normal"
                            ? cOrigen.value.split(",").map(s => s.trim()).filter(Boolean)
                            : [],
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
    snap.forEach(d => comHermanos.push({ id: d.id, ...d.data() }));

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
            <td>${h.telefono || "—"}</td>
            <td style="text-align:center;">${mapsIcon}</td>
            <td style="text-align:center;"><span class="badge-rol ${badgeClass}">${rolTexto}</span></td>
        `;
        hermanosTbody.appendChild(tr);
    });

    hermanosTable.style.display = "table";
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
    if (!comunidadId) {
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
        
        if (latestCodeDoc) {
            codeInput.value = latestCodeDoc.id;
            if (latestCodeDoc.usadoPorEmail) {
                codeInput.style.background = "#ffebee";
                codeInput.title = `Usado por: ${latestCodeDoc.usadoPorEmail}`;
            } else {
                codeInput.style.background = "#e8f5e9";
                codeInput.title = "Código activo y listo para usar";
            }
        } else {
            codeInput.value = "";
            codeInput.placeholder = "Sin código generado";
            codeInput.style.background = "#f5f5f5";
            codeInput.title = "";
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
            
            todasComunidades.push({
                id: d.id,
                parroquiaId,
                parroquiaNombre: pNombre,
                ...data
            });
        });

        // Ordenar por nombre de Parroquia y luego por número de Comunidad
        todasComunidades.sort((a, b) => {
            const pComp = a.parroquiaNombre.localeCompare(b.parroquiaNombre);
            if (pComp !== 0) return pComp;
            return String(a.numero).localeCompare(String(b.numero), undefined, {numeric: true});
        });

        renderComunidadesTable(todasComunidades);
    } catch(e) {
        console.error("Error al cargar listado de comunidades:", e);
    }
}

function renderComunidadesTable(lista) {
    const tbody = document.getElementById("comunidad-tbody");
    if (!tbody) return;
    tbody.innerHTML = "";

    if (lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:15px; color:#999;">No se encontraron comunidades.</td></tr>';
        return;
    }

    lista.forEach(c => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td><strong>${c.parroquiaNombre}</strong></td>
            <td>Comunidad ${c.numero}</td>
            <td><span class="badge-rol badge-hno" style="text-transform:capitalize;">${c.tipo || "Normal"}</span></td>
            <td><span style="font-weight:600; color:#475569;">${c.etapaNombre || "—"}</span></td>
            <td>${c.catequistaNombre ? `${c.catequistaNombre} ${c.catequistaTelefono ? `(${c.catequistaTelefono})` : ""}` : "—"}</td>
            <td style="text-align:center;">
                <button class="btn btn-sm btn-outline btn-edit-table" data-id="${c.id}">✏️</button>
                <button class="btn btn-sm btn-outline btn-delete-table" style="color:red; border-color:#f5c6cb; margin-left:4px;" data-id="${c.id}">✕</button>
            </td>
        `;

        tr.querySelector(".btn-edit-table").addEventListener("click", () => {
            selectAndEditCommunity(c);
        });

        tr.querySelector(".btn-delete-table").addEventListener("click", async () => {
            const confirmDelete = await window.customConfirm(
                "Eliminar Comunidad",
                `¿Estás seguro de que deseas eliminar la Comunidad ${c.numero} de la parroquia ${c.parroquiaNombre}?\nSe desvincularán todos sus hermanos.`,
                { icon: "⚠️", danger: true }
            );
            if (!confirmDelete) return;

            try {
                // Desvincular hermanos
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

                // Quitar del selector si está cargado
                const opt = selComunidad.querySelector(`option[value="${c.id}"]`);
                if (opt) opt.remove();

                await loadAllComunidades();
                showAlert("🗑️ Comunidad eliminada.", "success");
            } catch(err) {
                showAlert("Error: " + err.message, "error");
            }
        });

        tbody.appendChild(tr);
    });
}

function filterComunidades() {
    const q = document.getElementById("search-comunidades").value.toLowerCase().trim();
    if (!q) {
        renderComunidadesTable(todasComunidades);
        return;
    }

    const filtered = todasComunidades.filter(c => {
        const pNom = (c.parroquiaNombre || "").toLowerCase();
        const cNum = `comunidad ${c.numero}`.toLowerCase();
        const cEtapa = (c.etapaNombre || "").toLowerCase();
        const cCat = (c.catequistaNombre || "").toLowerCase();
        return pNom.includes(q) || cNum.includes(q) || cEtapa.includes(q) || cCat.includes(q);
    });
    renderComunidadesTable(filtered);
}

async function loadComunidadesDropdownForParroquia(pid) {
    const snap = await getDocs(collection(db, "parroquias", pid, "comunidades"));
    selComunidad.innerHTML = '<option value="">— Seleccionar comunidad —</option>';
    snap.forEach(d => {
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
