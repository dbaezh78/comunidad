// ================================================
// AUTH.JS — Manejo de sesion y navegacion global
// ================================================
import { auth, db }                 from "./firebase.js";
import "./settings.js";
import { collection, query, where, getDocs, doc, getDoc, updateDoc, addDoc, setDoc, onSnapshot, collectionGroup } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
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

    const isCreator = user.email.toLowerCase() === "dbaezh78@gmail.com";
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
    
    // Expose globally first so it's defined
    window.userPermissions = {
        rol,
        adminTotal,
        permissions
    };

    window.hasPermission = function(permId) {
        if (isCreator || window.userPermissions.adminTotal) return true;
        return !!window.userPermissions.permissions[permId];
    };

    const setupNavigationAndLayout = () => {
        // Navigation and Routing Guards
        const currentPath = window.location.pathname.split("/").pop() || "index.html";
        const basePage = currentPath.split("?")[0].split("#")[0];

        // Page Guards
        const pageGuards = {
            "parroquia.html": () => window.hasPermission("parroquia_ver") || window.hasPermission("parroquia_consultar"),
            "catequista.html": () => window.hasPermission("catequista_ver_hilos") || window.hasPermission("catequista_ver_asignacion") || window.hasPermission("catequista_ver_catequistas"),
            "comunidad.html": () => window.hasPermission("comunidad_consultar") || window.hasPermission("comunidad_ver_hermanos"),
            "hermanos.html": () => window.hasPermission("hermanos_buscar") || window.hasPermission("hermanos_ver"),
            "realidad.html": () => window.hasPermission("realidad_ver") || window.hasPermission("realidad_consultar"),
            "itinerario.html": () => window.hasPermission("itinerario_ver"),
            "sortear.html": () => window.hasPermission("sortear_ver"),
            "gsorteo.html": () => window.hasPermission("sortear_ver"),
            "codComunidad.html": () => window.hasPermission("codigo_ver"),
            "permisos.html": () => window.hasPermission("permisos_cuenta") || window.hasPermission("permisos_acceso") || window.hasPermission("impresion_seleccion_usuario"),
            "datos.html": () => window.hasPermission("datos_ver")
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
        let html = `<span class="nav-logo" id="nav-logo-toggle" style="cursor:pointer; user-select:none;">⛪ Santa Iglesia Católica</span>`;
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
        if (window.hasPermission("realidad_ver") || window.hasPermission("realidad_consultar")) {
            html += `<a href="realidad.html" class="nav-link ${basePage === 'realidad.html' ? 'active' : ''}"><span class="nav-icon">📚</span> Realidad</a>`;
        }
        if (window.hasPermission("itinerario_ver")) {
            html += `<a href="itinerario.html" class="nav-link ${basePage === 'itinerario.html' ? 'active' : ''}"><span class="nav-icon">🗺️</span> Itinerario</a>`;
        }
        if (window.hasPermission("sortear_ver")) {
            html += `<a href="gsorteo.html" class="nav-link ${basePage === 'gsorteo.html' ? 'active' : ''}"><span class="nav-icon">📊</span> Sorteo Grupos</a>`;
        }
        if (window.hasPermission("codigo_ver")) {
            html += `<a href="codComunidad.html" class="nav-link ${basePage === 'codComunidad.html' ? 'active' : ''}"><span class="nav-icon">🔑</span> Códigos</a>`;
        }
        if (window.hasPermission("permisos_cuenta") || window.hasPermission("permisos_acceso") || window.hasPermission("impresion_seleccion_usuario")) {
            html += `<a href="permisos.html" class="nav-link ${basePage === 'permisos.html' ? 'active' : ''}"><span class="nav-icon">🛡️</span> Permisos</a>`;
        }
        if (window.hasPermission("datos_ver")) {
            html += `<a href="datos.html" class="nav-link ${basePage === 'datos.html' ? 'active' : ''}"><span class="nav-icon">📂</span> Datos</a>`;
        }
        // Sorteo Comunidad 4 removed
        
        navContainer.innerHTML = html;

        // Toggle mobile menu visibility when clicking Santa Iglesia Católica
        const toggleBtn = navContainer.querySelector("#nav-logo-toggle");
        if (toggleBtn) {
            toggleBtn.addEventListener("click", () => {
                navContainer.classList.toggle("menu-expanded");
            });
        }
    }

    // Hide cards in index.html if user lacks access
    if (basePage === "index.html" || basePage === "") {
        const cardLinks = document.querySelectorAll(".ajustes-grid-jesus > a");
        const grid = document.querySelector(".ajustes-grid-jesus");
        const jesusCard = document.getElementById("jesus-card");

        cardLinks.forEach(link => {
            const href = link.getAttribute("href");
            link.style.display = ""; // Reset visibility
            if (pageGuards[href] && !pageGuards[href]()) {
                link.style.display = "none";
            }
        });

        // Center Jesus card dynamically among visible cards
        const adjustJesusCardPosition = () => {
            if (!grid || !jesusCard) return;

            const visibleLinks = Array.from(cardLinks).filter(link => link.style.display !== "none");
            if (visibleLinks.length === 0) return;

            const gridStyle = window.getComputedStyle(grid);
            const gridTemplateColumns = gridStyle.getPropertyValue("grid-template-columns");
            const columnCount = gridTemplateColumns.split(" ").length;

            let span = 1;
            let targetIndex = Math.floor(visibleLinks.length / 2);

            if (columnCount === 4) {
                span = 2;
                targetIndex = 5; // Row 1 (4 items) + Row 2 Col 1 (1 item)
            } else if (columnCount === 3) {
                span = 1;
                targetIndex = 4; // Row 1 (3 items) + Row 2 Col 1 (1 item)
            } else if (columnCount === 2) {
                span = 2;
                targetIndex = 2; // Row 1 (2 items)
            } else {
                span = 1;
                targetIndex = Math.floor(visibleLinks.length / 2);
            }

            jesusCard.style.gridColumn = `span ${span}`;

            if (targetIndex > visibleLinks.length) {
                targetIndex = visibleLinks.length;
            }

            if (targetIndex >= visibleLinks.length) {
                grid.appendChild(jesusCard);
            } else {
                grid.insertBefore(jesusCard, visibleLinks[targetIndex]);
            }
        };

        adjustJesusCardPosition();
        window.addEventListener("resize", adjustJesusCardPosition);

        if (jesusCard) {
            jesusCard.addEventListener("click", (e) => {
                e.stopPropagation();
                
                // Remove existing bubble if any
                const existingBubble = document.getElementById("jesus-speech-bubble");
                if (existingBubble) {
                    existingBubble.remove();
                    return;
                }

                const bubble = document.createElement("div");
                bubble.id = "jesus-speech-bubble";
                bubble.style.cssText = `
                    position: absolute;
                    bottom: 115%;
                    left: 50%;
                    transform: translateX(-50%);
                    background: white;
                    border: 3px solid #eab308;
                    border-radius: 12px;
                    padding: 12px 18px;
                    width: 250px;
                    box-shadow: 0 10px 25px rgba(0,0,0,0.35);
                    z-index: 1000;
                    text-align: center;
                    font-family: 'Georgia', serif;
                    font-size: 0.92rem;
                    line-height: 1.4;
                    cursor: default;
                    animation: popIn 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                `;

                bubble.innerHTML = `
                    <span style="
                        background: linear-gradient(135deg, #fef08a 0%, #eab308 50%, #ca8a04 100%);
                        -webkit-background-clip: text;
                        -webkit-text-fill-color: transparent;
                        font-weight: 800;
                        display: block;
                    ">
                        «La paz de Cristo sea contigo, ¡Cristo ha muerto por ti!»
                    </span>
                    <!-- Cola del bocadillo -->
                    <div style="
                        position: absolute;
                        top: 100%;
                        left: 50%;
                        transform: translateX(-50%);
                        width: 0;
                        height: 0;
                        border-left: 10px solid transparent;
                        border-right: 10px solid transparent;
                        border-top: 12px solid #eab308;
                    "></div>
                `;

                // Add keyframe animation dynamically
                if (!document.getElementById("bubble-animation-style")) {
                    const style = document.createElement("style");
                    style.id = "bubble-animation-style";
                    style.innerHTML = `
                        @keyframes popIn {
                            0% { transform: translateX(-50%) scale(0.6); opacity: 0; }
                            100% { transform: translateX(-50%) scale(1); opacity: 1; }
                        }
                    `;
                    document.head.appendChild(style);
                }

                jesusCard.appendChild(bubble);

                // Auto dismiss after 4 seconds
                setTimeout(() => {
                    if (bubble.parentNode) {
                        bubble.style.transition = "opacity 0.5s";
                        bubble.style.opacity = "0";
                        setTimeout(() => bubble.remove(), 500);
                    }
                }, 5000);
            });
        }
    }

    setupPrintButton();

    if (!appInitialized) {
        appInitialized = true;
        window.dispatchEvent(new CustomEvent("app:ready", { detail: user }));
    }
}

    if (isCreator) {
        window.userPermissions.adminTotal = true;
        window.userPermissions.rol = "admin";
        setupNavigationAndLayout();
    } else {
        try {
            const uSnap = await getDoc(doc(db, "autenticados", user.email.toLowerCase()));
            if (uSnap.exists()) {
                rol = uSnap.data().rol;
                if (!rol) {
                    // Try to find default role
                    const rolesSnap = await getDocs(collection(db, "permisosRoles"));
                    rolesSnap.forEach(d => {
                        if (d.data().isDefaultRole) rol = d.id;
                    });
                    if (!rol) rol = "hermano";
                }
                window.userPermissions.rol = rol;
                window.currentUserComunidadId = uSnap.data().comunidadId || null;
            } else {
                // Try to find default role
                const rolesSnap = await getDocs(collection(db, "permisosRoles"));
                rolesSnap.forEach(d => {
                    if (d.data().isDefaultRole) rol = d.id;
                });
                window.userPermissions.rol = rol;
            }
            
            // Escuchar en tiempo real los permisos del rol del usuario
            onSnapshot(doc(db, "permisosRoles", rol), (pSnap) => {
                window.userPermissions.rol = rol;
                if (pSnap.exists()) {
                    const pData = pSnap.data();
                    window.userPermissions.adminTotal = !!pData.adminTotal;
                    window.userPermissions.permissions = pData.permissions || {};
                } else {
                    window.userPermissions.adminTotal = false;
                    window.userPermissions.permissions = {};
                }
                
                setupNavigationAndLayout();
                
                window.dispatchEvent(new CustomEvent("permissions:updated", { detail: window.userPermissions }));
                
                if (typeof window.enforcePermissions === "function") {
                    window.enforcePermissions();
                } else if (typeof enforcePermissions === "function") {
                    enforcePermissions();
                }
            });
        } catch(e) {
            console.error("Error setting up realtime permissions:", e);
            setupNavigationAndLayout();
        }
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
        } else {
            // Find which group has been set as default in DB
            const rolesSnap = await getDocs(collection(db, "permisosRoles"));
            let dbDefault = null;
            rolesSnap.forEach(d => {
                if (d.data().isDefaultRole) dbDefault = d.id;
            });
            if (dbDefault) {
                rol = dbDefault;
            }
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
        <div id="activation-card-content" class="activation-card" style="background:white; padding:30px; border-radius:8px; box-shadow:0 10px 25px rgba(0,0,0,0.05); max-width:400px; width:90%; border:2px solid #e2e8f0; box-sizing:border-box;">
            <!-- Paso 1: Introducir Código -->
            <div id="step-code-container" style="text-align:center;">
                <div style="font-size:2.5rem; margin-bottom:12px;">🔑</div>
                <h3 style="margin-top:0; color:var(--primary);">Código de Activación</h3>
                <p style="font-size:0.85rem; color:#666; margin-bottom:20px;">Tu cuenta no tiene una comunidad asignada. Introduce el código de 32 caracteres suministrado por tu responsable.</p>
                <input type="text" id="activation-code-input" placeholder="Código de 32 caracteres" maxlength="32" style="width:100%; padding:10px; border:2px solid #e2e8f0; border-radius:5px; text-align:center; font-family:monospace; font-size:0.9rem; margin-bottom:12px; box-sizing:border-box; outline:none; text-transform:uppercase;">
                <div id="activation-error" style="color:#e74c3c; font-size:0.8rem; margin-bottom:12px; display:none;"></div>
                <button id="btn-activate-code" class="btn btn-primary" style="width:100%; padding:10px; cursor:pointer;">Continuar</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    const cardContent = document.getElementById("activation-card-content");
    const codeInput = document.getElementById("activation-code-input");
    const errorDiv = document.getElementById("activation-error");
    const btnActivate = document.getElementById("btn-activate-code");

    let validatedCode = "";
    let codeData = null;

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
                btnActivate.textContent = "Continuar";
                return;
            }

            codeData = codeSnap.data();
            if (codeData.usadoPorEmail) {
                errorDiv.textContent = "Este código ya fue utilizado por otra cuenta.";
                errorDiv.style.display = "block";
                btnActivate.disabled = false;
                btnActivate.textContent = "Continuar";
                return;
            }

            validatedCode = code;
            showPhoneVerificationStep();
        } catch(err) {
            errorDiv.textContent = "Error: " + err.message;
            errorDiv.style.display = "block";
            btnActivate.disabled = false;
            btnActivate.textContent = "Continuar";
        }
    });

    function formatPhoneNumber(value) {
        if (!value) return value;
        const phoneNumber = value.replace(/[^\d]/g, '');
        const phoneNumberLength = phoneNumber.length;
        if (phoneNumberLength < 4) return phoneNumber;
        if (phoneNumberLength < 7) {
            return `(${phoneNumber.slice(0, 3)}) ${phoneNumber.slice(3)}`;
        }
        return `(${phoneNumber.slice(0, 3)}) ${phoneNumber.slice(3, 6)}-${phoneNumber.slice(6, 10)}`;
    }

    function showPhoneVerificationStep() {
        cardContent.innerHTML = `
            <div id="step-phone-container" style="text-align:center;">
                <div style="font-size:2.5rem; margin-bottom:12px;">📱</div>
                <h3 style="margin-top:0; color:var(--primary);">Identificación de Cuenta</h3>
                <p style="font-size:0.9rem; color:#475569; margin-bottom:20px; line-height:1.5;">Vamos a identificar si ya tu cuenta ha sido creada. Para eso, digita tu número de teléfono:</p>
                <input type="tel" id="activation-phone-input" placeholder="(809) 123-4567" maxlength="14" style="width:100%; padding:10px; border:2px solid #e2e8f0; border-radius:5px; text-align:center; font-size:1.1rem; margin-bottom:12px; box-sizing:border-box; outline:none;">
                <div id="phone-error" style="color:#e74c3c; font-size:0.8rem; margin-bottom:12px; display:none;"></div>
                <button id="btn-verify-phone" class="btn btn-primary" style="width:100%; padding:10px; cursor:pointer;">Verificar</button>
            </div>
        `;

        const phoneInput = document.getElementById("activation-phone-input");
        const phoneError = document.getElementById("phone-error");
        const btnVerify = document.getElementById("btn-verify-phone");

        phoneInput.addEventListener("input", (e) => {
            e.target.value = formatPhoneNumber(e.target.value);
        });

        btnVerify.addEventListener("click", async () => {
            const rawPhone = phoneInput.value.trim();
            phoneError.style.display = "none";

            const cleanPhone = rawPhone.replace(/\D/g, "");
            if (!cleanPhone || cleanPhone.length < 7) {
                phoneError.textContent = "Introduce un número de teléfono válido.";
                phoneError.style.display = "block";
                return;
            }

            btnVerify.disabled = true;
            btnVerify.textContent = "Buscando...";

            try {
                const hSnap = await getDocs(collection(db, "hermanos"));
                let matchedHermano = null;
                hSnap.forEach(docSnap => {
                    const data = docSnap.data();
                    const cleanDbPhone = (data.telefono || "").replace(/\D/g, "");
                    if (cleanDbPhone && cleanDbPhone === cleanPhone) {
                        matchedHermano = { id: docSnap.id, ...data };
                    }
                });

                if (matchedHermano) {
                    showMatchConfirmationStep(matchedHermano, cleanPhone);
                } else {
                    showNewHermanoFormStep(cleanPhone);
                }
            } catch(err) {
                phoneError.textContent = "Error: " + err.message;
                phoneError.style.display = "block";
                btnVerify.disabled = false;
                btnVerify.textContent = "Verificar";
            }
        });
    }

    function showMatchConfirmationStep(hermano, cleanPhone) {
        const fullName = `${hermano.primerNombre} ${hermano.segundoNombre || ""} ${hermano.primerApellido} ${hermano.segundoApellido || ""}`.replace(/\s+/g, ' ').trim();
        cardContent.innerHTML = `
            <div id="step-confirm-container" style="text-align:center;">
                <div style="font-size:2.5rem; margin-bottom:12px;">👤</div>
                <h3 style="margin-top:0; color:var(--primary);">¿Eres tú?</h3>
                <p style="font-size:0.9rem; color:#334155; margin-bottom:8px; font-weight:600;">Se encontró un registro coincidente:</p>
                <div style="background:#f1f5f9; padding:12px; border-radius:6px; margin-bottom:20px; text-align:left;">
                    <div style="font-size:0.8rem; color:#64748b; font-weight:600;">Nombre:</div>
                    <div style="font-size:1rem; font-weight:700; color:#1e293b; margin-bottom:6px;">${fullName}</div>
                    <div style="font-size:0.8rem; color:#64748b; font-weight:600;">Teléfono:</div>
                    <div style="font-size:0.95rem; font-weight:600; color:#1e293b;">${hermano.telefono}</div>
                </div>
                <div id="confirm-error" style="color:#e74c3c; font-size:0.8rem; margin-bottom:12px; display:none;"></div>
                <div style="display:flex; gap:10px;">
                    <button id="btn-confirm-yes" class="btn btn-primary" style="flex:1; padding:10px; cursor:pointer;">Sí, soy yo</button>
                    <button id="btn-confirm-no" class="btn btn-outline" style="flex:1; padding:10px; cursor:pointer;">No soy yo</button>
                </div>
            </div>
        `;

        const btnYes = document.getElementById("btn-confirm-yes");
        const btnNo = document.getElementById("btn-confirm-no");
        const confirmError = document.getElementById("confirm-error");

        btnYes.addEventListener("click", async () => {
            btnYes.disabled = true;
            btnNo.disabled = true;
            btnYes.textContent = "Vinculando...";

            try {
                const hDocRef = doc(db, "hermanos", hermano.id);
                await updateDoc(hDocRef, {
                    correo: user.email,
                    comunidadId: codeData.comunidadId,
                    parroquiaId: codeData.parroquiaId
                });

                const codeRef = doc(db, "codigos", validatedCode);
                await updateDoc(codeRef, { usadoPorEmail: user.email });

                allowUserAccess(user);
            } catch(err) {
                confirmError.textContent = "Error: " + err.message;
                confirmError.style.display = "block";
                btnYes.disabled = false;
                btnNo.disabled = false;
                btnYes.textContent = "Sí, soy yo";
            }
        });

        btnNo.addEventListener("click", () => {
            showNewHermanoFormStep(cleanPhone);
        });
    }

    function showNewHermanoFormStep(cleanPhone) {
        cardContent.innerHTML = `
            <div id="step-register-container" style="text-align:left;">
                <h3 style="margin-top:0; color:var(--primary); text-align:center;">Crear Nuevo Registro</h3>
                <p style="font-size:0.82rem; color:#666; margin-bottom:16px; text-align:center;">No encontramos un hermano con tu teléfono. Registra tus datos para esta comunidad.</p>
                
                <div style="margin-bottom:10px;">
                    <label style="font-size:0.78rem; font-weight:700; color:#475569; display:block; margin-bottom:4px;">Primer Nombre *</label>
                    <input type="text" id="reg-primer-nombre" placeholder="Obligatorio" style="width:100%; padding:8px; border:1px solid #cbd5e1; border-radius:4px; font-size:0.88rem; box-sizing:border-box; outline:none;">
                </div>
                <div style="margin-bottom:10px;">
                    <label style="font-size:0.78rem; font-weight:700; color:#475569; display:block; margin-bottom:4px;">Segundo Nombre</label>
                    <input type="text" id="reg-segundo-nombre" placeholder="Opcional" style="width:100%; padding:8px; border:1px solid #cbd5e1; border-radius:4px; font-size:0.88rem; box-sizing:border-box; outline:none;">
                </div>
                <div style="margin-bottom:10px;">
                    <label style="font-size:0.78rem; font-weight:700; color:#475569; display:block; margin-bottom:4px;">Primer Apellido *</label>
                    <input type="text" id="reg-primer-apellido" placeholder="Obligatorio" style="width:100%; padding:8px; border:1px solid #cbd5e1; border-radius:4px; font-size:0.88rem; box-sizing:border-box; outline:none;">
                </div>
                <div style="margin-bottom:12px;">
                    <label style="font-size:0.78rem; font-weight:700; color:#475569; display:block; margin-bottom:4px;">Segundo Apellido</label>
                    <input type="text" id="reg-segundo-apellido" placeholder="Opcional" style="width:100%; padding:8px; border:1px solid #cbd5e1; border-radius:4px; font-size:0.88rem; box-sizing:border-box; outline:none;">
                </div>
                
                <div style="background:#f8fafc; border:1px solid #e2e8f0; padding:10px; border-radius:4px; margin-bottom:15px; font-size:0.8rem;">
                    <div style="color:#64748b; font-weight:600; margin-bottom:4px;">Datos de Cuenta a Vincular:</div>
                    <div style="color:#334155; font-weight:600;">📧 Correo: <span style="font-weight:400;">${user.email}</span></div>
                    <div style="color:#334155; font-weight:600;">📞 Teléfono: <span style="font-weight:400;">${cleanPhone}</span></div>
                </div>

                <div id="reg-error" style="color:#e74c3c; font-size:0.8rem; margin-bottom:12px; display:none; text-align:center;"></div>
                <button id="btn-save-register" class="btn btn-primary" style="width:100%; padding:10px; cursor:pointer; font-weight:700;">Completar Registro y Entrar</button>
            </div>
        `;

        const btnSave = document.getElementById("btn-save-register");
        const regError = document.getElementById("reg-error");

        btnSave.addEventListener("click", async () => {
            const pNombre = document.getElementById("reg-primer-nombre").value.trim();
            const sNombre = document.getElementById("reg-segundo-nombre").value.trim();
            const pApellido = document.getElementById("reg-primer-apellido").value.trim();
            const sApellido = document.getElementById("reg-segundo-apellido").value.trim();

            regError.style.display = "none";

            if (!pNombre || !pApellido) {
                regError.textContent = "El Primer Nombre y Primer Apellido son obligatorios.";
                regError.style.display = "block";
                return;
            }

            btnSave.disabled = true;
            btnSave.textContent = "Registrando...";

            try {
                await addDoc(collection(db, "hermanos"), {
                    correo: user.email,
                    telefono: cleanPhone,
                    primerNombre: pNombre,
                    segundoNombre: sNombre,
                    primerApellido: pApellido,
                    segundoApellido: sApellido,
                    comunidadId: codeData.comunidadId,
                    parroquiaId: codeData.parroquiaId,
                    activo: true,
                    razon: "Hermano",
                    hijosCantidad: 0,
                    hijos: []
                });

                const codeRef = doc(db, "codigos", validatedCode);
                await updateDoc(codeRef, { usadoPorEmail: user.email });

                allowUserAccess(user);
            } catch(err) {
                regError.textContent = "Error: " + err.message;
                regError.style.display = "block";
                btnSave.disabled = false;
                btnSave.textContent = "Completar Registro y Entrar";
            }
        });
    }
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
    logoutBtn.addEventListener("click", async () => {
        const confirmLogout = await window.customConfirm(
            "Cerrar Sesión",
            "¿Estás seguro de que deseas cerrar sesión?",
            { 
                icon: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#dc3545" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>`, 
                danger: true 
            }
        );
        if (confirmLogout) {
            signOut(auth);
        }
    });
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

function setupPrintButton() {
    const btnAjustes = document.getElementById("btn-ajustes");
    if (btnAjustes && !document.getElementById("btn-print")) {
        const btnPrint = document.createElement("button");
        btnPrint.id = "btn-print";
        btnPrint.className = "btn-outline";
        btnPrint.innerHTML = "🖨️";
        btnAjustes.parentNode.insertBefore(btnPrint, btnAjustes.nextSibling);

        btnPrint.addEventListener("click", async () => {
            const page = window.location.pathname.split("/").pop() || "index.html";
            const config = printConfigs[page];
            if (!config) {
                // Fallback page print if no config
                window.print();
                return;
            }

            const availableColumns = config.columns.filter(col => {
                if (!window.hasPermission) return true;
                return window.hasPermission(col.id);
            });

            if (availableColumns.length === 0) {
                availableColumns.push(...config.columns.filter(c => c.default));
            }

            let savedSelection = null;
            try {
                const stored = localStorage.getItem(`user_print_col_selection_${page}`);
                if (stored) savedSelection = JSON.parse(stored);
            } catch (e) {}

            if (savedSelection && Array.isArray(savedSelection)) {
                availableColumns.sort((a, b) => {
                    const idxA = savedSelection.indexOf(a.id);
                    const idxB = savedSelection.indexOf(b.id);
                    if (idxA === -1 && idxB === -1) return 0;
                    if (idxA === -1) return 1;
                    if (idxB === -1) return -1;
                    return idxA - idxB;
                });
            }

            showPrintSelectionModal(availableColumns, config, page);
        });
    }
}

function showPrintSelectionModal(availableColumns, config, page) {
    const overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(15,23,42,0.4); backdrop-filter:blur(2px); display:flex; align-items:center; justify-content:center; z-index:9999; font-family:'Segoe UI',sans-serif;";

    let savedSelection = null;
    try {
        const stored = localStorage.getItem(`user_print_col_selection_${page}`);
        if (stored) savedSelection = JSON.parse(stored);
    } catch (e) {}

    let sortChain = { ...config.defaultSortChain };

    overlay.innerHTML = `
        <div style="background:white; padding:25px; border-radius:16px; box-shadow:0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04); max-width:480px; width:90%; box-sizing:border-box;">
            <h3 style="margin-top:0; margin-bottom:15px; color:#1e293b; font-size:1.2rem; font-weight:700; border-bottom:1px solid #e2e8f0; padding-bottom:10px;">🖨️ Selección de Impresión</h3>
            
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:0.9rem; color:#475569; user-select:none; font-weight:600;">
                    <input type="checkbox" id="print-select-all-cb" style="width:18px; height:18px;">
                    <span>Seleccionar Todos</span>
                </label>
                <button id="print-default-btn" style="padding:6px 12px; background:#f1f5f9; color:#475569; border:1px solid #cbd5e1; border-radius:20px; font-weight:600; font-size:0.8rem; cursor:pointer; outline:none;">Valores por Defecto</button>
            </div>

            <div style="font-size:0.75rem; color:#64748b; margin-bottom:10px; font-weight:600;">* Arrastra las columnas para ordenar la impresión. Usa las flechas ▲/▼ para ordenar los datos por prioridad.</div>

            <div id="print-checkbox-list" style="max-height:300px; overflow-y:auto; margin-bottom:20px; padding-right:5px;">
                <!-- Checkboxes injected dynamically -->
            </div>
            
            <div style="display:flex; gap:12px; justify-content:flex-end; border-top:1px solid #e2e8f0; padding-top:15px;">
                <button id="print-cancel-btn" style="padding:8px 16px; background:#f1f5f9; color:#475569; border:1px solid #cbd5e1; border-radius:30px; font-weight:700; font-size:0.9rem; cursor:pointer; outline:none;">Cancelar</button>
                <button id="print-now-btn" style="padding:8px 16px; background:var(--primary, #3b82f6); color:white; border:none; border-radius:30px; font-weight:700; font-size:0.9rem; cursor:pointer; outline:none; display:flex; align-items:center; gap:6px;">Imprimir</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    const listDiv = overlay.querySelector("#print-checkbox-list");
    const selectAllCb = overlay.querySelector("#print-select-all-cb");

    const syncCheckedState = () => {
        const checkboxes = overlay.querySelectorAll(".print-col-cb");
        const checkedSet = new Set();
        checkboxes.forEach(cb => {
            if (cb.checked) checkedSet.add(cb.dataset.id);
        });
        savedSelection = availableColumns.map(c => c.id).filter(id => checkedSet.has(id));
    };

    const renderCheckboxList = () => {
        listDiv.innerHTML = "";
        availableColumns.forEach((col, index) => {
            const isChecked = savedSelection ? savedSelection.includes(col.id) : col.default;
            const dir = sortChain[col.id] || "asc";
            const sortIcon = dir === "asc" ? "▲" : "▼";
            const sortColor = "var(--primary, #3b82f6)";

            const item = document.createElement("div");
            item.draggable = true;
            item.style.cssText = "display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; background:#f8fafc; padding:8px 12px; border-radius:8px; border:1px solid #e2e8f0; cursor:grab;";
            item.innerHTML = `
                <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:0.9rem; color:#334155; user-select:none; flex:1; margin:0;">
                    <input type="checkbox" class="print-col-cb" data-id="${col.id}" ${isChecked ? "checked" : ""} style="width:18px; height:18px;">
                    <span>${col.label}</span>
                </label>
                <div style="display:flex; gap:12px; align-items:center;">
                    <button class="sort-priority-btn" data-id="${col.id}" style="background:transparent; border:none; cursor:pointer; font-size:1.1rem; color:${sortColor}; padding:2px 6px; font-weight:bold; width:28px; text-align:center;">${sortIcon}</button>
                </div>
            `;

            item.addEventListener("dragstart", (e) => {
                e.dataTransfer.setData("text/plain", index);
                item.style.opacity = "0.5";
            });
            item.addEventListener("dragend", () => {
                item.style.opacity = "1";
            });
            item.addEventListener("dragover", (e) => {
                e.preventDefault();
            });
            item.addEventListener("drop", (e) => {
                e.preventDefault();
                const fromIdx = parseInt(e.dataTransfer.getData("text/plain"));
                if (fromIdx !== index) {
                    syncCheckedState();
                    const draggedItem = availableColumns.splice(fromIdx, 1)[0];
                    availableColumns.splice(index, 0, draggedItem);
                    renderCheckboxList();
                }
            });

            let touchStartY = 0;
            item.addEventListener("touchstart", (e) => {
                touchStartY = e.touches[0].clientY;
            }, { passive: true });
            item.addEventListener("touchend", (e) => {
                const touchEndY = e.changedTouches[0].clientY;
                const diffY = touchEndY - touchStartY;
                if (Math.abs(diffY) > 25) {
                    syncCheckedState();
                    const targetOffset = diffY > 0 ? 1 : -1;
                    const toIdx = Math.max(0, Math.min(availableColumns.length - 1, index + targetOffset));
                    if (index !== toIdx) {
                        const draggedItem = availableColumns.splice(index, 1)[0];
                        availableColumns.splice(toIdx, 0, draggedItem);
                        renderCheckboxList();
                    }
                }
            });

            listDiv.appendChild(item);
        });

        listDiv.querySelectorAll(".sort-priority-btn").forEach(btn => {
            btn.addEventListener("click", (e) => {
                e.preventDefault();
                const colId = btn.dataset.id;
                const currentDir = sortChain[colId] || "asc";
                sortChain[colId] = currentDir === "asc" ? "desc" : "asc";
                syncCheckedState();
                renderCheckboxList();
            });
        });
    };

    renderCheckboxList();

    selectAllCb.addEventListener("change", () => {
        const state = selectAllCb.checked;
        overlay.querySelectorAll(".print-col-cb").forEach(cb => cb.checked = state);
    });

    overlay.querySelector("#print-default-btn").addEventListener("click", (e) => {
        e.preventDefault();
        availableColumns.sort((a, b) => {
            const indexA = config.columns.findIndex(c => c.id === a.id);
            const indexB = config.columns.findIndex(c => c.id === b.id);
            return indexA - indexB;
        });
        sortChain = { ...config.defaultSortChain };
        savedSelection = null;
        renderCheckboxList();
        selectAllCb.checked = false;
    });

    overlay.querySelector("#print-cancel-btn").addEventListener("click", () => overlay.remove());
    overlay.querySelector("#print-now-btn").addEventListener("click", async () => {
        const checkedCols = [];
        const checkedIds = [];
        overlay.querySelectorAll(".print-col-cb").forEach(cb => {
            if (cb.checked) {
                const colId = cb.dataset.id;
                checkedIds.push(colId);
                const orig = availableColumns.find(c => c.id === colId);
                if (orig) checkedCols.push(orig);
            }
        });
        
        try {
            localStorage.setItem(`user_print_col_selection_${page}`, JSON.stringify(checkedIds));
        } catch (e) {}

        if (checkedCols.length === 0) {
            alert("Debes seleccionar al menos una columna para imprimir.");
            return;
        }

        const printNowBtn = overlay.querySelector("#print-now-btn");
        printNowBtn.disabled = true;
        printNowBtn.textContent = "Cargando...";

        // 1. Fetch data
        let allData = [];
        try {
            allData = await config.getData();
        } catch (e) {
            console.error("Error loading print data:", e);
        }

        // 2. Fetch cache if missing
        window.cachedParroquias = window.cachedParroquias || {};
        if (Object.keys(window.cachedParroquias).length === 0) {
            try {
                const pSnap = await getDocs(collection(db, "parroquias"));
                pSnap.forEach(d => { window.cachedParroquias[d.id] = d.data().nombre; });
            } catch(e) {}
        }
        window.cachedComunidades = window.cachedComunidades || {};
        if (Object.keys(window.cachedComunidades).length === 0) {
            try {
                const cSnap = await getDocs(collectionGroup(db, "comunidades"));
                cSnap.forEach(d => { window.cachedComunidades[d.id] = `Comunidad ${d.data().numero || d.id}`; });
            } catch(e) {}
        }

        // 3. Multi-column sort
        allData.sort((a, b) => {
            for (let i = 0; i < checkedCols.length; i++) {
                const col = checkedCols[i];
                const dir = sortChain[col.id] || "asc";
                const comp = config.sortComparator(a, b, col.id, dir);
                if (comp !== 0) return comp;
            }
            return 0;
        });

        overlay.remove();
        executePrint(checkedCols, allData, config);
    });

    // Auto-focus the "Imprimir" button and add Escape key listener to close modal
    setTimeout(() => {
        const btnPrintNow = overlay.querySelector("#print-now-btn");
        if (btnPrintNow) btnPrintNow.focus();
    }, 50);

    const escListener = (e) => {
        if (e.key === "Escape") {
            overlay.remove();
            window.removeEventListener("keydown", escListener);
        }
    };
    window.addEventListener("keydown", escListener);
}

function executePrint(selectedColumns, allData, config) {
    if (!allData || allData.length === 0) {
        alert("No hay datos para imprimir.");
        return;
    }

    const titleText = document.title || "Directorio";
    const userCommunityName = window.currentUserComunidadId ? (window.cachedComunidades[window.currentUserComunidadId] || "") : "";
    const printTitle = userCommunityName ? `${titleText} - ${userCommunityName}` : `${titleText} - Santa Iglesia Católica`;

    const win = window.open("", "_blank");
    if (!win) {
        alert("Por favor, permite las ventanas emergentes para poder imprimir.");
        return;
    }

    let headersHtml = "";
    selectedColumns.forEach(col => {
        headersHtml += `<th style="border: 1px solid #cbd5e1; padding: 10px; background-color: #f8fafc; text-align: left; font-size: 0.9rem; font-weight: 700; color: #1e293b;">${col.label}</th>`;
    });

    let rowsHtml = "";
    allData.forEach(item => {
        rowsHtml += `<tr>`;
        const cells = config.rowMapper(item, selectedColumns, allData);
        cells.forEach(val => {
            rowsHtml += `<td style="border: 1px solid #cbd5e1; padding: 10px; font-size: 0.85rem; color: #334155;">${val}</td>`;
        });
        rowsHtml += `</tr>`;
    });

    win.document.write(`
        <html>
        <head>
            <title>${printTitle}</title>
            <style>
                body { font-family: "Segoe UI", sans-serif; margin: 20px; color: #1e293b; }
                h2 { text-align: center; margin-bottom: 20px; }
                table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                @media print {
                    button { display: none; }
                    body { margin: 0; }
                }
            </style>
        </head>
        <body>
            <h2>${printTitle}</h2>
            <table>
                <thead>
                    <tr>${headersHtml}</tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                </tbody>
            </table>
            <script>
                window.onload = function() {
                    window.print();
                    window.close();
                };
            </script>
        </body>
        </html>
    `);
    win.document.close();
}

window.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") {
        const btnPrint = document.getElementById("btn-print");
        if (btnPrint) {
            e.preventDefault();
            btnPrint.click();
        }
    }
});

const printConfigs = {
    "hermanos.html": {
        columns: [
            { id: "impresion_parroquia", label: "Parroquia", default: true },
            { id: "impresion_comunidad", label: "Comunidad", default: true },
            { id: "impresion_nombre_completo", label: "Nombre y apellido", default: true },
            { id: "impresion_fecha_nac", label: "Fecha nacimiento", default: true },
            { id: "impresion_telefono", label: "Teléfono", default: true },
            { id: "impresion_pareja", label: "Pareja", default: false },
            { id: "impresion_carisma", label: "Carisma", default: false },
            { id: "impresion_activo", label: "Activo", default: false },
            { id: "impresion_sexo", label: "Sexo", default: false },
            { id: "impresion_razon", label: "Razón", default: false },
            { id: "impresion_estado_civil", label: "Estado Civil", default: false },
            { id: "impresion_correo", label: "Correo", default: false },
            { id: "impresion_direccion", label: "Dirección", default: false },
            { id: "impresion_hijos_cant", label: "Cantidad de hijos", default: false },
            { id: "impresion_hijos_nombres", label: "Nombres hijos", default: false }
        ],
        getData: async () => {
            if (window.currentPrintedHermanos && window.currentPrintedHermanos.length > 0) {
                return [...window.currentPrintedHermanos];
            }
            const snap = await getDocs(collection(db, "hermanos"));
            const list = [];
            snap.forEach(d => {
                const item = d.data();
                item.id = d.id;
                list.push(item);
            });
            return list;
        },
        rowMapper: (h, selectedCols, allData) => {
            return selectedCols.map(col => {
                if (col.id === "impresion_activo") return h.activo === false ? "Inactivo" : "Activo";
                if (col.id === "impresion_parroquia") return window.cachedParroquias[h.parroquiaId] || "—";
                if (col.id === "impresion_comunidad") return window.cachedComunidades[h.comunidadId] || "—";
                if (col.id === "impresion_sexo") return h.sexo || "—";
                if (col.id === "impresion_nombre_completo") return `${h.primerNombre} ${h.segundoNombre||""} ${h.primerApellido} ${h.segundoApellido||""}`.replace(/\s+/g, ' ').trim();
                if (col.id === "impresion_fecha_nac") return h.fechaNacimiento ? new Date(h.fechaNacimiento + "T00:00:00").toLocaleDateString("es-DO", {day:"2-digit",month:"2-digit",year:"numeric"}) : "—";
                if (col.id === "impresion_pareja") {
                    const spouse = allData.find(s => s.id === h.esposoId);
                    return spouse ? `${spouse.primerNombre} ${spouse.primerApellido}` : "Soltero/a";
                }
                if (col.id === "impresion_carisma") return (h.carismas || []).join(", ") || "—";
                if (col.id === "impresion_razon") return h.razon || "—";
                if (col.id === "impresion_estado_civil") return h.estadoCivil || "—";
                if (col.id === "impresion_correo") return h.correo || "—";
                if (col.id === "impresion_telefono") return h.telefono || "—";
                if (col.id === "impresion_direccion") return h.direccion || "—";
                if (col.id === "impresion_hijos_cant") return h.hijos?.length || h.hijosCantidad || 0;
                if (col.id === "impresion_hijos_nombres") return (h.hijos || []).map(hj => hj.nombre).join(", ") || "—";
                return "—";
            });
        },
        defaultSortChain: {
            impresion_parroquia: "asc",
            impresion_comunidad: "asc",
            impresion_nombre_completo: "asc",
            impresion_fecha_nac: "asc",
            impresion_telefono: "asc"
        },
        sortComparator: (a, b, colId, dir) => {
            let valA = "", valB = "";
            if (colId === "impresion_parroquia") {
                valA = window.cachedParroquias[a.parroquiaId] || "";
                valB = window.cachedParroquias[b.parroquiaId] || "";
            } else if (colId === "impresion_comunidad") {
                valA = window.cachedComunidades[a.comunidadId] || "";
                valB = window.cachedComunidades[b.comunidadId] || "";
            } else if (colId === "impresion_nombre_completo") {
                valA = `${a.primerNombre} ${a.primerApellido}`.toLowerCase();
                valB = `${b.primerNombre} ${b.primerApellido}`.toLowerCase();
            } else if (colId === "impresion_telefono") {
                valA = a.telefono || "";
                valB = b.telefono || "";
            } else if (colId === "impresion_fecha_nac") {
                valA = a.fechaNacimiento || "";
                valB = b.fechaNacimiento || "";
            } else if (colId === "impresion_activo") {
                valA = a.activo === false ? "inactivo" : "activo";
                valB = b.activo === false ? "inactivo" : "activo";
            } else if (colId === "impresion_sexo") {
                valA = a.sexo || "";
                valB = b.sexo || "";
            } else if (colId === "impresion_razon") {
                valA = a.razon || "";
                valB = b.razon || "";
            } else if (colId === "impresion_estado_civil") {
                valA = a.estadoCivil || "";
                valB = b.estadoCivil || "";
            } else if (colId === "impresion_correo") {
                valA = a.correo || "";
                valB = b.correo || "";
            } else if (colId === "impresion_direccion") {
                valA = a.direccion || "";
                valB = b.direccion || "";
            }
            return valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' }) * (dir === "asc" ? 1 : -1);
        }
    },
    "parroquia.html": {
        columns: [
            { id: "nombre", label: "Nombre", default: true },
            { id: "parroco", label: "Párroco", default: true },
            { id: "telefono", label: "Teléfono", default: true },
            { id: "pais", label: "País", default: true },
            { id: "direccion", label: "Dirección", default: true }
        ],
        getData: async () => {
            if (window.currentPrintedParroquias && window.currentPrintedParroquias.length > 0) {
                return [...window.currentPrintedParroquias];
            }
            if (window.todasParroquias && window.todasParroquias.length > 0) {
                return [...window.todasParroquias];
            }
            const snap = await getDocs(collection(db, "parroquias"));
            const list = [];
            snap.forEach(d => {
                const item = d.data();
                item.id = d.id;
                list.push(item);
            });
            return list;
        },
        rowMapper: (p, selectedCols) => {
            return selectedCols.map(col => p[col.id] || "—");
        },
        defaultSortChain: { nombre: "asc" },
        sortComparator: (a, b, colId, dir) => {
            const valA = String(a[colId] || "").toLowerCase();
            const valB = String(b[colId] || "").toLowerCase();
            return valA.localeCompare(valB, undefined, { numeric: true }) * (dir === "asc" ? 1 : -1);
        }
    },
    "comunidad.html": {
        columns: [
            { id: "parroquiaNombre", label: "Parroquia", default: true },
            { id: "numero", label: "Comunidad", default: true },
            { id: "etapaNombre", label: "Etapa", default: true },
            { id: "catequistaNombre", label: "Catequista", default: true }
        ],
        getData: async () => {
            if (window.currentPrintedComunidades && window.currentPrintedComunidades.length > 0) {
                return [...window.currentPrintedComunidades];
            }
            if (window.todasComunidades && window.todasComunidades.length > 0) {
                return [...window.todasComunidades];
            }
            const snap = await getDocs(collectionGroup(db, "comunidades"));
            const list = [];
            snap.forEach(d => {
                const parroquiaId = d.ref.parent.parent.id;
                const pNombre = window.cachedParroquias[parroquiaId] || "Parroquia Desconocida";
                list.push({
                    id: d.id,
                    parroquiaId,
                    parroquiaNombre: pNombre,
                    ...d.data()
                });
            });
            return list;
        },
        rowMapper: (c, selectedCols) => {
            return selectedCols.map(col => {
                if (col.id === "numero") return `Comunidad ${c.numero}`;
                return c[col.id] || "—";
            });
        },
        defaultSortChain: { parroquiaNombre: "asc", numero: "asc" },
        sortComparator: (a, b, colId, dir) => {
            const valA = String(a[colId] || "").toLowerCase();
            const valB = String(b[colId] || "").toLowerCase();
            return valA.localeCompare(valB, undefined, { numeric: true }) * (dir === "asc" ? 1 : -1);
        }
    },
    "catequista.html": {
        columns: [
            { id: "nombre", label: "Catequista", default: true },
            { id: "telefono", label: "Teléfono", default: true },
            { id: "parroquia", label: "Parroquia", default: true },
            { id: "comunidad", label: "Comunidad", default: true },
            { id: "responsable", label: "Responsable", default: true }
        ],
        getData: async () => {
            if (window.currentPrintedCatequistas && window.currentPrintedCatequistas.length > 0) {
                return window.currentPrintedCatequistas.map(assoc => ({
                    id: assoc.id,
                    nombre: assoc.catName,
                    telefono: assoc.catPhone || "—",
                    parroquia: assoc.parishName,
                    comunidad: assoc.comName,
                    responsable: assoc.leaderStr
                }));
            }
            let comList = window.allComunidades || [];
            let hList = window.allHermanos || [];
            if (comList.length === 0) {
                const comSnap = await getDocs(collectionGroup(db, "comunidades"));
                comSnap.forEach(d => comList.push({ id: d.id, parroquiaId: d.ref.parent.parent.id, data: d.data() }));
            }
            if (hList.length === 0) {
                const hSnap = await getDocs(collection(db, "hermanos"));
                hSnap.forEach(d => hList.push({ id: d.id, name: `${d.data().primerNombre} ${d.data().primerApellido}`, phone: d.data().telefono || "", parroquiaId: d.data().parroquiaId, comunidadId: d.data().comunidadId, data: d.data() }));
            }
            const pMap = window.cachedParroquias || {};
            const list = [];
            comList.forEach(com => {
                const catId = com.data.catequistaId;
                if (!catId) return;
                
                const leader = hList.find(h => 
                    h.comunidadId === com.id && 
                    h.parroquiaId === com.parroquiaId && 
                    h.data.razon === "Responsable" && 
                    h.data.posicionResponsable === 1
                );
                const leaderStr = leader ? `${leader.name} ${leader.phone ? `(${leader.phone})` : ""}` : "— Ninguno asignado —";
                
                list.push({
                    id: com.id,
                    nombre: com.data.catequistaNombre || "Catequista Desconocido",
                    telefono: com.data.catequistaTelefono || "—",
                    parroquia: pMap[com.parroquiaId] || "Parroquia Desconocida",
                    comunidad: `Comunidad ${com.number || com.data.numero || com.id}`,
                    responsable: leaderStr
                });
            });
            return list;
        },
        rowMapper: (cat, selectedCols) => {
            return selectedCols.map(col => cat[col.id] || "—");
        },
        defaultSortChain: { nombre: "asc", comunidad: "asc" },
        sortComparator: (a, b, colId, dir) => {
            const valA = String(a[colId] || "").toLowerCase();
            const valB = String(b[colId] || "").toLowerCase();
            return valA.localeCompare(valB, undefined, { numeric: true }) * (dir === "asc" ? 1 : -1);
        }
    },
    "realidad.html": {
        columns: [
            { id: "nombre", label: "Nombre", default: true },
            { id: "catequistaNombre", label: "Catequista", default: true },
            { id: "web", label: "Página Web", default: true },
            { id: "fecha", label: "Inspirada", default: true },
            { id: "iniciadores", label: "Iniciadores", default: true }
        ],
        getData: async () => {
            if (window.todasRealidades && window.todasRealidades.length > 0) {
                return [...window.todasRealidades];
            }
            const snap = await getDocs(collection(db, "realidades"));
            const list = [];
            snap.forEach(d => {
                const item = d.data();
                item.id = d.id;
                list.push(item);
            });
            return list;
        },
        rowMapper: (r, selectedCols) => {
            return selectedCols.map(col => {
                if (col.id === "fecha") return r.fecha ? new Date(r.fecha + "T00:00:00").toLocaleDateString("es-DO") : "—";
                return r[col.id] || "—";
            });
        },
        defaultSortChain: { nombre: "asc" },
        sortComparator: (a, b, colId, dir) => {
            const valA = String(a[colId] || "").toLowerCase();
            const valB = String(b[colId] || "").toLowerCase();
            return valA.localeCompare(valB, undefined, { numeric: true }) * (dir === "asc" ? 1 : -1);
        }
    },
    "itinerario.html": {
        columns: [
            { id: "nombre", label: "Nombre", default: true },
            { id: "detalle", label: "Detalle", default: true },
            { id: "otros", label: "Otros", default: true }
        ],
        getData: async () => {
            if (window.currentPrintedStages && window.currentPrintedStages.length > 0) {
                return [...window.currentPrintedStages];
            }
            if (window.allStages && window.allStages.length > 0) {
                return [...window.allStages];
            }
            const snap = await getDocs(collection(db, "itinerario"));
            const list = [];
            snap.forEach(d => {
                const item = d.data();
                item.id = d.id;
                list.push(item);
            });
            return list;
        },
        rowMapper: (s, selectedCols) => {
            return selectedCols.map(col => s[col.id] || "—");
        },
        defaultSortChain: { nombre: "asc" },
        sortComparator: (a, b, colId, dir) => {
            const valA = String(a[colId] || "").toLowerCase();
            const valB = String(b[colId] || "").toLowerCase();
            return valA.localeCompare(valB, undefined, { numeric: true }) * (dir === "asc" ? 1 : -1);
        }
    },
    "sortear.html": {
        columns: [
            { id: "nombre", label: "Nombre", default: true },
            { id: "seleccionado", label: "Seleccionado", default: true }
        ],
        getData: async () => {
            const list = window.todasLasPersonas || [];
            const selected = window.seleccionados || [];
            return list.map(p => ({
                id: p.id || p.nombre,
                nombre: p.nombre,
                seleccionado: selected.includes(p.nombre) ? "Sí" : "No"
            }));
        },
        rowMapper: (p, selectedCols) => {
            return selectedCols.map(col => p[col.id] || "—");
        },
        defaultSortChain: { nombre: "asc" },
        sortComparator: (a, b, colId, dir) => {
            const valA = String(a[colId] || "").toLowerCase();
            const valB = String(b[colId] || "").toLowerCase();
            return valA.localeCompare(valB, undefined, { numeric: true }) * (dir === "asc" ? 1 : -1);
        }
    }
};

window.showCustomConfirm = function(message = "La información que elimine no podrá ser recuperada.") {
    return new Promise((resolve) => {
        // Create modal overlay
        const overlay = document.createElement("div");
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.4);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            font-family: sans-serif;
        `;

        // Create modal content container
        const container = document.createElement("div");
        container.style.cssText = `
            background: white;
            padding: 30px;
            border-radius: 12px;
            width: 90%;
            max-width: 400px;
            text-align: center;
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
        `;

        container.innerHTML = `
            <img src="src/img/siren.png" alt="Alerta" style="width: 80px; height: auto; margin-bottom: 15px; display: inline-block;">
            <h3 style="margin: 0 0 10px 0; font-size: 1.4rem; color: #1e293b; font-weight: 700;">¿Seguro que desea eliminar?</h3>
            <p style="margin: 0 0 24px 0; font-size: 0.9rem; color: #64748b; line-height: 1.4;">${message}</p>
            <div style="display: flex; justify-content: center; gap: 12px;">
                <button id="custom-confirm-cancel" style="background: #cbd5e1; color: #475569; border: none; padding: 10px 20px; font-size: 0.95rem; font-weight: 600; border-radius: 6px; cursor: pointer; min-width: 110px;">Cancelar</button>
                <button id="custom-confirm-yes" style="background: #d0003c; color: white; border: none; padding: 10px 20px; font-size: 0.95rem; font-weight: 600; border-radius: 6px; cursor: pointer; min-width: 110px;">Sí, eliminar!</button>
            </div>
        `;

        overlay.appendChild(container);
        document.body.appendChild(overlay);

        // Cancel handler
        overlay.querySelector("#custom-confirm-cancel").addEventListener("click", () => {
            document.body.removeChild(overlay);
            resolve(false);
        });

        // Yes handler
        overlay.querySelector("#custom-confirm-yes").addEventListener("click", () => {
            document.body.removeChild(overlay);
            resolve(true);
        });

        // Click overlay background to cancel
        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) {
                document.body.removeChild(overlay);
                resolve(false);
            }
        });
    });
};

window.showAlert = function(msg, type = "info") {
    const globalAlert = document.getElementById("global-alert");
    if (!globalAlert) {
        // Fallback to basic alert if element does not exist
        alert(msg);
        return;
    }
    globalAlert.textContent = msg;
    globalAlert.className = `alert alert-${type} visible`;
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (type === "success") {
        setTimeout(() => { globalAlert.className = "alert"; }, 3500);
    }
};
