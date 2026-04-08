// autoMessages.js - Der Info-Bot für Max' Server

/**
 * Startet den Info-Bot
 * @param {WebSocketServer} wss - Der Server, um alle Clients zu erreichen
 */
function startAutoMessages(wss) {
    // Hier kannst du deine Nachrichten eintragen
    const messages = [
        "📢 Willkommen auf dem Server! Viel Spaß beim Spielen! 🎮",
        "💡 Tipp: Nutze !help, um alle Befehle zu sehen.",
        "🚫 Bitte bleib höflich im Chat. Hacker werden sofort gebannt! 🔨",
    ];

    let index = 0;

    // Alle 10 Minuten (600.000 Millisekunden) eine Nachricht senden
    setInterval(() => {
        if (wss.clients.size > 0) { // Nur senden, wenn auch jemand online ist
            const text = messages[index];
            
            const broadcastData = JSON.stringify({
                type: 'chat',
                text: `🤖 INFO: ${text}`,
                system: true // Markiert es als System-Nachricht (oft farbig)
            });

            wss.clients.forEach(client => {
                if (client.readyState === 1) { // 1 = WebSocket.OPEN
                    client.send(broadcastData);
                }
            });

            // Zum nächsten Text springen (am Ende wieder von vorne)
            index = (index + 1) % messages.length;
            console.log(`[INFO-BOT] Nachricht gesendet: ${text}`);
        }
    }, 60000); // 600000 ms = 10 Minuten
}

module.exports = { startAutoMessages };
