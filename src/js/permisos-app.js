import { auth, db } from "./firebase.js";
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, query, orderBy, where, collectionGroup } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
import { signOut } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";

// DOM - Main Tabs
const tabBtnCuenta  = document.getElementById("tab-btn-cuenta");
const tabBtnAcceso  = document.getElementById("tab-btn-acceso");
const tabBtnUsoApp  = document.getElementById("tab-btn-usoapp");

const paneCuenta    = document.getElementById("pane-cuenta");
const paneAcceso    = document.getElementById("pane-acceso");
const paneUsoApp    = document.getElementById("pane-usoapp");

// DOM - Sub Tabs (Acceso)
const subtabBtnMiembros = document.getElementById("subtab-btn-miembros");
const subtabBtnGrupos   = document.getElementById("subtab-btn-grupos");
const subtabBtnPermisos = document.getElementById("subtab-btn-permisos");

const subpaneMiembros   = document.getElementById("subpane-miembros");
const subpaneGrupos     = document.getElementById("subpane-grupos");
const subpanePermisos   = document.getElementById("subpane-permisos");

// DOM - Profile
const profileImg      = document.getElementById("profile-img");
const profileName     = document.getElementById("profile-name");
const profileEmail    = document.getElementById("profile-email");
const profileRoleText = document.getElementById("profile-role-text");
const btnProfileLogout= document.getElementById("btn-profile-logout");

// DOM - Miembros Subpane
const formUserCard    = document.getElementById("form-user-card");
const inputUserEmail  = document.getElementById("u-email");
const inputUserName   = document.getElementById("u-name");
const selectUserRol   = document.getElementById("u-rol");
const checkUserBanned = document.getElementById("u-banned");
const btnSaveUser     = document.getElementById("btn-save-user");
const btnCancelUser   = document.getElementById("btn-cancel-user");
const searchUsers     = document.getElementById("search-users");
const usersTbody      = document.getElementById("users-tbody");

// DOM - Grupos Subpane
const inputGrupoId    = document.getElementById("g-id");
const inputGrupoNombre= document.getElementById("g-nombre");
const btnSaveGrupo    = document.getElementById("btn-save-grupo");
const btnCancelGrupo  = document.getElementById("btn-cancel-grupo");
const formGrupoTitle  = document.getElementById("form-grupo-title");
const gruposTbody     = document.getElementById("grupos-tbody");

// DOM - Permisos Subpane
const selectPermisosGrupo = document.getElementById("select-grupo");
const chkAdminTotal   = document.getElementById("chk-admin-total");
const btnSavePermisos = document.getElementById("btn-save-permisos");
const permisosLista   = document.getElementById("permisos-lista");
const rowsPermisos    = document.querySelectorAll(".permiso-row[data-page]");

// DOM - Uso App Pane
const searchUso       = document.getElementById("search-uso");
const selectPaisUso   = document.getElementById("select-pais-uso");
const usoTbody        = document.getElementById("uso-tbody");

// Global Alert
const globalAlert     = document.getElementById("global-alert");

// State
let currentUser = null;
let allUsers = [];
let allGroups = [];
let allUsoLogs = [];
let cachedParroquias = {};
let cachedComunidades = {}; // communityId -> number
let editingUserEmail = null;
let editingGrupoId = null;

// App Ready
window.addEventListener("app:ready", async (e) => {
    currentUser = e.detail;
    
    // Bind main tabs
    tabBtnCuenta.addEventListener("click", () => switchMainTab("cuenta"));
    tabBtnAcceso.addEventListener("click", () => switchMainTab("acceso"));
    tabBtnUsoApp.addEventListener("click", () => switchMainTab("usoapp"));

    // Bind sub tabs (Acceso)
    subtabBtnMiembros.addEventListener("click", () => switchSubTab("miembros"));
    subtabBtnGrupos.addEventListener("click", () => switchSubTab("grupos"));
    subtabBtnPermisos.addEventListener("click", () => switchSubTab("permisos"));

    // Bind Cuenta Logout
    btnProfileLogout.addEventListener("click", () => signOut(auth));

    // Bind Miembros actions
    btnSaveUser.addEventListener("click", saveUserPerms);
    btnCancelUser.addEventListener("click", resetUserForm);
    searchUsers.addEventListener("input", filterUsers);

    // Bind Grupos actions
    btnSaveGrupo.addEventListener("click", saveGrupo);
    btnCancelGrupo.addEventListener("click", resetGrupoForm);

    // Bind Permisos actions
    selectPermisosGrupo.addEventListener("change", loadGroupPermissions);
    chkAdminTotal.addEventListener("change", toggleAdminTotal);
    btnSavePermisos.addEventListener("click", savePermissions);

    // Bind Uso App filters
    searchUso.addEventListener("input", filterUsoLogs);
    selectPaisUso.addEventListener("change", filterUsoLogs);

    // Load initial data
    await loadParroquias();
    await loadAllComunidadesCache();
    await loadProfile();
    await loadGroups(); 
    await loadUsers();
    await loadUsoLogs();
});

// Helpers
function showAlert(msg, type = "info") {
    globalAlert.textContent = msg;
    globalAlert.className = `alert alert-${type} visible`;
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (type === "success") setTimeout(() => { globalAlert.className = "alert"; }, 3500);
}

// ── NAVIGATION CONTROLLER ──────────────────────────
function switchMainTab(tab) {
    [tabBtnCuenta, tabBtnAcceso, tabBtnUsoApp].forEach(btn => btn.classList.remove("active"));
    [paneCuenta, paneAcceso, paneUsoApp].forEach(pane => pane.style.display = "none");

    if (tab === "cuenta") {
        tabBtnCuenta.classList.add("active");
        paneCuenta.style.display = "block";
    } else if (tab === "acceso") {
        tabBtnAcceso.classList.add("active");
        paneAcceso.style.display = "block";
        switchSubTab("miembros");
    } else if (tab === "usoapp") {
        tabBtnUsoApp.classList.add("active");
        paneUsoApp.style.display = "block";
        loadUsoLogs();
    }
}

function switchSubTab(subtab) {
    [subtabBtnMiembros, subtabBtnGrupos, subtabBtnPermisos].forEach(btn => btn.classList.remove("active"));
    [subpaneMiembros, subpaneGrupos, subpanePermisos].forEach(pane => pane.style.display = "none");

    if (subtab === "miembros") {
        subtabBtnMiembros.classList.add("active");
        subpaneMiembros.style.display = "block";
        loadUsers();
    } else if (subtab === "grupos") {
        subtabBtnGrupos.classList.add("active");
        subpaneGrupos.style.display = "block";
        loadGroups();
    } else if (subtab === "permisos") {
        subtabBtnPermisos.classList.add("active");
        subpanePermisos.style.display = "block";
        loadGroupPermissions();
    }
}

// ── CACHE LOADERS ──────────────────────────────────
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

// ── TAB: CUENTA ────────────────────────────────────
async function loadProfile() {
    if (!currentUser) return;
    profileImg.src = currentUser.photoURL || "src/img/default-avatar.png";
    profileName.textContent = `Bienvenido: ${currentUser.displayName || currentUser.email}`;
    profileEmail.textContent = currentUser.email;

    try {
        const uSnap = await getDoc(doc(db, "autenticados", currentUser.email.toLowerCase()));
        if (uSnap.exists()) {
            const data = uSnap.data();
            const roleName = data.rol || "hermano";
            profileRoleText.textContent = roleName.toUpperCase();
        } else {
            profileRoleText.textContent = "HERMANO";
        }
    } catch(e) {
        profileRoleText.textContent = "HERMANO";
    }
}

// ── SUBTAB: GRUPOS ─────────────────────────────────
async function loadGroups() {
    gruposTbody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:15px; color:#7f8c8d;">Cargando...</td></tr>';
    try {
        const snap = await getDocs(collection(db, "permisosRoles"));
        allGroups = [];
        
        // Ensure default groups exist in local state even if DB is empty
        const defaultGroups = [
            { id: "admin", nombre: "Administradores del Sistema" },
            { id: "responsable", nombre: "Responsables de Comunidad" },
            { id: "hermano", nombre: "Hermanos Miembros" }
        ];

        snap.forEach(d => {
            allGroups.push({ id: d.id, nombre: d.data().nombre || d.id });
        });

        // Merge defaults if not present
        defaultGroups.forEach(dg => {
            if (!allGroups.find(g => g.id === dg.id)) {
                allGroups.push(dg);
            }
        });

        renderGruposTable();
        populateGroupsDropdowns();
    } catch(err) {
        gruposTbody.innerHTML = `<tr><td colspan="3" style="text-align:center; color:red;">Error: ${err.message}</td></tr>`;
    }
}

function renderGruposTable() {
    gruposTbody.innerHTML = "";
    allGroups.forEach(g => {
        const isDefault = ["admin", "responsable", "hermano"].includes(g.id);
        const deleteBtn = isDefault 
            ? `<span style="color:#aaa; font-size:0.8rem; font-style:italic;">Sistema</span>` 
            : `<button class="btn btn-sm btn-outline btn-delete-grupo" style="color:red; border-color:#f5c6cb;" data-id="${g.id}">✕ Eliminar</button>`;

        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td><strong>${g.id}</strong></td>
            <td>${g.nombre}</td>
            <td style="text-align:center;">
                <button class="btn btn-sm btn-outline btn-edit-grupo" data-id="${g.id}">✏️ Editar</button>
                ${deleteBtn}
            </td>
        `;

        tr.querySelector(".btn-edit-grupo").addEventListener("click", () => editGrupo(g));
        if (!isDefault) {
            tr.querySelector(".btn-delete-grupo").addEventListener("click", () => deleteGrupo(g.id));
        }
        gruposTbody.appendChild(tr);
    });
}

function populateGroupsDropdowns() {
    // Populate selectUserRol
    selectUserRol.innerHTML = "";
    // Populate selectPermisosGrupo
    selectPermisosGrupo.innerHTML = "";

    allGroups.forEach(g => {
        selectUserRol.appendChild(new Option(`${g.nombre} (${g.id})`, g.id));
        selectPermisosGrupo.appendChild(new Option(`${g.nombre} (${g.id})`, g.id));
    });
}

async function saveGrupo() {
    const id = inputGrupoId.value.trim().toLowerCase();
    const nombre = inputGrupoNombre.value.trim();

    if (!id || !nombre) return alert("Complete los campos requeridos.");
    if (editingGrupoId === null && ["admin", "responsable", "hermano"].includes(id)) {
        return alert("El identificador del grupo coincide con uno reservado por el sistema.");
    }

    btnSaveGrupo.disabled = true;
    try {
        await setDoc(doc(db, "permisosRoles", id), { nombre }, { merge: true });
        showAlert("✅ Grupo/Rol guardado con éxito.", "success");
        resetGrupoForm();
        await loadGroups();
    } catch(err) {
        showAlert("Error al guardar: " + err.message, "error");
    } finally {
        btnSaveGrupo.disabled = false;
    }
}

function editGrupo(g) {
    editingGrupoId = g.id;
    inputGrupoId.value = g.id;
    inputGrupoId.readOnly = true;
    inputGrupoNombre.value = g.nombre;

    formGrupoTitle.textContent = "✏️ Editar Grupo / Rol";
    btnCancelGrupo.style.display = "inline-block";
}

async function deleteGrupo(id) {
    const confirmDelete = await window.customConfirm(
        "Eliminar Grupo/Rol",
        `¿Estás seguro de que deseas eliminar permanentemente el grupo "${id}"?`,
        { icon: "🗑️", danger: true }
    );
    if (!confirmDelete) return;
    try {
        await deleteDoc(doc(db, "permisosRoles", id));
        showAlert("🗑️ Grupo eliminado con éxito.", "success");
        await loadGroups();
    } catch(err) {
        showAlert("Error al eliminar: " + err.message, "error");
    }
}

function resetGrupoForm() {
    editingGrupoId = null;
    inputGrupoId.value = "";
    inputGrupoId.readOnly = false;
    inputGrupoNombre.value = "";
    formGrupoTitle.textContent = "📝 Crear Nuevo Grupo / Rol";
    btnCancelGrupo.style.display = "none";
}

// ── SUBTAB: MIEMBROS ───────────────────────────────
async function loadUsers() {
    usersTbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:15px; color:#7f8c8d;">Cargando...</td></tr>';
    try {
        const snap = await getDocs(query(collection(db, "autenticados"), orderBy("fecha", "desc")));
        allUsers = [];
        snap.forEach(d => {
            allUsers.push({ id: d.id, ...d.data() });
        });
        renderUsersTable(allUsers);
    } catch(err) {
        usersTbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:red;">Error: ${err.message}</td></tr>`;
    }
}

function renderUsersTable(lista) {
    usersTbody.innerHTML = "";
    if (lista.length === 0) {
        usersTbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:15px; color:#999;">No hay miembros autenticados registrados.</td></tr>';
        return;
    }

    lista.forEach(u => {
        const cNombre = cachedComunidades[u.comunidadId] ? `Comunidad ${cachedComunidades[u.comunidadId]}` : "—";
        const dateStr = u.fecha 
            ? new Date(u.fecha).toLocaleString("es-DO", { dateStyle: "short", timeStyle: "short" }) 
            : "—";
        
        const geoStr = `${u.ip || "—"} / ${u.pais || "—"}`;
        
        const gInfo = allGroups.find(g => g.id === u.rol) || { nombre: u.rol || "hermano" };
        const rolStr = gInfo.nombre;

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
                <button class="btn btn-sm btn-outline btn-edit-user" data-email="${u.correo}">✏️ Permisos</button>
                <button class="btn btn-sm btn-outline btn-delete-user" style="color:red; border-color:#f5c6cb; margin-left:4px;" data-email="${u.correo}">✕ Eliminar</button>
            </td>
        `;

        tr.querySelector(".btn-edit-user").addEventListener("click", () => editUser(u));
        tr.querySelector(".btn-delete-user").addEventListener("click", () => deleteUser(u.correo));
        usersTbody.appendChild(tr);
    });
}

function filterUsers() {
    const q = searchUsers.value.toLowerCase().trim();
    if (!q) { renderUsersTable(allUsers); return; }

    const filtrados = allUsers.filter(u => {
        const email = (u.correo || "").toLowerCase();
        const name = (u.displayName || "").toLowerCase();
        return email.includes(q) || name.includes(q);
    });
    renderUsersTable(filtrados);
}

function editUser(u) {
    editingUserEmail = u.correo;
    inputUserEmail.value = u.correo;
    inputUserName.value = u.displayName || "";
    selectUserRol.value = u.rol || "hermano";
    checkUserBanned.checked = u.baneado || false;

    formUserCard.style.display = "block";
    formUserCard.scrollIntoView({ behavior: "smooth" });
}

async function saveUserPerms() {
    if (!editingUserEmail) return;

    btnSaveUser.disabled = true;
    try {
        await updateDoc(doc(db, "autenticados", editingUserEmail.toLowerCase()), {
            rol: selectUserRol.value,
            baneado: checkUserBanned.checked
        });

        showAlert("✅ Permisos del usuario actualizados exitosamente.", "success");
        resetUserForm();
        await loadUsers();
    } catch(err) {
        showAlert("Error al actualizar: " + err.message, "error");
    } finally {
        btnSaveUser.disabled = false;
    }
}

async function deleteUser(email) {
    if (!email) return;
    const confirmDelete = await window.customConfirm(
        "Eliminar Miembro/Usuario",
        `¿Estás seguro de que deseas eliminar permanentemente a ${email}? Esto borrará su registro de autenticación y su ficha en el directorio de hermanos.`,
        { icon: "🗑️", danger: true }
    );
    if (!confirmDelete) return;

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

function resetUserForm() {
    editingUserEmail = null;
    inputUserEmail.value = "";
    inputUserName.value = "";
    selectUserRol.value = "hermano";
    checkUserBanned.checked = false;
    formUserCard.style.display = "none";
}

// ── SUBTAB: PERMISOS ───────────────────────────────
async function loadGroupPermissions() {
    const selectedGroup = selectPermisosGrupo.value;
    if (!selectedGroup) return;

    resetCheckboxes();
    try {
        const docSnap = await getDoc(doc(db, "permisosRoles", selectedGroup));
        if (docSnap.exists()) {
            const data = docSnap.data();
            chkAdminTotal.checked = !!data.adminTotal;
            
            rowsPermisos.forEach(row => {
                const page = row.getAttribute("data-page");
                const pageData = data[page] || { leer: false, escribir: false, borrar: false };
                row.querySelector(".chk-leer").checked = !!pageData.leer;
                row.querySelector(".chk-escribir").checked = !!pageData.escribir;
                row.querySelector(".chk-borrar").checked = !!pageData.borrar;
            });
        } else {
            if (selectedGroup === "admin") {
                chkAdminTotal.checked = true;
                setAllCheckboxes(true);
            }
        }
        toggleAdminTotal();
    } catch(err) {
        showAlert("Error al cargar permisos: " + err.message, "error");
    }
}

function resetCheckboxes() {
    chkAdminTotal.checked = false;
    setAllCheckboxes(false);
}

function setAllCheckboxes(state) {
    rowsPermisos.forEach(row => {
        row.querySelector(".chk-leer").checked = state;
        row.querySelector(".chk-escribir").checked = state;
        row.querySelector(".chk-borrar").checked = state;
    });
}

function toggleAdminTotal() {
    const isTotal = chkAdminTotal.checked;
    rowsPermisos.forEach(row => {
        const chkLeer = row.querySelector(".chk-leer");
        const chkEscribir = row.querySelector(".chk-escribir");
        const chkBorrar = row.querySelector(".chk-borrar");

        if (isTotal) {
            chkLeer.checked = true;
            chkEscribir.checked = true;
            chkBorrar.checked = true;
            chkLeer.disabled = true;
            chkEscribir.disabled = true;
            chkBorrar.disabled = true;
        } else {
            chkLeer.disabled = false;
            chkEscribir.disabled = false;
            chkBorrar.disabled = false;
        }
    });
}

async function savePermissions() {
    const selectedGroup = selectPermisosGrupo.value;
    if (!selectedGroup) return;

    btnSavePermisos.disabled = true;
    try {
        const data = {
            adminTotal: chkAdminTotal.checked,
            updatedAt: new Date().toISOString()
        };

        rowsPermisos.forEach(row => {
            const page = row.getAttribute("data-page");
            data[page] = {
                leer: row.querySelector(".chk-leer").checked,
                escribir: row.querySelector(".chk-escribir").checked,
                borrar: row.querySelector(".chk-borrar").checked
            };
        });

        await setDoc(doc(db, "permisosRoles", selectedGroup), data, { merge: true });
        showAlert("💾 Permisos guardados con éxito para el grupo seleccionado.", "success");
    } catch(err) {
        showAlert("Error al guardar permisos: " + err.message, "error");
    } finally {
        btnSavePermisos.disabled = false;
    }
}

// ── PESTAÑA: USO APP ───────────────────────────────
async function loadUsoLogs() {
    try {
        const snap = await getDocs(query(collection(db, "autenticados"), orderBy("fecha", "desc")));
        allUsoLogs = [];
        const paises = new Set();

        snap.forEach(d => {
            const data = d.data();
            allUsoLogs.push({ id: d.id, ...data });
            if (data.pais) paises.add(data.pais);
        });

        // Populate countries select
        selectPaisUso.innerHTML = '<option value="">Todos los países</option>';
        paises.forEach(p => {
            selectPaisUso.appendChild(new Option(p, p));
        });

        renderUsoTable(allUsoLogs);
    } catch(err) {
        usoTbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:red;">Error: ${err.message}</td></tr>`;
    }
}

function renderUsoTable(lista) {
    usoTbody.innerHTML = "";
    if (lista.length === 0) {
        usoTbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:15px; color:#999;">No hay registros de uso.</td></tr>';
        return;
    }

    lista.forEach(log => {
        // Evaluate ONLINE / OFFLINE (active within last 5 minutes)
        let isOnline = false;
        if (log.fecha) {
            const diffMs = new Date() - new Date(log.fecha);
            if (diffMs < 5 * 60 * 1000) { // 5 minutes
                isOnline = true;
            }
        }

        const stateBadge = isOnline 
            ? `<span style="color:#28a745; font-weight:600; background:#f4fbf7; padding:2px 8px; border-radius:4px; font-size:0.75rem;">ONLINE</span>` 
            : `<span style="color:#dc3545; font-weight:600; background:#fdf2f2; padding:2px 8px; border-radius:4px; font-size:0.75rem;">OFFLINE</span>`;

        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>
                <strong>${log.displayName || "Invitado"}</strong>
                <div style="font-size:0.72rem; color:#666;">${log.correo || "—"}</div>
            </td>
            <td style="font-family:monospace;">${log.ip || "Desconocido"}</td>
            <td><strong>${log.pais || "Desconocido"}</strong></td>
            <td style="font-size:0.8rem; color:#475569;">${log.device || "Escritorio (Windows / Chrome)"}</td>
            <td>${stateBadge}</td>
        `;
        usoTbody.appendChild(tr);
    });
}

function filterUsoLogs() {
    const q = searchUso.value.toLowerCase().trim();
    const pais = selectPaisUso.value;

    const filtrados = allUsoLogs.filter(log => {
        const name = (log.displayName || "").toLowerCase();
        const email = (log.correo || "").toLowerCase();
        const ip = (log.ip || "").toLowerCase();
        const device = (log.device || "").toLowerCase();
        const country = log.pais || "";

        const matchesQuery = !q || name.includes(q) || email.includes(q) || ip.includes(q) || device.includes(q);
        const matchesCountry = !pais || country === pais;

        return matchesQuery && matchesCountry;
    });

    renderUsoTable(filtrados);
}
