// adminSystem.js - EXCLUSIVE ADMIN PANEL (POWER-VERSION)
const fs = require('fs');

const ADMINS = ['Max', '222'];

async function handleAdminCommand(ws, text, context) {
    const { wss, supabaseAdmin, runBackup, banPlayer, bannedIPs, profiles } = context;

    if (!ADMINS.includes(ws.playerName)) {
        ws.send(JSON.stringify({ type: 'chat', text: '❌ Zugriff verweigert!', system: true }));
        return true;
    }

    const args = text.slice(1).split(' '); 
    const cmd = args[0].toLowerCase();
    const targetName = args[1];

    console.log(`[ADMIN] ${ws.playerName} nutzt: ${cmd}`);

    switch (cmd) {
        // --- DIE KLASSIKER (Bereits drin) ---
        case 'k': // Kick
            wss.clients.forEach(c => { if(c.playerName === targetName) { c.send(JSON.stringify({type:'chat', text:'🚫 Gekickt!', system:true})); c.close(); }});
            break;

        case 'b': // Ban
            const reason = args.slice(2).join(' ') || 'Admin-Entscheidung';
            if (typeof banPlayer === 'function') await banPlayer(targetName, reason);
            break;

        case 's': // Save/Backup
            if (typeof runBackup === 'function') await runBackup(supabaseAdmin);
            ws.send(JSON.stringify({ type: 'chat', text: '💾 Backup erstellt!', system: true }));
            break;

        case 'w': // Wartung an/aus
            global.maintenanceMode = !global.maintenanceMode;
            const status = global.maintenanceMode ? 'AKTIVIERT 🔴' : 'DEAKTIVIERT 🟢';
            wss.clients.forEach(c => c.send(JSON.stringify({ type: 'chat', text: `⚠️ WARTUNG: ${status}`, system: true })));
            break;

        case 'a': // Durchsage (Announce)
            const msg = args.slice(1).join(' ');
            wss.clients.forEach(c => c.send(JSON.stringify({ type: 'chat', text: `📣 ADMIN: ${msg}`, system: true })));
            break;

        // --- 10 NEUE ABKÜRZUNGEN ---

        case 'i': // Info (IP & Status eines Spielers)
            let foundInfo = false;
            wss.clients.forEach(c => {
                if(c.playerName === targetName) {
                    ws.send(JSON.stringify({ type: 'chat', text: `ℹ️ Player: ${c.playerName} | IP: ${c.clientIP}`, system: true }));
                    foundInfo = true;
                }
            });
            if(!foundInfo) ws.send(JSON.stringify({ type: 'chat', text: '❓ Spieler nicht online.', system: true }));
            break;

        case 'l': // List (Wer ist online?)
            const online = Array.from(wss.clients).map(c => c.playerName || 'Unbekannt').join(', ');
            ws.send(JSON.stringify({ type: 'chat', text: `👥 Online (${wss.clients.size}): ${online}`, system: true }));
            break;

        case 'm': // Mute (Spieler stumm schalten - temporär für die Session)
            wss.clients.forEach(c => {
                if(c.playerName === targetName) {
                    c.isMuted = !c.isMuted;
                    ws.send(JSON.stringify({ type: 'chat', text: `🎙️ ${targetName} Mute: ${c.isMuted}`, system: true }));
                }
            });
            break;

        case 'clr': // Clear Chat für alle
            wss.clients.forEach(c => c.send(JSON.stringify({ type: 'chat', text: '\n'.repeat(50) + '🧹 Chat wurde vom Admin gereinigt.', system: true })));
            break;

        case 'kickall': // Alle außer Admins kicken
            wss.clients.forEach(c => {
                if(!ADMINS.includes(c.playerName)) {
                    c.send(JSON.stringify({ type: 'chat', text: '🚪 Server wird geleert...', system: true }));
                    c.close();
                }
            });
            break;

        case 'stats': // Datenbank-Stats eines Spielers (Siege)
            const p = profiles ? profiles.get(targetName) : null;
            if(p) ws.send(JSON.stringify({ type: 'chat', text: `📊 ${targetName}: ${p.wins || 0} Siege`, system: true }));
            else ws.send(JSON.stringify({ type: 'chat', text: '❓ Profil nicht geladen.', system: true }));
            break;

        case 'top': // Top 3 Spieler anzeigen
            const top3 = Array.from(profiles.values())
                .sort((a, b) => (b.wins || 0) - (a.wins || 0))
                .slice(0, 3)
                .map((p, i) => `${i+1}. ${p.name} (${p.wins}🏆)`)
                .join(' | ');
            ws.send(JSON.stringify({ type: 'chat', text: `🏆 Bestenliste: ${top3}`, system: true }));
            break;

        case 'setwin': // Einem Spieler Siege geben (z.B. /setwin Max 100)
            const amount = parseInt(args[2]);
            if(profiles && profiles.has(targetName) && !isNaN(amount)) {
                const profile = profiles.get(targetName);
                profile.wins = amount;
                ws.send(JSON.stringify({ type: 'chat', text: `⭐ ${targetName} hat jetzt ${amount} Siege.`, system: true }));
            }
            break;

        case 'unban': // IP Entsperren (Beispiel: /unban 123.456...)
            if(bannedIPs.delete(targetName)) {
                ws.send(JSON.stringify({ type: 'chat', text: `🔓 IP ${targetName} freigeschaltet.`, system: true }));
            }
            break;

        case 'h': // Hilfe / Befehlsliste
            ws.send(JSON.stringify({ type: 'chat', text: '🛠️ Befehle: /k, /b, /s, /w, /a, /i, /l, /m, /clr, /kickall, /stats, /top, /setwin, /unban', system: true }));
            break;

        default:
            return false; // Kein Admin-Shortcut gefunden
    }

    return true; 
}

module.exports = { handleAdminCommand };
