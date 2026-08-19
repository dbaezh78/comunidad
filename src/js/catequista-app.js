import { db } from "./firebase.js";
import { collection, doc, getDoc, getDocs, updateDoc, query, where, collectionGroup } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

// DOM - Form
const selectParroquia   = document.getElementById("cat-parroquia");
const selectComunidad   = document.getElementById("cat-comunidad");
const selectHermano     = document.getElementById("cat-hermano");
const labelRespInfo     = document.getElementById("cat-primer-responsable-info");
const btnSave           = document.getElementById("btn-save-catequista");
const btnRemove         = document.getElementById("btn-remove-catequista");

// DOM - List
const searchInput       = document.getElementById("search-catequistas");
const accordionContainer= document.getElementById("catequistas-acordeon-container");
const globalAlert       = document.getElementById("global-alert");

// State
let allParroquias       = [];
let allComunidades      = []; // Array of { id, number, parroquiaId, data }
let allHermanos         = []; // Array of { id, name, phone, email, parroquiaId, comunidadId, data }
let cachedParroquias    = {}; // id -> name
let cachedComunidades   = {}; // id -> name

// App Ready
window.addEventListener("app:ready", async () => {
    // Event listeners
    selectParroquia.addEventListener("change", onParroquiaChange);
    selectComunidad.addEventListener("change", onComunidadChange);
    btnSave.addEventListener("click", saveAssignment);
    btnRemove.addEventListener("click", removeAssignment);
    searchInput.addEventListener("input", filterAccordion);

    // Initial load
    await loadInitialData();
});

// Helpers
function showAlert(msg, type = "info") {
    globalAlert.textContent = msg;
    globalAlert.className = `alert alert-${type} visible`;
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (type === "success") setTimeout(() => { globalAlert.className = "alert"; }, 3500);
}

// ── DATA LOADERS ───────────────────────────────────
async function loadInitialData() {
    try {
        // 1. Fetch Parroquias
        const pSnap = await getDocs(collection(db, "parroquias"));
        allParroquias = [];
        cachedParroquias = {};
        selectParroquia.innerHTML = '<option value="">— Seleccionar Parroquia —</option>';
        pSnap.forEach(d => {
            const data = d.data();
            allParroquias.push({ id: d.id, ...data });
            cachedParroquias[d.id] = data.nombre;
            selectParroquia.appendChild(new Option(data.nombre, d.id));
        });

        // 2. Fetch all Hermanos
        const hSnap = await getDocs(collection(db, "hermanos"));
        allHermanos = [];
        selectHermano.innerHTML = '<option value="">— Seleccionar Hermano —</option>';
        hSnap.forEach(d => {
            const h = d.data();
            const nombre = `${h.primerNombre} ${h.segundoNombre || ""} ${h.primerApellido} ${h.segundoApellido || ""}`.replace(/\s+/g, ' ').trim();
            allHermanos.push({
                id: d.id,
                name: nombre,
                phone: h.telefono || "",
                email: h.correo || "",
                parroquiaId: h.parroquiaId || null,
                comunidadId: h.comunidadId || null,
                data: h
            });
        });

        // Sort hermanos by name and populate select
        allHermanos.sort((a,b) => a.name.localeCompare(b.name));
        allHermanos.forEach(h => {
            selectHermano.appendChild(new Option(h.name, h.id));
        });

        // 3. Fetch Communities via collectionGroup
        await reloadCommunitiesCache();
    } catch(err) {
        showAlert("Error cargando datos iniciales: " + err.message, "error");
    }
}

async function reloadCommunitiesCache() {
    try {
        const cSnap = await getDocs(collectionGroup(db, "comunidades"));
        allComunidades = [];
        cachedComunidades = {};
        cSnap.forEach(d => {
            const data = d.data();
            const parroquiaId = d.ref.parent.parent.id;
            allComunidades.push({
                id: d.id,
                number: data.numero || d.id,
                parroquiaId,
                data
            });
            cachedComunidades[d.id] = `Comunidad ${data.numero || d.id}`;
        });

        // Build Accordion
        renderAccordion();
    } catch(err) {
        console.error("Error reloading communities:", err);
    }
}

// ── EVENTS / CHANGE LISTENERS ───────────────────────
function onParroquiaChange() {
    const pid = selectParroquia.value;
    selectComunidad.innerHTML = '<option value="">— Seleccionar comunidad —</option>';
    selectComunidad.disabled = true;
    selectHermano.value = "";
    labelRespInfo.textContent = "— Ninguno asignado —";
    btnRemove.style.display = "none";

    if (!pid) return;

    // Filter communities belonging to the selected parish
    const filtered = allComunidades.filter(c => c.parroquiaId === pid);
    if (filtered.length === 0) {
        selectComunidad.innerHTML = '<option value="">— No hay comunidades —</option>';
        return;
    }

    selectComunidad.innerHTML = '<option value="">— Seleccionar Comunidad —</option>';
    filtered.sort((a,b) => String(a.number).localeCompare(String(b.number), undefined, {numeric:true}));
    filtered.forEach(c => {
        selectComunidad.appendChild(new Option(`Comunidad ${c.number}`, c.id));
    });
    selectComunidad.disabled = false;
}

function onComunidadChange() {
    const cid = selectComunidad.value;
    const pid = selectParroquia.value;
    selectHermano.value = "";
    labelRespInfo.textContent = "— Ninguno asignado —";
    btnRemove.style.display = "none";

    if (!cid || !pid) {
        selectHermano.innerHTML = '<option value="">— Seleccionar Hermano —</option>';
        return;
    }

    // 1. Get community details
    const com = allComunidades.find(c => c.id === cid && c.parroquiaId === pid);
    if (com) {
        filterHermanoDropdown(cid, com.number);
        if (com.data.catequistaId) {
            // Ensure currently assigned catechist exists in dropdown options
            if (!Array.from(selectHermano.options).some(opt => opt.value === com.data.catequistaId)) {
                selectHermano.appendChild(new Option(com.data.catequistaNombre || "Catequista Actual", com.data.catequistaId));
            }
            selectHermano.value = com.data.catequistaId;
            btnRemove.style.display = "inline-block";
        }
    }

    // 2. Fetch Primer Responsable of this community from local hermanos list
    const leader = allHermanos.find(h => 
        h.comunidadId === cid && 
        h.parroquiaId === pid && 
        h.data.razon === "Responsable" && 
        h.data.posicionResponsable === 1
    );

    if (leader) {
        labelRespInfo.textContent = `${leader.name} ${leader.phone ? `(${leader.phone})` : ""}`;
    } else {
        labelRespInfo.textContent = "— Ninguno registrado en esta comunidad —";
    }
}

function filterHermanoDropdown(targetComId, targetComNum) {
    selectHermano.innerHTML = '<option value="">— Seleccionar Hermano —</option>';
    
    const targetNumVal = parseInt(targetComNum);
    if (isNaN(targetNumVal)) {
        allHermanos.forEach(h => {
            selectHermano.appendChild(new Option(h.name, h.id));
        });
        return;
    }

    const eligibleHermanos = allHermanos.filter(h => {
        if (!h.comunidadId) return false;
        if (h.comunidadId === targetComId) return false;
        
        const comName = cachedComunidades[h.comunidadId] || "";
        const match = comName.match(/\d+/);
        if (!match) return false;
        const hComNum = parseInt(match[0]);
        return hComNum < targetNumVal;
    });

    eligibleHermanos.forEach(h => {
        selectHermano.appendChild(new Option(h.name, h.id));
    });
}

// ── SAVE / REMOVE ACTIONS ──────────────────────────
async function saveAssignment() {
    const pid = selectParroquia.value;
    const cid = selectComunidad.value;
    const hid = selectHermano.value;

    if (!pid || !cid || !hid) {
        alert("Por favor seleccione Parroquia, Comunidad y Catequista.");
        return;
    }

    const hermano = allHermanos.find(h => h.id === hid);
    if (!hermano) return;

    btnSave.disabled = true;
    try {
        const comDocRef = doc(db, "parroquias", pid, "comunidades", cid);
        await updateDoc(comDocRef, {
            catequistaId: hid,
            catequistaNombre: hermano.name,
            catequistaTelefono: hermano.phone
        });

        showAlert("✅ Catequista asignado exitosamente.", "success");
        
        // Refresh Cache
        await reloadCommunitiesCache();
        
        // Update form state
        btnRemove.style.display = "inline-block";
    } catch(err) {
        showAlert("Error al asignar: " + err.message, "error");
    } finally {
        btnSave.disabled = false;
    }
}

async function removeAssignment() {
    const pid = selectParroquia.value;
    const cid = selectComunidad.value;

    if (!pid || !cid) return;

    const confirmClear = await window.customConfirm(
        "Quitar Catequista",
        "¿Estás seguro de que deseas remover al catequista asignado a esta comunidad?",
        { icon: "✕", danger: true }
    );
    if (!confirmClear) return;

    btnRemove.disabled = true;
    try {
        const comDocRef = doc(db, "parroquias", pid, "comunidades", cid);
        await updateDoc(comDocRef, {
            catequistaId: null,
            catequistaNombre: null,
            catequistaTelefono: null
        });

        showAlert("🗑️ Catequista removido de la comunidad.", "success");
        selectHermano.value = "";
        btnRemove.style.display = "none";

        // Refresh Cache
        await reloadCommunitiesCache();
    } catch(err) {
        showAlert("Error al remover: " + err.message, "error");
    } finally {
        btnRemove.disabled = false;
    }
}

// ── ACCORDION RENDERING ────────────────────────────
function renderAccordion() {
    accordionContainer.innerHTML = "";

    // 1. Group communities by Catequista -> Parroquia
    const grouped = {}; // catequistaId -> { name, phone, parishes: { parroquiaId: { name, communities: [] } } }

    allComunidades.forEach(com => {
        const catId = com.data.catequistaId;
        if (!catId) return; // Skip if no catechist is assigned

        const catName = com.data.catequistaNombre || "Catequista Desconocido";
        const catPhone = com.data.catequistaTelefono || "";

        if (!grouped[catId]) {
            grouped[catId] = {
                name: catName,
                phone: catPhone,
                parishes: {}
            };
        }

        const pid = com.parroquiaId;
        const pNombre = cachedParroquias[pid] || "Parroquia Desconocida";

        if (!grouped[catId].parishes[pid]) {
            grouped[catId].parishes[pid] = {
                name: pNombre,
                communities: []
            };
        }

        // Find leader of this community
        const leader = allHermanos.find(h => 
            h.comunidadId === com.id && 
            h.parroquiaId === pid && 
            h.data.razon === "Responsable" && 
            h.data.posicionResponsable === 1
        );
        const leaderStr = leader ? `${leader.name} ${leader.phone ? `(${leader.phone})` : ""}` : "— Ninguno asignado —";

        grouped[catId].parishes[pid].communities.push({
            id: com.id,
            number: com.number,
            leader: leaderStr
        });
    });

    const uniqueCatIds = Object.keys(grouped);
    if (uniqueCatIds.length === 0) {
        accordionContainer.innerHTML = '<div style="text-align:center; padding:20px; color:#64748b;">No hay catequistas asignados en el sistema.</div>';
        return;
    }

    // Map each active catechist to their parent catechist (the catechist of their own community)
    const parents = {};
    uniqueCatIds.forEach(id => {
        const hno = allHermanos.find(h => h.id === id);
        if (hno && hno.comunidadId) {
            const com = allComunidades.find(c => c.id === hno.comunidadId);
            if (com && com.data.catequistaId && uniqueCatIds.includes(com.data.catequistaId)) {
                parents[id] = com.data.catequistaId;
            }
        }
    });

    const catechistList = [];
    const visited = new Set();

    function visit(id) {
        if (visited.has(id)) return;
        visited.add(id);

        if (grouped[id]) {
            catechistList.push(grouped[id]);
        }

        // Find and sort children (those whose parent is the current catechist)
        const children = uniqueCatIds.filter(childId => parents[childId] === id);
        children.sort((a, b) => grouped[a].name.localeCompare(grouped[b].name));
        
        children.forEach(childId => visit(childId));
    }

    // Find and sort roots (catechists without a parent in the active set)
    const roots = uniqueCatIds.filter(id => !parents[id]);
    roots.sort((a, b) => grouped[a].name.localeCompare(grouped[b].name));

    // Traverse from roots down
    roots.forEach(rootId => visit(rootId));

    // Fallback for cycles or disconnected nodes
    uniqueCatIds.forEach(id => {
        if (!visited.has(id)) {
            visit(id);
        }
    });

    // Render HTML Nodes
    catechistList.forEach(cat => {
        const itemDiv = document.createElement("div");
        itemDiv.className = "accordion-catequista";
        itemDiv.setAttribute("data-name", cat.name.toLowerCase());

        // Level 1: Catechist Name
        const header = document.createElement("div");
        header.className = "accordion-header";
        header.innerHTML = `
            <span>👤 <strong>${cat.name}</strong> ${cat.phone ? `<span style="font-weight:normal; color:#64748b; margin-left:6px;">📲 ${cat.phone}</span>` : ""}</span>
            <span class="chevron" style="transition:transform 0.2s;">▼</span>
        `;

        const content = document.createElement("div");
        content.className = "accordion-content";

        // Level 2: Parroquias
        Object.values(cat.parishes).forEach(parish => {
            const pGroup = document.createElement("div");
            pGroup.className = "parroquia-group";

            const pHeader = document.createElement("div");
            pHeader.className = "parroquia-header-sub";
            pHeader.innerHTML = `
                <span>⛪ ${parish.name}</span>
                <span class="sub-chevron" style="font-size:0.8rem; color:#64748b;">▼</span>
            `;

            const pContent = document.createElement("div");
            pContent.className = "parroquia-content-sub";

            // Sort communities
            parish.communities.sort((a,b) => String(a.number).localeCompare(String(b.number), undefined, {numeric:true}));

            // Level 3: Communities
            parish.communities.forEach(c => {
                const cItem = document.createElement("div");
                cItem.className = "community-item-detail";
                cItem.innerHTML = `
                    <span>🏠 Comunidad ${c.number}</span>
                    <span style="color:#64748b; font-size:0.8rem;">👑 Responsable: <strong style="color:#1e293b;">${c.leader}</strong></span>
                `;
                pContent.appendChild(cItem);
            });

            // Level 2 click toggle
            pHeader.addEventListener("click", (e) => {
                e.stopPropagation();
                const visible = pContent.style.display === "block";
                pContent.style.display = visible ? "none" : "block";
                pHeader.querySelector(".sub-chevron").textContent = visible ? "▼" : "▲";
            });

            pGroup.appendChild(pHeader);
            pGroup.appendChild(pContent);
            content.appendChild(pGroup);
        });

        // Level 1 click toggle
        header.addEventListener("click", () => {
            const visible = content.style.display === "block";
            content.style.display = visible ? "none" : "block";
            header.querySelector(".chevron").textContent = visible ? "▼" : "▲";
        });

        itemDiv.appendChild(header);
        itemDiv.appendChild(content);
        accordionContainer.appendChild(itemDiv);
    });
}

function filterAccordion() {
    const q = searchInput.value.toLowerCase().trim();
    const items = accordionContainer.querySelectorAll(".accordion-catequista");
    
    items.forEach(item => {
        const name = item.getAttribute("data-name") || "";
        if (!q || name.includes(q)) {
            item.style.display = "block";
        } else {
            item.style.display = "none";
        }
    });
}
