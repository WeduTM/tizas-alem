// 1. Configuración de Firebase
//    IMPORTANTE: Reemplaza estos valores con la configuración de tu propio proyecto Firebase.
//    Ve a la consola de Firebase -> Configuración del proyecto -> Tus apps -> Web
const firebaseConfig = {
    apiKey: "TU_API_KEY",
    authDomain: "TU_AUTH_DOMAIN",
    projectId: "TU_PROJECT_ID",
    storageBucket: "TU_STORAGE_BUCKET",
    messagingSenderId: "TU_MESSAGING_SENDER_ID",
    appId: "TU_APP_ID"
};

// Inicializar Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Referencias a elementos del DOM
const chalkButton = document.getElementById('chalkButton');
const buttonMessage = document.getElementById('buttonMessage');
const totalChalksSpan = document.getElementById('totalChalks');
const mostChalksClassSpan = document.getElementById('mostChalksClass');
const mostChalksCountSpan = document.getElementById('mostChalksCount');
const chalkLogUl = document.getElementById('chalkLog');

// Función para obtener la IP del usuario (con un servicio externo, cuidado con límites de uso)
async function getUserIp() {
    try {
        const response = await fetch('https://api.ipify.org?format=json');
        const data = await response.json();
        return data.ip;
    } catch (error) {
        console.error('Error al obtener la IP:', error);
        return 'unknown_ip_' + Math.random().toString(36).substr(2, 9); // Fallback
    }
}

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
        buttonMessage.textContent = '¡Ha roto una tiza!';
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

    const userIp = await getUserIp();
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
            ip: userIp,
            timestamp: now
        });

        // 3. Limpiar clics antiguos y contar IPs únicas en los últimos 5 minutos
        const tempClicksRef = db.collection('temp_clicks');
        const recentClicksSnapshot = await tempClicksRef.where('timestamp', '>=', fiveMinutesAgo).get();
        
        const uniqueIps = new Set();
        recentClicksSnapshot.forEach(doc => {
            uniqueIps.add(doc.data().ip);
        });

        // 4. Verificar si se cumplen las condiciones
        if (uniqueIps.size >= 3) {
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
                    ip: userIp, // Guarda la IP del último en pulsar para el log
                    classDate: classDate
                });
            });

            buttonMessage.textContent = '¡Felicidades! Otro asesinato ha sido registrado.';
            buttonMessage.className = 'message success';
            
            // Opcional: limpiar los clicks temporales asociados a este asesinato si queremos un reset estricto
            // Esta limpieza sería más robusta con una Cloud Function, pero se puede hacer una aproximación aquí.
            // Por ahora, el sistema de 5 minutos ya limpia implícitamente al filtrar por fecha.

        } else {
            buttonMessage.textContent = `Faltan ${3 - uniqueIps.size} personas para verificar la tiza rota. ¡Ánimo!`;
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
