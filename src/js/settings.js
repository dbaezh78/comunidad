import { db, auth } from "./firebase.js";
import { collection, doc, getDocs, addDoc, updateDoc, deleteDoc, query, orderBy } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

// --- CSS para los Ajustes ---
const styles = document.createElement("style");
styles.textContent = `
.settings-tabs-container {
    display: flex;
    gap: 2px;
    height: 380px;
    font-family: 'Segoe UI', sans-serif;
}
.settings-tabs {
    width: min-content;
    border-right: 1px solid #e2e8f0;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-right: 8px;
}
.settings-tab-btn {
    border: none;
    background: none;
    text-align: left;
    padding: 8px 12px;
    font-size: 0.88rem;
    font-weight: 600;
    cursor: pointer;
    border-radius: 6px;
    color: #64748b;
    transition: all 0.2s;
}
.settings-tab-btn:hover {
    background: #f1f5f9;
    color: #0f172a;
}
.settings-tab-btn.active {
    background: var(--primary);
    color: white;
}
.settings-tab-content {
    flex: 1;
    overflow-y: auto;
    padding-left: 8px;
}
.settings-tab-pane {
    display: none;
}
.settings-tab-pane.active {
    display: block;
}
.theme-option {
    padding: 1px;
    border: 1.5px solid #e2e8f0;
    border-radius: 6px;
    cursor: pointer;
    text-align: center;
    font-weight: bold;
    font-size: 0.85rem;
    transition: all 0.2s;
    user-select: none;
}
.theme-option:hover {
    border-color: #cbd5e1;
}
.theme-option.selected {
    border-color: var(--primary);
    background: #f0f6ff;
    color: var(--primary);
}

/* Reglas CSS para temas */
body.dark-theme {
    --bg: #1e293b;
    --card-bg: #0f172a;
    --border: #334155;
    --text: #f8fafc;
    --text-muted: #94a3b8;
    background-color: #0f172a;
    color: #f8fafc;
}
body.dark-theme .card,
body.dark-theme .modal-container,
body.dark-theme #excel-filter-menu {
    background-color: #1e293b;
    border-color: #334155;
    color: #f8fafc;
}
body.dark-theme input,
body.dark-theme select,
body.dark-theme textarea {
    background-color: #0f172a;
    color: #f8fafc;
    border-color: #334155;
}
body.dark-theme .hermanos-table tbody tr:nth-child(even) td {
    background-color: #1e293b;
}
body.dark-theme .hermanos-table tbody tr:nth-child(odd) td {
    background-color: #0f172a;
}
body.dark-theme .hermanos-table tr:hover td {
    background-color: #334155;
}

body.emerald-theme {
    --primary: #059669;
    --primary-hover: #047857;
    --accent: #10b981;
}
body.emerald-theme .theme-option.selected {
    border-color: #059669;
    background: #ecfdf5;
    color: #059669;
}
`;
document.head.appendChild(styles);

// Log de sesión local
let sessionLogs = [];
function addLog(action) {
    const time = new Date().toLocaleTimeString();
    sessionLogs.unshift(`[${time}] ${action}`);
    renderLogs();
}

function renderLogs() {
    const container = document.getElementById("sg-logs-container");
    if (container) {
        container.innerHTML = sessionLogs.map(l => `<div style="border-bottom:1px solid #f1f5f9; padding:2px 0;">${l}</div>`).join("");
    }
}

// Inyección del Modal en el DOM
function injectModal() {
    if (document.getElementById("modal-settings")) return;

    const modalHTML = `
    <div id="modal-settings" class="modal-overlay">
        <div class="modal-container" style="max-width: 650px; width: 95%;">
            <div class="modal-header">
                <h3 class="modal-title">⚙️ Ajustes del Sistema</h3>
                <button class="modal-close" id="settings-close">&times;</button>
            </div>
            <div class="modal-body" style="padding-bottom: 0;">
                <div class="settings-tabs-container">
                    <div class="settings-tabs">
                        <button class="settings-tab-btn active" data-tab="tab-general">General</button>
                        <button class="settings-tab-btn" data-tab="tab-tema">Tema</button>
                        <button class="settings-tab-btn" data-tab="tab-usuario">Usuario</button>
                        <button class="settings-tab-btn" data-tab="tab-datos">Datos</button>
                        <button class="settings-tab-btn" data-tab="tab-log">Log</button>
                    </div>
                    <div class="settings-tab-content">
                        <!-- General -->
                        <div class="settings-tab-pane active" id="tab-general">
                            <h4 style="margin-top:0;">Configuración General</h4>
                            <div class="form-group">
                                <label>Nombre de la Aplicación</label>
                                <input type="text" id="sg-app-name" value="Comunidad 4" style="width:100%; padding:8px; border:2px solid var(--border); border-radius:5px;">
                            </div>
                            <div class="form-group" style="margin-top: 10px;">
                                <label>Zona Horaria</label>
                                <select id="sg-timezone" style="width:100%; padding:8px; border:2px solid var(--border); border-radius:5px;">
                                    <option value="America/Santo_Domingo">Dominicana (GMT-4)</option>
                                    <option value="GMT">GMT</option>
                                </select>
                            </div>
                            <button class="btn btn-primary" id="sg-save-general" style="margin-top:12px;">Guardar cambios</button>
                        </div>

                        <!-- Tema -->
                        <div class="settings-tab-pane" id="tab-tema">
                            <h4 style="margin-top:0;">Personalizar Tema</h4>
                            <p style="font-size:0.8rem; color:#666; margin-bottom:12px;">Selecciona el color del tema principal para la aplicación.</p>
                            <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:10px;">
                                <div class="theme-option" data-theme="original">🔵 Original (Azul)</div>
                                <div class="theme-option" data-theme="dark">⚫ Oscuro</div>
                                <div class="theme-option" data-theme="emerald">🟢 Esmeralda</div>
                            </div>
                        </div>

                        <!-- Usuario -->
                        <div class="settings-tab-pane" id="tab-usuario">
                            <h4 style="margin-top:0;">Información de Usuario</h4>
                            <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
                                <img id="sg-user-photo" src="" style="width:60px; height:60px; border-radius:50%; background:#ccc; object-fit:cover;">
                                <div>
                                    <strong id="sg-user-name" style="font-size:1.1rem; display:block;">—</strong>
                                    <span id="sg-user-email" style="font-size:0.85rem; color:#666;">—</span>
                                </div>
                            </div>
                            <p style="font-size:0.8rem; color:#666;">Tu cuenta está asociada con los permisos del sistema.</p>
                        </div>

                        <!-- Datos -->
                        <div class="settings-tab-pane" id="tab-datos">
                            <h4 style="margin-top:0;">Administración de Carismas</h4>
                            <div class="form-grid" style="grid-template-columns: 80px 1fr auto; gap: 8px; align-items: end; margin-bottom: 12px; display: grid;">
                                <div class="form-group" style="margin:0;">
                                    <label style="font-size:0.72rem; margin-bottom:2px; display:block;">Icono</label>
                                    <input type="text" id="sg-carisma-icon" placeholder="📖" style="width:100%; padding:8px; border:2px solid var(--border); border-radius:5px; text-align:center; font-size:1.1rem;">
                                </div>
                                <div class="form-group" style="margin:0;">
                                    <label style="font-size:0.72rem; margin-bottom:2px; display:block;">Nombre</label>
                                    <input type="text" id="sg-carisma-name" placeholder="Ej: Lector" style="width:100%; padding:8px; border:2px solid var(--border); border-radius:5px;">
                                </div>
                                <button class="btn btn-primary" id="sg-add-carisma" style="height:40px; padding:0 16px;">Guardar</button>
                                <input type="hidden" id="sg-carisma-id">
                            </div>
                            <div id="sg-carismas-list" style="max-height:180px; overflow-y:auto; border:2px solid var(--border); border-radius:7px; padding:8px; background:#fbfcfe; font-size:0.82rem;">
                                Cargando carismas...
                            </div>
                        </div>

                        <!-- Log -->
                        <div class="settings-tab-pane" id="tab-log">
                            <h4 style="margin-top:0;">Registro de Actividades</h4>
                            <p style="font-size:0.8rem; color:#666; margin-bottom:8px;">Acciones registradas durante la sesión actual:</p>
                            <div id="sg-logs-container" style="max-height:220px; overflow-y:auto; border:2px solid var(--border); border-radius:7px; padding:8px; background:#fafafa; font-family:monospace; font-size:0.78rem; display:flex; flex-direction:column; gap:4px; max-width:100%; box-sizing:border-box;">
                                <!-- Log rows -->
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-outline" id="settings-close-footer">Cerrar</button>
            </div>
        </div>
    </div>
    `;
    const containerDiv = document.createElement("div");
    containerDiv.innerHTML = modalHTML;
    document.body.appendChild(containerDiv.firstElementChild);

    setupModalInteractions();
}

function setupModalInteractions() {
    const modal = document.getElementById("modal-settings");
    const closeBtn = document.getElementById("settings-close");
    const closeFootBtn = document.getElementById("settings-close-footer");

    // Cerrar modal
    [closeBtn, closeFootBtn].forEach(btn => {
        if (btn) btn.addEventListener("click", () => {
            modal.classList.remove("open");
            addLog("Ajustes cerrados");
        });
    });

    // Pestañas
    const tabs = document.querySelectorAll(".settings-tab-btn");
    tabs.forEach(btn => {
        btn.addEventListener("click", () => {
            tabs.forEach(t => t.classList.remove("active"));
            document.querySelectorAll(".settings-tab-pane").forEach(p => p.classList.remove("active"));
            
            btn.classList.add("active");
            const targetId = btn.getAttribute("data-tab");
            document.getElementById(targetId).classList.add("active");
            addLog(`Navegó a pestaña: ${btn.textContent}`);

            if (targetId === "tab-datos") {
                loadCarismas();
            } else if (targetId === "tab-codigos") {
                loadAllInviteCodes();
            }
        });
    });

    // Cargar Nombre de App Local y Zona Horaria
    const appNameInput = document.getElementById("sg-app-name");
    const tzSelect = document.getElementById("sg-timezone");
    const savedName = localStorage.getItem("sg-app-name") || "Comunidad 4";
    const savedTz = localStorage.getItem("sg-timezone") || "America/Santo_Domingo";
    
    if (appNameInput) appNameInput.value = savedName;
    if (tzSelect) tzSelect.value = savedTz;

    // Guardar cambios General
    document.getElementById("sg-save-general").addEventListener("click", () => {
        localStorage.setItem("sg-app-name", appNameInput.value);
        localStorage.setItem("sg-timezone", tzSelect.value);
        alert("Ajustes generales guardados localmente.");
        addLog(`Cambió nombre de app a "${appNameInput.value}" y zona horaria a "${tzSelect.value}"`);
    });

    // Cargar Temas
    const themeOpts = document.querySelectorAll(".theme-option");
    const currentTheme = localStorage.getItem("selected-theme") || "original";
    applyTheme(currentTheme);

    themeOpts.forEach(opt => {
        const theme = opt.getAttribute("data-theme");
        if (theme === currentTheme) opt.classList.add("selected");
        
        opt.addEventListener("click", () => {
            themeOpts.forEach(o => o.classList.remove("selected"));
            opt.classList.add("selected");
            applyTheme(theme);
            localStorage.setItem("selected-theme", theme);
            addLog(`Cambió tema visual a: ${theme}`);
        });
    });

    // Inicializar carismas
    document.getElementById("sg-add-carisma").addEventListener("click", saveCarisma);
}

function applyTheme(theme) {
    document.body.classList.remove("dark-theme", "emerald-theme");
    if (theme === "dark") {
        document.body.classList.add("dark-theme");
    } else if (theme === "emerald") {
        document.body.classList.add("emerald-theme");
    }
}

// Cargar Datos del Usuario Conectado en el Modal
function loadUserData(user) {
    const photo = document.getElementById("sg-user-photo");
    const name = document.getElementById("sg-user-name");
    const email = document.getElementById("sg-user-email");

    if (photo && user.photoURL) photo.src = user.photoURL;
    if (name) name.textContent = user.displayName || "Usuario Comunidad";
    if (email) email.textContent = user.email;
}

// --- LOGICA DE CARISMAS (DATOS) ---
let listCarismas = [];
async function loadCarismas() {
    const listContainer = document.getElementById("sg-carismas-list");
    if (!listContainer) return;
    listContainer.innerHTML = "Cargando...";

    try {
        const snap = await getDocs(query(collection(db, "carismas"), orderBy("nombre")));
        listCarismas = [];
        snap.forEach(d => listCarismas.push({ id: d.id, ...d.data() }));

        // Auto-poblar carismas por defecto si está vacío
        if (listCarismas.length === 0) {
            const defaults = [
                { nombre: "Lector", icono: "📖" },
                { nombre: "Cantor", icono: "🎤" },
                { nombre: "Florista", icono: "🌸" },
                { nombre: "Didascala", icono: "🏫" }
            ];
            for (let item of defaults) {
                await addDoc(collection(db, "carismas"), item);
            }
            return loadCarismas();
        }

        renderCarismas();
    } catch (err) {
        listContainer.innerHTML = `Error: ${err.message}`;
    }
}

function renderCarismas() {
    const listContainer = document.getElementById("sg-carismas-list");
    listContainer.innerHTML = "";

    listCarismas.forEach(c => {
        const row = document.createElement("div");
        row.style.display = "flex";
        row.style.justifyContent = "space-between";
        row.style.alignItems = "center";
        row.style.padding = "6px 8px";
        row.style.borderBottom = "1px solid var(--border)";

        row.innerHTML = `
            <span>${c.icono || "🔘"} <strong>${c.nombre}</strong></span>
            <div>
                <button class="btn btn-sm btn-outline btn-edit" style="padding:2px 6px; font-size:0.75rem;" data-id="${c.id}">Editar</button>
                <button class="btn btn-sm btn-outline btn-delete" style="padding:2px 6px; font-size:0.75rem; color:red; border-color:#f5c6cb;" data-id="${c.id}">✕</button>
            </div>
        `;

        row.querySelector(".btn-edit").addEventListener("click", () => {
            document.getElementById("sg-carisma-id").value = c.id;
            document.getElementById("sg-carisma-name").value = c.nombre;
            document.getElementById("sg-carisma-icon").value = c.icono || "";
            document.getElementById("sg-add-carisma").textContent = "Actualizar";
        });

        row.querySelector(".btn-delete").addEventListener("click", async () => {
            if (confirm(`¿Eliminar carisma "${c.nombre}"?`)) {
                await deleteDoc(doc(db, "carismas", c.id));
                addLog(`Eliminó carisma: ${c.nombre}`);
                clearCarismaForm();
                loadCarismas();
            }
        });

        listContainer.appendChild(row);
    });
}

async function saveCarisma() {
    const nameInput = document.getElementById("sg-carisma-name");
    const iconInput = document.getElementById("sg-carisma-icon");
    const idInput = document.getElementById("sg-carisma-id");

    const name = nameInput.value.trim();
    const icono = iconInput.value.trim() || "🔘";
    const editId = idInput.value;

    if (!name) return alert("Escribe el nombre del carisma.");

    try {
        if (editId) {
            await updateDoc(doc(db, "carismas", editId), { nombre: name, icono });
            addLog(`Actualizó carisma a "${name}"`);
        } else {
            await addDoc(collection(db, "carismas"), { nombre: name, icono });
            addLog(`Creó nuevo carisma: "${name}"`);
        }
        clearCarismaForm();
        loadCarismas();
    } catch (e) {
        alert("Error al guardar: " + e.message);
    }
}

function clearCarismaForm() {
    document.getElementById("sg-carisma-id").value = "";
    document.getElementById("sg-carisma-name").value = "";
    document.getElementById("sg-carisma-icon").value = "";
    document.getElementById("sg-add-carisma").textContent = "Guardar";
}

async function loadAllInviteCodes() {
    const listContainer = document.getElementById("sg-codigos-list");
    if (!listContainer) return;
    listContainer.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:12px; color:#666;">Cargando...</td></tr>';

    try {
        const codeSnap = await getDocs(query(collection(db, "codigos"), orderBy("createdAt", "desc")));
        const parishesSnap = await getDocs(collection(db, "parroquias"));
        const parishesMap = {};
        const communitiesMap = {};

        parishesSnap.forEach(pDoc => {
            parishesMap[pDoc.id] = pDoc.data().nombre;
        });

        for (let pId of Object.keys(parishesMap)) {
            const comsSnap = await getDocs(collection(db, "parroquias", pId, "comunidades"));
            comsSnap.forEach(cDoc => {
                communitiesMap[cDoc.id] = cDoc.data().numero || cDoc.id;
            });
        }

        if (codeSnap.empty) {
            listContainer.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:12px; color:#999;">No hay códigos generados.</td></tr>';
            return;
        }

        listContainer.innerHTML = "";
        codeSnap.forEach(d => {
            const data = d.data();
            const pNombre = parishesMap[data.parroquiaId] || "—";
            const cNombre = communitiesMap[data.comunidadId] ? `Comunidad ${communitiesMap[data.comunidadId]}` : "—";
            const usadoPor = data.usadoPorEmail 
                ? `<span style="color:#2ecc71; font-weight:600;">✅ ${data.usadoPorEmail}</span>` 
                : `<span style="color:#e67e22; font-weight:600;">Disponible</span>`;

            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td style="font-family:monospace; font-weight:600; padding:6px 10px;">${d.id}</td>
                <td style="padding:6px 10px;">${pNombre}</td>
                <td style="padding:6px 10px;">${cNombre}</td>
                <td style="padding:6px 10px;">${usadoPor}</td>
            `;
            listContainer.appendChild(tr);
        });
    } catch(err) {
        listContainer.innerHTML = `<tr><td colspan="4" style="text-align:center; color:red; padding:12px;">Error: ${err.message}</td></tr>`;
    }
}

// Inicializar bindings al detectar que la app está lista
window.addEventListener("app:ready", (e) => {
    injectModal();
    const user = e.detail;
    if (user) {
        loadUserData(user);
        addLog(`Usuario autenticado: ${user.email}`);
    }

    const settingsBtn = document.getElementById("btn-ajustes");
    if (settingsBtn) {
        settingsBtn.addEventListener("click", () => {
            const modal = document.getElementById("modal-settings");
            if (modal) {
                modal.classList.add("open");
                addLog("Abrió Ajustes del Sistema");
            }
        });
    }

    // Aplicar tema por defecto al cargar página
    const savedTheme = localStorage.getItem("selected-theme") || "original";
    applyTheme(savedTheme);
});
