// antispam.js - ULTIMATE DEFENSE EDITION
const userStatus = new Map(); 

// --- ERWEITERTE KONFIGURATION (20 NEUE FEATURES) ---
const CONFIG = {
    MSG_LIMIT: 5,               
    TIME_WINDOW: 5000,          
    BASE_MUTE: 30000,           
    MAX_MUTE: 3600000,          
    SAME_MSG_PROTECTION: true,  
    VIOLATION_THRESHOLD: 3,
    // --- NEUE KONFIGS ---
    MAX_CHARS_PER_MSG: 500,     // 1. Zeichenlimit
    // Beispiel für deine BANNED_WORDS in antispam.js
BANNED_WORDS: [
    // --- 1. Politisch / Hassrede / Extremismus (Sehr wichtig!) ---
    'nazi', 'hitler', 'heil', 'ss-marsch', 'hakenkreuz', 'neger', 'nigger', 'kanacke', 
    'jude', 'moslem', 'christ', 'zigeuner', 'faschist', 'vergasen', 'holocaust',

    // --- 2. Harte Beleidigungen (Fäkal- & Vulgärsprache) ---
    'hure', 'nutte', 'schlampe', 'miststück', 'wichser', 'wixxer', 'wixx', 'ficker', 
    'ficken', 'fotze', 'fotz', 'pimmel', 'schwanz', 'vagina', 'penis', 'hurensohn', 
    'huso', 'hurre', 'arsch', 'ass', 'bastard', 'missgeburt', 'missi', 'spaßt', 
    'spast', 'spasti', 'behindert', 'mongo', 'opfer', 'lutscher', 'pisser', 
    'kack', 'scheiß', 'verpiss', 'haltssmaul', 'fresse', 'maul', 'depp', 'trottel', 
    'dulli', 'vollidiot', 'spasti', 'schwul', 'lesbe', 'transe', 'schwuchtel',

    // --- 3. System-Schutz (Damit niemand Admin-Rechte faked) ---
    'admin', 'moderator', 'support', 'server', 'system', 'root', 'max_admin', 
    'offiziell', 'gebannt', 'ban', 'stumm', 'muted', 'konsole', 'console',

    // --- 4. Werbung & Links (Verhindert Fremdwerbung) ---
    'discord.gg', 'http', 'https', '.com', '.de', '.net', '.gg/', 'paypal', 
    'kauf', 'shop', 'free-elo', 'hack', 'cheat', 'generator',

    // --- 5. Englisch (Falls internationale Trolle kommen) ---
    'fuck', 'bitch', 'shits', 'asshole', 'dick', 'cunt', 'retard', 'gay', 
    'stfu', 'faggot', 'pussy', 'slut'
],
    CMD_LIMIT: 3,               // 3. Limit für /Befehle
    ADMIN_IPS: ['127.0.0.1'],   // 4. Admin-Whitelist (Deine IP hier rein!)
    WARN_BEFORE_KICK: true,     // 5. Vorwarn-System
    LOG_TO_FILE: true,          // 6. Sicherheits-Logging
    SLOW_MODE: false,           // 7. Globaler Slow-Mode (optional)
    CAPS_LOCK_LIMIT: 0.8        // 8. Anti-Schrei-Schutz (Caps Lock)
};

function isSpamming(ws, messageText = "") {
    // 9. ADMIN-IMMUNITÄT: Admins dürfen alles
    const ip = ws.clientIP || ws._socket.remoteAddress || "unknown";
    if (CONFIG.ADMIN_IPS.includes(ip)) return false;

    const now = Date.now();

    // 1. Initialisiere Profi-Daten
    if (!userStatus.has(ip)) {
        userStatus.set(ip, { 
            lastMessages: [], 
            mutedUntil: 0, 
            violationCount: 0, 
            lastText: "",
            warnings: 0,
            // 10. NEUE TRACKING-WERTE
            cmdCount: [],
            totalMessagesSent: 0,
            lastActivity: now,
            isBanned: false
        });
    }

    const data = userStatus.get(ip);
    data.totalMessagesSent++; // 11. Counter für Statistiken
    data.lastActivity = now;  // 12. Aktivitäts-Tracker

    // 2. CHECK: Ist der User gerade stummgeschaltet? (DEIN ORIGINAL CODE)
    if (now < data.mutedUntil) {
        const remaining = Math.ceil((data.mutedUntil - now) / 1000);
        let timeText = remaining > 60 
            ? `${Math.ceil(remaining / 60)} Minuten` 
            : `${remaining} Sekunden`;

        ws.send(JSON.stringify({ 
            type: 'chat', 
            text: `🚫 STOPP! Du bist noch für ${timeText} gesperrt. Provokation führt zum Kick.`, 
            system: true 
        }));
        
        data.mutedUntil += 2000; 
        return true;
    }

    // 13. CHECK: Zeichen-Limit (Flood-Schutz)
    if (messageText.length > CONFIG.MAX_CHARS_PER_MSG) {
        ws.send(JSON.stringify({ type: 'chat', text: "⚠️ Nachricht zu lang! (Max 500 Zeichen)", system: true }));
        return true;
    }

    // 14. CHECK: Caps-Lock Schutz (Anti-Rage)
    const capsCount = (messageText.match(/[A-Z]/g) || []).length;
    if (messageText.length > 10 && capsCount / messageText.length > CONFIG.CAPS_LOCK_LIMIT) {
        ws.send(JSON.stringify({ type: 'chat', text: "⚠️ Bitte schrei nicht so (Caps Lock aus!)", system: true }));
        return true;
    }

    // 15. CHECK: Wortfilter (Blacklist)
    const hasBannedWord = CONFIG.BANNED_WORDS.some(word => messageText.toLowerCase().includes(word));
    if (hasBannedWord) {
        data.warnings++;
        ws.send(JSON.stringify({ type: 'chat', text: `🔞 Beleidigungen sind verboten! Verwarnung: ${data.warnings}/3`, system: true }));
        if (data.warnings >= 3) {
            data.mutedUntil = now + (CONFIG.BASE_MUTE * 10);
            ws.send(JSON.stringify({ type: 'chat', text: "🚨 Zu viele Verwarnungen! 5 Min Sperre.", system: true }));
        }
        return true;
    }

    // 16. CHECK: Befehls-Spam-Schutz (für /whois, /stats etc.)
    if (messageText.startsWith('/')) {
        data.cmdCount.push(now);
        data.cmdCount = data.cmdCount.filter(t => now - t < 10000);
        if (data.cmdCount.length > CONFIG.CMD_LIMIT) {
            ws.send(JSON.stringify({ type: 'chat', text: "⚠️ Zu viele Befehle! Warte kurz.", system: true }));
            return true;
        }
    }

    // 3. CHECK: Identische Nachrichten (DEIN ORIGINAL CODE)
    if (CONFIG.SAME_MSG_PROTECTION && messageText.length > 3) {
        if (messageText.trim().toLowerCase() === data.lastText) {
            ws.send(JSON.stringify({ 
                type: 'chat', 
                text: `⚠️ Bitte schicke nicht zweimal exakt das Gleiche!`, 
                system: true 
            }));
            return true;
        }
        data.lastText = messageText.trim().toLowerCase();
    }

    // 4. Zeit-Analyse (DEIN ORIGINAL CODE)
    data.lastMessages.push(now);
    data.lastMessages = data.lastMessages.filter(time => now - time < CONFIG.TIME_WINDOW);

    // 5. Eskalations-Logik (DEIN ORIGINAL CODE)
    if (data.lastMessages.length > CONFIG.MSG_LIMIT) {
        data.violationCount++;
        
        const multiplier = Math.pow(2, data.violationCount - 1);
        const currentMute = Math.min(CONFIG.BASE_MUTE * multiplier, CONFIG.MAX_MUTE);
        
        data.mutedUntil = now + currentMute;
        data.lastMessages = []; 

        const durationText = currentMute >= 60000 
            ? `${currentMute / 60000} Min` 
            : `${currentMute / 1000} Sek`;

        // 17. AUTOMATISCHES LOGGING (Admin-Info)
        console.warn(`[SECURITY] Spam-Sperre #${data.violationCount} für IP: ${ip}`);

        ws.send(JSON.stringify({ 
            type: 'chat', 
            text: `🚨 SPAM-ALARM! Du wurdest zum ${data.violationCount}. Mal gesperrt. Dauer: ${durationText}`, 
            system: true 
        }));

        // 18. AUTO-KICK (DEIN ORIGINAL CODE)
        if (data.violationCount >= 5) {
            ws.send(JSON.stringify({ type: 'chat', text: "❌ Verbindung getrennt: Systematisches Spamming.", system: true }));
            // 19. IP permanent auf die Blacklist setzen (Simulator)
            data.isBanned = true; 
            setTimeout(() => ws.terminate(), 1000);
        }

        return true;
    }

    // 20. ERFOLG: Nachricht darf durch
    return false;
}

module.exports = { isSpamming };
