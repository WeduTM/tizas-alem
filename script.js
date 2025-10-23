// 1. Configuración de Firebase
// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyB2O0glIygIEGqp_Ya6BY5w_lY5OyErLuk",
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

// Referencias a elementos del DOM
const chalkButton = document.getElementById('chalkButton');
const buttonMessage = document.getElementById('buttonMessage');
const totalChalksSpan = document.getElementById('totalChalks');
const mostChalksClassSpan = document.getElementById('mostChalksClass');
const mostChalksCountSpan = document.getElementById('mostChalksCount');
const chalkLogUl = document.getElementById('chalkLog');


// --- Funciones para manejar IDs de usuario únicos (reemplaza las IPs) ---

// Función para generar un UUID (Identificador Único Universal)
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0,
            v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// Función para obtener o generar el ID de usuario desde localStorage
function getUserId() {
    let userId = localStorage.getItem('tizasAlemUserId');
    if (!userId) {
        userId = generateUUID();
        localStorage.setItem('tizasAlemUserId', userId);
    }
    return userId;
}

// --- Fin de las funciones de ID de usuario ---


// Función para verificar si estamos en horario de ALEM
function isInAlemHours() {
    const now = new Date();
    const day = now.getDay(); // 0 = Domingo, 1 = Lunes, ..., 6 = Sábado
    const hours = now.getHours();
    const minutes = now.getMinutes();

    // Martes: 12:30 a 13:30
    const isTuesday = day === 2 && (
        (hours === 12 && minutes >= 30) ||
        (hours === 13 && minutes < 30)
    );

    // Jueves: 11:30 a 13:30
    const isThursday = day === 4 && (
        (hours === 11 && minutes >= 30) ||
        (hours === 12) ||
        (hours === 13 && minutes < 30)
    );

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

// Escuchar cambios en la base de datos para actualizar contadores y logs
db.collection('stats').doc('global').onSnapshot(doc => {
    if (doc.exists) {
        const data = doc.data();
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
    }
});

db.collection('chalk_log').orderBy('timestamp', 'desc').limit(10).onSnapshot(snapshot => {
    chalkLogUl.innerHTML = ''; // Limpiar registros anteriores
    snapshot.forEach(doc => {
        const data = doc.data();
        const date = data.timestamp.toDate();
        const formattedDate = date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const formattedTime = date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        
        const listItem = document.createElement('li');
        listItem.textContent = `Otra tiza muerta ha sido registrada a las ${formattedTime} del ${formattedDate}. (Clase: ${data.classDate})`;
        chalkLogUl.appendChild(listItem);
    });
});

// Listener para el botón de la tiza
chalkButton.addEventListener('click', async () => {
    if (chalkButton.disabled) {
        buttonMessage.textContent = 'El botón está deshabilitado. No es horario de ALEM.';
        buttonMessage.className = 'message';
        return;
    }

    chalkButton.disabled = true; // Deshabilitar temporalmente para evitar spam
    buttonMessage.textContent = 'Procesando tu clic...';
    buttonMessage.className = 'message';

    const userId = getUserId(); // Obtener el ID único del usuario/navegador
    const now = firebase.firestore.Timestamp.now();
    const fiveMinutesAgo = new Date(now.toDate().getTime() - 5 * 60 * 1000); // 5 minutos en milisegundos

    try {
        // 1. Verificar si ya se ha registrado una tiza en los últimos 5 minutos
        const lastChalkDoc = await db.collection('chalk_log').orderBy('timestamp', 'desc').limit(1).get();
        if (!lastChalkDoc.empty) {
            const lastChalkTime = lastChalkDoc.docs[0].data().timestamp.toDate();
            if (now.toDate().getTime() - lastChalkTime.getTime() < 5 * 60 * 1000) {
                buttonMessage.textContent = '¡Calma! No se puede registrar más de una tiza cada 5 minutos.';
                buttonMessage.className = 'message';
                chalkButton.disabled = false;
                return;
            }
        }

        // 2. Registrar el clic del usuario en la colección temporal
        await db.collection('temp_clicks').add({
            userId: userId, // Ahora guardamos el ID de usuario
            timestamp: now
        });

        // 3. Limpiar clics antiguos y contar IDs únicos en los últimos 5 minutos
        const tempClicksRef = db.collection('temp_clicks');
        const recentClicksSnapshot = await tempClicksRef.where('timestamp', '>=', fiveMinutesAgo).get();
        
        const uniqueUserIds = new Set(); // Ahora contamos IDs de usuario únicos
        recentClicksSnapshot.forEach(doc => {
            uniqueUserIds.add(doc.data().userId);
        });

        // 4. Verificar si se cumplen las condiciones
        if (uniqueUserIds.size >= 3) { // Verificar si hay 3 o más IDs de usuario únicos
            // Eliminar los clics que ya se usaron para esta tiza, o mantenerlos por si se quiere un log de clicks
            // Para simplificar, los mantenemos y la limpieza será periódica si la implementamos en una Cloud Function
            // Por ahora, solo nos importa para el conteo de esta ejecución.

            // Incrementa el contador global y por clase
            const globalStatsRef = db.collection('stats').doc('global');
            await db.runTransaction(async (transaction) => {
                const globalDoc = await transaction.get(globalStatsRef);
                let totalChalks = (globalDoc.exists && globalDoc.data().totalChalks) || 0;
                let chalksByClass = (globalDoc.exists && globalDoc.data().chalksByClass) || {};

                totalChalks++;

                const classDate = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' });
                chalksByClass[classDate] = (chalksByClass[classDate] || 0) + 1;

                transaction.set(globalStatsRef, {
                    totalChalks: totalChalks,
                    chalksByClass: chalksByClass,
                    lastChalkTimestamp: now // Guardar el timestamp del último asesinato
                });

                // Registrar el evento de la tiza rota
                await db.collection('chalk_log').add({
                    timestamp: now,
                    userId: userId, // Guarda el ID del usuario/navegador que realizó el último clic válido
                    classDate: classDate
                });
            });

            buttonMessage.textContent = '¡Felicidades! Otra tiza ha sido asesinada.';
            buttonMessage.className = 'message success';
            
            // Opcional: limpiar los clicks temporales más antiguos (mejor con Cloud Function)
            // Por ahora, el sistema de 5 minutos ya limpia implícitamente al filtrar por fecha.

        } else {
            buttonMessage.textContent = `Faltan ${3 - uniqueUserIds.size} personas para romper la tiza. ¡Ánimo!`;
            buttonMessage.className = 'message';
        }

    } catch (error) {
        console.error('Error al romper la tiza:', error);
        buttonMessage.textContent = 'Ocurrió un error al intentar romper la tiza. Inténtalo de nuevo.';
        buttonMessage.className = 'message';
    } finally {
        chalkButton.disabled = false; // Habilitar el botón de nuevo
        // Limpiar clics temporales más antiguos que 5 minutos (esto podría hacerse con una Cloud Function para ser más eficiente y escalable)
        tempClicksRef.where('timestamp', '<', fiveMinutesAgo).get().then(snapshot => {
            snapshot.forEach(doc => {
                doc.ref.delete();
            });
        });
    }
});

// Inicializar el estado del botón al cargar la página y cada minuto
updateButtonState();
setInterval(updateButtonState, 60 * 1000); // Actualizar cada minuto
