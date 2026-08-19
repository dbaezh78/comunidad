import { db } from "./firebase.js";
import { collection, doc, getDoc, getDocs, updateDoc, query, orderBy, collectionGroup, deleteDoc, where } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

// DOM
const userCard        = document.getElementById("form-user-card");
const inputEmail      = document.getElementById("u-email");
const inputName       = document.getElementById("u-name");
const selectRol       = document.getElementById("u-rol");
const checkBanned     = document.getElementById("u-banned");
const btnSave         = document.getElementById("btn-save-user");
const btnCancel       = document.getElementById("btn-cancel");
const searchInput     = document.getElementById("search-users");
const tbody           = document.getElementById("users-tbody");
const globalAlert     = document.getElementById("global-alert");

// State
let allUsers = [];
let cachedParroquias = {};
let cachedComunidades = {}; // communityId -> number
let editingEmail = null;

// App Ready
window.addEventListener("app:ready", async () => {
    await loadParroquias();
    await loadAllComunidadesCache();
    await loadUsers();

    btnSave.addEventListener("click", saveUserPerms);
    btnCancel.addEventListener("click", resetForm);
    searchInput.addEventListener("input", filterUsers);
});

// Helpers
function showAlert(msg, type = "info") {
    globalAlert.textContent = msg;
    globalAlert.className = `alert alert-${type} visible`;
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (type === "success") setTimeout(() => { globalAlert.className = "alert"; }, 3500);
}

async function loadParroquias() {
    try {
        const snap = await getDocs(collection(db, "parroquias"));
        snap.forEach(d => {
            cachedParroquias[d.id] = d.data().nombre;
        });
    } catch(e) { console.error(e); }
}

async function loadAllComunidadesCache() {
    try {
        const snap = await getDocs(collectionGroup(db, "comunidades"));
        snap.forEach(d => {
            cachedComunidades[d.id] = d.data().numero || d.id;
        });
    } catch(e) { console.error(e); }
}

async function loadUsers() {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:15px; color:#7f8c8d;">Cargando...</td></tr>';
    try {
        const snap = await getDocs(query(collection(db, "autenticados"), orderBy("fecha", "desc")));
        allUsers = [];
        snap.forEach(d => {
            allUsers.push({ id: d.id, ...d.data() });
        });
        renderTable(allUsers);
    } catch(err) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:red;">Error: ${err.message}</td></tr>`;
    }
}

function renderTable(lista) {
    tbody.innerHTML = "";
    if (lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:15px; color:#999;">No hay usuarios autenticados registrados.</td></tr>';
        return;
    }

    lista.forEach(u => {
        const cNombre = cachedComunidades[u.comunidadId] ? `Comunidad ${cachedComunidades[u.comunidadId]}` : "—";
        const dateStr = u.fecha 
            ? new Date(u.fecha).toLocaleString("es-DO", { dateStyle: "short", timeStyle: "short" }) 
            : "—";
        
        const geoStr = `${u.ip || "—"} / ${u.pais || "—"}`;
        
        let rolStr = "Hermano";
        if (u.rol === "admin") rolStr = "Administrador";
        else if (u.rol === "responsable") rolStr = "Responsable";

        const estadoStr = u.baneado 
            ? `<span style="color:#dc3545; font-weight:600; background:#fdf2f2; padding:2px 6px; border-radius:4px; font-size:0.75rem;">Baneado</span>` 
            : `<span style="color:#28a745; font-weight:600; background:#f4fbf7; padding:2px 6px; border-radius:4px; font-size:0.75rem;">Activo</span>`;

        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>
                <strong>${u.displayName || "Usuario"}</strong>
                <div style="font-size:0.75rem; color:#666;">${u.correo}</div>
            </td>
            <td>${cNombre}</td>
            <td>${dateStr}</td>
            <td>${geoStr}</td>
            <td>${rolStr}</td>
            <td>${estadoStr}</td>
            <td style="text-align:center;">
                <button class="btn btn-sm btn-outline btn-edit" data-email="${u.correo}">✏️ Permisos</button>
                <button class="btn btn-sm btn-outline btn-delete" style="color:red; border-color:#f5c6cb; margin-left:4px;" data-email="${u.correo}">✕ Eliminar</button>
            </td>
        `;

        tr.querySelector(".btn-edit").addEventListener("click", () => editUser(u));
        tr.querySelector(".btn-delete").addEventListener("click", () => deleteUser(u.correo));
        tbody.appendChild(tr);
    });
}

function filterUsers() {
    const q = searchInput.value.toLowerCase().trim();
    if (!q) { renderTable(allUsers); return; }

    const filtrados = allUsers.filter(u => {
        const email = (u.correo || "").toLowerCase();
        const name = (u.displayName || "").toLowerCase();
        return email.includes(q) || name.includes(q);
    });
    renderTable(filtrados);
}

function editUser(u) {
    editingEmail = u.correo;
    inputEmail.value = u.correo;
    inputName.value = u.displayName || "";
    selectRol.value = u.rol || "all";
    checkBanned.checked = u.baneado || false;

    userCard.style.display = "block";
    userCard.scrollIntoView({ behavior: "smooth" });
}

async function saveUserPerms() {
    if (!editingEmail) return;

    btnSave.disabled = true;
    try {
        await updateDoc(doc(db, "autenticados", editingEmail.toLowerCase()), {
            rol: selectRol.value,
            baneado: checkBanned.checked
        });

        showAlert("✅ Permisos del usuario actualizados exitosamente.", "success");
        resetForm();
        await loadUsers();
    } catch(err) {
        showAlert("Error al actualizar: " + err.message, "error");
    } finally {
        btnSave.disabled = false;
    }
}

function resetForm() {
    editingEmail = null;
    inputEmail.value = "";
    inputName.value = "";
    selectRol.value = "all";
    checkBanned.checked = false;
    userCard.style.display = "none";
}

async function deleteUser(email) {
    if (!email) return;
    if (!confirm(`¿Estás seguro de que deseas eliminar permanentemente a ${email}? Esto borrará su registro de autenticación y su ficha en el directorio de hermanos para que pueda registrarse nuevamente desde cero.`)) return;

    try {
        await deleteDoc(doc(db, "autenticados", email.toLowerCase()));

        const hSnap = await getDocs(query(collection(db, "hermanos"), where("correo", "==", email)));
        for (let docSnap of hSnap.docs) {
            await deleteDoc(doc(db, "hermanos", docSnap.id));
        }

        showAlert("🗑️ Usuario y registro de hermano eliminados correctamente.", "success");
        await loadUsers();
    } catch(err) {
        showAlert("Error al eliminar: " + err.message, "error");
    }
}
