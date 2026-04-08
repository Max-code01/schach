// spectator.js - Das ULTIMATIVE Stadion-System für Max' Server

// Speichert: Map { WebSocket => RoomID }
const spectators = new Map();

/**
 * Fügt einen Zuschauer zu einem Raum oder einem Spieler hinzu
 * @param {WebSocket} ws - Der Zuschauer
 * @param {string} target - Die Raumnummer (z.B. "room_1") oder ein Spielername
 * @param {WebSocketServer} wss - Um Spieler zu finden
 */
function addSpectator(ws, target, wss) {
    if (!target) {
        ws.send(JSON.stringify({ type: 'chat', text: '❌ Nutzung: /watch [Name oder Raum]', system: true }));
        return;
    }

    let finalRoom = target;

    // 1. Smarte Suche: Ist 'target' vielleicht ein Spielername?
    if (!target.startsWith('room_')) {
        let found = false;
        wss.clients.forEach(client => {
            if (client.playerName && client.playerName.toLowerCase() === target.toLowerCase()) {
                if (client.room) {
                    finalRoom = client.room;
                    found = true;
                }
            }
        });
        if (!found) {
            ws.send(JSON.stringify({ type: 'chat', text: `❌ Spieler "${target}" wurde nicht gefunden oder ist in keinem Spiel.`, system: true }));
            return;
        }
    }

    // 2. Zuschauer registrieren
    spectators.set(ws, finalRoom);
    ws.isSpectator = true;
    ws.spectatingRoom = finalRoom;

    // 3. Bestätigung an Zuschauer
    ws.send(JSON.stringify({ 
        type: 'chat', 
        text: `👁️ Du schaust jetzt in Raum [${finalRoom}] zu!`, 
        system: true 
    }));

    // 4. Info an die Spieler im Raum (Optional: Kannst du auskommentieren, wenn es geheim sein soll)
    const count = getSpectatorCount(finalRoom);
    broadcastToSpectators({
        type: 'chat',
        text: `📢 Ein neuer Zuschauer ist beigetreten. (Gesamt: ${count})`,
        system: true
    }, finalRoom);
}

/**
 * Entfernt einen Zuschauer (z.B. bei Logout oder /unwatch)
 */
function removeSpectator(ws) {
    if (spectators.has(ws)) {
        const room = spectators.get(ws);
        spectators.delete(ws);
        ws.isSpectator = false;
        ws.spectatingRoom = null;
        
        // Optional: Letzte Nachricht an den Zuschauer
        if (ws.readyState === 1) {
            ws.send(JSON.stringify({ type: 'chat', text: '👁️ Beobachter-Modus beendet.', system: true }));
        }
    }
}

/**
 * Sendet Daten (Züge/Bilder/Chat) NUR an die Zuschauer eines bestimmten Raums
 */
function broadcastToSpectators(data, roomID) {
    if (!roomID) return;
    const message = JSON.stringify(data);
    
    spectators.forEach((targetRoom, client) => {
        if (client.readyState === 1 && targetRoom === roomID) {
            client.send(message);
        }
    });
}

/**
 * Spezieller Zuschauer-Chat (Zuschauer können untereinander schreiben, ohne die Spieler zu stören)
 */
function handleSpectatorChat(ws, text) {
    const room = spectators.get(ws);
    if (!room) return;

    const chatData = {
        type: 'chat',
        sender: `👁️ [Beobachter] ${ws.playerName || 'Gast'}`,
        text: text,
        isSpectatorChat: true
    };

    // Schicke es an alle Zuschauer im selben Raum UND an dich selbst
    broadcastToSpectators(chatData, room);
}

/**
 * Zählt, wie viele Leute gerade in einem bestimmten Raum zuschauen
 */
function getSpectatorCount(roomID) {
    let count = 0;
    spectators.forEach(room => { if (room === roomID) count++; });
    return count;
}

module.exports = { 
    addSpectator, 
    removeSpectator, 
    broadcastToSpectators, 
    handleSpectatorChat,
    getSpectatorCount,
    spectators 
};
