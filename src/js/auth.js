// ================================================
// AUTH.JS — Manejo de sesion y navegacion global
// ================================================
import { auth, db }                 from "./firebase.js";
import "./settings.js";
import { collection, query, where, getDocs, doc, getDoc, updateDoc, addDoc, setDoc } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
import { GoogleAuthProvider,
         signInWithPopup,
         signOut,
         onAuthStateChanged }       from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";

const provider = new GoogleAuthProvider();

// ── DOM ──────────────────────────────────────────
const loginOverlay = document.getElementById("login-overlay");
const appContent   = document.getElementById("app-content");
const topBar       = document.getElementById("top-bar");
const btnGoogle    = document.getElementById("btn-google");
const googleBtnTxt = document.getElementById("google-btn-text");
const loginError   = document.getElementById("login-error");
const userInfo     = document.getElementById("user-info");
const userPhoto    = document.getElementById("user-photo");
const logoutBtn    = document.getElementById("btn-logout");

let appInitialized = false;

// ── Loader de Espera Personalizado ────────────────
function updateLoader(percent) {
    let loader = document.getElementById("global-loader");
    if (!loader) {
        loader = document.createElement("div");
        loader.id = "global-loader";
        loader.style.cssText = "position:fixed; top:0; left:0; right:0; bottom:0; background:#f8fafc; display:flex; flex-direction:column; align-items:center; justify-content:center; z-index:99999; font-family:'Segoe UI',sans-serif; transition: opacity 0.5s ease-out;";
        loader.innerHTML = `
            <div style="text-align:center; max-width:320px; width:90%;">
                <img src="src/img/jesus.png" style="max-height:220px; width:auto; border-radius:12px; margin-bottom:20px; box-shadow:0 10px 15px -3px rgba(0,0,0,0.1);">
                <div id="loader-percent" style="font-size:2rem; font-weight:800; color:#1e293b; margin-bottom:12px;">0%</div>
                <div style="width:100%; height:8px; background:#e2e8f0; border-radius:10px; overflow:hidden; margin-bottom:15px;">
                    <div id="loader-bar" style="width:0%; height:100%; background:#dc3545; transition:width 0.3s ease-out;"></div>
                </div>
                <div style="font-size:0.85rem; color:#64748b; font-weight:600;">Cargando sistema...</div>
            </div>
        `;
        document.body.appendChild(loader);
    }

    const bar = document.getElementById("loader-bar");
    const pct = document.getElementById("loader-percent");
    if (bar && pct) {
        bar.style.width = `${percent}%`;
        pct.textContent = `${percent}%`;
    }

    if (percent >= 100) {
        setTimeout(() => {
            loader.style.opacity = "0";
            setTimeout(() => {
                if (loader.parentNode) loader.parentNode.removeChild(loader);
            }, 500);
        }, 300);
    }
}

// Iniciar cargador al 10% al cargar script
updateLoader(10);

// ── Auth state ────────────────────────────────────
onAuthStateChanged(auth, (user) => {
    if (user) {
        updateLoader(40);
        checkCommunityAccess(user);
    } else {
        const overlay = document.getElementById("activation-overlay");
        if (overlay) overlay.remove();
        
        loginOverlay.style.display = "flex";
        appContent.style.display   = "none";
        topBar.style.display       = "none";
        if (userPhoto) userPhoto.style.display = "none";
        appInitialized = false;

        // Quitar cargador de inmediato si no hay sesión
        updateLoader(100);
    }
});

async function checkCommunityAccess(user) {
    updateLoader(60);
    // 1. Verificar si está baneado
    try {
        const uSnap = await getDoc(doc(db, "autenticados", user.email.toLowerCase()));
        if (uSnap.exists() && uSnap.data().baneado) {
            updateLoader(100);
            showBannedScreen(user);
            return;
        }
    } catch(e) { console.error(e); }

    // Registrar login y auditoría en background de inmediato para todos los autenticados
    registerUserLogin(user);

    updateLoader(75);

    const isCreator = user.email.toLowerCase().includes("dbaezh");
    if (isCreator) {
        allowUserAccess(user);
        return;
    }

    try {
        const snap = await getDocs(query(collection(db, "hermanos"), where("correo", "==", user.email)));
        let hasCommunity = false;
        let existingHermano = null;
        
        if (!snap.empty) {
            existingHermano = { id: snap.docs[0].id, ...snap.docs[0].data() };
            if (existingHermano.comunidadId) {
                hasCommunity = true;
            }
        }

        updateLoader(90);

        if (hasCommunity) {
            allowUserAccess(user);
        } else {
            updateLoader(100);
            showActivationScreen(user, existingHermano);
        }
    } catch(e) {
        console.error("Error validating user community access:", e);
        allowUserAccess(user);
    }
}

async function allowUserAccess(user) {
    updateLoader(85);
    
    // Fetch role and permissions
    let rol = "hermano";
    let permissions = {};
    let adminTotal = false;

    const isCreator = user.email.toLowerCase() === "dbaezh78@gmail.com";
    if (isCreator) {
        adminTotal = true;
        rol = "admin";
    } else {
        try {
            const uSnap = await getDoc(doc(db, "autenticados", user.email.toLowerCase()));
            if (uSnap.exists()) {
                rol = uSnap.data().rol || "hermano";
            }
            
            const pSnap = await getDoc(doc(db, "permisosRoles", rol));
            if (pSnap.exists()) {
                const pData = pSnap.data();
                adminTotal = !!pData.adminTotal;
                permissions = pData.permissions || {};
            }
        } catch(e) {
            console.error("Error loading user permissions:", e);
        }
    }

    // Expose globally
    window.userPermissions = {
        rol,
        adminTotal,
        permissions
    };

    window.hasPermission = function(permId) {
        if (isCreator || adminTotal) return true;
        return !!permissions[permId];
    };

    // Navigation and Routing Guards
    const currentPath = window.location.pathname.split("/").pop() || "index.html";
    const basePage = currentPath.split("?")[0].split("#")[0];

    // Page Guards
    const pageGuards = {
        "parroquia.html": () => window.hasPermission("parroquia_ver") || window.hasPermission("parroquia_consultar"),
        "catequista.html": () => window.hasPermission("catequista_ver_hilos") || window.hasPermission("catequista_ver_asignacion") || window.hasPermission("catequista_ver_catequistas"),
        "comunidad.html": () => window.hasPermission("comunidad_consultar") || window.hasPermission("comunidad_ver_hermanos"),
        "hermanos.html": () => window.hasPermission("hermanos_buscar") || window.hasPermission("hermanos_ver"),
        "realidad.html": () => window.hasPermission("realidad_ver"),
        "itinerario.html": () => window.hasPermission("itinerario_ver"),
        "sortear.html": () => window.hasPermission("sortear_ver"),
        "codComunidad.html": () => window.hasPermission("codigo_ver"),
        "permisos.html": () => window.hasPermission("permisos_cuenta") || window.hasPermission("permisos_acceso")
    };

    if (pageGuards[basePage] && !pageGuards[basePage]()) {
        console.warn(`Access denied to page: ${basePage}. Redirecting to index.html`);
        window.location.href = "index.html";
        return;
    }

    updateLoader(100);
    const overlay = document.getElementById("activation-overlay") || document.getElementById("banned-overlay");
    if (overlay) overlay.remove();

    loginOverlay.style.display = "none";
    appContent.style.display   = "block";
    topBar.style.display       = "flex";

    userInfo.textContent = user.displayName || user.email;
    if (user.photoURL) {
        userPhoto.src           = user.photoURL;
        userPhoto.style.display = "block";
    }

    // Inyectar navbar global dinámico y marcar activo según la página actual
    const navContainer = document.querySelector("nav.nav-bar");
    if (navContainer) {
        let html = `<span class="nav-logo">⛪ Santa Iglesia Católica</span>`;
        html += `<a href="index.html" class="nav-link ${basePage === 'index.html' || basePage === '' ? 'active' : ''}"><span class="nav-icon">🏠</span> Home</a>`;
        
        if (window.hasPermission("parroquia_ver") || window.hasPermission("parroquia_consultar")) {
            html += `<a href="parroquia.html" class="nav-link ${basePage === 'parroquia.html' ? 'active' : ''}"><span class="nav-icon">⛪</span> Parroquia</a>`;
        }
        if (window.hasPermission("catequista_ver_hilos") || window.hasPermission("catequista_ver_asignacion") || window.hasPermission("catequista_ver_catequistas")) {
            html += `<a href="catequista.html" class="nav-link ${basePage === 'catequista.html' ? 'active' : ''}"><span class="nav-icon">📖</span> Catequistas</a>`;
        }
        if (window.hasPermission("comunidad_consultar") || window.hasPermission("comunidad_ver_hermanos")) {
            html += `<a href="comunidad.html" class="nav-link ${basePage === 'comunidad.html' ? 'active' : ''}"><span class="nav-icon" style="background:#ffffff; border-radius:4px; padding:2px; display:inline-flex; align-items:center; justify-content:center; width:20px; height:20px; line-height:1;">👥</span> Comunidad</a>`;
        }
        if (window.hasPermission("hermanos_buscar") || window.hasPermission("hermanos_ver")) {
            html += `<a href="hermanos.html" class="nav-link ${basePage === 'hermanos.html' ? 'active' : ''}"><span class="nav-icon">👨‍👩‍👧‍👦</span> Hermanos</a>`;
        }
        if (window.hasPermission("realidad_ver")) {
            html += `<a href="realidad.html" class="nav-link ${basePage === 'realidad.html' ? 'active' : ''}"><span class="nav-icon">📚</span> Realidad</a>`;
        }
        if (window.hasPermission("itinerario_ver")) {
            html += `<a href="itinerario.html" class="nav-link ${basePage === 'itinerario.html' ? 'active' : ''}"><span class="nav-icon">🗺️</span> Itinerario</a>`;
        }
        if (window.hasPermission("sortear_ver")) {
            html += `<a href="sortear.html" class="nav-link ${basePage === 'sortear.html' ? 'active' : ''}"><span class="nav-icon">🎲</span> Sortear</a>`;
        }
        if (window.hasPermission("codigo_ver")) {
            html += `<a href="codComunidad.html" class="nav-link ${basePage === 'codComunidad.html' ? 'active' : ''}"><span class="nav-icon">🔑</span> Códigos</a>`;
        }
        if (window.hasPermission("permisos_cuenta") || window.hasPermission("permisos_acceso")) {
            html += `<a href="permisos.html" class="nav-link ${basePage === 'permisos.html' ? 'active' : ''}"><span class="nav-icon">🛡️</span> Permisos</a>`;
        }
        
        navContainer.innerHTML = html;
    }

    // Hide cards in index.html if user lacks access
    if (basePage === "index.html" || basePage === "") {
        const cardLinks = document.querySelectorAll(".ajustes-grid-jesus > a");
        cardLinks.forEach(link => {
            const href = link.getAttribute("href");
            if (pageGuards[href] && !pageGuards[href]()) {
                link.style.display = "none";
            }
        });
    }

    if (!appInitialized) {
        appInitialized = true;
        window.dispatchEvent(new CustomEvent("app:ready", { detail: user }));
    }
}

async function registerUserLogin(user) {
    const userDocRef = doc(db, "autenticados", user.email.toLowerCase());
    
    let rol = "hermano";
    let baneado = false;
    try {
        const uSnap = await getDoc(userDocRef);
        if (uSnap.exists()) {
            rol = uSnap.data().rol || "hermano";
            baneado = uSnap.data().baneado || false;
        }
    } catch(e) { console.error(e); }

    let ip = sessionStorage.getItem("cached_user_ip") || "Desconocido";
    let pais = sessionStorage.getItem("cached_user_country") || "Desconocido";
    if (ip === "Desconocido") {
        try {
            const res = await fetch("https://ipapi.co/json/");
            if (res.ok) {
                const ipData = await res.json();
                ip = ipData.ip || "Desconocido";
                pais = ipData.country_name || "Desconocido";
                sessionStorage.setItem("cached_user_ip", ip);
                sessionStorage.setItem("cached_user_country", pais);
            }
        } catch(e) {
            // Mute error logs for external rate limits
        }
    }

    let comunidadId = null;
    let parroquiaId = null;
    try {
        const hSnap = await getDocs(query(collection(db, "hermanos"), where("correo", "==", user.email)));
        if (!hSnap.empty) {
            const hData = hSnap.docs[0].data();
            comunidadId = hData.comunidadId || null;
            parroquiaId = hData.parroquiaId || null;
        }
    } catch(e) { console.error(e); }

    try {
        await setDoc(userDocRef, {
            correo: user.email,
            displayName: user.displayName || "Usuario",
            fecha: new Date().toISOString(),
            ip,
            pais,
            provider: user.providerData[0]?.providerId || "google.com",
            comunidadId,
            parroquiaId,
            rol,
            baneado,
            device: getDeviceDescriptor()
        }, { merge: true });
    } catch(e) { console.error("Error writing user audit:", e); }
}

function getDeviceDescriptor() {
    const ua = navigator.userAgent;
    let os = "Desconocido";
    let browser = "Desconocido";
    let type = "Escritorio";

    if (/Mobi|Android|iPhone|iPad/i.test(ua)) {
        type = "Móvil";
    }

    if (/Windows/i.test(ua)) os = "Windows";
    else if (/Android/i.test(ua)) os = "Android";
    else if (/Macintosh|Mac OS X/i.test(ua)) os = "Mac";
    else if (/iPhone|iPad|iPod/i.test(ua)) os = "iOS";
    else if (/Linux/i.test(ua)) os = "Linux";

    if (/Chrome|CriOS/i.test(ua) && !/Edge|Edg/i.test(ua)) browser = "Chrome";
    else if (/Safari/i.test(ua) && !/Chrome|CriOS/i.test(ua)) browser = "Safari";
    else if (/Firefox/i.test(ua)) browser = "Firefox";
    else if (/Edge|Edg/i.test(ua)) browser = "Edge";

    return `${type} (${os} / ${browser})`;
}

function showBannedScreen(user) {
    loginOverlay.style.display = "none";
    appContent.style.display   = "none";
    topBar.style.display       = "flex";

    const actOverlay = document.getElementById("activation-overlay");
    if (actOverlay) actOverlay.remove();
    let overlay = document.getElementById("banned-overlay");
    if (overlay) overlay.remove();

    overlay = document.createElement("div");
    overlay.id = "banned-overlay";
    overlay.className = "activation-overlay";
    overlay.style.cssText = "position:fixed; top:0; left:0; right:0; bottom:0; background:#fdf2f2; display:flex; align-items:center; justify-content:center; z-index:2000; font-family:'Segoe UI',sans-serif;";
    
    overlay.innerHTML = `
        <div class="activation-card" style="background:white; padding:30px; border-radius:8px; box-shadow:0 10px 25px rgba(220,53,69,0.08); max-width:400px; width:90%; text-align:center; border:2px solid #f5c6cb;">
            <div style="font-size:3rem; margin-bottom:12px;">🚫</div>
            <h3 style="margin-top:0; color:#dc3545;">Cuenta Bloqueada</h3>
            <p style="font-size:0.85rem; color:#666; margin-bottom:20px;">Tu usuario (${user.email}) ha sido suspendido temporal o permanentemente por el administrador del sistema.</p>
            <button id="btn-banned-logout" class="btn btn-outline" style="width:100%; border-color:#dc3545; color:#dc3545; padding:10px; cursor:pointer;">Cerrar Sesión</button>
        </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById("btn-banned-logout").addEventListener("click", () => signOut(auth));
}

function showActivationScreen(user, existingHermano) {
    loginOverlay.style.display = "none";
    appContent.style.display   = "none";
    topBar.style.display       = "flex";
    
    let overlay = document.getElementById("activation-overlay");
    if (overlay) overlay.remove();

    overlay = document.createElement("div");
    overlay.id = "activation-overlay";
    overlay.className = "activation-overlay";
    overlay.style.cssText = "position:fixed; top:0; left:0; right:0; bottom:0; background:#f8fafc; display:flex; align-items:center; justify-content:center; z-index:2000; font-family:'Segoe UI',sans-serif;";
    
    overlay.innerHTML = `
        <div class="activation-card" style="background:white; padding:30px; border-radius:8px; box-shadow:0 10px 25px rgba(0,0,0,0.05); max-width:400px; width:90%; text-align:center; border:2px solid #e2e8f0;">
            <div style="font-size:2.5rem; margin-bottom:12px;">🔑</div>
            <h3 style="margin-top:0; color:var(--primary);">Código de Activación</h3>
            <p style="font-size:0.85rem; color:#666; margin-bottom:20px;">Tu cuenta no tiene una comunidad asignada. Introduce el código de 32 caracteres suministrado por tu responsable.</p>
            <input type="text" id="activation-code-input" placeholder="Código de 32 caracteres" maxlength="32" style="width:100%; padding:10px; border:2px solid #e2e8f0; border-radius:5px; text-align:center; font-family:monospace; font-size:0.9rem; margin-bottom:12px; box-sizing:border-box; outline:none; text-transform:uppercase;">
            <div id="activation-error" style="color:#e74c3c; font-size:0.8rem; margin-bottom:12px; display:none;"></div>
            <button id="btn-activate-code" class="btn btn-primary" style="width:100%; padding:10px; cursor:pointer;">Activar Cuenta</button>
        </div>
    `;

    document.body.appendChild(overlay);

    const codeInput = document.getElementById("activation-code-input");
    const errorDiv = document.getElementById("activation-error");
    const btnActivate = document.getElementById("btn-activate-code");

    btnActivate.addEventListener("click", async () => {
        const code = codeInput.value.trim().toUpperCase();
        errorDiv.style.display = "none";

        if (code.length !== 32) {
            errorDiv.textContent = "El código debe tener exactamente 32 caracteres.";
            errorDiv.style.display = "block";
            return;
        }

        btnActivate.disabled = true;
        btnActivate.textContent = "Verificando...";

        try {
            const codeRef = doc(db, "codigos", code);
            const codeSnap = await getDoc(codeRef);

            if (!codeSnap.exists()) {
                errorDiv.textContent = "Código inválido o inexistente.";
                errorDiv.style.display = "block";
                btnActivate.disabled = false;
                btnActivate.textContent = "Activar Cuenta";
                return;
            }

            const codeData = codeSnap.data();
            if (codeData.usadoPorEmail) {
                errorDiv.textContent = "Este código ya fue utilizado por otra cuenta.";
                errorDiv.style.display = "block";
                btnActivate.disabled = false;
                btnActivate.textContent = "Activar Cuenta";
                return;
            }

            await updateDoc(codeRef, { usadoPorEmail: user.email });

            if (existingHermano) {
                await updateDoc(doc(db, "hermanos", existingHermano.id), {
                    comunidadId: codeData.comunidadId,
                    parroquiaId: codeData.parroquiaId
                });
            } else {
                await addDoc(collection(db, "hermanos"), {
                    correo: user.email,
                    primerNombre: user.displayName ? user.displayName.split(" ")[0] : "Hermano",
                    primerApellido: user.displayName ? user.displayName.split(" ").slice(1).join(" ") : "",
                    comunidadId: codeData.comunidadId,
                    parroquiaId: codeData.parroquiaId,
                    activo: true,
                    razon: "Hermano",
                    hijosCantidad: 0,
                    hijos: []
                });
            }

            allowUserAccess(user);
        } catch(err) {
            errorDiv.textContent = "Error: " + err.message;
            errorDiv.style.display = "block";
            btnActivate.disabled = false;
            btnActivate.textContent = "Activar Cuenta";
        }
    });
}

// ── Google Sign-In ────────────────────────────────
if (btnGoogle) {
    btnGoogle.addEventListener("click", async () => {
        setLoading(true);
        hideError();
        try {
            await signInWithPopup(auth, provider);
        } catch (err) {
            setLoading(false);
            if (err.code !== "auth/popup-closed-by-user" &&
                err.code !== "auth/cancelled-popup-request") {
                showError(getErrorMessage(err.code));
            }
        }
    });
}

// ── Logout ────────────────────────────────────────
if (logoutBtn) {
    logoutBtn.addEventListener("click", () => signOut(auth));
}

// ── Helpers ───────────────────────────────────────
function setLoading(state) {
    if (!btnGoogle) return;
    btnGoogle.disabled = state;
    if (googleBtnTxt) googleBtnTxt.textContent = state ? "Abriendo Google..." : "Continuar con Google";
}

function showError(msg) {
    if (loginError) { loginError.textContent = msg; loginError.classList.add("visible"); }
}

function hideError() {
    if (loginError) loginError.classList.remove("visible");
}

function getErrorMessage(code) {
    const map = {
        "auth/popup-blocked":          "El navegador bloqueo la ventana. Permite popups para este sitio.",
        "auth/network-request-failed": "Error de red. Verifica tu conexion.",
        "auth/unauthorized-domain":    "Este dominio no esta autorizado en Firebase.",
    };
    return map[code] || `Error al iniciar sesion (${code}).`;
}

// ── Export auth para otros modulos ────────────────
export { auth };

// ── Confirmación Personalizada Global ──────────────
window.customConfirm = function(title, message, options = {}) {
    const icon = options.icon || "❓";
    const isDanger = options.danger !== false;

    return new Promise((resolve) => {
        const overlay = document.createElement("div");
        overlay.style.cssText = "position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(15,23,42,0.4); backdrop-filter:blur(2px); display:flex; align-items:center; justify-content:center; z-index:9999; font-family:'Segoe UI',sans-serif;";
        
        const cardColor = isDanger ? "#dc3545" : "var(--primary, #3b82f6)";
        const cardBg = isDanger ? "#fde8e8" : "#e0f2fe";

        overlay.innerHTML = `
            <div style="background:white; padding:30px; border-radius:16px; box-shadow:0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04); max-width:400px; width:90%; text-align:center; box-sizing:border-box;">
                <div style="width:60px; height:60px; border-radius:50%; background:${cardBg}; display:flex; align-items:center; justify-content:center; margin:0 auto 15px auto; font-size:1.8rem;">
                    ${icon}
                </div>
                <h3 style="margin-top:0; margin-bottom:8px; color:#1e293b; font-size:1.25rem; font-weight:700;">${title}</h3>
                <p style="font-size:0.9rem; color:#475569; line-height:1.5; margin-bottom:24px;">${message}</p>
                <div style="display:flex; gap:12px; justify-content:center;">
                    <button id="confirm-yes-btn" style="flex:1; padding:10px 16px; background:${cardColor}; color:white; border:none; border-radius:30px; font-weight:700; font-size:0.9rem; cursor:pointer; outline:none; transition:opacity 0.2s;">Sí</button>
                    <button id="confirm-no-btn" style="flex:1; padding:10px 16px; background:#f1f5f9; color:#475569; border:1px solid #cbd5e1; border-radius:30px; font-weight:700; font-size:0.9rem; cursor:pointer; outline:none; transition:background-color 0.2s;">No</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        const yesBtn = overlay.querySelector("#confirm-yes-btn");
        const noBtn = overlay.querySelector("#confirm-no-btn");

        yesBtn.addEventListener("mouseover", () => yesBtn.style.opacity = "0.9");
        yesBtn.addEventListener("mouseout", () => yesBtn.style.opacity = "1");
        noBtn.addEventListener("mouseover", () => noBtn.style.backgroundColor = "#e2e8f0");
        noBtn.addEventListener("mouseout", () => noBtn.style.backgroundColor = "#f1f5f9");

        yesBtn.addEventListener("click", () => {
            overlay.remove();
            resolve(true);
        });

        noBtn.addEventListener("click", () => {
            overlay.remove();
            resolve(false);
        });
    });
};
