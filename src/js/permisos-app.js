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
const permisosTree    = document.getElementById("permisos-tree");

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

    // Render permissions tree structure
    renderPermissionsTreeMarkup();
    enforcePermissions();

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
        const hasDeletePerm = window.hasPermission("permisos_acceso_grupos_eliminar");
        const deleteBtn = isDefault 
            ? `<span style="color:#aaa; font-size:0.8rem; font-style:italic;">Sistema</span>` 
            : (hasDeletePerm ? `<button class="btn btn-sm btn-outline btn-delete-grupo" style="color:red; border-color:#f5c6cb;" data-id="${g.id}">✕ Eliminar</button>` : "");

        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td><strong>${g.id}</strong></td>
            <td>${g.nombre}</td>
            <td style="text-align:center;">
                ${window.hasPermission("permisos_acceso_grupos_editar") ? `<button class="btn btn-sm btn-outline btn-edit-grupo" data-id="${g.id}">✏️ Editar</button>` : ""}
                ${deleteBtn}
            </td>
        `;

        const btnEditG = tr.querySelector(".btn-edit-grupo");
        if (btnEditG) {
            btnEditG.addEventListener("click", () => editGrupo(g));
        }
        if (!isDefault && hasDeletePerm) {
            const btnDelG = tr.querySelector(".btn-delete-grupo");
            if (btnDelG) {
                btnDelG.addEventListener("click", () => deleteGrupo(g.id));
            }
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
                ${(window.hasPermission("permisos_acceso_miembros_editar_rol") || window.hasPermission("permisos_acceso_miembros_editar_suspender")) ? `<button class="btn btn-sm btn-outline btn-edit-user" data-email="${u.correo}">✏️ Permisos</button>` : ""}
                ${window.hasPermission("permisos_acceso_miembros_eliminar") ? `<button class="btn btn-sm btn-outline btn-delete-user" style="color:red; border-color:#f5c6cb; margin-left:4px;" data-email="${u.correo}">✕ Eliminar</button>` : ""}
            </td>
        `;

        const btnEditU = tr.querySelector(".btn-edit-user");
        if (btnEditU) {
            btnEditU.addEventListener("click", () => editUser(u));
        }
        const btnDeleteU = tr.querySelector(".btn-delete-user");
        if (btnDeleteU) {
            btnDeleteU.addEventListener("click", () => deleteUser(u.correo));
        }
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

// ── SUBTAB: PERMISOS (DYNAMIC DENDROGRAM/TREE VIEW) ──
const PERMISSIONS_TREE = [
  {
    id: "parroquia",
    label: "Parroquia",
    children: [
      { id: "parroquia_crear", label: "Crear Nueva parroquia" },
      { id: "parroquia_consultar", label: "Seleccionar parroquia para consultar" },
      { id: "parroquia_buscar", label: "Buscar en Parroquia" },
      { id: "parroquia_filtrar", label: "Filtrar" },
      { id: "parroquia_ver", label: "Ver datos de Parroquia" },
      { id: "parroquia_editar", label: "Editar parroquia" },
      { id: "parroquia_eliminar", label: "Eliminar Parroquia" }
    ]
  },
  {
    id: "catequista",
    label: "Catequista",
    children: [
      { id: "catequista_ver_catequistas", label: "Ver Catequistas" },
      { id: "catequista_ver_asignacion", label: "Ver asignacion catequista" },
      { id: "catequista_guardar", label: "Guardar Asignacion" },
      { id: "catequista_quitar", label: "Quitar Catequista" },
      { id: "catequista_ver_hilos", label: "Expandir comunidades catequista" }
    ]
  },
  {
    id: "comunidad",
    label: "Comunidad",
    children: [
      { id: "comunidad_consultar", label: "Consultar Comunidad" },
      { id: "comunidad_crear", label: "+Nueva Comunidad" },
      { id: "comunidad_buscar", label: "Hacer busqueda" },
      { id: "comunidad_filtrar", label: "Filtrar" },
      { id: "comunidad_editar", label: "Editar" },
      { id: "comunidad_eliminar", label: "Eliminar" },
      { id: "comunidad_generar_codigo", label: "Generar código único" },
      { id: "comunidad_ver_hermanos", label: "Ver datos comunidad" }
    ]
  },
  {
    id: "hermanos",
    label: "Hermanos",
    children: [
      { id: "hermanos_buscar", label: "Buscar" },
      { id: "hermanos_crear", label: "Crear Nuevo Hermano" },
      { id: "hermanos_ver", label: "Ver hermano creado" },
      { id: "hermanos_editar", label: "Editar hermano creado" },
      { id: "hermanos_eliminar", label: "Eliminar hermano Creado" },
      { id: "hermanos_guardar", label: "Guardar Hermano creado o modificado" },
      { id: "hermanos_cambiar_activo", label: "Cambiar de Activo a No Activo en edicion de hermano" }
    ]
  },
  {
    id: "realidad",
    label: "Realidad",
    children: [
      { id: "realidad_ver", label: "Ver tarjeta de realidad" },
      { id: "realidad_crear", label: "Crear Nueva Realidad" },
      { id: "realidad_editar", label: "Editar" },
      { id: "realidad_eliminar", label: "Eliminar" }
    ]
  },
  {
    id: "itinerario",
    label: "Itinerario",
    children: [
      { id: "itinerario_ver", label: "Ver" },
      { id: "itinerario_crear", label: "Crear" },
      { id: "itinerario_guardar", label: "Guardar" },
      { id: "itinerario_editar", label: "Editar" },
      { id: "itinerario_eliminar", label: "Eliminar" }
    ]
  },
  {
    id: "sortear",
    label: "Sortear",
    children: [
      { id: "sortear_ver", label: "Ver / Listar" }
    ]
  },
  {
    id: "codigo",
    label: "Codigo",
    children: [
      { id: "codigo_ver", label: "Ver" },
      { id: "codigo_generar", label: "Generar codigo" },
      { id: "codigo_seleccionar_parroquia", label: "Seleccionar parroquia" },
      { id: "codigo_seleccionar_comunidad", label: "Seleccionar Comunidad" },
      { id: "codigo_guardar", label: "Guardar" },
      { id: "codigo_editar", label: "Editar" },
      { id: "codigo_eliminar", label: "Eliminar" }
    ]
  },
  {
    id: "permisos",
    label: "Permisos",
    children: [
      { id: "permisos_cuenta", label: "Cuenta" },
      {
        id: "permisos_acceso",
        label: "Acceso",
        children: [
          {
            id: "permisos_acceso_miembros",
            label: "Miembros",
            children: [
              { id: "permisos_acceso_miembros_editar_rol", label: "Editar/Cambiar Rol" },
              { id: "permisos_acceso_miembros_editar_suspender", label: "Suspender / banear usuario" },
              { id: "permisos_acceso_miembros_eliminar", label: "Eliminar" }
            ]
          },
          {
            id: "permisos_acceso_grupos",
            label: "Grupos",
            children: [
              { id: "permisos_acceso_grupos_ver", label: "Ver" },
              { id: "permisos_acceso_grupos_crear", label: "Crear Grupo / Rol" },
              { id: "permisos_acceso_grupos_editar", label: "Editar" },
              { id: "permisos_acceso_grupos_eliminar", label: "Eliminar" }
            ]
          },
          {
            id: "permisos_acceso_permisos",
            label: "Permisos",
            children: [
              { id: "permisos_acceso_permisos_ver", label: "Ver" },
              { id: "permisos_acceso_permisos_asignar", label: "Asignar Permiso" }
            ]
          },
          { id: "permisos_uso_app", label: "Uso App" }
        ]
      }
    ]
  },
  {
    id: "ajuste",
    label: "Ajuste",
    children: [
      { id: "ajuste_ver", label: "Ver Ajuste" }
    ]
  }
];

function renderPermissionsTreeMarkup() {
    if (!permisosTree) return;
    permisosTree.innerHTML = "";
    buildTreeNodes(PERMISSIONS_TREE, permisosTree);
}

function buildTreeNodes(nodes, parentEl) {
    nodes.forEach(node => {
        const hasChildren = node.children && node.children.length > 0;
        
        const nodeEl = document.createElement("div");
        nodeEl.className = "tree-node";
        
        const headerEl = document.createElement("div");
        headerEl.className = "tree-node-header";
        
        const leftEl = document.createElement("div");
        leftEl.className = "tree-node-left";
        
        const savedStates = JSON.parse(localStorage.getItem("permisos_tree_expanded")) || {};
        const isExpanded = savedStates[node.id] !== false; // Default to expanded (true)

        let toggleBtn = null;
        if (hasChildren) {
            leftEl.style.cursor = "pointer";
            toggleBtn = document.createElement("span");
            toggleBtn.className = "tree-toggle";
            toggleBtn.textContent = isExpanded ? "▼" : "▶";
            leftEl.appendChild(toggleBtn);

            leftEl.addEventListener("click", () => {
                const childrenContainer = nodeEl.querySelector(".tree-node-children");
                const saved = JSON.parse(localStorage.getItem("permisos_tree_expanded")) || {};
                if (childrenContainer.style.display === "none") {
                    childrenContainer.style.display = "block";
                    toggleBtn.textContent = "▼";
                    saved[node.id] = true;
                } else {
                    childrenContainer.style.display = "none";
                    toggleBtn.textContent = "▶";
                    saved[node.id] = false;
                }
                localStorage.setItem("permisos_tree_expanded", JSON.stringify(saved));
            });
        } else {
            const spacer = document.createElement("span");
            spacer.style.width = "20px";
            leftEl.appendChild(spacer);
        }
        
        const labelEl = document.createElement("span");
        labelEl.textContent = node.label;
        leftEl.appendChild(labelEl);
        
        const rightEl = document.createElement("div");
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.className = "tree-checkbox";
        checkbox.dataset.id = node.id;
        
        if (hasChildren) {
            checkbox.addEventListener("change", () => {
                const subCheckboxes = nodeEl.querySelectorAll(".tree-checkbox");
                subCheckboxes.forEach(cb => {
                    cb.checked = checkbox.checked;
                    cb.indeterminate = false;
                });
            });
        }
        
        rightEl.appendChild(checkbox);
        
        headerEl.appendChild(leftEl);
        headerEl.appendChild(rightEl);
        nodeEl.appendChild(headerEl);
        
        if (hasChildren) {
            const childrenEl = document.createElement("div");
            childrenEl.className = "tree-node-children";
            childrenEl.style.display = isExpanded ? "block" : "none";
            
            buildTreeNodes(node.children, childrenEl);
            nodeEl.appendChild(childrenEl);
            
            // Listen for child updates to sync parent checked state
            childrenEl.addEventListener("change", (e) => {
                e.stopPropagation();
                const immediateCheckboxes = childrenEl.querySelectorAll(`:scope > .tree-node > .tree-node-header > div > .tree-checkbox`);
                const allChecked = Array.from(immediateCheckboxes).every(cb => cb.checked);
                const someChecked = Array.from(immediateCheckboxes).some(cb => cb.checked || cb.indeterminate);
                
                checkbox.checked = allChecked;
                checkbox.indeterminate = !allChecked && someChecked;
                
                // Bubble event upwards to parent nodes
                const parentNodeEvent = new Event("change", { bubbles: true });
                nodeEl.parentNode.dispatchEvent(parentNodeEvent);
            });
        }
        
        parentEl.appendChild(nodeEl);
    });
}

async function loadGroupPermissions() {
    const selectedGroup = selectPermisosGrupo.value;
    if (!selectedGroup) return;

    resetCheckboxes();
    try {
        const docSnap = await getDoc(doc(db, "permisosRoles", selectedGroup));
        if (docSnap.exists()) {
            const data = docSnap.data();
            chkAdminTotal.checked = !!data.adminTotal;
            
            const permissionsData = data.permissions || {};
            const checkboxes = permisosTree.querySelectorAll(".tree-checkbox");
            checkboxes.forEach(cb => {
                const id = cb.dataset.id;
                cb.checked = !!permissionsData[id];
            });

            // Re-sync indeterminate state bottom-up
            const parents = Array.from(permisosTree.querySelectorAll(".tree-node")).reverse();
            parents.forEach(nodeEl => {
                const checkbox = nodeEl.querySelector(":scope > .tree-node-header > div > .tree-checkbox");
                const childrenEl = nodeEl.querySelector(".tree-node-children");
                if (childrenEl) {
                    const childCheckboxes = childrenEl.querySelectorAll(`:scope > .tree-node > .tree-node-header > div > .tree-checkbox`);
                    const allChecked = Array.from(childCheckboxes).every(cb => cb.checked);
                    const someChecked = Array.from(childCheckboxes).some(cb => cb.checked || cb.indeterminate);
                    checkbox.checked = allChecked;
                    checkbox.indeterminate = !allChecked && someChecked;
                }
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
    const checkboxes = permisosTree.querySelectorAll(".tree-checkbox");
    checkboxes.forEach(cb => {
        cb.checked = false;
        cb.indeterminate = false;
        cb.disabled = false;
    });
}

function setAllCheckboxes(state) {
    const checkboxes = permisosTree.querySelectorAll(".tree-checkbox");
    checkboxes.forEach(cb => {
        cb.checked = state;
        cb.indeterminate = false;
    });
}

function toggleAdminTotal() {
    const isTotal = chkAdminTotal.checked;
    const checkboxes = permisosTree.querySelectorAll(".tree-checkbox");
    checkboxes.forEach(cb => {
        if (isTotal) {
            cb.checked = true;
            cb.disabled = true;
        } else {
            cb.disabled = false;
        }
    });
}

async function savePermissions() {
    const selectedGroup = selectPermisosGrupo.value;
    if (!selectedGroup) return;

    btnSavePermisos.disabled = true;
    try {
        const permissions = {};
        const checkboxes = permisosTree.querySelectorAll(".tree-checkbox");
        checkboxes.forEach(cb => {
            const id = cb.dataset.id;
            permissions[id] = cb.checked;
        });

        const data = {
            adminTotal: chkAdminTotal.checked,
            permissions,
            updatedAt: new Date().toISOString()
        };

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

function enforcePermissions() {
    if (!window.hasPermission) return;

    // Main Tab: Uso App
    const tabUso = document.getElementById("tab-usoapp");
    if (tabUso && !window.hasPermission("permisos_uso_app")) {
        tabUso.style.display = "none";
    }

    // Sub Tabs under Acceso
    const tabMiembros = document.getElementById("subtab-miembros");
    const hasMiembrosPerm = window.hasPermission("permisos_acceso_miembros_editar_rol") ||
                            window.hasPermission("permisos_acceso_miembros_editar_suspender") ||
                            window.hasPermission("permisos_acceso_miembros_eliminar");
    if (tabMiembros && !hasMiembrosPerm) {
        tabMiembros.style.display = "none";
    }

    const tabGrupos = document.getElementById("subtab-grupos");
    const hasGruposPerm = window.hasPermission("permisos_acceso_grupos_ver") ||
                          window.hasPermission("permisos_acceso_grupos_crear") ||
                          window.hasPermission("permisos_acceso_grupos_editar") ||
                          window.hasPermission("permisos_acceso_grupos_eliminar");
    if (tabGrupos && !hasGruposPerm) {
        tabGrupos.style.display = "none";
    }

    const tabPermisos = document.getElementById("subtab-permisos");
    const hasPermisosPerm = window.hasPermission("permisos_acceso_permisos_ver");
    if (tabPermisos && !hasPermisosPerm) {
        tabPermisos.style.display = "none";
    }

    // Member edit options
    const selectUserRol = document.getElementById("user-rol");
    if (selectUserRol && !window.hasPermission("permisos_acceso_miembros_editar_rol")) {
        selectUserRol.disabled = true;
    }

    const checkUserBanned = document.getElementById("user-banned");
    if (checkUserBanned && !window.hasPermission("permisos_acceso_miembros_editar_suspender")) {
        checkUserBanned.disabled = true;
    }

    // Save/create actions
    const btnSaveGrupo = document.getElementById("btn-save-grupo");
    if (btnSaveGrupo && !window.hasPermission("permisos_acceso_grupos_crear") && !window.hasPermission("permisos_acceso_grupos_editar")) {
        btnSaveGrupo.style.display = "none";
    }

    const btnSavePermisos = document.getElementById("btn-save-permisos");
    if (btnSavePermisos && !window.hasPermission("permisos_acceso_permisos_asignar")) {
        btnSavePermisos.style.display = "none";
    }
}
