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

// App Ready
window.addEventListener("app:ready", async () => {
    btnSave.addEventListener("click", saveStage);
    btnCancel.addEventListener("click", resetForm);
    searchInput.addEventListener("input", filterStages);
    filterRealidad.addEventListener("change", onFilterRealidadChange);

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

function renderTable(lista) {
    tbody.innerHTML = "";

    const activeRealidadId = filterRealidad.value;

    // Filter stages belonging to the currently selected reality
    const filteredByRealidad = lista.filter(s => {
        if (!s.realidadId && activeRealidadId === defaultRealidadId) return true;
        return s.realidadId === activeRealidadId;
    });

    if (filteredByRealidad.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:15px; color:#999;">No se encontraron etapas para esta realidad.</td></tr>';
        return;
    }

    filteredByRealidad.forEach(s => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td><strong>${s.nombre}</strong></td>
            <td>${s.detalle || "—"}</td>
            <td>${s.otros || "—"}</td>
            <td style="text-align:center;">
                <button class="btn btn-sm btn-outline btn-edit" data-id="${s.id}">✏️ Editar</button>
                <button class="btn btn-sm btn-outline btn-delete" style="color:red; border-color:#f5c6cb; margin-left:4px;" data-id="${s.id}">✕</button>
            </td>
        `;

        tr.querySelector(".btn-edit").addEventListener("click", () => editStage(s));
        tr.querySelector(".btn-delete").addEventListener("click", () => deleteStage(s.id));
        tbody.appendChild(tr);
    });
}

function filterStages() {
    const q = searchInput.value.toLowerCase().trim();
    if (!q) { renderTable(allStages); return; }

    const filtered = allStages.filter(s => {
        const nom = (s.nombre || "").toLowerCase();
        const det = (s.detalle || "").toLowerCase();
        return nom.includes(q) || det.includes(q);
    });
    renderTable(filtered);
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

        // Set the filter select value to the saved reality to let user see it immediately
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
