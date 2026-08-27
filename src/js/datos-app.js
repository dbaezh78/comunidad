// ================================================
// DATOS-APP.JS — Logica de datos.html
// ================================================
import { db } from "./firebase.js";
import { collection, doc, getDoc, getDocs, addDoc,
         updateDoc, deleteDoc, query, orderBy } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

// DOM Selector de Catálogos
const formSelector = document.getElementById("form-selector");
const btnNuevoCatalogo = document.getElementById("btn-nuevo-catalogo");
const btnEditarCatalogo = document.getElementById("btn-editar-catalogo");

// DOM Formulario Catálogos
const formCardCatalogo = document.getElementById("form-card-catalogo");
const formTitleCatalogo = document.getElementById("form-title-catalogo");
const inputCatalogoNombre = document.getElementById("catalogo-nombre");
const inputCatalogoDetalle = document.getElementById("catalogo-detalle");
const btnSaveCatalogo = document.getElementById("btn-save-catalogo");
const btnCancelCatalogo = document.getElementById("btn-cancel-catalogo");
const btnDeleteCatalogo = document.getElementById("btn-delete-catalogo");

// DOM Sección Misiones (Registros Genéricos)
const sectionMisiones = document.getElementById("section-misiones");
const btnNuevaMision = document.getElementById("btn-nueva-mision");
const formCardMision = document.getElementById("form-card-mision");
const formTitleMision = document.getElementById("form-title-mision");
const loadingStateMision = document.getElementById("loading-state-mision");
const emptyStateMision = document.getElementById("empty-state-mision");
const tableCardMision = document.getElementById("table-card-mision");
const tbodyMisiones = document.getElementById("misiones-tbody");
const globalAlert = document.getElementById("global-alert");

const inputMisionOrden = document.getElementById("mision-orden");
const inputMisionNombre = document.getElementById("mision-nombre");
const inputMisionDesc = document.getElementById("mision-descripcion");

const btnSaveMision = document.getElementById("btn-save-mision");
const btnCancelMision = document.getElementById("btn-cancel-mision");
const btnDeleteMision = document.getElementById("btn-delete-mision");

// DOM Sección Importación
const btnImportarMisiones = document.getElementById("btn-importar-misiones");
const formCardImport = document.getElementById("form-card-import");
const importTextarea = document.getElementById("import-textarea");
const btnSaveImport = document.getElementById("btn-save-import");
const btnCancelImport = document.getElementById("btn-cancel-import");

// Labels dinámicos
const sectionTitle = document.getElementById("section-title");
const labelMisionNombre = document.getElementById("label-mision-nombre");
const thMisionNombre = document.getElementById("th-mision-nombre");
const loadingTextMision = document.getElementById("loading-text-mision");
const emptyTextMision = document.getElementById("empty-text-mision");

// Estado
let todasMisiones = [];
let editingMisionId = null;
let editingCatalogoId = null; // null for creating, docId for editing
let allCatalogos = [];
let currentCatalogCode = "misiones";

// Helper function to slugify text
function slugify(text) {
    return text.toString().toLowerCase().trim()
        .normalize('NFD') // remove accents
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, '_') // replace spaces with _
        .replace(/[^\w\-]+/g, '') // remove non-word chars
        .replace(/\-\-+/g, '_') // replace multiple - with _
        .replace(/^-+/, '') // trim - from start
        .replace(/-+$/, ''); // trim - from end
}

// ── App ready ────────────────────────────────────
window.addEventListener("app:ready", async () => {
    enforcePermissions();
    await loadItinerariosForCatalogos();
    await loadCatalogos();

    // Eventos Catálogos (Formulario)
    if (btnNuevoCatalogo) {
        btnNuevoCatalogo.addEventListener("click", () => {
            editingCatalogoId = null;
            inputCatalogoNombre.value = "";
            if (inputCatalogoDetalle) inputCatalogoDetalle.value = "";
            const stageSelect = document.getElementById("catalogo-etapa");
            if (stageSelect) stageSelect.value = "";
            formTitleCatalogo.textContent = "➕ Crear Nuevo Catálogo";
            btnDeleteCatalogo.style.display = "none";
            
            // Hide list and other forms
            sectionMisiones.style.display = "none";
            formCardMision.style.display = "none";
            formCardCatalogo.style.display = "block";
        });
    }

    if (btnEditarCatalogo) {
        btnEditarCatalogo.addEventListener("click", () => {
            const cat = allCatalogos.find(c => c.code === currentCatalogCode);
            if (!cat) return;
            
            // Cannot edit or delete the default 'misiones' catalog
            if (cat.code === "misiones") {
                showAlert("El catálogo base de Misiones no se puede editar ni eliminar.", "error");
                return;
            }

            editingCatalogoId = cat.id;
            inputCatalogoNombre.value = cat.nombre;
            if (inputCatalogoDetalle) inputCatalogoDetalle.value = cat.detalle || "";
            const stageSelect = document.getElementById("catalogo-etapa");
            if (stageSelect) stageSelect.value = cat.etapaId || "";
            formTitleCatalogo.textContent = `✏️ Editar Catálogo: ${cat.nombre}`;
            btnDeleteCatalogo.style.display = window.hasPermission("datos_eliminar") ? "inline-block" : "none";
            
            // Hide list and other forms
            sectionMisiones.style.display = "none";
            formCardMision.style.display = "none";
            formCardCatalogo.style.display = "block";
        });
    }

    btnCancelCatalogo.addEventListener("click", () => {
        formCardCatalogo.style.display = "none";
        sectionMisiones.style.display = "block";
        loadMisiones();
    });

    btnSaveCatalogo.addEventListener("click", saveCatalogo);
    btnDeleteCatalogo.addEventListener("click", deleteCatalogo);

    formSelector.addEventListener("change", onCatalogSelectChange);

    // Eventos Registros (Elementos del Catálogo)
    btnNuevaMision.addEventListener("click", () => {
        editingMisionId = null;
        clearMisionForm();
        
        // Auto-calculate next order number
        let maxOrden = 0;
        todasMisiones.forEach(m => {
            const ord = m.orden !== undefined && m.orden !== null ? parseInt(m.orden) : 0;
            if (ord > maxOrden) maxOrden = ord;
        });
        const nextOrden = maxOrden + 1;
        inputMisionOrden.value = nextOrden;
        
        // Focus nombre field empty, cursor ready to type
        setTimeout(() => {
            inputMisionNombre.focus();
        }, 50);
        
        const cat = allCatalogos.find(c => c.code === currentCatalogCode);
        formTitleMision.textContent = `📋 Registrar Nuevo Elemento (${cat ? cat.nombre : ''})`;
        btnDeleteMision.style.display = "none";
        formCardMision.style.display = "block";
        tableCardMision.style.display = "none";
    });

    btnCancelMision.addEventListener("click", () => {
        formCardMision.style.display = "none";
        clearMisionForm();
        renderMisionesTable();
    });

    btnSaveMision.addEventListener("click", saveMision);
    btnDeleteMision.addEventListener("click", deleteMision);

    // Save with Enter key
    const triggerSaveOnEnter = (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            saveMision();
        }
    };
    if (inputMisionNombre) inputMisionNombre.addEventListener("keydown", triggerSaveOnEnter);
    if (inputMisionOrden) inputMisionOrden.addEventListener("keydown", triggerSaveOnEnter);

    // Eventos Importación
    if (btnImportarMisiones) {
        btnImportarMisiones.addEventListener("click", () => {
            formCardMision.style.display = "none";
            formCardImport.style.display = "block";
            tableCardMision.style.display = "none";
            importTextarea.value = "";
            setTimeout(() => {
                importTextarea.focus();
            }, 50);
        });
    }

    if (btnCancelImport) {
        btnCancelImport.addEventListener("click", () => {
            formCardImport.style.display = "none";
            renderMisionesTable();
        });
    }

    if (btnSaveImport) {
        btnSaveImport.addEventListener("click", saveImport);
    }
});

// ── CRUD Catálogos ───────────────────────────────
async function loadCatalogos() {
    try {
        const snap = await getDocs(collection(db, "catalogos"));
        allCatalogos = [];
        snap.forEach(d => {
            allCatalogos.push({ id: d.id, ...d.data() });
        });

        // Si no existe ningún catálogo, inicializar Misiones por defecto
        if (allCatalogos.length === 0) {
            const defaultCat = { nombre: "Misiones", code: "misiones" };
            const docRef = await addDoc(collection(db, "catalogos"), defaultCat);
            defaultCat.id = docRef.id;
            allCatalogos.push(defaultCat);
        }

        // Asegurarse de que Misiones existe
        const hasMisiones = allCatalogos.some(c => c.code === "misiones");
        if (!hasMisiones) {
            const defaultCat = { nombre: "Misiones", code: "misiones" };
            const docRef = await addDoc(collection(db, "catalogos"), defaultCat);
            defaultCat.id = docRef.id;
            allCatalogos.push(defaultCat);
        }

        // Sort catalogos alphabetically
        allCatalogos.sort((a, b) => a.nombre.localeCompare(b.nombre));

        // Rellenar selector
        formSelector.innerHTML = '';
        allCatalogos.forEach(c => {
            const labelText = c.etapaNombre ? `📋 ${c.nombre} (${c.etapaNombre})` : `📋 ${c.nombre}`;
            const opt = new Option(labelText, c.code);
            formSelector.appendChild(opt);
        });

        formSelector.value = currentCatalogCode;
        updateDynamicLabels();
        sectionMisiones.style.display = "block";
        formCardCatalogo.style.display = "none";
        await loadMisiones();

    } catch(err) {
        console.error("Error al cargar catálogos:", err);
        showAlert("Error al cargar la lista de catálogos.", "error");
    }
}

async function saveCatalogo() {
    const nombre = inputCatalogoNombre.value.trim();
    const stageSelect = document.getElementById("catalogo-etapa");
    const etapaId = stageSelect ? stageSelect.value || null : null;
    const etapaNombre = (stageSelect && etapaId) ? stageSelect.options[stageSelect.selectedIndex].text : null;
    const detalle = inputCatalogoDetalle ? inputCatalogoDetalle.value.trim() : "";

    if (!nombre) {
        showAlert("El nombre del catálogo es obligatorio.", "error");
        return;
    }
    if (!etapaId) {
        showAlert("Debe seleccionar la etapa del itinerario correspondiente.", "error");
        return;
    }

    const code = slugify(nombre);
    if (code === "") {
        showAlert("Nombre de catálogo no válido.", "error");
        return;
    }

    // Check duplicate code
    const duplicate = allCatalogos.find(c => c.code === code);
    if (duplicate && duplicate.id !== editingCatalogoId) {
        showAlert("Ya existe un catálogo con este nombre o código equivalente.", "error");
        return;
    }

    try {
        if (editingCatalogoId) {
            // Update Catalog Name, Etapa, & Detalle
            await updateDoc(doc(db, "catalogos", editingCatalogoId), {
                nombre: nombre,
                etapaId: etapaId,
                etapaNombre: etapaNombre,
                detalle: detalle,
                updatedAt: new Date().toISOString()
            });
            showAlert("✅ Catálogo actualizado con éxito.", "success");
        } else {
            // Create New Catalog
            await addDoc(collection(db, "catalogos"), {
                nombre: nombre,
                code: code,
                etapaId: etapaId,
                etapaNombre: etapaNombre,
                detalle: detalle,
                createdAt: new Date().toISOString()
            });
            showAlert("✅ Catálogo creado con éxito.", "success");
            currentCatalogCode = code; // switch to new catalog
        }
        formCardCatalogo.style.display = "none";
        await loadCatalogos();
    } catch(err) {
        console.error("Error saving catalog:", err);
        showAlert("Error al guardar el catálogo en el servidor.", "error");
    }
}

async function deleteCatalogo() {
    if (!editingCatalogoId) return;

    if (!confirm("¿Está seguro de eliminar este catálogo? Todos los elementos registrados bajo este catálogo se mantendrán en la base de datos pero el catálogo dejará de figurar.")) {
        return;
    }

    try {
        await deleteDoc(doc(db, "catalogos", editingCatalogoId));
        showAlert("✅ Catálogo eliminado con éxito.", "success");
        currentCatalogCode = "misiones"; // fallback
        formCardCatalogo.style.display = "none";
        await loadCatalogos();
    } catch(err) {
        console.error("Error deleting catalog:", err);
        showAlert("Error al eliminar el catálogo del servidor.", "error");
    }
}

function onCatalogSelectChange() {
    currentCatalogCode = formSelector.value;
    formCardMision.style.display = "none";
    formCardCatalogo.style.display = "none";
    clearMisionForm();
    updateDynamicLabels();
    sectionMisiones.style.display = "block";
    loadMisiones();
}

function updateDynamicLabels() {
    const cat = allCatalogos.find(c => c.code === currentCatalogCode);
    const catName = cat ? cat.nombre : 'Registro';
    
    if (sectionTitle) sectionTitle.textContent = `📋 ${catName}`;
    
    const sectionDesc = document.getElementById("section-desc");
    if (sectionDesc) {
        if (cat && cat.detalle) {
            sectionDesc.textContent = cat.detalle;
            sectionDesc.style.display = "block";
        } else {
            sectionDesc.style.display = "none";
        }
    }
    
    if (btnNuevaMision) btnNuevaMision.textContent = `+ Nuevo ${catName}`;
    if (labelMisionNombre) labelMisionNombre.textContent = `Nombre de ${catName} *`;
    if (thMisionNombre) thMisionNombre.textContent = catName;
    if (loadingTextMision) loadingTextMision.textContent = `Cargando ${catName}...`;
    if (emptyTextMision) {
        emptyTextMision.innerHTML = `No hay registros en ${catName}.<br>Crea el primero con el botón "+ Nuevo ${catName}".`;
    }
    if (inputMisionNombre) {
        inputMisionNombre.placeholder = `Ej: Nombre del elemento para ${catName}...`;
    }
}

// ── Alertas ──────────────────────────────────────
function showAlert(msg, type = "info") {
    globalAlert.textContent = msg;
    globalAlert.className = `alert alert-${type} visible`;
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (type === "success") {
        setTimeout(() => { globalAlert.className = "alert"; }, 3500);
    }
}

// ── CRUD Registros Genéricos ─────────────────────
async function loadMisiones() {
    loadingStateMision.style.display = "flex";
    emptyStateMision.style.display = "none";
    tableCardMision.style.display = "none";
    tbodyMisiones.innerHTML = "";

    try {
        const snap = await getDocs(collection(db, currentCatalogCode));
        todasMisiones = [];
        snap.forEach(d => {
            todasMisiones.push({ id: d.id, ...d.data() });
        });

        // Sort in memory by order number, then alphabetically
        todasMisiones.sort((a, b) => {
            const ordA = a.orden !== undefined && a.orden !== null ? parseInt(a.orden) : 9999;
            const ordB = b.orden !== undefined && b.orden !== null ? parseInt(b.orden) : 9999;
            if (ordA !== ordB) return ordA - ordB;
            return a.nombre.localeCompare(b.nombre);
        });

        loadingStateMision.style.display = "none";

        if (todasMisiones.length === 0) {
            emptyStateMision.style.display = "block";
            return;
        }

        renderMisionesTable();
    } catch(err) {
        console.error(`Error al cargar ${currentCatalogCode}:`, err);
        loadingStateMision.style.display = "none";
        showAlert("Error al cargar los registros del servidor.", "error");
    }
}

function renderMisionesTable() {
    tbodyMisiones.innerHTML = "";
    todasMisiones.forEach(m => {
        const tr = document.createElement("tr");
        const displayName = m.orden !== undefined && m.orden !== null ? `${m.orden}. ${m.nombre}` : m.nombre;
        
        tr.innerHTML = `
            <td><strong>${displayName}</strong></td>
            <td>${m.descripcion || "—"}</td>
            <td style="text-align:center;">
                ${window.hasPermission("datos_editar") ? `<button class="btn btn-sm btn-outline btn-edit-mision" data-id="${m.id}">✏️ Editar</button>` : "—"}
            </td>
        `;

        const btnEdit = tr.querySelector(".btn-edit-mision");
        if (btnEdit) {
            btnEdit.addEventListener("click", () => openEditMision(m));
        }

        tbodyMisiones.appendChild(tr);
    });
    tableCardMision.style.display = "block";
}

function clearMisionForm() {
    inputMisionOrden.value = "";
    inputMisionNombre.value = "";
    inputMisionDesc.value = "";
    editingMisionId = null;
}

function openEditMision(m) {
    editingMisionId = m.id;
    inputMisionOrden.value = m.orden !== undefined && m.orden !== null ? m.orden : "";
    inputMisionNombre.value = m.nombre;
    inputMisionDesc.value = m.descripcion || "";

    const cat = allCatalogos.find(c => c.code === currentCatalogCode);
    const catName = cat ? cat.nombre : 'Registro';

    formTitleMision.textContent = `✏️ Editar: ${m.nombre}`;
    btnDeleteMision.style.display = window.hasPermission("datos_eliminar") ? "inline-block" : "none";
    formCardMision.style.display = "block";
    tableCardMision.style.display = "none";
}

async function saveMision() {
    const nombre = inputMisionNombre.value.trim();
    const descripcion = inputMisionDesc.value.trim();
    const orden = inputMisionOrden.value ? parseInt(inputMisionOrden.value) : null;

    if (!nombre) {
        showAlert("El nombre es obligatorio (*).", "error");
        return;
    }

    const payload = {
        nombre,
        descripcion,
        orden,
        updatedAt: new Date().toISOString()
    };

    try {
        if (editingMisionId) {
            await updateDoc(doc(db, currentCatalogCode, editingMisionId), payload);
            showAlert("Registro actualizado con éxito.", "success");
        } else {
            payload.createdAt = new Date().toISOString();
            await addDoc(collection(db, currentCatalogCode), payload);
            showAlert("Registro guardado con éxito.", "success");
        }

        formCardMision.style.display = "none";
        clearMisionForm();
        await loadMisiones();
    } catch(err) {
        console.error("Error al guardar registro:", err);
        showAlert("Error de servidor al guardar el registro.", "error");
    }
}

async function deleteMision() {
    if (!editingMisionId) return;

    if (!confirm("¿Está seguro de que desea eliminar este registro?")) {
        return;
    }

    try {
        await deleteDoc(doc(db, currentCatalogCode, editingMisionId));
        showAlert("Registro eliminado con éxito.", "success");

        formCardMision.style.display = "none";
        clearMisionForm();
        await loadMisiones();
    } catch(err) {
        console.error("Error al eliminar registro:", err);
        showAlert("Error de servidor al eliminar el registro.", "error");
    }
}

async function saveImport() {
    const rawText = importTextarea.value.trim();
    if (!rawText) {
        showAlert("Por favor, ingrese al menos una palabra o tema.", "error");
        return;
    }

    const lines = rawText.split("\n").map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) {
        showAlert("No se encontraron elementos válidos para importar.", "error");
        return;
    }

    btnSaveImport.disabled = true;
    const originalText = btnSaveImport.textContent;
    btnSaveImport.textContent = "⏳ Importando...";

    // Calculate start order number
    let maxOrden = 0;
    todasMisiones.forEach(m => {
        const ord = m.orden !== undefined && m.orden !== null ? parseInt(m.orden) : 0;
        if (ord > maxOrden) maxOrden = ord;
    });

    try {
        const promises = lines.map((line, idx) => {
            return addDoc(collection(db, currentCatalogCode), {
                nombre: line,
                descripcion: "",
                orden: maxOrden + 1 + idx,
                createdAt: new Date().toISOString()
            });
        });

        await Promise.all(promises);
        showAlert(`🎉 Listado importado con éxito (${lines.length} elementos agregados).`, "success");
        formCardImport.style.display = "none";
        await loadMisiones();
    } catch(err) {
        console.error("Error al importar listado:", err);
        showAlert("Error de servidor al importar el listado.", "error");
    } finally {
        btnSaveImport.disabled = false;
        btnSaveImport.textContent = originalText;
    }
}

function enforcePermissions() {
    if (typeof window.hasPermission !== "function") return;
    const canCreate = window.hasPermission("datos_crear");
    if (btnNuevaMision) {
        btnNuevaMision.style.display = canCreate ? "inline-block" : "none";
    }
    if (btnImportarMisiones) {
        btnImportarMisiones.style.display = canCreate ? "inline-block" : "none";
    }
    if (btnNuevoCatalogo) {
        btnNuevoCatalogo.style.display = canCreate ? "inline-block" : "none";
    }
    if (btnEditarCatalogo) {
        btnEditarCatalogo.style.display = canCreate ? "inline-block" : "none";
    }
}

window.enforcePermissions = enforcePermissions;

async function loadItinerariosForCatalogos() {
    const catalogoEtapa = document.getElementById("catalogo-etapa");
    if (!catalogoEtapa) return;
    catalogoEtapa.innerHTML = '<option value="">— Seleccionar Etapa —</option>';
    try {
        const snap = await getDocs(query(collection(db, "itinerario"), orderBy("createdAt", "asc")));
        snap.forEach(d => {
            catalogoEtapa.appendChild(new Option(d.data().nombre, d.id));
        });
    } catch(e) {
        console.error("Error loading stages list in catalog page:", e);
    }
}
