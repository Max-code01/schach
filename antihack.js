// antihack.js - Das unüberwindbare Schutzschild
const fs = require('fs');
const BAN_FILE = './bans.json';
const { banIPPermanently } = require('./server');

// --- NEU: DISCORD ALARM FUNKTION ---
async function sendDiscordAlarm(playerName, reason, ip) {
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) return;

    const payload = {
        embeds: [{
            title: "🚨 ANTI-HACK ALARM",
            color: 0xff0000, // Rot
            fields: [
                { name: "Spieler", value: playerName || "Unbekannt", inline: true },
                { name: "IP-Adresse", value: ip, inline: true },
                { name: "Grund", value: reason }
            ],
            timestamp: new Date()
        }]
    };

    try {
        await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    } catch (e) {
        console.error("Discord-Alarm konnte nicht gesendet werden");
    }
}

function validateSecurity(data, ws, bannedIPs, triggerUltraBan) {
    const now = Date.now();
    const ip = ws.clientIP || "unknown";
    const name = ws.playerName || "Unbekannter_Spieler";

    // Hilfsfunktion um Ban + Discord auszulösen
    const executeBan = (reason) => {
        // NEU: .htaccess Sperre auslösen (Weg A)
    // Wir prüfen, ob eine IP da ist und ob es nicht die eigene (localhost) ist
    if (ip && ip !== "unknown" && ip !== "127.0.0.1" && ip !== "::1") {
        try {
            banIPPermanently(ip);
        } catch (err) {
            console.error("Konnte IP nicht in .htaccess schreiben:", err);
        }
    }
        // NEU: Das eigene Pop-Up Fenster für den Hacker, bevor er fliegt!
        // Wir nutzen type 'system_alert', was in deiner script.js ein alert() auslöst
        if (ws.readyState === 1) { 
            ws.send(JSON.stringify({ 
                type: 'system_alert', 
                message: `☠️ ANTI-CHEAT SYSTEM ☠️\n\nDu wurdest beim Hacken erwischt!\nGrund: ${reason}\n\nDein Account und deine IP wurden permanent gesperrt!` 
            }));
        }

        sendDiscordAlarm(name, reason, ip); // Alarm schicken
        return triggerUltraBan(reason);    // Den eigentlichen Ban ausführen
    };

    // --- BASIS SCHUTZ ---
    if (!data || typeof data !== 'object') return executeBan("Manipuliertes Datenpaket (Ungültiges Objekt)");

    // 1. Konsolen-Spam / Payload Limit
    const rawLength = JSON.stringify(data).length;
    if (rawLength > 4000) return executeBan("Payload-Attacke (Datenmenge zu groß)");

    // 2. Client-Identität-Check (Hacker ändern oft Typen)
    if (typeof data.type !== 'string') return executeBan("Protokoll-Manipulation (Typ-Fälschung)");

    // --- CHAT & KONSOLE SCHUTZ ---
    if (data.type === 'chat_message' || data.type === 'chat') {
        const msg = data.text || data.content || "";
        
        // 3. Befehls-Ausnahme (Erlaubt / ! ?)
        const isCommand = msg.startsWith('/') || msg.startsWith('!') || msg.startsWith('?');
        
        if (!isCommand) {
            // 4. CSS-Injection Schutz
            if (/[{}]|display:|position:|background:|color:|font-size|opacity|script/i.test(msg)) {
                return executeBan("CSS/Style Injection via Konsole");
            }
            // 5. HTML/Script Tag Schutz
            if (/<|>|href|src=|onerror=|onload=/i.test(msg)) {
                return executeBan("XSS-Versuch (HTML Tags)");
            }
        }
        
        // 6. Unsichtbare Zeichen (Hacker nutzen das oft für Geister-Namen)
        if (/[\u200B-\u200D\uFEFF]/.test(msg)) return executeBan("Zero-Width-Space Attacke");
    }

    // --- SPIEL-LOGIK SCHUTZ (EXTREM) ---
    if (data.type === 'move') {
        // 7. Spectator-Move Hack
        if (ws.isSpectator) return executeBan("Spectator-Move-Hack");

        // 8. Koordinaten-Manipulation
        const { fr, fc, tr, tc } = data.move || {};
        if ([fr, fc, tr, tc].some(v => typeof v !== 'number' || v < 0 || v > 7)) {
            return executeBan("Illegale Board-Koordinaten (Out of Bounds)");
        }

        // 9. Teleport-Check (Falls Figur sich ohne Zug bewegt - Platzhalter für deine Logik)
        if (fr === tr && fc === tc) return executeBan("Null-Move-Manipulation");
    }

    // --- TECHNISCHE HACKS ---
    // 10. SQL-Injection (Supabase Schutz)
    const sqlPattern = /UNION|SELECT|DROP|DELETE|UPDATE|INSERT|INTO|VALUES|--|;|OR 1=1/i;
    if (sqlPattern.test(JSON.stringify(data))) return executeBan("SQL-Injection Versuch");

    // 11. Prototype Pollution
    if (JSON.stringify(data).includes("__proto__") || JSON.stringify(data).includes("constructor")) {
        return executeBan("Prototype Pollution Attacke");
    }

    // 12. Automatischer Sieg-Hack
    if (data.type === 'game_win') {
        const gameTime = (now - (ws.gameStartTimestamp || now)) / 1000;
        if (gameTime < 10) return executeBan("Speed-Win-Hack (Sieg unter 10 Sek)");
    }

    // 13. Room-Hijacking (Versuch in andere Räume zu senden)
    if (ws.roomID && data.roomID && ws.roomID !== data.roomID) {
        return executeBan("Cross-Room-Injection (Fremder Raumzugriff)");
    }

    // 14. Doppel-Login (Sitzungs-Fälschung)
    //if (data.type === 'login' && ws.playerName) {
        //return executeBan("Multi-Session-Hack (Zweiter Login auf aktiver Verbindung)");
   // }

    // 15. Emojis-Flut (Browser-Crash verhindern)
    const emojiCount = (msg) => (msg.match(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g) || []).length;
    if (data.text && emojiCount(data.text) > 10) return executeBan("Emoji-Crash-Attacke");

    // 16. JSON-Parsing Bombe
    try {
        if (rawLength > 1000 && (JSON.stringify(data).match(/{/g) || []).length > 20) {
            return executeBan("JSON-Depth Attacke (Verschachtelungs-Bombe)");
        }
    } catch(e) {}

    // 17. Falsche Farben-Wahl (Cheat)
    if (data.type === 'join' && data.color && !['white', 'black', 'random'].includes(data.color)) {
        return executeBan("Farben-Manipulation im Protokoll");
    }
   
    // 19. Flooding/Buffer-Overflow Schutz
    //if (!ws.securityScore) ws.securityScore = 0;
    //if (rawLength > 1000) ws.securityScore += 5;
   // if (ws.securityScore > 50) return executeBan("Ressourcen-Erschöpfungs-Angriff");

    // 20. Heartbeat-Manipulation
    if (data.type === 'ping' && data.timestamp && data.timestamp > now + 10000) {
        return executeBan("Time-Travel Hack (Manipulierter Ping-Zeitstempel)");
    }

    // ==========================================
    // --- NEUE SCHUTZFUNKTIONEN ---
    // ==========================================

    // NEU: 21. Type-Juggling (Hacker senden Arrays statt Strings um Logik zu brechen)
    if (data.type === 'chat' && data.text && typeof data.text !== 'string') {
        return executeBan("Type-Juggling Hack (Falsches Datenformat im Chat)");
    }

    // NEU: 22. Unerlaubte Admin-Befehle fälschen (Client sendet sich selbst als "System")
    if (data.system === true || data.sender === 'SYSTEM' || data.sender === 'System') {
        return executeBan("System-Rechte Fälschung (Admin-Spoofing)");
    }

    // NEU: 23. Züge außerhalb des eigenen Zugs senden (Desync Hack)
    //if (data.type === 'move' && data.turn && ws.playerColor && data.turn !== ws.playerColor) {
        //return executeBan("Turn-Spoofing (Zug gemacht, obwohl Gegner dran ist)");
   //}

    // NEU: 24. Micro-Flooding (Viele winzige Anfragen in extrem kurzer Zeit, z.B. 20 pro Sekunde)
    //if (!ws.microSpamTimes) ws.microSpamTimes = [];
    //ws.microSpamTimes.push(now);
    //ws.microSpamTimes = ws.microSpamTimes.filter(t => now - t < 1000); // Check der letzten Sekunde
    //if (ws.microSpamTimes.length > 30) {
        //return executeBan("Micro-Flooding (Server-DDoS-Versuch)");
   //}

    return true; // Sicher!
}

module.exports = { validateSecurity };
