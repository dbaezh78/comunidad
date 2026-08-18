// ================================================
// AUTH.JS — Manejo de sesion y navegacion global
// ================================================
import { auth }                     from "./firebase.js";
import "./settings.js";
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

// ── Auth state ────────────────────────────────────
onAuthStateChanged(auth, (user) => {
    if (user) {
        loginOverlay.style.display = "none";
        appContent.style.display   = "block";
        topBar.style.display       = "flex";

        userInfo.textContent = user.displayName || user.email;
        if (user.photoURL) {
            userPhoto.src           = user.photoURL;
            userPhoto.style.display = "block";
        }

        // Marcar nav-link activo segun pagina actual
        const page = window.location.pathname.split("/").pop() || "index.html";
        document.querySelectorAll(".nav-link").forEach(a => {
            const href = a.getAttribute("href");
            a.classList.toggle("active", href === page || href === "./" + page);
        });

        if (!appInitialized) {
            appInitialized = true;
            window.dispatchEvent(new CustomEvent("app:ready", { detail: user }));
        }
    } else {
        loginOverlay.style.display = "flex";
        appContent.style.display   = "none";
        topBar.style.display       = "none";
        if (userPhoto) userPhoto.style.display = "none";
        appInitialized = false;
    }
});

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
