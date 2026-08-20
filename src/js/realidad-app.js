// ================================================
// REALIDAD-APP.JS — Logica de realidad.html
// ================================================
import { db } from "./firebase.js";
import { collection, doc, getDoc, getDocs, addDoc,
         updateDoc, deleteDoc, query, where,
         orderBy } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

// ── DOM ──────────────────────────────────────────
const btnNueva        = document.getElementById("btn-nueva-realidad");
const formCard        = document.getElementById("form-card");
const formTitle       = document.getElementById("form-title-realidad");
const loadingState    = document.getElementById("loading-state");
const emptyState      = document.getElementById("empty-state");
const realidadCards   = document.getElementById("realidad-cards");
const globalAlert     = document.getElementById("global-alert");

const rNombre         = document.getElementById("r-nombre");
const rWeb            = document.getElementById("r-web");
const rFecha          = document.getElementById("r-fecha");
const rIniciadores    = document.getElementById("r-iniciadores");
const rHistoria       = document.getElementById("r-historia");
const rItinerario     = document.getElementById("r-itinerario");
const catInput        = document.getElementById("cat-input");
const catId           = document.getElementById("cat-id");
const catResults      = document.getElementById("cat-results");

const btnSave         = document.getElementById("btn-save-realidad");
const btnCancel       = document.getElementById("btn-cancel-realidad");
const btnDelete       = document.getElementById("btn-delete-realidad");

// Estado
let todosHermanos    = [];
window.todasRealidades  = [];
let editingId        = null;

// ── App ready ────────────────────────────────────
window.addEventListener("app:ready", async () => {
    enforcePermissions();
    await loadHermanos();
    await loadRealidades();
    setupCatequistaSearch();
});

async function loadHermanos() {
    const snap = await getDocs(collection(db, "hermanos"));
    todosHermanos = [];
    snap.forEach(d => {
        const h = d.data();
        if (h.activo !== false) {
            todosHermanos.push({ id: d.id, ...h });
        }
    });
    todosHermanos.sort((a, b) => {
        const nomA = `${a.primerApellido || ""} ${a.primerNombre || ""}`.toLowerCase();
        const nomB = `${b.primerApellido || ""} ${b.primerNombre || ""}`.toLowerCase();
        return nomA.localeCompare(nomB);
    });
}

// ── Busqueda de catequista ─────────────────────────
function setupCatequistaSearch() {
    catInput.addEventListener("input", () => {
        const q = catInput.value.toLowerCase().trim();
        if (q.length < 2) { catResults.classList.remove("open"); return; }

        const matches = todosHermanos.filter(h =>
            `${h.primerNombre} ${h.primerApellido}`.toLowerCase().includes(q)
        ).slice(0, 8);

        catResults.innerHTML = "";
        if (!matches.length) {
            catResults.innerHTML = `<div class="search-result-item" style="color:#7f8c8d;">Sin resultados</div>`;
        } else {
            matches.forEach(h => {
                const item = document.createElement("div");
                item.className = "search-result-item";
                const nombre = [h.primerNombre, h.segundoNombre, h.primerApellido, h.segundoApellido].filter(Boolean).join(" ");
                item.textContent = nombre;
                item.addEventListener("click", () => {
                    catId.value    = h.id;
                    catInput.value = nombre;
                    catResults.classList.remove("open");
                });
                catResults.appendChild(item);
            });
        }
        catResults.classList.add("open");
    });

    document.addEventListener("click", (e) => {
        if (!catInput.contains(e.target)) catResults.classList.remove("open");
    });
}

// ── Cargar y renderizar realidades ────────────────
async function loadRealidades() {
    loadingState.style.display = "flex";
    realidadCards.innerHTML    = "";

    const snap = await getDocs(query(
        collection(db, "realidades"),
        orderBy("nombre")
    ));

    todasRealidades = [];
    snap.forEach(d => todasRealidades.push({ id: d.id, ...d.data() }));

    loadingState.style.display = "none";

    if (todasRealidades.length === 0) {
        emptyState.style.display = "block";
        return;
    }

    emptyState.style.display = "none";
    renderCards(todasRealidades);
}

function renderCards(realidades) {
    realidadCards.innerHTML = "";
    realidades.forEach(r => {
        const card = document.createElement("div");
        card.className = "realidad-card";
        card.dataset.id = r.id;

        const webMarkup = r.web ? `<div>🌐 <a href="${r.web}" target="_blank" style="color:var(--primary);text-decoration:none;font-weight:600;">Página Web</a></div>` : "";
        const fechaMarkup = r.fecha ? `<div>📅 Inspirada: ${new Date(r.fecha + "T00:00:00").toLocaleDateString("es-DO", {day:"2-digit",month:"long",year:"numeric"})}</div>` : "";
        const iniciadoresMarkup = r.iniciadores ? `<div>👥 Iniciadores: ${r.iniciadores}</div>` : "";

        card.innerHTML = `
            <div class="rc-nombre">📚 ${r.nombre}</div>
            <div class="rc-catequista" style="margin-top:6px;font-size:0.9rem;color:#555;">🎓 Catequista: ${r.catequistaNombre || "—"}</div>
            <div class="rc-meta" style="margin-top:6px;font-size:0.85rem;color:#7f8c8d;display:flex;flex-direction:column;gap:3px;">
                ${webMarkup}
                ${fechaMarkup}
                ${iniciadoresMarkup}
            </div>
            ${r.historia ? `<div class="rc-historia" style="margin-top:8px;font-size:0.85rem;color:#555;border-top:1px solid #eee;padding-top:6px;"><strong>Historia:</strong><br>${r.historia.replace(/\n/g, '<br>')}</div>` : ""}
            ${r.itinerario ? `<div class="rc-itinerario" style="margin-top:8px;font-size:0.85rem;color:#555;border-top:1px solid #eee;padding-top:6px;"><strong>Itinerario de Formación:</strong><br>${r.itinerario.replace(/\n/g, '<br>')}</div>` : ""}
            <div style="margin-top:12px;">
                ${window.hasPermission("realidad_consultar") ? `<button class="btn btn-sm btn-outline btn-view-r" data-id="${r.id}" style="margin-right:6px;">👁️ Ver</button>` : ""}
                ${window.hasPermission("realidad_editar") ? `<button class="btn btn-sm btn-outline btn-editar-r" data-id="${r.id}">✏️ Editar</button>` : ""}
            </div>
        `;
        const btnViewR = card.querySelector(".btn-view-r");
        if (btnViewR) {
            btnViewR.addEventListener("click", (e) => {
                e.stopPropagation();
                openView(r);
            });
        }
        const btnEditR = card.querySelector(".btn-editar-r");
        if (btnEditR) {
            btnEditR.addEventListener("click", (e) => {
                e.stopPropagation();
                openEdit(r);
            });
        }
        realidadCards.appendChild(card);
    });
}

function enableAllInputs() {
    const inputs = formCard.querySelectorAll("input, select, textarea, button");
    inputs.forEach(input => {
        input.disabled = false;
    });
    enforcePermissions();
}

// ── Nueva realidad ────────────────────────────────
btnNueva.addEventListener("click", () => {
    enableAllInputs();
    editingId = null;
    rNombre.value      = "";
    rWeb.value         = "";
    rFecha.value       = "";
    rIniciadores.value = "";
    rHistoria.value    = "";
    rItinerario.value  = "";
    catInput.value     = "";
    catId.value        = "";
    formTitle.textContent = "📋 Nueva Realidad";
    btnDelete.style.display = "none";
    formCard.style.display  = "block";
    formCard.scrollIntoView({ behavior: "smooth" });
});

// ── Editar realidad ───────────────────────────────
function openEdit(r) {
    enableAllInputs();
    editingId          = r.id;
    rNombre.value      = r.nombre || "";
    rWeb.value         = r.web || "";
    rFecha.value       = r.fecha || "";
    rIniciadores.value = r.iniciadores || "";
    rHistoria.value    = r.historia || "";
    rItinerario.value  = r.itinerario || "";
    catInput.value     = r.catequistaNombre || "";
    catId.value        = r.catequistaId     || "";
    formTitle.textContent   = `✏️ Editar: ${r.nombre}`;
    btnDelete.style.display = (window.hasPermission && window.hasPermission("realidad_eliminar")) ? "inline-flex" : "none";
    formCard.style.display  = "block";
    formCard.scrollIntoView({ behavior: "smooth" });
}

function openView(r) {
    openEdit(r);
    formTitle.textContent = `👁️ Consultar: ${r.nombre}`;
    
    // Disable all inputs except cancel button
    const inputs = formCard.querySelectorAll("input, select, textarea, button:not(#btn-cancel-realidad)");
    inputs.forEach(input => {
        if (input.id === "btn-delete-realidad") return;
        input.disabled = true;
    });

    // Hide save button
    const btnSave = document.getElementById("btn-save-realidad");
    if (btnSave) btnSave.style.display = "none";
    
    // Hide delete button
    const btnDelete = document.getElementById("btn-delete-realidad");
    if (btnDelete) btnDelete.style.display = "none";
}

// ── Cancelar ──────────────────────────────────────
btnCancel.addEventListener("click", () => {
    formCard.style.display = "none";
    editingId = null;
    enableAllInputs();
});

// ── Guardar ───────────────────────────────────────
btnSave.addEventListener("click", async () => {
    const nombre = rNombre.value.trim();
    if (!nombre) { showAlert("El nombre de la realidad es obligatorio.", "error"); return; }

    const data = {
        nombre,
        web:               rWeb.value.trim() || null,
        fecha:             rFecha.value || null,
        iniciadores:       rIniciadores.value.trim() || null,
        historia:          rHistoria.value.trim() || null,
        itinerario:        rItinerario.value.trim() || null,
        catequistaId:      catId.value     || null,
        catequistaNombre:  catInput.value.trim() || null,
        updatedAt: new Date().toISOString(),
    };

    btnSave.disabled = true;
    try {
        if (editingId) {
            await updateDoc(doc(db, "realidades", editingId), data);
            showAlert("✅ Realidad actualizada.", "success");
        } else {
            data.createdAt = new Date().toISOString();
            await addDoc(collection(db, "realidades"), data);
            showAlert("✅ Realidad creada.", "success");
        }
        formCard.style.display = "none";
        editingId = null;
        await loadRealidades();
    } catch (err) {
        showAlert("Error: " + err.message, "error");
    } finally {
        btnSave.disabled = false;
    }
});

// ── Eliminar ──────────────────────────────────────
btnDelete.addEventListener("click", async () => {
    if (!editingId) return;
    if (!confirm("¿Eliminar esta realidad? Esta acción no se puede deshacer.")) return;
    try {
        await deleteDoc(doc(db, "realidades", editingId));
        formCard.style.display = "none";
        editingId = null;
        showAlert("🗑️ Realidad eliminada.", "success");
        await loadRealidades();
    } catch (err) {
        showAlert("Error: " + err.message, "error");
    }
});

// ── Helpers ───────────────────────────────────────
function showAlert(msg, type = "info") {
    globalAlert.textContent = msg;
    globalAlert.className   = `alert alert-${type} visible`;
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (type === "success") setTimeout(() => { globalAlert.className = "alert"; }, 3500);
}

function enforcePermissions() {
    if (!window.hasPermission) return;

    // Crear Nueva Realidad
    const btnNueva = document.getElementById("btn-nueva-realidad");
    if (btnNueva && !window.hasPermission("realidad_crear")) {
        btnNueva.style.display = "none";
    }

    // Guardar Realidad / Editar
    const btnSave = document.getElementById("btn-save-realidad");
    if (btnSave && !window.hasPermission("realidad_crear") && !window.hasPermission("realidad_editar")) {
        btnSave.style.display = "none";
    }

    // Eliminar Realidad
    const btnDelete = document.getElementById("btn-delete-realidad");
    if (btnDelete && !window.hasPermission("realidad_eliminar")) {
        btnDelete.style.display = "none";
    }
}
