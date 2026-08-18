// ================================================
// FIREBASE — Configuración compartida (módulo ES)
// Importa desde aquí en todos los demás módulos:
//   import { auth, db } from "./firebase.js";
// ================================================
import { initializeApp }  from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";
import { getAuth }        from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import { getFirestore }   from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey:            "AIzaSyAn1uzbiNanJB1weABFpXoMELGDC2I5BqU",
    authDomain:        "comunidad-94e1a.firebaseapp.com",
    projectId:         "comunidad-94e1a",
    storageBucket:     "comunidad-94e1a.firebasestorage.app",
    messagingSenderId: "136400782765",
    appId:             "1:136400782765:web:9422a468fce60990020d24"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db   = getFirestore(app);
