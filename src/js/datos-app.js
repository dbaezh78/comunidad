// ================================================
// DATOS-APP.JS — Logica de datos.html
// ================================================
import { db } from "./firebase.js";
import { collection, doc, getDoc, getDocs, addDoc,
         updateDoc, deleteDoc, query, orderBy } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

// DOM Selector de Catálogos
const formSelector = document.getElementById("form-selector");

// DOM Sección Misiones
const sectionMisiones = document.getElementById("section-misiones");
const btnNuevaMision = document.getElementById("btn-nueva-mision");
const formCardMision = document.getElementById("form-card-mision");
const formTitleMision = document.getElementById("form-title-mision");
const loadingStateMision = document.getElementById("loading-state-mision");
const emptyStateMision = document.getElementById("empty-state-mision");
const tableCardMision = document.getElementById("table-card-mision");
const tbodyMisiones = document.getElementById("misiones-tbody");
const globalAlert = document.getElementById("global-alert");

const inputMisionNombre = document.getElementById("mision-nombre");
const inputMisionDesc = document.getElementById("mision-descripcion");

const btnSaveMision = document.getElementById("btn-save-mision");
const btnCancelMision = document.getElementById("btn-cancel-mision");
const btnDeleteMision = document.getElementById("btn-delete-mision");

// Estado
let todasMisiones = [];
let editingMisionId = null;

// ── App ready ────────────────────────────────────
window.addEventListener("app:ready", async () => {
    enforcePermissions();
    await loadMisiones();

    // Eventos Misiones
    btnNuevaMision.addEventListener("click", () => {
        editingMisionId = null;
        clearMisionForm();
        formTitleMision.textContent = "📋 Registrar Nueva Misión";
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
    formSelector.addEventListener("change", toggleSections);
});

// Alternar entre diferentes secciones de catálogos (preparado para futuras adiciones)
function toggleSections() {
    const value = formSelector.value;
    document.querySelectorAll(".data-section").forEach(sec => {
        sec.style.display = "none";
    });
    if (value === "misiones") {
        sectionMisiones.style.display = "block";
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

// ── CRUD Misiones ────────────────────────────────
async function loadMisiones() {
    loadingStateMision.style.display = "flex";
    emptyStateMision.style.display = "none";
    tableCardMision.style.display = "none";
    tbodyMisiones.innerHTML = "";

    try {
        const snap = await getDocs(query(collection(db, "misiones"), orderBy("nombre")));
        todasMisiones = [];
        snap.forEach(d => {
            todasMisiones.push({ id: d.id, ...d.data() });
        });

        loadingStateMision.style.display = "none";

        if (todasMisiones.length === 0) {
            emptyStateMision.style.display = "block";
            return;
        }

        renderMisionesTable();
    } catch(err) {
        console.error("Error al cargar misiones:", err);
        loadingStateMision.style.display = "none";
        showAlert("Error al cargar las misiones del servidor.", "error");
    }
}

function renderMisionesTable() {
    tbodyMisiones.innerHTML = "";
    todasMisiones.forEach(m => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td><strong>${m.nombre}</strong></td>
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
    inputMisionNombre.value = "";
    inputMisionDesc.value = "";
    editingMisionId = null;
}

function openEditMision(m) {
    editingMisionId = m.id;
    inputMisionNombre.value = m.nombre;
    inputMisionDesc.value = m.descripcion || "";

    formTitleMision.textContent = `✏️ Editar: ${m.nombre}`;
    btnDeleteMision.style.display = window.hasPermission("datos_eliminar") ? "inline-block" : "none";
    formCardMision.style.display = "block";
    tableCardMision.style.display = "none";
}

async function saveMision() {
    const nombre = inputMisionNombre.value.trim();
    const descripcion = inputMisionDesc.value.trim();

    if (!nombre) {
        showAlert("El nombre de la misión es obligatorio (*).", "error");
        return;
    }

    const payload = {
        nombre,
        descripcion,
        updatedAt: new Date().toISOString()
    };

    try {
        if (editingMisionId) {
            // Editar
            await updateDoc(doc(db, "misiones", editingMisionId), payload);
            showAlert("Misión actualizada con éxito.", "success");
        } else {
            // Crear
            payload.createdAt = new Date().toISOString();
            await addDoc(collection(db, "misiones"), payload);
            showAlert("Misión registrada con éxito.", "success");
        }

        formCardMision.style.display = "none";
        clearMisionForm();
        await loadMisiones();
    } catch(err) {
        console.error("Error al guardar misión:", err);
        showAlert("Error de servidor al guardar la misión.", "error");
    }
}

async function deleteMision() {
    if (!editingMisionId) return;

    if (!confirm("¿Está seguro de que desea eliminar esta misión?")) {
        return;
    }

    try {
        await deleteDoc(doc(db, "misiones", editingMisionId));
        showAlert("Misión eliminada con éxito.", "success");

        formCardMision.style.display = "none";
        clearMisionForm();
        await loadMisiones();
    } catch(err) {
        console.error("Error al eliminar misión:", err);
        showAlert("Error de servidor al eliminar la misión.", "error");
    }
}

// ── Control de Permisos ──────────────────────────
function enforcePermissions() {
    if (!window.hasPermission) return;

    // Crear Nueva Misión
    if (!window.hasPermission("datos_crear")) {
        btnNuevaMision.style.display = "none";
    }

    // Guardar Misión
    if (!window.hasPermission("datos_crear") && !window.hasPermission("datos_editar")) {
        btnSaveMision.style.display = "none";
    }

    // Eliminar Misión
    if (!window.hasPermission("datos_eliminar")) {
        btnDeleteMision.style.display = "none";
    }
}
