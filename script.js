// 1. Configuración de Firebase
// Importamos directamente desde las URLs de Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-analytics.js";
import { 
    getDatabase, 
    ref, 
    onValue, 
    runTransaction, 
    push, 
    serverTimestamp,
    query,
    orderByChild,
    limitToLast,
    get,
    remove
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-database.js";

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyB2O0glIygIEGqp_Ya6BY5w_lY5OyErLuk", // Nota: Es normal que esta clave sea pública.
    authDomain: "tizasalem.firebaseapp.com",
    databaseURL: "https://tizasalem-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "tizasalem",
    storageBucket: "tizasalem.firebasestorage.app",
    messagingSenderId: "1087196212689",
    appId: "1:1087196212689:web:a2c0fef78fabd5082004f0",
    measurementId: "G-Q3PBLZ3WWB"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
// INICIALIZAMOS REALTIME DATABASE
const db = getDatabase(app);

// Referencias a elementos del DOM
const chalkButton = document.getElementById('chalkButton');
const buttonMessage = document.getElementById('buttonMessage');
const totalChalksSpan = document.getElementById('totalChalks');
const mostChalksClassSpan = document.getElementById('mostChalksClass');
const mostChalksCountSpan = document.getElementById('mostChalksCount');
const chalkLogUl = document.getElementById('chalkLog');


// --- Funciones para manejar IDs de usuario únicos ---


function getUserId() {
    let userId = localStorage.getItem('tizasAlemUserId');
    if (!userId) {
        userId = crypto.randomUUID();
        localStorage.setItem('tizasAlemUserId', userId);
    }
    return userId;
}

// --- Fin de las funciones de ID de usuario ---


// Función para verificar si estamos en horario de ALEM
function isInAlemHours() {
    const now = new Date();
    const day = now.getDay();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const isTuesday = day === 2 && ((hours === 12 && minutes >= 30) || (hours === 13 && minutes < 30));
    const isThursday = day === 4 && ((hours === 11 && minutes >= 30) || (hours === 12) || (hours === 13 && minutes < 30));
    return isTuesday || isThursday;
}

// Actualiza el estado del botón y el mensaje inicial
function updateButtonState() {
    if (isInAlemHours()) {
        chalkButton.disabled = false;
        buttonMessage.textContent = '¡Hora de romper tizas!';
        buttonMessage.className = 'message success';
    } else {
        chalkButton.disabled = true;
        buttonMessage.textContent = 'El botón solo está activo durante los horarios de ALEM.';
        buttonMessage.className = 'message';
    }
}

// --- Lógica de Base de Datos ---

// Escuchar cambios en la base de datos para actualizar contadores
const globalStatsRef = ref(db, 'stats/global');
onValue(globalStatsRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
        totalChalksSpan.textContent = data.totalChalks || 0;
        
        let mostClass = 'N/A';
        let mostCount = 0;
        if (data.chalksByClass) {
            for (const className in data.chalksByClass) {
                if (data.chalksByClass[className] > mostCount) {
                    mostCount = data.chalksByClass[className];
                    mostClass = className;
                }
            }
        }
        mostChalksClassSpan.textContent = mostClass;
        mostChalksCountSpan.textContent = mostCount;
    } else {
        // Si no hay datos, resetea los contadores
        totalChalksSpan.textContent = 0;
        mostChalksClassSpan.textContent = 'N/A';
        mostChalksCountSpan.textContent = 0;
    }
});

// Escuchar cambios en el log de tizas
const chalkLogRef = ref(db, 'chalk_log');
const chalkLogQuery = query(chalkLogRef, orderByChild('timestamp'), limitToLast(10)); 

onValue(chalkLogQuery, (snapshot) => {
    chalkLogUl.innerHTML = '';
    const logs = [];
    snapshot.forEach(childSnapshot => {
        logs.push(childSnapshot.val());
    });
    // Invertimos el array para mostrar el más nuevo primero
    logs.reverse().forEach(data => {
        const date = new Date(data.timestamp);
        const formattedDate = date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const formattedTime = date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        
        const listItem = document.createElement('li');
        listItem.textContent = `Otra tiza muerta ha sido registrada a las ${formattedTime} del ${formattedDate}. (Clase: ${data.classDate})`;
        chalkLogUl.appendChild(listItem);
    });
});

// Listener para el botón de la tiza
chalkButton.addEventListener('click', async () => {
    chalkButton.disabled = true;
    buttonMessage.textContent = 'Procesando tu clic...';
    
    const userId = getUserId();
    const now = Date.now();
    const fiveMinutesAgo = now - 5 * 60 * 1000;

    try {
        const lastChalkQuery = query(chalkLogRef, orderByChild('timestamp'), limitToLast(1));
        const lastChalkSnapshot = await get(lastChalkQuery);

        if (lastChalkSnapshot.exists()) {
            let lastChalkTime;
            lastChalkSnapshot.forEach(child => {
                lastChalkTime = child.val().timestamp;
            });
            if (now - lastChalkTime < 5 * 60 * 1000) {
                buttonMessage.textContent = '¡Calma! No se puede registrar más de una tiza cada 5 minutos.';
                chalkButton.disabled = false;
                return;
            }
        }

        const tempClicksRef = ref(db, 'temp_clicks');
        await push(tempClicksRef, {
            userId: userId,
            timestamp: serverTimestamp()
        });

        const recentClicksQuery = query(tempClicksRef, orderByChild('timestamp'));
        const recentClicksSnapshot = await get(recentClicksQuery);

        const uniqueUserIds = new Set();
        recentClicksSnapshot.forEach(doc => {
            const click = doc.val();
            if (click.timestamp && click.timestamp > fiveMinutesAgo) {
                uniqueUserIds.add(click.userId);
            } else if (click.timestamp <= fiveMinutesAgo) {
                remove(doc.ref);
            }
        });

        if (uniqueUserIds.size >= 3) {
            await runTransaction(globalStatsRef, (currentData) => {
                if (!currentData) {
                    currentData = { totalChalks: 0, chalksByClass: {} };
                }
                // --- CORRECCIÓN AQUÍ: Reemplazamos "/" por "-" ---
                const classDate = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' }).replace(/\//g, '-');

                currentData.totalChalks = (currentData.totalChalks || 0) + 1;
                currentData.chalksByClass = currentData.chalksByClass || {};
                currentData.chalksByClass[classDate] = (currentData.chalksByClass[classDate] || 0) + 1;
                return currentData;
            });
            
            // --- CORRECCIÓN AQUÍ TAMBIÉN: Usamos la misma lógica para consistencia ---
            const logClassDate = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' }).replace(/\//g, '-');
            await push(chalkLogRef, {
                timestamp: serverTimestamp(),
                userId: userId,
                classDate: logClassDate
            });

            buttonMessage.textContent = '¡Felicidades! Otra tiza ha sido asesinada.';
            buttonMessage.className = 'message success';
            
            await remove(tempClicksRef);

        } else {
            buttonMessage.textContent = `Faltan ${3 - uniqueUserIds.size} personas para romper la tiza. ¡Ánimo!`;
        }

    } catch (error) {
        console.error('Error al romper la tiza:', error);
        buttonMessage.textContent = 'Ocurrió un error. Inténtalo de nuevo.';
    } finally {
        chalkButton.disabled = false;
    }
});


// Inicializar el estado del botón al cargar la página y cada minuto
updateButtonState();
setInterval(updateButtonState, 60 * 1000);
