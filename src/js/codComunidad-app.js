import { db } from "./firebase.js";
import { collection, doc, getDoc, setDoc, getDocs, deleteDoc, updateDoc, query, orderBy, collectionGroup } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

// DOM
const inputCode       = document.getElementById("c-code");
const btnGen          = document.getElementById("btn-gen-code");
const selectParroquia = document.getElementById("c-parroquia");
const selectComunidad = document.getElementById("c-comunidad");
const selectHermano   = document.getElementById("c-hermano");
const inputEmail      = document.getElementById("c-email");
const btnSave         = document.getElementById("btn-save-code");
const btnCancel       = document.getElementById("btn-cancel");
const searchInput     = document.getElementById("search-codes");
const tbody           = document.getElementById("codes-tbody");
const globalAlert     = document.getElementById("global-alert");

// State
let allCodes = [];
let cachedParroquias = {};
let cachedComunidades = {}; // id -> number
let allHermanos = [];
let editingCode = null;

// App Ready
window.addEventListener("app:ready", async () => {
    enforcePermissions();
    await loadParroquias();
    await loadAllComunidadesCache();
    await loadHermanos();
    await loadCodes();

    selectParroquia.addEventListener("change", async () => {
        await loadComunidadesForParroquia(selectParroquia.value);
        updateHermanoDropdownForSelection();
    });

    selectComunidad.addEventListener("change", () => {
        updateHermanoDropdownForSelection();
    });

    selectHermano.addEventListener("change", () => {
        const selectedHnoId = selectHermano.value;
        if (!selectedHnoId) {
            inputEmail.value = "";
            return;
        }
        const hno = allHermanos.find(h => h.id === selectedHnoId);
        if (hno) {
            inputEmail.value = hno.correo || "";
        }
    });

    btnGen.addEventListener("click", () => {
        inputCode.value = generateUUID32();
    });

    btnSave.addEventListener("click", saveCode);
    btnCancel.addEventListener("click", resetForm);
    searchInput.addEventListener("input", filterCodes);
});

// Helpers
function showAlert(msg, type = "info") {
    globalAlert.textContent = msg;
    globalAlert.className = `alert alert-${type} visible`;
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (type === "success") setTimeout(() => { globalAlert.className = "alert"; }, 3500);
}

function generateUUID32() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let result = "";
    for (let i = 0; i < 32; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

async function loadParroquias() {
    const snap = await getDocs(query(collection(db, "parroquias"), orderBy("nombre")));
    selectParroquia.innerHTML = '<option value="">— Seleccionar —</option>';
    snap.forEach(d => {
        cachedParroquias[d.id] = d.data().nombre;
        selectParroquia.appendChild(new Option(d.data().nombre, d.id));
    });
}

async function loadAllComunidadesCache() {
    try {
        const snap = await getDocs(collectionGroup(db, "comunidades"));
        snap.forEach(d => {
            cachedComunidades[d.id] = d.data().numero || d.id;
        });
    } catch(e) {
        console.error(e);
    }
}

async function loadComunidadesForParroquia(pid) {
    selectComunidad.innerHTML = '<option value="">— Seleccionar —</option>';
    if (!pid) { selectComunidad.disabled = true; return; }

    selectComunidad.disabled = true;
    try {
        const snap = await getDocs(collection(db, "parroquias", pid, "comunidades"));
        let coms = [];
        snap.forEach(d => coms.push({ id: d.id, numero: d.data().numero || d.id }));
        coms.sort((a, b) => a.numero - b.numero);

        coms.forEach(c => {
            selectComunidad.appendChild(new Option(`Comunidad ${c.numero}`, c.id));
        });
        selectComunidad.disabled = false;
    } catch(e) {
        console.error(e);
    }
}

async function loadCodes() {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:15px; color:#7f8c8d;">Cargando...</td></tr>';
    try {
        const snap = await getDocs(query(collection(db, "codigos"), orderBy("createdAt", "desc")));
        allCodes = [];
        snap.forEach(d => {
            allCodes.push({ id: d.id, ...d.data() });
        });
        renderTable(allCodes);
    } catch(err) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:red;">Error: ${err.message}</td></tr>`;
    }
}

function renderTable(lista) {
    tbody.innerHTML = "";
    if (lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:15px; color:#999;">No hay códigos.</td></tr>';
        return;
    }

    lista.forEach(c => {
        const pNombre = cachedParroquias[c.parroquiaId] || "—";
        const origNum = cachedComunidades[c.comunidadId] || c.comunidadId || "—";
        let cNombre = `Comunidad ${origNum}`;

        if (c.usadoPorEmail) {
            const hno = allHermanos.find(h => h.correo && h.correo.toLowerCase() === c.usadoPorEmail.toLowerCase());
            if (hno && hno.comunidadId && hno.comunidadId !== c.comunidadId) {
                const currNum = cachedComunidades[hno.comunidadId] || hno.comunidadId || "—";
                cNombre = `<span style="font-weight:600; color:#dc3545;" title="Hermano trasladado de comunidad">N: ${origNum} → ${currNum}</span>`;
            }
        }

        const correo = c.usadoPorEmail 
            ? `<span style="color:#2ecc71; font-weight:600;">✅ ${c.usadoPorEmail}</span>` 
            : `<span style="color:#e67e22; font-weight:600;">Disponible</span>`;

        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td style="font-family:monospace; font-weight:600;">${c.id}</td>
            <td>${pNombre}</td>
            <td>${cNombre}</td>
            <td>${correo}</td>
            <td style="text-align:center;">
                ${window.hasPermission("codigo_editar") ? `<button class="btn btn-sm btn-outline btn-edit" data-id="${c.id}">✏️ Editar</button>` : ""}
                ${window.hasPermission("codigo_eliminar") ? `<button class="btn btn-sm btn-outline btn-delete" style="color:red; border-color:#f5c6cb;" data-id="${c.id}">✕</button>` : ""}
            </td>
        `;

        const btnEdit = tr.querySelector(".btn-edit");
        if (btnEdit) {
            btnEdit.addEventListener("click", () => editCode(c));
        }
        const btnDelete = tr.querySelector(".btn-delete");
        if (btnDelete) {
            btnDelete.addEventListener("click", () => deleteCode(c.id));
        }
        tbody.appendChild(tr);
    });
}

function filterCodes() {
    const q = searchInput.value.toLowerCase().trim();
    if (!q) { renderTable(allCodes); return; }

    const filtrados = allCodes.filter(c => {
        const code = c.id.toLowerCase();
        const email = (c.usadoPorEmail || "").toLowerCase();
        const pNombre = (cachedParroquias[c.parroquiaId] || "").toLowerCase();
        const cNombre = cachedComunidades[c.comunidadId] ? `comunidad ${cachedComunidades[c.comunidadId]}`.toLowerCase() : "";
        return code.includes(q) || email.includes(q) || pNombre.includes(q) || cNombre.includes(q);
    });
    renderTable(filtrados);
}

async function saveCode() {
    const code = inputCode.value.trim().toUpperCase();
    const parroquia = selectParroquia.value;
    const comunidad = selectComunidad.value;
    const email = inputEmail.value.trim();

    if (code.length !== 32) return alert("Por favor genera un código de 32 caracteres.");
    if (!parroquia || !comunidad) return alert("Llene los campos obligatorios de Parroquia y Comunidad.");

    btnSave.disabled = true;
    try {
        const data = {
            comunidadId: comunidad,
            parroquiaId: parroquia,
            usadoPorEmail: email || null
        };

        if (editingCode) {
            await updateDoc(doc(db, "codigos", editingCode), data);
            showAlert("✅ Código actualizado con éxito.", "success");
        } else {
            data.createdAt = new Date().toISOString();
            await setDoc(doc(db, "codigos", code), data);
            showAlert("✅ Código creado y guardado.", "success");
        }
        resetForm();
        await loadCodes();
    } catch(err) {
        showAlert("Error al guardar: " + err.message, "error");
    } finally {
        btnSave.disabled = false;
    }
}

async function editCode(c) {
    editingCode = c.id;
    inputCode.value = c.id;
    inputCode.readOnly = true;
    btnGen.disabled = true;

    selectParroquia.value = c.parroquiaId;
    await loadComunidadesForParroquia(c.parroquiaId);
    selectComunidad.value = c.comunidadId;
    
    updateHermanoDropdownForSelection();

    inputEmail.value = c.usadoPorEmail || "";

    if (c.usadoPorEmail) {
        const hno = allHermanos.find(h => h.correo.toLowerCase() === c.usadoPorEmail.toLowerCase());
        selectHermano.value = hno ? hno.id : "";
    } else {
        selectHermano.value = "";
    }

    btnCancel.style.display = "inline-block";
    btnSave.textContent = "💾 Guardar Cambios";
}

async function deleteCode(code) {
    const confirmDelete = await window.customConfirm(
        "Eliminar Código",
        `¿Estás seguro de que deseas eliminar permanentemente el código ${code}?`,
        { icon: "🗑️", danger: true }
    );
    if (!confirmDelete) return;
    try {
        await deleteDoc(doc(db, "codigos", code));
        showAlert("🗑️ Código eliminado.", "success");
        await loadCodes();
    } catch(err) {
        showAlert("Error al eliminar: " + err.message, "error");
    }
}

function resetForm() {
    editingCode = null;
    inputCode.value = "";
    inputCode.readOnly = true;
    btnGen.disabled = false;
    selectParroquia.value = "";
    selectComunidad.value = "";
    selectComunidad.disabled = true;
    selectHermano.value = "";
    inputEmail.value = "";

    updateHermanoDropdownForSelection();

    btnCancel.style.display = "none";
    btnSave.textContent = "💾 Guardar Código";
}

async function loadHermanos() {
    selectHermano.innerHTML = '<option value="">— Seleccionar comunidad primero —</option>';
    selectHermano.disabled = true;
    try {
        const snap = await getDocs(collection(db, "hermanos"));
        allHermanos = [];
        snap.forEach(d => {
            const h = d.data();
            const nombre = `${h.primerNombre} ${h.segundoNombre || ""} ${h.primerApellido} ${h.segundoApellido || ""}`.replace(/\s+/g, ' ').trim();
            allHermanos.push({ id: d.id, nombre, correo: h.correo || "", comunidadId: h.comunidadId || null, parroquiaId: h.parroquiaId || null });
        });
        allHermanos.sort((a, b) => a.nombre.localeCompare(b.nombre));
    } catch(e) {
        console.error("Error loading hermanos:", e);
    }
}

function updateHermanoDropdownForSelection() {
    const pid = selectParroquia.value;
    const cid = selectComunidad.value;

    selectHermano.innerHTML = "";

    if (!pid || !cid) {
        selectHermano.appendChild(new Option("— Seleccionar comunidad primero —", ""));
        selectHermano.disabled = true;
        return;
    }

    const filtrados = allHermanos.filter(h => h.parroquiaId === pid && h.comunidadId === cid);

    if (filtrados.length === 0) {
        selectHermano.appendChild(new Option("— No hay hermanos en esta comunidad —", ""));
        selectHermano.disabled = true;
        return;
    }

    selectHermano.appendChild(new Option("— Seleccionar Hermano —", ""));
    filtrados.forEach(h => {
        selectHermano.appendChild(new Option(h.nombre, h.id));
    });
    selectHermano.disabled = false;
}

function enforcePermissions() {
    if (!window.hasPermission) return;

    // Generar codigo (btnGen)
    const btnGen = document.getElementById("btn-gen-code");
    if (btnGen && !window.hasPermission("codigo_generar")) {
        btnGen.style.display = "none";
    }

    // Seleccionar parroquia (selectParroquia)
    const selectParroquia = document.getElementById("c-parroquia");
    if (selectParroquia && !window.hasPermission("codigo_seleccionar_parroquia")) {
        selectParroquia.disabled = true;
    }

    // Seleccionar Comunidad (selectComunidad)
    const selectComunidad = document.getElementById("c-comunidad");
    if (selectComunidad && !window.hasPermission("codigo_seleccionar_comunidad")) {
        selectComunidad.disabled = true;
    }

    // Guardar (btnSave)
    const btnSave = document.getElementById("btn-save-code");
    if (btnSave && !window.hasPermission("codigo_guardar")) {
        btnSave.style.display = "none";
    }
}
