import { db } from "./firebase.js";
import { collection, doc, getDocs, addDoc, updateDoc, deleteDoc, query, orderBy } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

// DOM
const cardDatos          = document.getElementById("card-datos");
const modalDatos         = document.getElementById("modal-datos");
const btnCloseModal      = document.getElementById("btn-close-modal");
const btnCloseModalFoot  = document.getElementById("btn-close-modal-footer");
const inputCarisma       = document.getElementById("new-carisma-name");
const inputIcon          = document.getElementById("new-carisma-icon");
const editCarismaId      = document.getElementById("edit-carisma-id");
const btnAddCarisma      = document.getElementById("btn-add-carisma");
const containerCarismas  = document.getElementById("carismas-container-modal");

let allCarismas = [];

// App ready
window.addEventListener("app:ready", () => {
    // Eventos de modal
    cardDatos.addEventListener("click", () => {
        modalDatos.classList.add("open");
        clearModalForm();
        loadCarismas();
    });

    [btnCloseModal, btnCloseModalFoot].forEach(btn => {
        btn.addEventListener("click", () => {
            modalDatos.classList.remove("open");
        });
    });
});

// Cargar carismas de Firestore
async function loadCarismas() {
    containerCarismas.innerHTML = '<div style="color:#7f8c8d; text-align:center; padding:12px;">Cargando...</div>';
    
    try {
        const snap = await getDocs(query(collection(db, "carismas"), orderBy("nombre")));
        allCarismas = [];
        snap.forEach(d => allCarismas.push({ id: d.id, ...d.data() }));

        // Si esta vacio, auto-poblar con los 4 por defecto con iconos
        if (allCarismas.length === 0) {
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
    } catch(err) {
        containerCarismas.innerHTML = `<div style="color:#e74c3c; padding:12px;">Error: ${err.message}</div>`;
    }
}

// Renderizar lista en modal
function renderCarismas() {
    containerCarismas.innerHTML = "";
    allCarismas.forEach(c => {
        const row = document.createElement("div");
        row.style.display = "flex";
        row.style.justifyContent = "space-between";
        row.style.alignItems = "center";
        row.style.padding = "8px 12px";
        row.style.borderBottom = "1px solid var(--border)";
        row.style.fontSize = "0.9rem";
        row.style.fontFamily = "'Segoe UI', sans-serif";

        row.innerHTML = `
            <span style="font-weight:600; color:var(--text);">
                <span style="margin-right:8px; font-size:1.1rem;">${c.icono || "🔘"}</span>${c.nombre}
            </span>
            <div style="display:flex; gap:6px;">
                <button class="btn btn-sm btn-outline btn-edit-carisma" style="padding:2px 8px;" data-id="${c.id}">Editar</button>
                <button class="btn btn-sm btn-outline btn-delete-carisma" style="color:#e74c3c; border-color:#f5c6cb; padding:2px 8px;" data-id="${c.id}">✕</button>
            </div>
        `;

        row.querySelector(".btn-edit-carisma").addEventListener("click", () => {
            editCarismaId.value = c.id;
            inputCarisma.value = c.nombre;
            inputIcon.value = c.icono || "";
            btnAddCarisma.textContent = "Actualizar";
            inputCarisma.focus();
        });

        row.querySelector(".btn-delete-carisma").addEventListener("click", async () => {
            if(confirm(`¿Eliminar carisma "${c.nombre}"?`)) {
                await deleteDoc(doc(db, "carismas", c.id));
                clearModalForm();
                loadCarismas();
            }
        });

        containerCarismas.appendChild(row);
    });
}

// Limpiar modal
function clearModalForm() {
    editCarismaId.value = "";
    inputCarisma.value = "";
    inputIcon.value = "";
    btnAddCarisma.textContent = "Guardar";
}

// Agregar o actualizar carisma
btnAddCarisma.addEventListener("click", async () => {
    const valName = inputCarisma.value.trim();
    const valIcon = inputIcon.value.trim() || "🔘";
    if(!valName) return;
    
    btnAddCarisma.disabled = true;
    try {
        const id = editCarismaId.value;
        if (id) {
            await updateDoc(doc(db, "carismas", id), {
                nombre: valName,
                icono: valIcon
            });
        } else {
            await addDoc(collection(db, "carismas"), {
                nombre: valName,
                icono: valIcon
            });
        }
        clearModalForm();
        loadCarismas();
    } catch(err) {
        alert("Error al guardar: " + err.message);
    } finally {
        btnAddCarisma.disabled = false;
    }
});
