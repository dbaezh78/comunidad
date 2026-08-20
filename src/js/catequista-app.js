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
let loggedInUserComunidadId = null;
let loggedInUserRole      = "hermano";

// App Ready
window.addEventListener("app:ready", async (e) => {
    enforcePermissions();
    const user = e.detail;
    if (user && user.email) {
        try {
            const uSnap = await getDoc(doc(db, "autenticados", user.email.toLowerCase()));
            if (uSnap.exists()) {
                loggedInUserComunidadId = uSnap.data().comunidadId || null;
                loggedInUserRole = uSnap.data().rol || "hermano";
            }
        } catch(err) {
            console.error("Error loading user profile in catequista:", err);
        }
    }

    // Event listeners
    selectParroquia.addEventListener("change", onParroquiaChange);
    selectComunidad.addEventListener("change", onComunidadChange);
    btnSave.addEventListener("click", saveAssignment);
    if (btnRemove) btnRemove.addEventListener("click", removeAssignment);
    searchInput.addEventListener("input", filterAccordion);
    
    document.querySelectorAll(".btn-clear-slot").forEach(btn => {
        btn.addEventListener("click", () => {
            const slot = parseInt(btn.dataset.slot);
            clearSlot(slot);
        });
    });

    setupOriginCascades();

    // Initial load
    await loadInitialData();
});

// Helpers
let currentEligibleHermanos = [];

function populateAllOriginParroquias() {
    const originParroquias = document.querySelectorAll(".cat-origin-parroquia");
    originParroquias.forEach(sel => {
        sel.innerHTML = '<option value="">— Seleccionar —</option>';
        allParroquias.forEach(p => {
            sel.appendChild(new Option(p.nombre, p.id));
        });
    });
}

function setupOriginCascades() {
    document.querySelectorAll(".cat-origin-parroquia").forEach(selPar => {
        const slot = selPar.dataset.slot;
        
        const selCom = slot === "head" 
            ? document.getElementById("cat-comunidad-head") 
            : document.getElementById(`cat-companion-comunidad-${slot}`);
            
        const selHno = slot === "head" 
            ? document.getElementById("cat-hermano") 
            : document.getElementById(`cat-companion-${slot}`);
            
        const phoneEl = slot === "head"
            ? document.getElementById("cat-hermano-telefono")
            : document.getElementById(`cat-companion-phone-${slot}`);
            
        const spouseEl = slot === "head"
            ? document.getElementById("cat-conyuge")
            : document.getElementById(`cat-companion-spouse-${slot}`);

        selPar.addEventListener("change", () => {
            selCom.innerHTML = '<option value="">— Seleccionar —</option>';
            selCom.disabled = true;
            selHno.innerHTML = '<option value="">— Seleccionar —</option>';
            if (phoneEl) phoneEl.value = "";
            if (spouseEl) spouseEl.value = "";
            
            const pid = selPar.value;
            if (!pid) return;

            const coms = allComunidades.filter(c => c.parroquiaId === pid);
            coms.sort((a, b) => String(a.number).localeCompare(String(b.number), undefined, { numeric: true }));
            
            coms.forEach(c => {
                selCom.appendChild(new Option(`Comunidad ${c.number}`, c.id));
            });
            selCom.disabled = false;
        });

        selCom.addEventListener("change", () => {
            selHno.innerHTML = '<option value="">— Seleccionar —</option>';
            if (phoneEl) phoneEl.value = "";
            if (spouseEl) spouseEl.value = "";

            const cid = selCom.value;
            const pid = selPar.value;
            if (!cid || !pid) return;

            const list = allHermanos.filter(h => h.comunidadId === cid && h.parroquiaId === pid);
            list.sort((a, b) => a.name.localeCompare(b.name));

            list.forEach(h => {
                const displayName = `${h.data.primerNombre} ${h.data.primerApellido || ""}`.trim();
                selHno.appendChild(new Option(displayName, h.id));
            });
        });

        selHno.addEventListener("change", () => {
            const val = selHno.value;
            if (val) {
                const allSelects = [
                    document.getElementById("cat-hermano"),
                    ...Array.from({ length: 7 }, (_, i) => document.getElementById(`cat-companion-${i + 1}`))
                ].filter(Boolean);
                
                const alreadySelected = allSelects.some(s => s !== selHno && s.value === val);
                if (alreadySelected) {
                    if (window.customConfirm) {
                        window.customConfirm(
                            "Duplicado Detectado",
                            "Este hermano ya está seleccionado en el equipo de catequistas de esta comunidad. Por favor, selecciona a otra persona.",
                            { icon: "⚠️", danger: false }
                        );
                    } else {
                        alert("Este hermano ya está seleccionado en el equipo de catequistas de esta comunidad. Por favor, selecciona a otra persona.");
                    }
                    selHno.value = "";
                    if (phoneEl) phoneEl.value = "";
                    if (spouseEl) spouseEl.value = "";
                    updateRowsVisibility();
                    return;
                }
            }
            updateSpouseAndPhoneFields(selHno, phoneEl, spouseEl);
            updateRowsVisibility();
        });
    });
}

function updateRowsVisibility() {
    const headHnoVal = document.getElementById("cat-hermano").value;
    const row1 = document.getElementById("row-slot-1");
    
    if (headHnoVal) {
        row1.style.display = "table-row";
    } else {
        row1.style.display = "none";
    }

    for (let slot = 2; slot <= 7; slot++) {
        const prevSel = document.getElementById(`cat-companion-${slot - 1}`);
        const currentRow = document.getElementById(`row-slot-${slot}`);
        const prevRow = document.getElementById(`row-slot-${slot - 1}`);
        if (prevSel && prevSel.value && currentRow && prevRow.style.display !== "none") {
            currentRow.style.display = "table-row";
        } else {
            currentRow.style.display = "none";
        }
    }

    // Toggle X clear button visibility
    for (let slot = 1; slot <= 7; slot++) {
        const selVal = document.getElementById(`cat-companion-${slot}`).value;
        const btnClear = document.getElementById(`btn-clear-slot-${slot}`);
        if (btnClear) {
            btnClear.style.display = selVal ? "inline-block" : "none";
        }
    }
}

function clearSlot(slot) {
    const selPar = document.getElementById(`cat-companion-parroquia-${slot}`);
    const selCom = document.getElementById(`cat-companion-comunidad-${slot}`);
    const selHno = document.getElementById(`cat-companion-${slot}`);
    const phoneEl = document.getElementById(`cat-companion-phone-${slot}`);
    const spouseEl = document.getElementById(`cat-companion-spouse-${slot}`);

    if (selPar) selPar.value = "";
    if (selCom) {
        selCom.innerHTML = '<option value="">— Primero parroquia —</option>';
        selCom.disabled = true;
    }
    if (selHno) {
        selHno.innerHTML = '<option value="">— Seleccionar —</option>';
    }
    if (phoneEl) phoneEl.value = "";
    if (spouseEl) spouseEl.value = "";

    shiftSlotsUp(slot);
    updateRowsVisibility();
}

function shiftSlotsUp(startSlot) {
    for (let slot = startSlot; slot < 7; slot++) {
        const nextSlot = slot + 1;
        const nextPar = document.getElementById(`cat-companion-parroquia-${nextSlot}`);
        const nextCom = document.getElementById(`cat-companion-comunidad-${nextSlot}`);
        const nextHno = document.getElementById(`cat-companion-${nextSlot}`);
        const nextPhone = document.getElementById(`cat-companion-phone-${nextSlot}`);
        const nextSpouse = document.getElementById(`cat-companion-spouse-${nextSlot}`);

        const currPar = document.getElementById(`cat-companion-parroquia-${slot}`);
        const currCom = document.getElementById(`cat-companion-comunidad-${slot}`);
        const currHno = document.getElementById(`cat-companion-${slot}`);
        const currPhone = document.getElementById(`cat-companion-phone-${slot}`);
        const currSpouse = document.getElementById(`cat-companion-spouse-${slot}`);

        if (nextHno && nextHno.value) {
            // Copy next slot values to current slot
            currPar.value = nextPar.value;
            
            // Re-populate community dropdown
            currCom.innerHTML = nextCom.innerHTML;
            currCom.value = nextCom.value;
            currCom.disabled = nextCom.disabled;

            // Re-populate hermano dropdown
            currHno.innerHTML = nextHno.innerHTML;
            currHno.value = nextHno.value;

            currPhone.value = nextPhone.value;
            currSpouse.value = nextSpouse.value;

            // Clear next slot
            nextPar.value = "";
            nextCom.innerHTML = '<option value="">— Primero parroquia —</option>';
            nextCom.disabled = true;
            nextHno.innerHTML = '<option value="">— Seleccionar —</option>';
            nextPhone.value = "";
            nextSpouse.value = "";
        } else {
            // Nothing to shift, clear current if it's the one we clicked
            break;
        }
    }
}

function formatPhoneString(phone) {
    if (!phone) return "";
    const clean = phone.replace(/\D/g, "");
    if (clean.length === 10) {
        return `(${clean.slice(0, 3)}) ${clean.slice(3, 6)}-${clean.slice(6)}`;
    }
    return phone;
}

function updateSpouseAndPhoneFields(selectEl, phoneEl, spouseEl) {
    if (!selectEl) return;
    const hid = selectEl.value;
    if (!hid) {
        if (phoneEl) phoneEl.value = "";
        if (spouseEl) spouseEl.value = "";
        return;
    }
    const hermano = allHermanos.find(h => h.id === hid);
    if (hermano) {
        if (phoneEl) phoneEl.value = formatPhoneString(hermano.phone) || "Sin teléfono";
        if (spouseEl) {
            if (hermano.data?.esposoId) {
                const spouseHno = allHermanos.find(x => x.id === hermano.data.esposoId);
                if (spouseHno) {
                    spouseEl.value = `${spouseHno.data.primerNombre} ${spouseHno.data.segundoNombre || ""}`.trim();
                } else {
                    spouseEl.value = hermano.data.esposoNombre || "Casado / sin detalles";
                }
            } else {
                spouseEl.value = "Soltero / sin cónyuge";
            }
        }
    }
}

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

        // 3. Fetch Communities via collectionGroup
        await reloadCommunitiesCache();
        populateAllOriginParroquias();
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
    if (btnRemove) btnRemove.style.display = "none";

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
    
    // Clear head origin selectors
    const selParHead = document.getElementById("cat-parroquia-head");
    if (selParHead) selParHead.value = "";
    const selComHead = document.getElementById("cat-comunidad-head");
    if (selComHead) {
        selComHead.innerHTML = '<option value="">— Primero parroquia —</option>';
        selComHead.disabled = true;
    }
    
    // Clear head details
    selectHermano.innerHTML = '<option value="">— Seleccionar —</option>';
    document.getElementById("cat-hermano-telefono").value = "";
    document.getElementById("cat-conyuge").value = "";
    
    // Clear companion slots origin selectors and details
    document.querySelectorAll(".cat-companion-select").forEach(sel => {
        sel.innerHTML = '<option value="">— Seleccionar —</option>';
        const slot = sel.dataset.slot;
        
        const selPar = document.getElementById(`cat-companion-parroquia-${slot}`);
        if (selPar) selPar.value = "";
        
        const selCom = document.getElementById(`cat-companion-comunidad-${slot}`);
        if (selCom) {
            selCom.innerHTML = '<option value="">— Primero parroquia —</option>';
            selCom.disabled = true;
        }
        
        document.getElementById(`cat-companion-phone-${slot}`).value = "";
        document.getElementById(`cat-companion-spouse-${slot}`).value = "";
    });

    labelRespInfo.textContent = "— Ninguno asignado —";
    if (btnRemove) btnRemove.style.display = "none";

    if (!cid || !pid) {
        selectHermano.innerHTML = '<option value="">— Seleccionar Hermano —</option>';
        return;
    }

    // 1. Get community details
    const com = allComunidades.find(c => c.id === cid && c.parroquiaId === pid);
    if (com) {
        filterHermanoDropdown(cid, com.number);
        
        if (com.data.catequistaId) {
            // Populate Cabeza Slot
            const headHno = allHermanos.find(h => h.id === com.data.catequistaId);
            if (headHno) {
                const selPar = document.getElementById("cat-parroquia-head");
                const selCom = document.getElementById("cat-comunidad-head");
                const selHno = document.getElementById("cat-hermano");
                const phoneEl = document.getElementById("cat-hermano-telefono");
                const spouseEl = document.getElementById("cat-conyuge");

                selPar.value = headHno.parroquiaId || "";
                
                selCom.innerHTML = '<option value="">— Seleccionar —</option>';
                const coms = allComunidades.filter(c => c.parroquiaId === headHno.parroquiaId);
                coms.sort((a, b) => String(a.number).localeCompare(String(b.number), undefined, { numeric: true }));
                coms.forEach(c => { selCom.appendChild(new Option(`Comunidad ${c.number}`, c.id)); });
                selCom.value = headHno.comunidadId || "";
                selCom.disabled = false;

                selHno.innerHTML = '<option value="">— Seleccionar —</option>';
                const hnos = allHermanos.filter(h => h.comunidadId === headHno.comunidadId && h.parroquiaId === headHno.parroquiaId);
                hnos.sort((a, b) => a.name.localeCompare(b.name));
                hnos.forEach(h => {
                    const shortName = `${h.data.primerNombre} ${h.data.segundoNombre || ""}`.trim();
                    selHno.appendChild(new Option(shortName, h.id));
                });
                selHno.value = headHno.id;

                updateSpouseAndPhoneFields(selHno, phoneEl, spouseEl);
            }

            // Extract companion IDs (excluding head and head's spouse)
            const headSpouseId = headHno?.data?.esposoId || null;
            const companionIds = [];
            if (com.data.equipoCatequistasIds) {
                com.data.equipoCatequistasIds.forEach(id => {
                    if (id === com.data.catequistaId || id === headSpouseId) return;
                    
                    const alreadyAddedSpouse = companionIds.some(cid => {
                        const comp = allHermanos.find(h => h.id === cid);
                        return comp?.data?.esposoId === id;
                    });
                    
                    if (!alreadyAddedSpouse) {
                        companionIds.push(id);
                    }
                });
            }

            // Populate companion slots
            companionIds.forEach((id, index) => {
                const slotIndex = index + 1;
                if (slotIndex <= 7) {
                    const compH = allHermanos.find(x => x.id === id);
                    if (compH) {
                        const selPar = document.getElementById(`cat-companion-parroquia-${slotIndex}`);
                        const selCom = document.getElementById(`cat-companion-comunidad-${slotIndex}`);
                        const selHno = document.getElementById(`cat-companion-${slotIndex}`);
                        const phoneEl = document.getElementById(`cat-companion-phone-${slotIndex}`);
                        const spouseEl = document.getElementById(`cat-companion-spouse-${slotIndex}`);

                        selPar.value = compH.parroquiaId || "";
                        
                        selCom.innerHTML = '<option value="">— Seleccionar —</option>';
                        const coms = allComunidades.filter(c => c.parroquiaId === compH.parroquiaId);
                        coms.sort((a, b) => String(a.number).localeCompare(String(b.number), undefined, { numeric: true }));
                        coms.forEach(c => { selCom.appendChild(new Option(`Comunidad ${c.number}`, c.id)); });
                        selCom.value = compH.comunidadId || "";
                        selCom.disabled = false;

                        selHno.innerHTML = '<option value="">— Seleccionar —</option>';
                        const hnos = allHermanos.filter(h => h.comunidadId === compH.comunidadId && h.parroquiaId === compH.parroquiaId);
                        hnos.sort((a, b) => a.name.localeCompare(b.name));
                        hnos.forEach(h => {
                            const shortName = `${h.data.primerNombre} ${h.data.segundoNombre || ""}`.trim();
                            selHno.appendChild(new Option(shortName, h.id));
                        });
                        selHno.value = compH.id;

                        updateSpouseAndPhoneFields(selHno, phoneEl, spouseEl);
                    }
                }
            });

            // Update slot visibility states
            updateRowsVisibility();
            
            if (btnRemove && window.hasPermission && window.hasPermission("catequista_quitar")) {
                btnRemove.style.display = "inline-block";
            }
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
    
    const compSelects = document.querySelectorAll(".cat-companion-select");
    compSelects.forEach(sel => {
        sel.innerHTML = '<option value="">— Seleccionar Hermano —</option>';
    });

    const targetNumVal = parseInt(targetComNum);
    if (isNaN(targetNumVal)) {
        currentEligibleHermanos = [...allHermanos];
    } else {
        currentEligibleHermanos = allHermanos.filter(h => {
            if (!h.comunidadId) return false;
            if (h.comunidadId === targetComId) return false;
            
            const comName = cachedComunidades[h.comunidadId] || "";
            const match = comName.match(/\d+/);
            if (!match) return false;
            const hComNum = parseInt(match[0]);
            return hComNum < targetNumVal;
        });
    }

    currentEligibleHermanos.forEach(h => {
        const displayName = `${h.data.primerNombre} ${h.data.primerApellido || ""}`.trim();
        selectHermano.appendChild(new Option(displayName, h.id));
    });

    compSelects.forEach(sel => {
        currentEligibleHermanos.forEach(h => {
            const displayName = `${h.data.primerNombre} ${h.data.primerApellido || ""}`.trim();
            sel.appendChild(new Option(displayName, h.id));
        });
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
        
        const equipoIds = [hid];
        const equipoNombres = [hermano.name];
        
        if (hermano.data?.esposoId) {
            equipoIds.push(hermano.data.esposoId);
            equipoNombres.push(hermano.data.esposoNombre);
        }
        
        const companionSelects = document.querySelectorAll(".cat-companion-select");
        companionSelects.forEach(sel => {
            const val = sel.value;
            if (val && !equipoIds.includes(val)) {
                equipoIds.push(val);
                const compHno = allHermanos.find(h => h.id === val);
                if (compHno) {
                    equipoNombres.push(compHno.name);
                    if (compHno.data?.esposoId && !equipoIds.includes(compHno.data.esposoId)) {
                        equipoIds.push(compHno.data.esposoId);
                        equipoNombres.push(compHno.data.esposoNombre);
                    }
                }
            }
        });

        await updateDoc(comDocRef, {
            catequistaId: hid,
            catequistaNombre: hermano.name,
            catequistaTelefono: hermano.phone,
            equipoCatequistasIds: equipoIds,
            equipoCatequistasNombres: equipoNombres
        });

        showAlert("✅ Catequista asignado exitosamente.", "success");
        
        // Refresh Cache
        await reloadCommunitiesCache();
        
        // Update form state
        if (btnRemove && window.hasPermission && window.hasPermission("catequista_quitar")) {
            btnRemove.style.display = "inline-block";
        }
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

    if (btnRemove) btnRemove.disabled = true;
    try {
        const comDocRef = doc(db, "parroquias", pid, "comunidades", cid);
        await updateDoc(comDocRef, {
            catequistaId: null,
            catequistaNombre: null,
            catequistaTelefono: null,
            equipoCatequistasIds: null,
            equipoCatequistasNombres: null
        });

        showAlert("🗑️ Catequista removido de la comunidad.", "success");
        onComunidadChange(); // This clears and resets all dropdowns and values perfectly!
        if (btnRemove) btnRemove.style.display = "none";

        // Refresh Cache
        await reloadCommunitiesCache();
    } catch(err) {
        showAlert("Error al remover: " + err.message, "error");
    } finally {
        if (btnRemove) btnRemove.disabled = false;
    }
}

// ── ACCORDION RENDERING ────────────────────────────
function renderAccordion() {
    accordionContainer.innerHTML = "";
    
    // Check mode
    const viewMode = document.getElementById("catequistas-view-filter")?.value || "lista";
    
    // Common flat list of catechist community assignments:
    const flatList = [];
    allComunidades.forEach(com => {
        const catId = com.data.catequistaId;
        if (!catId) return;
        
        const isNotAdmin = !window.userPermissions?.adminTotal && window.userPermissions?.rol !== "admin" && !window.hasPermission("catequista_guardar");
        if (isNotAdmin && loggedInUserComunidadId && com.id !== loggedInUserComunidadId) {
            return;
        }
        
        const catName = com.data.catequistaNombre || "Catequista Desconocido";
        const catPhone = com.data.catequistaTelefono || "";
        const pid = com.parroquiaId;
        const pNombre = cachedParroquias[pid] || "Parroquia Desconocida";
        
        const leader = allHermanos.find(h => 
            h.comunidadId === com.id && 
            h.parroquiaId === pid && 
            h.data.razon === "Responsable" && 
            h.data.posicionResponsable === 1
        );
        
        let leaderStr = "— Ninguno asignado —";
        if (leader) {
            let displayHno = leader;
            if (leader.data.sexo === "F" && leader.data.estadoCivil === "Casado" && leader.data.esposoId) {
                const husband = allHermanos.find(h => h.id === leader.data.esposoId);
                if (husband && husband.comunidadId === com.id && husband.data.activo !== false) {
                    displayHno = husband;
                }
            }
            const formattedPhone = formatPhoneString(displayHno.phone);
            leaderStr = `${displayHno.name}${formattedPhone ? ` (${formattedPhone})` : ""}`;
        }
        
        flatList.push({
            id: com.id,
            catId,
            catName,
            catPhone,
            parishId: pid,
            parishName: pNombre,
            comName: `Comunidad ${com.number || com.data.numero || com.id}`,
            leaderStr
        });
    });

    // Expose flatList for printing filters
    window.currentPrintedCatequistas = flatList;

    if (flatList.length === 0) {
        accordionContainer.innerHTML = '<div style="text-align:center; padding:20px; color:#64748b;">No hay asignaciones de catequistas.</div>';
        return;
    }

    if (viewMode === "lista") {
        // Group by Catequista -> Parroquia
        const grouped = {};
        flatList.forEach(assoc => {
            if (!grouped[assoc.catId]) {
                grouped[assoc.catId] = {
                    name: assoc.catName,
                    phone: assoc.catPhone,
                    parishes: {}
                };
            }
            if (!grouped[assoc.catId].parishes[assoc.parishId]) {
                grouped[assoc.catId].parishes[assoc.parishId] = {
                    name: assoc.parishName,
                    communities: []
                };
            }
            grouped[assoc.catId].parishes[assoc.parishId].communities.push({
                id: assoc.id,
                number: assoc.comName,
                leader: assoc.leaderStr
            });
        });

        // Sort communities in ascending order for each parish
        Object.values(grouped).forEach(cat => {
            Object.values(cat.parishes).forEach(parish => {
                parish.communities.sort((a, b) => {
                    const numA = parseInt(a.number.replace(/\D/g, "")) || 0;
                    const numB = parseInt(b.number.replace(/\D/g, "")) || 0;
                    return numA - numB;
                });
            });
        });

        const uniqueCatIds = Object.keys(grouped);

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

            const children = uniqueCatIds.filter(childId => parents[childId] === id);
            children.sort((a, b) => grouped[a].name.localeCompare(grouped[b].name));
            
            children.forEach(childId => visit(childId));
        }

        const roots = uniqueCatIds.filter(id => !parents[id]);
        roots.sort((a, b) => grouped[a].name.localeCompare(grouped[b].name));

        roots.forEach(rootId => visit(rootId));

        uniqueCatIds.forEach(id => {
            if (!visited.has(id)) {
                visit(id);
            }
        });

        catechistList.forEach(cat => {
            const itemDiv = document.createElement("div");
            itemDiv.className = "accordion-catequista";
            itemDiv.setAttribute("data-name", cat.name.toLowerCase());

            const header = document.createElement("div");
            header.className = "accordion-header";
            header.innerHTML = `
                <span>👤 <strong>${cat.name}</strong> ${cat.phone ? `<span style="font-weight:normal; color:#64748b; margin-left:6px;">📲 ${cat.phone}</span>` : ""}</span>
                <span class="chevron">▼</span>
            `;

            const content = document.createElement("div");
            content.className = "accordion-content";
            content.style.padding = "15px";

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

                parish.communities.forEach(c => {
                    const cItem = document.createElement("div");
                    cItem.className = "community-group-sub";
                    cItem.style.cssText = "border-top:1px solid #f1f5f9; padding:8px 0;";

                    const cHeader = document.createElement("div");
                    cHeader.className = "community-header-sub";
                    cHeader.style.cssText = "display:flex; justify-content:space-between; align-items:center; cursor:pointer; padding:6px 12px; transition: background 0.2s; border-radius:4px;";
                    cHeader.innerHTML = `
                        <span style="font-weight:600; color:#334155;">🏠 ${c.number}</span>
                        <div style="display:flex; align-items:center; gap:8px;">
                            <span style="color:#64748b; font-size:0.82rem;">👑 Responsable: <strong style="color:#1e293b;">${c.leader}</strong></span>
                            <span class="com-chevron" style="font-size:0.8rem; color:#64748b;">▼</span>
                        </div>
                    `;

                    // Hover effects using JS
                    cHeader.addEventListener("mouseenter", () => cHeader.style.background = "#f1f5f9");
                    cHeader.addEventListener("mouseleave", () => cHeader.style.background = "transparent");

                    const cContent = document.createElement("div");
                    cContent.className = "community-content-sub";
                    cContent.style.cssText = "display:none; padding:8px 12px 8px 24px; background:#f8fafc; border-radius:6px; margin-top:4px;";

                    // Fetch all team members (including head, spouse, and companions)
                    const matchingCom = allComunidades.find(com => com.id === c.id);
                    const companionList = [];
                    if (matchingCom && matchingCom.data.equipoCatequistasIds) {
                        matchingCom.data.equipoCatequistasIds.forEach(mId => {
                            const hno = allHermanos.find(h => h.id === mId);
                            if (hno) {
                                companionList.push({
                                    name: `${hno.data.primerNombre} ${hno.data.primerApellido || ""}`.trim(),
                                    phone: formatPhoneString(hno.phone) || "Sin teléfono"
                                });
                            }
                        });
                    }

                    if (companionList.length === 0) {
                        companionList.push({
                            name: cat.name,
                            phone: formatPhoneString(cat.phone) || "Sin teléfono"
                        });
                    }

                    let companionHTML = `<div style="font-weight:700; color:#475569; font-size:0.82rem; margin-bottom:6px; border-bottom:1px solid #e2e8f0; padding-bottom:2px;">👥 Equipo de Catequistas:</div>`;
                    if (companionList.length === 0) {
                        companionHTML += `<div style="font-size:0.8rem; color:#94a3b8; font-style:italic;">— Sin miembros asignados —</div>`;
                    } else {
                        companionList.forEach(m => {
                            companionHTML += `
                                <div style="display:flex; justify-content:space-between; font-size:0.82rem; padding:3px 0; color:#475569;">
                                    <span>👤 ${m.name}</span>
                                    <span style="color:#64748b;">📲 ${m.phone}</span>
                                </div>
                            `;
                        });
                    }
                    cContent.innerHTML = companionHTML;

                    cHeader.addEventListener("click", (e) => {
                        e.stopPropagation();
                        const visible = cContent.style.display === "block";
                        cContent.style.display = visible ? "none" : "block";
                        cHeader.querySelector(".com-chevron").textContent = visible ? "▼" : "▲";
                    });

                    cItem.appendChild(cHeader);
                    cItem.appendChild(cContent);
                    pContent.appendChild(cItem);
                });

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

            header.addEventListener("click", () => {
                const visible = content.style.display === "block";
                content.style.display = visible ? "none" : "block";
                header.querySelector(".chevron").textContent = visible ? "▼" : "▲";
            });

            itemDiv.appendChild(header);
            itemDiv.appendChild(content);
            accordionContainer.appendChild(itemDiv);
        });

    } else if (viewMode === "parroquias") {
        // Group by Parroquia -> Catequista + Comunidades
        const grouped = {};
        flatList.forEach(assoc => {
            if (!grouped[assoc.parishId]) {
                grouped[assoc.parishId] = {
                    name: assoc.parishName,
                    catechists: {}
                };
            }
            if (!grouped[assoc.parishId].catechists[assoc.catId]) {
                grouped[assoc.parishId].catechists[assoc.catId] = {
                    name: assoc.catName,
                    phone: assoc.catPhone,
                    communities: []
                };
            }
            grouped[assoc.parishId].catechists[assoc.catId].communities.push(assoc.comName);
        });

        Object.values(grouped).forEach(parish => {
            const itemDiv = document.createElement("div");
            itemDiv.className = "accordion-catequista";
            itemDiv.setAttribute("data-name", parish.name.toLowerCase());

            const header = document.createElement("div");
            header.className = "accordion-header";
            header.innerHTML = `
                <span>⛪ <strong>${parish.name}</strong></span>
                <span class="chevron">▼</span>
            `;

            const content = document.createElement("div");
            content.className = "accordion-content";

            Object.values(parish.catechists).forEach(cat => {
                // Sort communities ascending
                cat.communities.sort((a, b) => {
                    const numA = parseInt(a.replace(/\D/g, "")) || 0;
                    const numB = parseInt(b.replace(/\D/g, "")) || 0;
                    return numA - numB;
                });

                const div = document.createElement("div");
                div.style.padding = "8px 0";
                div.style.borderBottom = "1px solid #f1f5f9";
                div.innerHTML = `👤 <strong>${cat.name}</strong> ${cat.phone ? `(${cat.phone})` : ""} — Comunidades: ${cat.communities.join(", ")}`;
                content.appendChild(div);
            });

            header.addEventListener("click", () => {
                const visible = content.style.display === "block";
                content.style.display = visible ? "none" : "block";
                header.querySelector(".chevron").textContent = visible ? "▼" : "▲";
            });

            itemDiv.appendChild(header);
            itemDiv.appendChild(content);
            accordionContainer.appendChild(itemDiv);
        });

    } else if (viewMode === "comunidades") {
        // Group by Comunidad -> Catequista
        flatList.forEach(assoc => {
            const itemDiv = document.createElement("div");
            itemDiv.className = "accordion-catequista";
            itemDiv.setAttribute("data-name", `${assoc.parishName} ${assoc.comName}`.toLowerCase());

            const header = document.createElement("div");
            header.className = "accordion-header";
            header.innerHTML = `
                <span>👥 <strong>${assoc.parishName} — ${assoc.comName}</strong></span>
                <span class="chevron">▼</span>
            `;

            const content = document.createElement("div");
            content.className = "accordion-content";
            content.innerHTML = `
                <div style="padding:4px 0;">👤 <strong>Catequista:</strong> ${assoc.catName} ${assoc.catPhone ? `(${assoc.catPhone})` : ""}</div>
                <div style="padding:4px 0;">🙏 <strong>Responsable:</strong> ${assoc.leaderStr}</div>
            `;

            header.addEventListener("click", () => {
                const visible = content.style.display === "block";
                content.style.display = visible ? "none" : "block";
                header.querySelector(".chevron").textContent = visible ? "▼" : "▲";
            });

            itemDiv.appendChild(header);
            itemDiv.appendChild(content);
            accordionContainer.appendChild(itemDiv);
        });

    } else if (viewMode === "responsables") {
        // Group by Responsable -> Catequista + Comunidades
        const grouped = {};
        flatList.forEach(assoc => {
            const leaderKey = assoc.leaderStr.split(" (")[0]; // strip phone number
            if (!grouped[leaderKey]) {
                grouped[leaderKey] = {
                    name: assoc.leaderStr,
                    assignments: []
                };
            }
            grouped[leaderKey].assignments.push(assoc);
        });

        Object.values(grouped).forEach(leader => {
            const itemDiv = document.createElement("div");
            itemDiv.className = "accordion-catequista";
            itemDiv.setAttribute("data-name", leader.name.toLowerCase());

            const header = document.createElement("div");
            header.className = "accordion-header";
            header.innerHTML = `
                <span>🙏 <strong>Responsable: ${leader.name}</strong></span>
                <span class="chevron">▼</span>
            `;

            const content = document.createElement("div");
            content.className = "accordion-content";

            leader.assignments.forEach(assoc => {
                const div = document.createElement("div");
                div.style.padding = "8px 0";
                div.style.borderBottom = "1px solid #f1f5f9";
                div.innerHTML = `⛪ ${assoc.parishName} — 👥 ${assoc.comName} (Catequista: ${assoc.catName} ${assoc.catPhone ? `📲 ${assoc.catPhone}` : ""})`;
                content.appendChild(div);
            });

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

function enforcePermissions() {
    if (!window.hasPermission) return;

    // Show/hide cards based on section visibility permissions
    const cards = document.querySelectorAll(".page-content > .card");
    if (cards.length >= 2) {
        if (!window.hasPermission("catequista_ver_asignacion")) {
            cards[0].style.display = "none";
        } else {
            cards[0].style.display = "block";
        }
        if (!window.hasPermission("catequista_ver_catequistas")) {
            cards[1].style.display = "none";
        } else {
            cards[1].style.display = "block";
        }
    }

    // Guardar Asignacion
    const btnSave = document.getElementById("btn-save-catequista");
    const hasGuardar = window.hasPermission("catequista_guardar");
    if (btnSave && !hasGuardar) {
        btnSave.style.display = "none";
    }

    // Disable catechist dropdown if they cannot assign/modify
    if (selectHermano && !hasGuardar) {
        selectHermano.disabled = true;
    }

    // Quitar Catequista
    const btnRemove = document.getElementById("btn-remove-catequista");
    if (btnRemove && !window.hasPermission("catequista_quitar")) {
        btnRemove.style.display = "none";
    }
}
