//const WebSocket = require('ws');
//const fs = require('fs');
//const cluster = require('cluster');
//const os = require('os');
//const crypto = require('crypto');

// ==========================================
// 🔥 CHAOS BOT TITAN CONFIGURATION 🔥
// ==========================================
//const SERVER_URL = "wss://mein-schach-uten.onrender.com";
//const BOTS_PER_WORKER = 5; 
//const ATTACK_INTERVAL_MS = 250; 
//const CRASH_LOG = 'ultimate_crash_report.json';
//const NUM_CORES = os.cpus().length;

 //Discord Webhook aus den Render-Umgebungsvariablen (oder lokal) laden
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

// ==========================================
// 🚨 DISCORD ALARM SYSTEM
// ==========================================
async function sendDiscordAlert(vulnData) {
    if (!DISCORD_WEBHOOK_URL) return; // Wenn kein Webhook da ist, ignoriere es

    const message = `🚨 **ACHTUNG: Chaos-Bot hat einen Fehler gefunden!** 🚨\n\n` +
                    `**IP (Spoofed):** \`${vulnData.spoofed_ip}\`\n` +
                    `**Gesendeter Payload:**\n\`\`\`json\n${JSON.stringify(vulnData.payload_sent).substring(0, 500)}\n\`\`\`\n` +
                    `**Server-Antwort/Schwachstelle:**\n\`\`\`\n${vulnData.server_response}\n\`\`\``;

    try {
        await fetch(DISCORD_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: message })
        });
    } catch (e) {
        console.error("Fehler beim Senden an Discord:", e.message);
    }
}

// ==========================================
// 🦠 PAYLOAD & ATTACK GENERATOR
// ==========================================
class AttackGenerator {
    static getRandomIP() {
        return `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
    }

    static generateRandomString(length) {
        return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
    }

    static generateExtremePayload() {
        const adminGuesses = ["Admina1", "admin", "1234", "Maxi", "Max", "' OR 1=1--"];
        const randomAdminPass = adminGuesses[Math.floor(Math.random() * adminGuesses.length)];

        const attacks = [
            // --- ALTE ANGRIFFE (Behalten!) ---
            () => ({ type: 'chat', text: 'A'.repeat(4096), playerName: 'BoundaryBot' }),
            () => ({ type: 'chat', text: 'B'.repeat(4097), playerName: 'OverflowBot' }),
            () => {
                let deepObj = { type: 'chat' };
                let current = deepObj;
                for(let i = 0; i < 50; i++) { current.nested = {}; current = current.nested; }
                return deepObj;
            },
            () => ({ type: 'move', move: { fr: -1, fc: 9, tr: null, tc: "A" } }), 
            () => ({ type: 'move', move: { fr: 0, fc: 0, tr: 0, tc: 0 }, roomID: { "$ne": null } }), 
            () => ({ type: 'chat', text: "UNION SELECT * FROM players--", playerName: "SQLi_Bot" }),
            () => ({ type: 'login_attempt', playerName: "admin' OR '1'='1", password: "123", clientIP: this.getRandomIP() }),
            () => ({ type: 'chat', text: "<script>alert(1)</script>", playerName: "XSS_Bot" }),
            () => ({ type: 'chat', text: "<img src=x onerror=alert(1)>", playerName: "XSS_Bot2" }), 
            () => ({ type: 'join', playerName: "constructor.prototype.admin = true;" }), 
            () => ({ type: 'chat', text: `/ban AdminBot ${randomAdminPass}`, playerName: "Max" }), 
            () => ({ type: 'chat', text: `?kick randomUser ${randomAdminPass}`, playerName: "Ghost" }),
            () => ({ type: 'find_random', playerName: `QueueSpammer_${Math.random()}` }),
            () => ({ type: 'chat', text: "Chat message\x00 with null byte", playerName: "NullBot" }),
            () => ({ type: 'chat', text: "Dies ist ein Test", system: true, sender: "SYSTEM" }),

            // --- NEUE EXTREME ANGRIFFE (Hinzugefügt!) ---
            // 10. Massive Arrays (RAM Killer)
            () => ({ type: 'chat', text: 'Test', history: Array(10000).fill('SPAM') }),
            
            // 11. Unicode & Zalgo Text (Zerstört oft Datenbanken und Frontend-Render)
            () => ({ type: 'chat', text: "T̵͍͝e̵͍͝s̵͍͝t̵͍͝", playerName: "ZalgoBot" }),
            
            // 12. Negative Limits und NaN (Not a Number) Injections
            () => ({ type: 'move', move: { fr: NaN, fc: Infinity, tr: -999, tc: undefined } }),
            
            // 13. Emoji Overflow (Testet die parseEmojis Funktion in deinem Server!)
            () => ({ type: 'chat', text: "😀".repeat(1000) }),

            // 14. Fake Ping/Pong Flooding
            () => ({ type: 'ping', timestamp: "INVALID_DATE_STRING" })
        ];

        return attacks[Math.floor(Math.random() * attacks.length)]();
    }
}

// ==========================================
// 🧠 MASTER PROCESS (Der Kommandant)
// ==========================================
if (cluster.isMaster) {
    console.clear();
    console.log(`
    ████████╗██╗████████╗ █████╗ ███╗   ██╗
    ╚══██╔══╝██║╚══██╔══╝██╔══██╗████╗  ██║
       ██║   ██║   ██║   ███████║██╔██╗ ██║
       ██║   ██║   ██║   ██╔══██║██║╚██╗██║
       ██║   ██║   ██║   ██║  ██║██║ ╚████║
       ╚═╝   ╚═╝   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═══╝
    EXTREME CHAOS FUZZER (v4.0) - MULTI-CORE + DISCORD ALARM
    =========================================
    Ziel: ${SERVER_URL}
    Kerne (Generäle): ${NUM_CORES}
    Bots pro Kern: ${BOTS_PER_WORKER}
    Gesamt-Armee: ${NUM_CORES * BOTS_PER_WORKER} aktive Verbindungen
    Webhook Aktiv: ${DISCORD_WEBHOOK_URL ? "JA 🟢" : "NEIN 🔴 (Umgebungsvariable fehlt)"}
    =========================================
    `);

    let totalRequests = 0;
    let totalErrors = 0;
    let foundVulnerabilities = [];

    if (!fs.existsSync(CRASH_LOG)) fs.writeFileSync(CRASH_LOG, JSON.stringify([]));

    for (let i = 0; i < NUM_CORES; i++) {
        const worker = cluster.fork();
        
        worker.on('message', (msg) => {
            if (msg.cmd === 'request_sent') totalRequests++;
            if (msg.cmd === 'vuln_found') {
                totalErrors++;
                foundVulnerabilities.push(msg.data);
                
                // 1. In die Log-Datei schreiben
                const currentData = JSON.parse(fs.readFileSync(CRASH_LOG));
                currentData.push(msg.data);
                fs.writeFileSync(CRASH_LOG, JSON.stringify(currentData, null, 2));

                // 2. Discord Alarm auslösen!
                sendDiscordAlert(msg.data);
            }
        });
    }

    cluster.on('exit', (worker, code, signal) => {
        console.log(`💀 General (Worker ${worker.process.pid}) ist gefallen. Respawne...`);
        cluster.fork();
    });

    setInterval(() => {
        process.stdout.write(`\r🚀 Requests/sec: ${(totalRequests / 2).toFixed(0)} | 💥 Gefundene Lücken: ${totalErrors} | 📡 Kerne: ${Object.keys(cluster.workers).length}    `);
        totalRequests = 0; 
    }, 2000);

} 
// ==========================================
// ⚔️ WORKER PROCESS (Die Fußsoldaten)
// ==========================================
else {
    function startBotSession(botId) {
        const spoofedIP = AttackGenerator.getRandomIP();
        const ws = new WebSocket(SERVER_URL, {
            headers: {
                'x-forwarded-for': spoofedIP,
                'User-Agent': 'Chaos-Titan-Bot/4.0'
            }
        });

        let attackInterval;
        let lastPayload = null;

        ws.on('open', () => {
            attackInterval = setInterval(() => {
                if (ws.readyState === WebSocket.OPEN) {
                    
                    if (Math.random() < 0.05) {
                        lastPayload = "SYNTAX_ERROR { type: 'test' ";
                        ws.send(lastPayload);
                    } else {
                        lastPayload = AttackGenerator.generateExtremePayload();
                        ws.send(JSON.stringify(lastPayload));
                    }
                    
                    process.send({ cmd: 'request_sent' });
                }
            }, ATTACK_INTERVAL_MS);
        });

        ws.on('message', (data) => {
            try {
                const response = data.toString();
                
                // Wenn der Server Error, Reject, Stacktrace oder ähnliches zurückgibt
                if (response.toLowerCase().includes('error') || response.includes('System-Reject') || response.includes('Unhandled')) {
                    process.send({ 
                        cmd: 'vuln_found', 
                        data: { 
                            time: new Date().toISOString(), 
                            spoofed_ip: spoofedIP,
                            payload_sent: lastPayload, 
                            server_response: response.substring(0, 500) 
                        } 
                    });
                }
            } catch (e) {}
        });

        ws.on('close', () => {
            clearInterval(attackInterval);
            setTimeout(() => startBotSession(botId), 500);
        });

        ws.on('error', () => {
            clearInterval(attackInterval);
        });
    }

    for (let i = 0; i < BOTS_PER_WORKER; i++) {
        startBotSession(i);
    }
}
