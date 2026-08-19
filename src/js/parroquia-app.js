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

// ── App ready ────────────────────────────────────
window.addEventListener("app:ready", async () => {
    await loadRealidades();
    await loadParroquias();
    
    const searchInput = document.getElementById("search-parroquias");
    if (searchInput) {
        searchInput.addEventListener("input", filterParroquias);
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

selParroquia.addEventListener("change", async () => {
    const id = selParroquia.value;
    if (!id) { viewPanel.style.display = "none"; formPanel.style.display = "none"; return; }
    showLoading(true);
    const snap = await getDoc(doc(db, "parroquias", id));
    showLoading(false);
    if (snap.exists()) showViewPanel({ id: snap.id, ...snap.data() });
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

function renderParroquiasTable(lista) {
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
            <td><strong>${p.nombre}</strong></td>
            <td>${p.parroco || "—"}</td>
            <td>${p.telefono || "—"}</td>
            <td>${p.direccion || "—"}</td>
            <td style="text-align:center;">
                <button class="btn btn-sm btn-outline btn-edit-table" data-id="${p.id}">✏️ Editar</button>
                <button class="btn btn-sm btn-outline btn-delete-table" style="color:red; border-color:#f5c6cb; margin-left:4px;" data-id="${p.id}">✕</button>
            </td>
        `;

        tr.querySelector(".btn-edit-table").addEventListener("click", () => {
            selParroquia.value = p.id;
            openEditForm(p);
        });

        tr.querySelector(".btn-delete-table").addEventListener("click", () => {
            deleteParroquiaById(p.id);
        });

        tbody.appendChild(tr);
    });
}

function filterParroquias() {
    const q = document.getElementById("search-parroquias").value.toLowerCase().trim();
    if (!q) {
        renderParroquiasTable(todasParroquias);
        return;
    }

    const filtered = todasParroquias.filter(p => {
        const nom = (p.nombre || "").toLowerCase();
        const pr = (p.parroco || "").toLowerCase();
        const dir = (p.direccion || "").toLowerCase();
        return nom.includes(q) || pr.includes(q) || dir.includes(q);
    });
    renderParroquiasTable(filtered);
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

