require('dotenv').config();
const axios = require('axios');
const path = require('path');
const bannedIPs = new Set(); 
const express = require('express');
const app = express();
app.use('/videos', express.static(path.join(__dirname, 'videos')));
const cors = require('cors');
app.use(cors());
const { validateSecurity } = require('./antihack.js');
const { getLocationFromIP } = require('./geoTracker.js');
const { parseEmojis } = require('./emojis');
const { isNameAllowed } = require('./badnames');
const { addSpectator, removeSpectator, broadcastToSpectators } = require('./spectator');
const { startAutoMessages } = require('./autoMessages');
const { handleAdminCommand } = require('./adminSystem');
const { runBackup } = require('./autoBackup'); // Wichtig für den /s Befehl
const { startBackupScheduler } = require('./autoBackup');
const { isSpamming } = require('./antispam');
const userMessageLog = new Map(); 
const SPAM_THRESHOLD = 5;
const SPAM_INTERVAL = 3000;
const { createClient } = require('@supabase/supabase-js');
// DER TÜRSTEHER - Muss ganz oben stehen!
// Route für die digitale Visitenkarte eines Spielers
app.get('/download-contact/:playerName', (req, res) => {
    const name = req.params.playerName;
    // Link zu deiner echten Spiel-Webseite auf GitHub
    const gameUrl = "https://max-code01.github.io/mein-schach"; 
    const vCardContent = [
        "BEGIN:VCARD",
        "VERSION:3.0",
        `FN:Schach-Rivale: ${name}`,       // Name, der im Telefonbuch erscheint
        `N:;${name};;;`,
        `URL:${gameUrl}`,                  // Verlinkung zurück zu deinem Spiel
        "NOTE:Gefunden auf Max' Ultra-Schach. Fordere ihn heraus!",
        "END:VCARD"
    ].join("\n");

    // WICHTIG: Diese Header sagen dem Browser, dass er eine Datei speichern soll
    res.setHeader('Content-Type', 'text/vcard');
    res.setHeader('Content-Disposition', `attachment; filename="${name}_rivale.vcf"`);
    
    res.send(vCardContent);
});

// Das definiert den Chef-Zugang (Admin)
const supabaseAdmin = createClient(
    process.env.SUPABASE_URL, 
    process.env.SUPABASE_SERVICE_KEY
);
const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const { createCanvas, loadImage } = require('canvas');
const ffmpeg = require('fluent-ffmpeg');

// Ordner für die Spiel-Bilder und fertigen Videos erstellen
const TEMP_DIR = path.join(__dirname, 'temp_moves');
const VIDEO_DIR = path.join(__dirname, 'videos');
// Erstellt die Ordner beim Serverstart, falls sie fehlen
[TEMP_DIR, VIDEO_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`📁 Ordner erstellt: ${dir}`);
    }
});

if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR);
if (!fs.existsSync(VIDEO_DIR)) fs.mkdirSync(VIDEO_DIR);

// Diese Liste muss oben in deiner server.js stehen!

function banIPPermanently(ip) {
    // 1. Nur ausführen, wenn eine IP da ist und sie noch nicht gesperrt wurde
    if (ip && !bannedIPs.has(ip)) {
        bannedIPs.add(ip);
        console.log(`🚫 IP ${ip} wurde zur internen Sperrliste hinzugefügt.`);
        
        // 2. In .htaccess schreiben (Bleibt innerhalb des IF-Blocks)
        const htaccessPath = path.join(__dirname, '.htaccess');
        const denyLine = `\nDeny from ${ip}`;

        fs.appendFile(htaccessPath, denyLine, (err) => {
            if (err) {
                console.error("Fehler beim Schreiben in .htaccess:", err);
            } else {
                console.log(`🚫 IP ${ip} wurde permanent in .htaccess gesperrt!`);
            }
        });
    } // <--- Diese Klammer schließt das "if". Jetzt gehört alles oben dazu!
} // <--- Diese Klammer schließt die Funktion.


// Exportiere die Funktion, damit das Antihack-Modul sie nutzen kann
module.exports = { banIPPermanently };
const nodemailer = require('nodemailer');
const engine = require('./engineWorker.js');
const ghost = require('./ghostplayer.js');
// 🤖 Der neue Discord-Alarm (funktioniert immer!)
async function sendBanEmail(playerName, reason, ip) {
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    
    if (!webhookUrl) {
        console.error("❌ Fehler: DISCORD_WEBHOOK_URL fehlt in den Render-Variablen!");
        return false;
    }

    const payload = {
        embeds: [{
            title: "🚨 BAN-ALARM: Spieler gesperrt",
            color: 15158332, // Rot
            fields: [
                { name: "Spieler", value: playerName, inline: true },
                { name: "Grund", value: reason, inline: true },
                { name: "IP-Adresse", value: `\`${ip}\``, inline: false }
            ],
            footer: { text: "Schach-Server Wächter" },
            timestamp: new Date()
        }]
    };

    try {
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            console.log("✅ Ban-Alarm an Discord gesendet!");
            return true;
        } else {
            console.error("❌ Discord Fehler-Status:", response.status);
            return false;
        }
    } catch (error) {
        console.error("❌ Fehler beim Senden an Discord:", error.message);
        return false;
    }
}
const SUPABASE_URL = 'https://sfbubqwnuthicpenmwye.supabase.co';
const SUPABASE_KEY = 'sb_publishable_H-ZV5me7vxZN_fNPdQ0ifA_--7AdGnZ'; // Hinweis: Nutze eigentlich den Service-Role-Key für Schreibrechte!
// --- GHOST PLAYER KONFIGURATION ---
const ghostNames = ["ChessMaster99", "Lukas_Pro", "QueenGambit", "DarkKnight", "Susi_Sunshine", "CheckMate", "KingOfKings", "Master_88"];
const ghostSentences = ["Hallo!", "Viel Glück!", "Gutes Spiel!", "Lust auf eine Revanche?", "Puh, das war knapp!", "Respekt!", "Moin moin", "Schach!","Gleich hab ich dich!"];
// In deiner server.js, ganz oben nach den Imports:



app.use((req, res, next) => {
    const clientIP = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    // 1. IP-Blacklist Check (Geändert zu .has)
    if (bannedIPs.has(clientIP)) {
        return res.status(403).send("<h1>403 Forbidden</h1>Deine IP wurde vom Antihack-System gesperrt.");
    }

    // 2. HTTPS-Zwang
    if (req.headers['x-forwarded-proto'] !== 'https' && process.env.NODE_ENV === 'production') {
        return res.redirect(`https://${req.hostname}${req.url}`);
    }

    next();
});
// Express statische Dateien mit Caching
// 'public' ist der Ordner, in dem deine index.html und Bilder liegen
app.use(express.static('public', {
  maxAge: '30d' // Speichert Bilder etc. für 30 Tage im Browser
}));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

function createGhostPlayer() {
    const randomName = ghostNames[Math.floor(Math.random() * ghostNames.length)];
    
    // Simulierter Bot-Client
    const ghost = {
        playerName: randomName,
        isBot: true, // Wichtig zur Unterscheidung
        readyState: 1, // Simuliert eine offene Verbindung
        send: (data) => { /* Ignoriert eingehende Daten */ },
        terminate: () => { /* Falls gekickt wird */ },
        on: () => {} // Falls Events registriert werden
    };

    // 📢 Bot schreibt nach Zufallszeit etwas im Chat
    setTimeout(() => {
        broadcast({ 
            type: 'chat', 
            text: `${randomName}: ${ghostSentences[Math.floor(Math.random() * ghostSentences.length)]}`, 
            playerName: randomName 
        });
    }, Math.random() * 5000 + 3000);

    return ghost;
}

// Füge das hier hinzu, damit globalMute funktioniert
let serverConfig = { globalMute: false };
let waitingPlayer = null;

// --- SERVER SETUP ---
// WICHTIG: Hier stecken wir "app" (Express) in den Server! Nur so funktionieren die Links.
const server = http.createServer(app); 

// Wenn man nur auf die Haupt-URL geht, zeigen wir deinen Text:
app.get('/', (req, res) => {
    res.send("Schach-Ultra-Server: MAXIMALE VOLLVERSION - ALLER CODE ENTHALTEN"); 
});
const wss = new WebSocket.Server({ server });

// --- DATEI-PFADE ---
const LB_FILE = './leaderboard.json';
const USER_FILE = './userDB.json';
const BAN_FILE = './bannedIPs.json';

// --- SERVER SPEICHER / VARIABLEN (ALLES VORHANDEN) ---
let moveCounters = {};
let leaderboard = {};
let userDB = {}; 
let profiles = {};
let mutedPlayers = new Map(); 
let warnings = {}; 
let loginAttempts = new Map(); // Für den Hacker-Schutz
let blockedIPs = new Map(); // Speichert, wer wirklich gesperrt ist

let serverLocked = false; 
let slowModeDelay = 0; 
let messageHistory = new Map(); 
let lastSentMessage = new Map(); 
let lastWinTime = new Map(); 
let winStreakCount = new Map();
let lastKnownIPs = {}; // Hier merkt sich der Server: Name -> IP
const adminPass = "Admina1";
const helperPass = "Maxi"; // Ersetze dies durch das Supporter-Passwort


// IN DER server.js
// --- VIDEO ENGINE SETUP ---

// 1. Die URLs (Alle 12 Figuren von Wikimedia)
const PIECE_URLS = {
    // Weiß (Groß)
    'K': 'https://upload.wikimedia.org/wikipedia/commons/4/42/Chess_klt45.svg',
    'Q': 'https://upload.wikimedia.org/wikipedia/commons/1/15/Chess_qlt45.svg',
    'R': 'https://upload.wikimedia.org/wikipedia/commons/7/72/Chess_rlt45.svg',
    'B': 'https://upload.wikimedia.org/wikipedia/commons/b/b1/Chess_blt45.svg',
    'N': 'https://upload.wikimedia.org/wikipedia/commons/7/70/Chess_nlt45.svg',
    'P': 'https://upload.wikimedia.org/wikipedia/commons/4/45/Chess_plt45.svg',
    
    // Schwarz (Klein - Hier lag wahrscheinlich der Fehler!)
    'k': 'https://upload.wikimedia.org/wikipedia/commons/f/f0/Chess_kdt45.svg',
    'q': 'https://upload.wikimedia.org/wikipedia/commons/4/47/Chess_qdt45.svg',
    'r': 'https://upload.wikimedia.org/wikipedia/commons/f/ff/Chess_rdt45.svg',
    'b': 'https://upload.wikimedia.org/wikipedia/commons/9/98/Chess_bdt45.svg',
    'n': 'https://upload.wikimedia.org/wikipedia/commons/e/ef/Chess_ndt45.svg',
    'p': 'https://upload.wikimedia.org/wikipedia/commons/c/c7/Chess_pdt45.svg'
};

// Einheitlicher Speicher für die geladenen Bild-Objekte
const loadedPieceImages = {}; 

// 2. Bilder beim Starten des Servers laden
// 1. Hilfsfunktion für die Pause (muss vor preloadPieceImages stehen)
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 2. Die verbesserte Lade-Funktion
async function preloadPieceImages() {
    console.log("⏳ Lade Schachfiguren von Wikimedia (mit Sicherheits-Pausen)...");
    
    let geladeneAnzahl = 0;
    const figurenKeys = Object.entries(PIECE_URLS);

    for (const [key, url] of figurenKeys) {
        try {
            // Bild laden
            loadedPieceImages[key] = await loadImage(url);
            geladeneAnzahl++;
            console.log(`✅ Geladen (${geladeneAnzahl}/12): Figur ${key}`);
            
            // WICHTIG: 600ms warten, damit Wikipedia uns nicht sperrt
            await sleep(600); 
            
        } catch (err) {
            console.error(`❌ Fehler beim Laden von Figur ${key}:`, err.message);
            
            // Kleiner Trick: Falls es ein 429-Fehler ist, 3 Sekunden warten und nochmal versuchen
            if (err.message.includes('429')) {
                console.log(`🔄 Warteschlange voll (429). Versuche ${key} in 3 Sek. erneut...`);
                await sleep(3000);
                try {
                    loadedPieceImages[key] = await loadImage(url);
                    geladeneAnzahl++;
                    console.log(`✅ Im zweiten Versuch geladen: ${key}`);
                } catch (retryErr) {
                    console.error(`❌ Finaler Abbruch für Figur ${key}`);
                }
            }
        }
    }

    if (geladeneAnzahl === 12) {
        console.log("🏁 PERFEKT: Alle 12 Figuren sind im Speicher!");
    } else {
        console.warn(`⚠️ ACHTUNG: Nur ${geladeneAnzahl} von 12 Figuren geladen. Schwarz könnte fehlen.`);
    }
}

// Startet den Ladevorgang sofort beim Serverstart
preloadPieceImages();

// 3. Die Snapshot-Funktion für die Video-Einzelbilder
async function captureMoveSnapshot(gameId, boardArray, moveCount) {
    const canvas = createCanvas(400, 400);
    const ctx = canvas.getContext('2d');

    // Brett zeichnen (Helles/Dunkles Holz-Design)
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            ctx.fillStyle = (r + c) % 2 === 0 ? '#eeeed2' : '#769656';
            ctx.fillRect(c * 50, r * 50, 50, 50);
        }
    }

    // Figuren auf das Brett zeichnen
    boardArray.forEach((row, r) => {
        row.forEach((pieceCode, c) => {
            // Prüfen, ob eine Figur da ist und ob wir das Bild geladen haben
            if (pieceCode && loadedPieceImages[pieceCode]) {
                const img = loadedPieceImages[pieceCode];
                // Zeichnen mit 5px Padding für besseren Look
                ctx.drawImage(img, c * 50 + 5, r * 50 + 5, 40, 40);
            }
        });
    });

    // Speicherpfad festlegen und Bild erstellen
    const fileName = `game_${gameId}_move_${String(moveCount).padStart(3, '0')}.png`;
    const filePath = path.join(TEMP_DIR, fileName);
    
    const out = fs.createWriteStream(filePath);
    const stream = canvas.createPNGStream();
    stream.pipe(out);
}

function generateGameVideo(gameId, ws) {
    const outputFileName = `Match_${gameId}_Highlight.mp4`;
    const outputPath = path.join(VIDEO_DIR, outputFileName);
    
    // FFmpeg nimmt alle Bilder dieses Spiels aus dem Temp-Ordner
    ffmpeg()
        .input(path.join(TEMP_DIR, `game_${gameId}_move_%03d.png`))
        .inputFPS(2) // 2 Züge pro Sekunde im Video
        .videoCodec('libx264')
        .outputOptions(['-pix_fmt yuv420p'])
        .on('end', () => {
            console.log(`✅ Video für Spiel ${gameId} fertig!`);
            
            // Link an den Spieler schicken
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: "VIDEO_READY",
                    url: `/videos/${outputFileName}`
                }));
            }
            
            // WICHTIG: Der Timer startet ERST HIER, wenn das Video fertig ist!
            setTimeout(() => {
                if (fs.existsSync(outputPath)) {
                    fs.unlinkSync(outputPath); 
                    console.log(`🗑️ Video ${outputFileName} automatisch gelöscht.`);
                }
            }, 30 * 60 * 1000);
            
        })
        .on('error', (err) => console.error("❌ Video-Fehler:", err))
        .save(outputPath);
}
// --- ÜBERTRAGENE LOGIK AUS SOCIAL_CORE.RB ---
function createPlayerProfile(name) {
    return {
        uid: Math.random().toString(36).substring(2, 10).toUpperCase(),
        level: 1,
        xp: 0,
        wins: 0,
        joined: new Date().toLocaleDateString('de-DE')
    };
}


function sendLeaderboardUpdate(target) {
    // 1. Sortieren: Wir schauen in das Objekt und nehmen .wins
    const sorted = Object.entries(leaderboard)
        .sort((a, b) => {
            const winsA = typeof a[1] === 'object' ? a[1].wins : a[1];
            const winsB = typeof b[1] === 'object' ? b[1].wins : b[1];
            return winsB - winsA;
        })
        .slice(0, 10);

    // 2. Das Paket für die Website schnüren (inkl. Level, XP und Datum)
    const msg = JSON.stringify({ 
        type: 'leaderboard', 
        list: sorted.map(e => {
            // Falls ein alter Eintrag ohne Objekt kommt, Standardwerte setzen
            const data = typeof e[1] === 'object' ? e[1] : { 
                wins: e[1], 
                level: 1, 
                xp: 0, 
                joined: new Date().toLocaleDateString('de-DE') 
            };
            return { 
                name: e[0], 
                wins: data.wins, 
                level: data.level, 
                xp: data.xp,
                joined: data.joined 
            };
        }) 
    });

    // 3. Abschicken
    if (target) {
        target.send(msg);
    } else {
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) client.send(msg);
        });
    }
}

// --- HILFSFUNKTION FÜR POPUP-NACHRICHTEN ---
const sendSystemAlert = (targetWs, message) => {
    if (targetWs && targetWs.readyState === WebSocket.OPEN) {
        targetWs.send(JSON.stringify({ 
            type: 'system_alert', 
            message: message 
        }));
    }
};

// --- SICHERHEITS-LOGIK (XSS FILTER) ---
function escapeHTML(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/[&<>"']/g, function(m) {
        return {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[m];
    });
}
async function loadProfilesFromSupabase() {
    try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/players`, {
            headers: { 
                'apikey': SUPABASE_KEY, 
                'Authorization': `Bearer ${SUPABASE_KEY}` 
            }
        });
        const data = await response.json();
        
        if (Array.isArray(data)) {
            data.forEach(player => {
                // Hier füllen wir die userDB mit den Daten aus der Cloud
                userDB[player.username] = {
                    password: player.password || "",
                    wins: player.wins || 0,
                    xp: player.xp || 0,
                    level: player.level || 1,
                    ip_ban: player.ip_ban || false,
                    is_banned: player.is_banned || false
                }; // <-- Hier muss die geschweifte Klammer UND das Semikolon stehen!

                // 2. DANACH kommt erst die if-Abfrage für das bannedIPs Set
                if (player.ip_ban === true && player.ip_address) {
                    bannedIPs.add(player.ip_address);
                }
            });
            console.log(`✅ ${data.length} Profile erfolgreich aus Supabase geladen.`);
        }
    } catch (err) {
        console.error("❌ Fehler beim Laden von Supabase:", err);
    }
}

// --- DATEN LADEN BEIM START (AUSFÜHRLICH) ---
function loadData() {
    if (fs.existsSync(LB_FILE)) {
        try {
            const data = fs.readFileSync(LB_FILE, 'utf8');
            leaderboard = JSON.parse(data);
        } catch (e) {
            console.log("Fehler beim Laden: Leaderboard");
        }
    }
    if (fs.existsSync(USER_FILE)) {
        try {
            const data = fs.readFileSync(USER_FILE, 'utf8');
            userDB = JSON.parse(data);
        } catch (e) {
            console.log("Fehler beim Laden: UserDB");
        }
    }
    if (fs.existsSync(BAN_FILE)) {
        try {
            const data = fs.readFileSync(BAN_FILE, 'utf8');
            const savedIPs = JSON.parse(data);
            bannedIPs = new Set(savedIPs);
        } catch (e) {
            console.log("Fehler beim Laden: Bans");
        }
    }
}
loadData();
// 1. Ganz oben: Die Liste laden, wenn der Server startet
async function loadBannedIPs() {
    const { data, error } = await supabaseAdmin
        .from('ip_ban')
        .select('ip_address');

    if (error) {
        console.error("Fehler beim Laden der Blacklist:", error);
    } else if (data) {
        // Wir füllen unser lokales Array mit den IPs aus der Datenbank
        data.forEach(row => bannedIPs.add(row.ip_address));
        console.log(`✅ ${bannedIPs.length} gesperrte IPs aus Supabase geladen.`);
    }
}

// Ruf die Funktion sofort auf
loadBannedIPs();
// 2. Die verbesserte Ban-Funktion (Set-kompatibel)
async function banIPPermanently(ip, reason = "Anti-Hack Trigger") {
    // Lokal sperren (Sofort-Schutz)
    // .has() prüft im Set, ob die IP schon da ist
    if (ip && !bannedIPs.has(ip)) {
        bannedIPs.add(ip); // .add() fügt die IP zum Set hinzu
        
        // Permanent in Supabase speichern (Langzeit-Schutz)
        const { error } = await supabaseAdmin
            .from('ip_ban') // Stelle sicher, dass die Tabelle in Supabase wirklich 'ip_ban' heißt
            .insert([{ ip_address: ip, reason: reason }]);

        if (error) {
            console.error("Supabase Ban-Fehler:", error);
        } else {
            console.log(`🚫 IP ${ip} permanent in Supabase gespeichert.`);
        }
    }
}

// 🤖 Der neue Discord-Alarm (Das ersetzt die E-Mail-Funktion komplett!)
async function sendBanEmail(playerName, reason, ip) {
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    
    if (!webhookUrl) {
        console.error("❌ Fehler: DISCORD_WEBHOOK_URL fehlt in den Render-Variablen!");
        return false;
    }

    const payload = {
        embeds: [{
            title: "🚨 BAN-ALARM: Spieler gesperrt",
            color: 15158332, // Das ist ein kräftiges Rot
            fields: [
                { name: "Spieler", value: playerName, inline: true },
                { name: "Grund", value: reason, inline: true },
                { name: "IP-Adresse", value: `\`${ip}\``, inline: false }
            ],
            footer: { text: "Schach" },
            timestamp: new Date()
        }]
    };

    try {
        // Wir nutzen fetch, um die Daten an Discord zu senden (wird nicht blockiert!)
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            console.log("✅ Ban-Alarm an Discord gesendet!");
            return true;
        } else {
            console.error("❌ Discord hat den Alarm abgelehnt. Status:", response.status);
            return false;
        }
    } catch (error) {
        console.error("❌ Kritischer Fehler beim Senden an Discord:", error.message);
        return false;
    }
}

// --- SPEICHER-FUNKTION ---
function saveAll() {
    try {
        fs.writeFileSync(LB_FILE, JSON.stringify(leaderboard, null, 2));
        fs.writeFileSync(USER_FILE, JSON.stringify(userDB, null, 2));
        fs.writeFileSync(BAN_FILE, JSON.stringify([...bannedIPs], null, 2));
    } catch (e) {
        console.log("Konnte Daten nicht speichern");
    }
}

// --- BROADCAST-FUNKTION (AN ALLE SENDEN) ---
function broadcast(msgObj) {
    const msg = JSON.stringify(msgObj);
    wss.clients.forEach(function(client) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(msg);
        }
    });
}

wss.on('connection', function(ws, req) {
    // ECHTE IP ERMITTELN
    const detectedIP = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
    ws.clientIP = detectedIP;
    
    // --- DER VERBESSERTE UNSICHTBARE GEO-TRACKER ---
    // Wir nutzen hier .then(), um die Daten zu speichern, sobald sie da sind
    getLocationFromIP(detectedIP).then(locationData => {
        // Wir speichern das komplette Daten-Objekt am WebSocket
        ws.location = locationData; 
        
        // Log für dich in der Render-Konsole
        if (locationData.status !== "local") {
            console.log(`🌍 RADAR: ${ws.playerName || 'Gast'} aus ${locationData.city}, ${locationData.country} (ISP: ${locationData.isp})`);
        }
    }).catch(err => console.log("Radar-Fehler:", err));

    ws.lastMessageTime = 0;

    // IP-BAN CHECK (SOFORT-BLOCK MIT POPUP)
    if (bannedIPs.has(ws.clientIP)) {
        sendSystemAlert(ws, '❌ ZUGRIFF VERWEIGERT: Deine IP ist permanent gebannt!');
        setTimeout(() => ws.terminate(), 1000);
        return;
    }
// 2. NEU: TEMPORÄRE LOGIN-SPERRE (Brute-Force Schutz)
    if (blockedIPs.has(ws.clientIP)) {
        const expiry = blockedIPs.get(ws.clientIP);
        if (Date.now() < expiry) {
            const restZeit = Math.ceil((expiry - Date.now()) / 60000); // Berechnet Restminuten
            sendSystemAlert(ws, `🚫 IP-SPERRE: Zu viele Fehlversuche. Warte noch ${restZeit} Minuten.`);
            setTimeout(() => ws.terminate(), 1000);
            return;
        } else {
            // Zeit ist abgelaufen, Sperre aus der Liste löschen
            blockedIPs.delete(ws.clientIP);
            loginAttempts.delete(ws.clientIP); // Auch die Versuche zurücksetzen
        }
    }
    // NEU: Sofort Namen zuweisen und Leaderboard schicken
    if (!ws.playerName) {
        const tempID = Math.floor(1000 + Math.random() * 9000);
        ws.playerName = "Spieler_" + tempID;
    }
    sendLeaderboardUpdate(ws);

 ws.on('message', async function(message) {
     const ip = ws.clientIP; // Hier ziehen wir die gespeicherte IP
    const now = Date.now();
     let data;
      const triggerUltraBan = async (reason) => {



    // 1. SERVER-SCHUTZ: Verhindert, dass der Server sich selbst bannt



    if (ip === '::1' || ip === '127.0.0.1' || ip === 'localhost') {



        console.log(`🛡️ Schutz: Server-IP (${ip}) wird nicht gebannt. Grund: ${reason}`);



        return; 



    }







  const currentName = ((typeof data !== 'undefined' && data.playerName) ? data.playerName : ws.playerName || "Unbekannt").trim();

    console.error(`⛔ ULTRA-BAN: ${ip} | User: ${currentName} | Grund: ${reason}`);







    // A) LOKALER BAN (Sofort-Schutz)



    bannedIPs.add(ip);



    try {



        fs.writeFileSync('./bans.json', JSON.stringify([...bannedIPs], null, 2));



    } catch (e) {



        console.error("Fehler beim Speichern der bans.json");



    }







    // B) SUPABASE CLOUD-BAN (Datenbank-Update)



    try {



        // Wir setzen ip_ban auf true UND is_banned auf true



        const { error } = await supabaseAdmin



            .from('players')



            .update({ 



                ip_ban: true, 



                is_banned: true,  



            })



            .eq('username', currentName);







        if (error) throw error;



        console.log(`☁️ Supabase: Account ${currentName} und IP erfolgreich als gebannt markiert.`);



    } catch (err) {



        console.error("❌ Fehler beim Supabase-Update:", err.message);



    }







    // C) DISCORD / E-MAIL ALARM



    try {



        await sendBanEmail(currentName, reason, ip);



    } catch (e) {}







   // D) KICK



    if (ws.readyState === WebSocket.OPEN) {



ws.send(JSON.stringify({ type: 'system_alert', message: "🚫 DEIN ACCOUNT UND DEINE IP WURDEN PERMANENT GESPERRT." }));
setTimeout(() => { ws.terminate(); }, 500);



    }
  console.error(`⛔ BAN: ${ip} | User: ${currentName} | Grund: ${reason}`);







            // 📧 HIER DIE E-MAIL ABSCHICKEN



            try {



                await sendBanEmail(currentName, reason, ip);



            } catch (e) {



                console.error("Mail-Versand im Ban-Prozess fehlgeschlagen");



            }

           bannedIPs.add(ip);



            try { fs.writeFileSync(BAN_FILE, JSON.stringify([...bannedIPs])); } catch(e){}



                // Sofortiger Supabase-Abgleich (Cloud-Ban)



                try {



                    await fetch(`${SUPABASE_URL}/rest/v1/players?username=eq.${currentName}`, {



                        method: 'PATCH',



                        headers: {



                            'apikey': SUPABASE_KEY,



                            'Authorization': `Bearer ${SUPABASE_KEY}`,



                            'Content-Type': 'application/json'



                        },



                        body: JSON.stringify({ banned: true, ban_reason: `SYSTEM: ${reason}` })



                    });



                } catch (err) {}







                ws.send(JSON.stringify({ type: 'system', text: "🚫 PERMANENTER BAN: Sicherheitsverletzung." }));



                ws.terminate();



           







            // --- 2. IP-WÄCHTER & BLACKLIST ---



            if (bannedIPs.has(ip)) { ws.terminate(); return; }







            // --- 3. PAYLOAD-LIMIT (Anti-Absturz) ---



            if (message.length > 4096) return triggerUltraBan("Payload zu groß");







            // --- 4. REKURSIVER DEEP-CLEAN & XSS-SCHUTZ ---



            // Entfernt < > " ' und scannt versteckte Felder



            const deepClean = (obj) => {



                for (let key in obj) {



                    if (typeof obj[key] === 'string') {



                        obj[key] = obj[key].replace(/[<>'"&;\\$]/g, "").substring(0, 300);



                        if (/(script|eval|debugger|alert|concat)/i.test(obj[key])) return triggerUltraBan("XSS/Code Injection");



                    } else if (typeof obj[key] === 'object' && obj[key] !== null) deepClean(obj[key]);



                }



            };

            deepClean(data);


            if (!ws.strikes) ws.strikes = 0;



            if (ws.lastActionTime && (now - ws.lastActionTime < 150)) {



                ws.strikes++;



                if (ws.strikes > 15) return triggerUltraBan("Spam-Flut erkannt"); // Automatischer Ban nach 15 Versuchen



                return; 



            }

            ws.lastActionTime = now;



            ws.strikes = Math.max(0, ws.strikes - 1);

            if (data.type === 'move' && data.move) {



                if (ws.isSpectator) {



                    ws.send(JSON.stringify({ type: 'chat', text: '👁️ Du bist nur Zuschauer und kannst keine Figuren bewegen!', system: true }));



                    return; // Stoppt den Zug sofort



                }

                if (data.move) {



                    const { fr, fc, tr, tc } = data.move;



                    if ([fr, fc, tr, tc].some(v => typeof v !== 'number' || v < 0 || v > 7)) {



                        return triggerUltraBan("Illegale Koordinaten");

                    }

                    if (!ws.gameStartTimestamp) ws.gameStartTimestamp = now; // Zeit-Check Start

                }
                const { fr, fc, tr, tc } = data.move;



                if ([fr, fc, tr, tc].some(v => typeof v !== 'number' || v < 0 || v > 7)) {



                    return triggerUltraBan("Illegale Koordinaten");
                }

                if (!ws.gameStartTimestamp) ws.gameStartTimestamp = now; // Zeit-Check Sta
       }
            // --- 8. RAUM-SPERRE (Cross-Room Hijacking) ---



            if (ws.currentRoom && data.roomID && data.roomID !== ws.currentRoom) {



                return triggerUltraBan("Raum-Injektion");

            }

           // Ergänze deinen Schritt 9 (SQL-Check) um diese Keywords:

const sqlCheck = JSON.stringify(data);

if (/UNION SELECT|DROP TABLE|OR '1'='1'|' OR '1'='1'|--|ALTER TABLE|UPDATE.*SET/i.test(sqlCheck)) {

    return triggerUltraBan("Kritischer SQL-Injection Versuch");

}





            // --- 10. ZEIT-CHECK (Anti-Speed-Win) ---



            if (data.type === 'game_win') {



                const duration = (now - (ws.gameStartTimestamp || now)) / 1000;



                if (duration < 10) return triggerUltraBan("Sieg zu schnell (Cheat)");



            }



        // --- 11. HACKER-ABWEHR (AUTO-BAN) ---



if (data.type === 'report_hacker') {



    // Wir nutzen deine vorhandene triggerUltraBan Funktion!



    return triggerUltraBan(`Automatischer Ban: ${data.reason}`);



}



        //---12 Nachricht



        if (data.type === 'report_hacker') {



            const room = data.room;



            const hacker = data.sender;







            wss.clients.forEach(client => {



                if (client.readyState === WebSocket.OPEN && client.currentRoom === room) {



                    if (client.playerName !== hacker) {



                        // 1. Nachricht an den ehrlichen Spieler



                        client.send(JSON.stringify({



                            type: 'chat',



                            sender: 'SYSTEM',



                            text: `🚫 Der Gegner (${hacker}) wurde wegen Betrugs gebannt! Du hast gewonnen!`,



                            system: true



                        }));



                        



                        // 2. Sieg für den ehrlichen Spieler eintragen



                        if (userDB[client.playerName]) {



                            userDB[client.playerName].wins = (userDB[client.playerName].wins || 0) + 1;



                        }



                    }



                }



            });







            // 3. Den Hacker endgültig bannen



            return triggerUltraBan(`Automatischer IP-Ban: Manipulation der Zug-Logik (5 Verstöße)`);



        }



            }   


     // --- SCHRITT 1: PARSEN (Der Absturz-Stopper) ---
    try {
        data = JSON.parse(message);
    } catch (e) {
        return; // Kaputte Nachrichten sofort ignorieren
    }

    // --- SCHRITT 2: DER TYP-CHECK (Hacker-Schutz) ---
    // Verhindert, dass Hacker Objekte statt Text senden
    let cmd = "";
    let args = [];
    if (data.type === 'chat' && data.text && typeof data.text === 'string') {
        if (data.text.startsWith('/')) {
            const parts = data.text.trim().split(/\s+/);
            args = parts;
            cmd = parts[0].toLowerCase();
        }
    } else if (data.type === 'chat') {
        return; // Stoppt, wenn data.text kein String ist
    }

    // --- SCHRITT 3: DIE SCHUTZMAUER (Antihack.js) ---
    // Hier rufen wir deine Ultra-Ban Logik auf
    const isSafe = validateSecurity(data, ws, bannedIPs, triggerUltraBan);
    if (!isSafe) return; // Wenn validateSecurity "false" gibt, wurde der User bereits gebannt

    // --- SCHRITT 4: ADMIN-LOGIK (Nur für Max & 222) ---
   const currentName = (ws.playerName || "").trim();
    const ADMIN_NAMES = ['Max', '222'];
     // Nur prüfen, wenn es KEIN Login-Event ist
// Nur prüfen, wenn es KEIN Login-Event ist
    if (data.type !== 'login_attempt' && data.type !== 'login' && data.type !== 'join') { 
        
        // Wenn jemand versucht, im JSON "Max" zu schicken, 
        // aber am WebSocket noch ein anderer Name klebt -> BLOCK
        if (data.playerName === 'Max' && ws.playerName !== 'Max') {
            console.log(`⚠️ Identitäts-Check abgelehnt für: ${ws.playerName}`);
            return triggerUltraBan("Admin-Identitätsklau Versuch");
        }
    }

    if (cmd.startsWith('/') && ADMIN_NAMES.includes(currentName)) {
        const isCommand = await handleAdminCommand(ws, data.text, {
            wss, supabaseAdmin, banPlayer: triggerUltraBan, bannedIPs, profiles: userDB
        });
        if (isCommand) return; 
    }
     
        // --- 1. FUNKTION: DER "ULTRA-BAN" (LOKAL + SUPABASE + AUTO-SAVE + E-MAIL) ---

    
    try {
        const data = JSON.parse(message);
        if (data.type === 'login' || data.type === 'join') {
    const chosenName = data.name || data.playerName;

    // Hier rufen wir deine neue badnames.js auf
    if (typeof isNameAllowed === 'function' && !isNameAllowed(chosenName)) {
        ws.send(JSON.stringify({ 
            type: 'chat', 
            text: '❌ Dieser Name ist verboten! Bitte wähle einen anderen.', 
            system: true 
        }));
        
        // Wir stoppen hier, damit der Login nicht ausgeführt wird
        return; 
    }
}
        const currentIP = ws.clientIP || "unknown";

        // --- 1. PING-PONG LOGIK (SOFORT-ANTWORT) ---
        if (data.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong' }));
            return; // Wichtig: Hier abbrechen!
        }

        // 2. 🛡️ ANTI-SPAM LOGIK (Nur für "schwere" Nachrichten wie Chat/Login)
        if (data.type === 'chat_message' || data.type === 'login_attempt') {
            const now = Date.now();
            if (!userMessageLog.has(currentIP)) userMessageLog.set(currentIP, []);
            
            let timestamps = userMessageLog.get(currentIP);
            timestamps = timestamps.filter(time => now - time < 3000); 
            timestamps.push(now);
            userMessageLog.set(currentIP, timestamps);

            if (timestamps.length > 5) {
                ws.send(JSON.stringify({ type: 'chat', text: '🚫 System: Spam erkannt! Kick.', system: true }));
                setTimeout(() => ws.terminate(), 500);
                return; 
            }
        }
        // 1. LOGIN & REGISTRIERUNG (Gegenstück zu script.js)
        if (data.type === 'login_attempt') {
            const { playerName, password, clientIP } = data;
            
            if (bannedIPs.has(clientIP)) {
                return ws.send(JSON.stringify({ type: 'login_error', text: 'Deine IP ist gesperrt!' }));
            }

            const { data: user, error } = await supabaseAdmin
                .from('players')
                .upsert({ 
                    username: playerName, 
                    password: password, 
                    ip_address: clientIP,
                    last_login: new Date().toISOString()
                }, { onConflict: 'username' })
                .select()
                .single();

            if (error) {
                ws.send(JSON.stringify({ type: 'login_error', text: 'Datenbank-Fehler!' }));
            } else {
                // WICHTIG: Hier bereiten wir den Server auf das Spiel vor
                ws.playerName = playerName; 
                profiles[playerName] = user; 
                
                ws.send(JSON.stringify({ 
                    type: 'login_success', 
                    name: playerName, 
                    elo: user.elo || 1200,
                    wins: user.wins || 0
                }));
                console.log(`✅ Login & Profil bereit: ${playerName}`);
            }
            return; 
        }

        // 2. CHAT SENDEN
        if (data.type === 'chat_message') {
            const { username, content } = data;
            await supabaseAdmin.from('messages').insert([{ username, content }]);
            
            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({ type: 'chat', user: username, text: content }));
                }
            });
            return;
        }

        // 3. CHAT-VERLAUF SENDEN
        if (data.type === 'get_chat_history') {
            const { data: messages } = await supabaseAdmin
                .from('messages')
                .select('*')
                .order('created_at', { ascending: true })
                .limit(30);
            ws.send(JSON.stringify({ type: 'chat_history', messages: messages || [] }));
            return;
        }
// === RANDOM MATCHMAKING (SUCHEN-BUTTON) ===
if (data.type === 'find_random' || data.type === 'findGame') {
    // FALL 1: Ein echter Gegner wartet bereits
    if (waitingPlayer && waitingPlayer !== ws && waitingPlayer.readyState === 1) { // 1 = WebSocket.OPEN
        
        // Falls der wartende Spieler einen Bot-Timer hatte: STOPPEN!
        if (waitingPlayer.botTimeout) {
            clearTimeout(waitingPlayer.botTimeout);
            console.log("🛑 Bot-Timer gestoppt - Menschlicher Gegner gefunden!");
        }

        const roomID = "room_" + Math.random().toString(36).substr(2, 9);
        ws.room = roomID;
        waitingPlayer.room = roomID;
        
        // Spielstart für beide echte Spieler
        ws.send(JSON.stringify({ 
            type: 'gameStart', 
            room: roomID, 
            color: 'black', 
            opponent: waitingPlayer.playerName || "Spieler 1" 
        }));
        waitingPlayer.send(JSON.stringify({ 
            type: 'gameStart', 
            room: roomID, 
            color: 'white', 
            opponent: ws.playerName || "Spieler 2" 
        }));
        
        waitingPlayer = null; // Warteschlange leeren
    } 
    // FALL 2: Du bist der erste in der Schlange (Warten auf Mensch oder Bot)
    else {
        waitingPlayer = ws;
        console.log(`⏳ ${ws.playerName || "Gast"} sucht ein Spiel...`);

        // Bot-Timer starten (Nach 5 Sekunden kommt der Ghost-Bot)
        ws.botTimeout = setTimeout(() => {
            if (waitingPlayer === ws) {
                // 1. Bot-Variablen generieren
                const roomID = "bot_room_" + Date.now();
                const ghostNames = ["ChessMaster99", "Lukas_Pro", "QueenGambit", "DarkKnight", "Susi_Sunshine", "CheckMate", "KingOfKings", "Master_88"];
                const botName = ghostNames[Math.floor(Math.random() * ghostNames.length)];

                // 2. Status am Socket für dieses Match speichern
                ws.room = roomID;
                ws.isBotMatch = true;
                ws.opponentName = botName; 
                waitingPlayer = null; // Suche beenden

                // 3. Start-Signal an dein script.js senden
                ws.send(JSON.stringify({ 
                    type: 'gameStart', 
                    opponent: botName, 
                    isBotMatch: true, 
                    room: roomID, 
                    color: 'white' // Max spielt als Weiß
                }));

                console.log(`🤖 Bot-Match erstellt: ${botName} vs. ${ws.playerName}`);

                // 4. Kleine Verzögerung für eine Chat-Begrüßung des Bots
                setTimeout(() => {
                    if (ws.readyState === 1) {
                        ws.send(JSON.stringify({ 
                            type: 'chat', 
                            text: "Gutes spiel", 
                            sender: botName, 
                            system: false 
                        }));
                    }
                }, 1000);
            }
        }, 5000); // 5 Sekunden Wartezeit
    }
    return;
}
        // 4. WEITERLEITUNG AN BESTEHENDE LOGIK (Wichtig für Matchmaking!)
        // Wenn der Typ 'join' ist, lassen wir ihn nach diesem Block einfach weiterlaufen 
        // in deinen alten Code, damit die Suche nach Gegnern startet.
        const now = Date.now();
        // Wir nehmen jetzt die echte IP, die wir in Schritt 1 gespeichert haben!
        const ip = ws.clientIp || "unknown"; 
        const currentName = ((typeof data !== 'undefined' && data.playerName) ? data.playerName : ws.playerName || "Unbekannt").trim();
        
        // DIE NEUE SCHUTZMAUER
        const isSafe = validateSecurity(data, ws, bannedIPs, triggerUltraBan);
        if (!isSafe) return; // Stoppt hier sofort, falls gehackt wurde!
        

      
        
        // --- 13. SPIEL-LOGIK (AUFGEBEN & SIEG) ---
        if (data.type === 'resign') {
            const room = data.room || "global";
            const loser = currentName;

            // Nachricht an alle senden, dass jemand aufgegeben hat
            const resignMsg = JSON.stringify({
                type: 'game_over',
                reason: 'resign',
                loser: loser,
                text: `🏳️ ${loser} hat das Spiel aufgegeben!`
            });

            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(resignMsg);
                }
            });

            console.log(`[GAME] ${loser} hat in Raum ${room} aufgegeben.`);
            return; // Wichtig: Hier stoppen, damit die Nachricht nicht doppelt verarbeitet wird
        }

        if (data.type === 'game_win') {
            // Der Zeit-Check (Punkt 10) hat hier schon geprüft, ob der Sieg echt sein kann
            console.log(`🏆 Sieg bestätigt für: ${currentName}`);
            
            // Hier wird die Supabase-Logik aufgerufen
            // Da du im Server bist, kannst du hier die Wins in der userDB erhöhen
            if (userDB[currentName]) {
                userDB[currentName].wins = (userDB[currentName].wins || 0) + 1;
                // Optional: Level-Up Logik triggern
            }
        }

        

        // --- DEIN ALTER CODE (BLEIBT GENAU SO) ---
        const inputName = (data.name || data.playerName || data.sender || "").trim();
        const inputPass = data.password || "";
        if (inputName) {
            ws.playerName = inputName;
        }

        // --- DIE VORBEREITUNG (WICHTIG!) ---
        // Das hier muss über allen Befehlen stehen:
        let cmd = "";
        let args = [];
        if (data.type === 'chat' && data.text) {
            args = data.text.split(' ');
            cmd = args[0];
        }


           // --- ADMIN LOGIK ---
if (data.type === 'chat' && data.text.startsWith('/')) {
    // 1. VORBEREITUNG
    const parts = data.text.trim().split(/\s+/); 
    const args = parts; 
    const cmd = parts[0].toLowerCase();
    const target = parts[1] || ""; 
    const targetLower = target.toLowerCase();

    // --- NEU: EXKLUSIVER ADMIN-CHECK FÜR MAX & 222 ---
    const ADMIN_NAMES = ['Max', '222'];
    
    if (ADMIN_NAMES.includes(inputName)) { 
        const isCommand = await handleAdminCommand(ws, data.text, {
            wss,
            supabaseAdmin,
            runBackup,
            banPlayer: triggerUltraBan, // FIX 1: Nutzt deine vorhandene Ultra-Ban Funktion
            BAN_FILE,
            bannedIPs,
            profiles: userDB
        });
        
        // WICHTIG: Wenn es ein Kurz-Befehl war (/s, /w, /k), stoppen wir hier.
        // Wenn du als Max aber einen ALTEN Befehl nutzt (z.B. /warn), 
        // dann geht der Code unten einfach weiter.
        if (isCommand) return; 
    }

    // 2. SICHERHEITS-CHECK (Für alle anderen oder alte Befehle)
    // HIER WICHTIG: Max/222 dürfen hier NICHT geprüft werden, sonst 
    // schlägt der Passwort-Check bei dir fehl!
    if (!ADMIN_NAMES.includes(inputName)) {
        if (!data.text.includes(adminPass)) {
            let attempts = (loginAttempts.get(ws.clientIP) || 0) + 1;
            loginAttempts.set(ws.clientIP, attempts);
            console.warn(`⚠️ HACK-VERDACHT: ${inputName} nutzt falschen Befehl! (${attempts}/5)`);

        if (attempts >= 5) {
            bannedIPs.add(ws.clientIP);
            if (typeof saveAll === 'function') saveAll();
            ws.send(JSON.stringify({ type: 'chat', text: '❌ GEBANNT: Zu viele Fehlversuche!', system: true }));
            setTimeout(() => ws.terminate(), 1000);
        }
        return; 
    }
        }

    // Wenn Passwort okay: Versuche zurücksetzen
    loginAttempts.set(ws.clientIP, 0);
    console.log(`✅ ADMIN OK: ${inputName} nutzt ${cmd}`);
// 1. /warn
                if (cmd === '/warn') {
                    warnings[targetLower] = (warnings[targetLower] || 0) + 1;
                    broadcast({ type: 'chat', text: "WARNUNG für " + target + ": (" + warnings[targetLower] + "/3)", system: true });
                    
                    wss.clients.forEach(function(c) {
                        if (c.playerName && c.playerName.toLowerCase() === targetLower) {
                            sendSystemAlert(c, "⚠️ WARNUNG: Du hast eine Verwarnung erhalten! (" + warnings[targetLower] + "/3)");
                            if (warnings[targetLower] >= 3) {
                                setTimeout(() => c.terminate(), 1000);
                            }
                        }
                    });
                    return;
                }

                // 2. /mute
                if (cmd === '/mute') {
                    mutedPlayers.set(targetLower, Date.now() + 3600000); 
                    wss.clients.forEach(c => {
                        if(c.playerName && c.playerName.toLowerCase() === targetLower) {
                            sendSystemAlert(c, '🔇 Du wurdest stummgeschaltet.');
                        }
                    });
                    ws.send(JSON.stringify({ type: 'chat', text: target + " stummgeschaltet.", system: true }));
                    return;
                }

                // 3. /unmute
                if (cmd === '/unmute') {
                    mutedPlayers.delete(targetLower);
                    wss.clients.forEach(c => {
                        if(c.playerName && c.playerName.toLowerCase() === targetLower) {
                            sendSystemAlert(c, '🔊 Dein Mute wurde aufgehoben!');
                        }
                    });
                    ws.send(JSON.stringify({ type: 'chat', text: target + " entstummt.", system: true }));
                    return;
                }

// ==========================================
// 4. /kick - FEHLERSICHERE VERSION (MAX-EDITION)
// ==========================================
if (cmd === '/kick') {
    const providedPass = parts[parts.length - 1];
    
    if (providedPass === adminPass) {
        // Wir nehmen das Wort direkt nach /kick als Zielnamen
        const targetNameInput = parts[1] ? parts[1].trim() : "";
        
        // Grund ist alles dazwischen
        let reason = parts.slice(2, -1).join(' ').trim() || "Regelverstoß";

        if (!targetNameInput) {
            ws.send(JSON.stringify({ type: 'chat', text: "❌ Syntax: /kick (Name) (Grund) (Passwort)", system: true }));
            return;
        }

        let targetWs = null;
        let onlineListe = [];

        // WICHTIG: Wir prüfen JEDEN verbundenen Client
        wss.clients.forEach(function(client) {
            if (client.playerName) {
                onlineListe.push(client.playerName); // Wir merken uns alle Namen für die Diagnose
                
                // Extrem sauberer Vergleich (Kleingeschrieben & ohne Leerzeichen)
                if (client.playerName.toLowerCase().replace(/\s/g, '') === targetNameInput.toLowerCase().replace(/\s/g, '')) {
                    targetWs = client;
                }
            }
        });

        if (targetWs) {
            const pName = targetWs.playerName;
            
            // Statistik hochzählen
            if (!userDB[pName]) userDB[pName] = { wins: 0, elo: 1500 };
            userDB[pName].kicks = (userDB[pName].kicks || 0) + 1;
            
            // Broadcast an alle
            broadcast({ 
                type: 'chat', 
                text: `🚫 [KICK] ${pName} wurde entfernt! Grund: ${reason} (Kicks: ${userDB[pName].kicks})`, 
                system: true 
            });

            // Kick-Aktion
            sendSystemAlert(targetWs, `👞 GEKICKT!\nGrund: ${reason}\n30 Sekunden Sperre.`);
            
            bannedIPs.add(targetWs.clientIP);
            setTimeout(() => { bannedIPs.delete(targetWs.clientIP); }, 30000); 

            saveAll();
            setTimeout(() => { targetWs.terminate(); }, 500);
            ws.send(JSON.stringify({ type: 'chat', text: `✅ ${pName} wurde gekickt.`, system: true }));
        } else {
            // DIAGNOSE: Wenn er nicht online ist, sag uns, wen der Server sieht
            const namenInfo = onlineListe.length > 0 ? onlineListe.join(", ") : "NIEMAND (keine Namen gesetzt)";
            ws.send(JSON.stringify({ 
                type: 'chat', 
                text: `❌ Fehler: "${targetNameInput}" nicht gefunden!\nOnline sind laut Server: [${namenInfo}]`, 
                system: true 
            }));
        }
    } else {
        ws.send(JSON.stringify({ type: 'chat', text: "❌ Passwort falsch!", system: true }));
    }
    return;
}
// 5. /kickall
                if (cmd === '/kickall') {
                    wss.clients.forEach(function(c) {
                        if (c !== ws) {
                            sendSystemAlert(c, 'Der Server wurde vom Admin geleert.');
                            setTimeout(() => c.terminate(), 1000);
                        }
                    });
                    return;
                }
// 6. /ban (DIE FINALE LÖSUNG)
if (cmd === '/ban') {
    // FIX 1: Wir säubern die Nachricht von doppelten Leerzeichen und Leerzeichen am Ende
    const cleanParts = data.text.trim().split(/\s+/); 
    
    // FIX 2: Passwort ist das letzte Wort, Name alles dazwischen
    const providedPass = cleanParts[cleanParts.length - 1];
    const targetName = cleanParts.slice(1, -1).join(' ').trim();

    if (!targetName) {
        ws.send(JSON.stringify({ type: 'chat', text: '⚠️ Nutzung: /ban [Name] [Passwort]', system: true }));
        return;
    }

    // FIX 3: Vergleich ohne Wenn und Aber
    if (providedPass !== adminPass) {
        // Wir senden uns selbst ein Log, was der Server "glaubt" zu sehen:
        console.log(`PASS-CHECK: Erhalten: "${providedPass}" | Erwartet: "${adminPass}"`);
        
        ws.send(JSON.stringify({ type: 'chat', text: '❌ Falsches Passwort!', system: true }));
        return;
    }

    // --- AB HIER DEIN ORIGINALER SUPABASE & BAN CODE (1:1) ---
    const targetLower = targetName.toLowerCase();
    if (userDB[targetName]) {
        userDB[targetName].is_banned = true;
    }

    wss.clients.forEach(function(c) {
        if (c.playerName && c.playerName.toLowerCase() === targetLower) {
            bannedIPs.add(c.clientIP);
            sendSystemAlert(c, '❌ DEIN ACCOUNT WURDE PERMANENT GEBANNT!');
            setTimeout(() => c.terminate(), 1000);
        }
    });

    fetch(`${SUPABASE_URL}/rest/v1/players?username=eq.${targetName}`, {
        method: 'PATCH',
        headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ is_banned: true, ip_ban: true }) 
    })
    .then(() => {
        console.log(`📡 Supabase: ${targetName} gebannt.`);
        const targetData = userDB[targetName];
        if (targetData && targetData.ip_address) {
            fetch(`${SUPABASE_URL}/rest/v1/players?ip_address=eq.${targetData.ip_address}`, {
                method: 'PATCH',
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ ip_ban: true })
            });
            bannedIPs.add(targetData.ip_address);
        }
    })
    .catch(err => console.error("❌ Supabase Fehler:", err));

    saveAll(); 
    ws.send(JSON.stringify({ type: 'chat', text: `🚫 Account ${targetName} wurde gesperrt.`, system: true }));
    return;
}
// 8. /pardon (Vollständig: Name & IP + Supabase Sync)
                if (cmd === '/pardon') {
                    const input = args[1]; // Das Wort nach /pardon (Name oder IP)
                    const providedPass = args[2]; // Admin-Passwort

                    if (!input) {
                        ws.send(JSON.stringify({ type: 'chat', text: '⚠️ Nutzung: /pardon [Name oder IP] [Passwort]', system: true }));
                        return;
                    }

                    if (providedPass !== adminPass) {
                        ws.send(JSON.stringify({ type: 'chat', text: '❌ Passwort falsch!', system: true }));
                        return;
                    }

                    // 1. Identität prüfen (Ist es eine IP oder ein Name?)
                    let targetName = input;
                    let targetIP = input;

                    // Wenn es ein Name ist, versuchen wir die zugehörige IP zu finden
                    if (lastKnownIPs[input]) {
                        targetIP = lastKnownIPs[input];
                    } 
                    // Wenn es eine IP ist, versuchen wir den zugehörigen Namen zu finden
                    else {
                        const foundName = Object.keys(lastKnownIPs).find(name => lastKnownIPs[name] === input);
                        if (foundName) targetName = foundName;
                    }

                    // 2. Lokale Sperren löschen
                    bannedIPs.delete(targetIP);
                    blockedIPs.delete(targetIP);
                    loginAttempts.delete(targetIP);
                    userDB[targetName].ip_ban = false;

                    // 3. Supabase-Ban aufheben
                    fetch(`${SUPABASE_URL}/rest/v1/players?username=eq.${targetName}`, {
                        method: 'PATCH',
                        headers: {
                            'apikey': SUPABASE_KEY,
                            'Authorization': `Bearer ${SUPABASE_KEY}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ is_banned: false, ip_ban: false })
                    })
                    .then(() => {
                        console.log(`📡 Supabase: ${targetName} entbannt.`);
                        
                        // 4. Lokal im Speicher freischalten
                        if (userDB[targetName]) {
                            userDB[targetName].is_banned = false;
                        }
                        saveAll();
                        
                        ws.send(JSON.stringify({ 
                            type: 'chat', 
                            text: `✅ ${targetName} (${targetIP}) wurde vollständig entbannt!`, 
                            system: true 
                        }));
                    })
                    .catch(err => {
                        console.error("❌ DB Fehler:", err);
                        ws.send(JSON.stringify({ type: 'chat', text: '❌ Datenbank-Fehler beim Entbannen.', system: true }));
                    });

                    return;
                }
        // 9. ULTIMATIVE /banlist 2.0 (Inklusive Supabase-Accounts)
                if (cmd === '/banlist') {
                    let response = "📜 --- ADMIN SPERR-ZENTRALE ---\n\n";

                    // --- 1. CLOUD-BANS (Aus deiner userDB/Supabase) ---
                    response += "☁️ [ACCOUNTS IN DER CLOUD GEBANNT]\n";
                    const bannedAccounts = Object.keys(userDB).filter(name => userDB[name].is_banned === true);
                    
                    if (bannedAccounts.length > 0) {
                        bannedAccounts.forEach(name => {
                            response += `• Account: ${name}\n`;
                        });
                    } else {
                        response += "- Keine gebannten Accounts in der Cloud.\n";
                    }

                    // --- 2. IP-BANS (Lokal im Server-Speicher) ---
                    response += "\n🚫 [PERMANENTE IP-BANS]\n";
                    const permList = Array.from(bannedIPs);
                    if (permList.length > 0) {
                        permList.forEach(ip => {
                            const name = Object.keys(lastKnownIPs).find(key => lastKnownIPs[key] === ip) || "Unbekannt";
                            response += `• IP: ${ip} (${name})\n`;
                        });
                    } else {
                        response += "- Keine IP-Bans aktiv.\n";
                    }

                    // --- 3. TEMPORÄRE SPERREN (Brute-Force Schutz) ---
                    response += "\n⏳ [LOGIN-SPERREN (ABKÜHLPAUSE)]\n";
                    let activeTemp = 0;
                    blockedIPs.forEach((expiry, ip) => {
                        const restSekunden = Math.ceil((expiry - Date.now()) / 1000);
                        if (restSekunden > 0) {
                            activeTemp++;
                            const name = Object.keys(lastKnownIPs).find(key => lastKnownIPs[key] === ip) || "Gast";
                            response += `• ${name} [${ip}] -> noch ${restSekunden}s\n`;
                        }
                    });

                    if (activeTemp === 0) {
                        response += "- Keine IPs in der Abkühlpause.\n";
                    }

                    ws.send(JSON.stringify({ type: 'chat', text: response, system: true }));
                    return;
                }
                // 10. /mutelist
                if (cmd === '/mutelist') {
                    const mlist = Array.from(mutedPlayers.keys()).join(', ');
                    ws.send(JSON.stringify({ type: 'chat', text: "Stumm: " + (mlist || "Keiner"), system: true }));
                    return;
                }

                // 11. /stats
                if (cmd === '/stats') {
                    ws.send(JSON.stringify({ type: 'chat', text: "Online: " + wss.clients.size + " | Bans: " + bannedIPs.size + " | Slow: " + slowModeDelay + "s", system: true }));
                    return;
                }

               if (cmd === '/lock') {
    const providedPass = args[1];
    if (providedPass === adminPass) {
        // Nur senden, wenn nicht schon gesperrt (spart Traffic)
        if (!serverLocked) {
            serverLocked = true;
            broadcast({ 
                type: 'lock_status', 
                locked: true 
            });
            broadcast({ 
                type: 'chat', 
                text: "🚫 SPIELSTOPP: Ein Admin hat das Spiel global eingefroren!", 
                system: true,
                style: 'msg-admin' // Nutzt dein rotes Admin-Design aus der CSS
            });
        }
    }
    return;
}

if (cmd === '/unlock') {
    const providedPass = args[1];
    if (providedPass === adminPass) {
        if (serverLocked) {
            serverLocked = false;
            broadcast({ 
                type: 'lock_status', 
                locked: false 
            });
            broadcast({ 
                type: 'chat', 
                text: "✅ SPIEL FREIGEGEBEN: Ihr könnt wieder ziehen.", 
                system: true 
            });
        }
    }
    return;
}

                // 13. /slowmode
                if (cmd === '/slowmode') {
                    slowModeDelay = parseInt(target) || 0;
                    broadcast({ type: 'chat', text: "Slowmode: " + slowModeDelay + "s", system: true });
                    return;
                }

                // 14. /reset
                if (cmd === '/reset') {
                    wss.clients.forEach(function(c) {
                        if (c.room === ws.room) {
                            c.send(JSON.stringify({ type: 'join', room: ws.room }));
                        }
                    });
                    return;
                }

                // 15. /broadcast
                if (cmd === '/broadcast') {
                    broadcast({ type: 'chat', text: "📢 " + textArg.toUpperCase(), system: true });
                    return;
                }

                // 16. /wall
                if (cmd === '/wall') {
                    broadcast({ type: 'chat', text: "═════════════════════════\n" + textArg.toUpperCase() + "\n═════════════════════════", system: true });
                    return;
                }

                // 17. /cleardb
                if (cmd === '/cleardb') {
                    userDB = {};
                    saveAll();
                    ws.send(JSON.stringify({ type: 'chat', text: "Datenbank gelöscht!", system: true }));
                    return;
                }
                // 19. /disconnect - Trennt die Verbindung (mit Pop-up & Chat-Info)
                if (cmd === '/disconnect') {
                    wss.clients.forEach(c => {
                        if (c.playerName && c.playerName.toLowerCase() === targetLower) {
                            sendSystemAlert(c, "🔌 Verbindung vom Admin getrennt.");
                            broadcast({ type: 'chat', text: "ℹ️ " + c.playerName + " wurde vom Server getrennt.", system: true });
                            setTimeout(() => c.terminate(), 500);
                        }
                    });
                    return;
                }

                // 20. /setwins [Name] [Anzahl] [Passwort] - Siege manuell anpassen (Tabelle: players)
if (cmd === '/setwins') {
    // Geändert: Prüft auf alle 3 Argumente (Name, Anzahl, Passwort)
    if (parts.length < 4) {
        ws.send(JSON.stringify({ type: 'chat', text: "❌ Syntax: /setwins (Name) (Anzahl) (Passwort)", system: true }));
        return;
    }

    const targetName = parts[1];
    const newWins = parseInt(parts[2]);
    const providedPass = parts[3];

    if (providedPass === adminPass) {
        if (!isNaN(newWins)) {
            // 1. Lokales Leaderboard aktualisieren
            leaderboard[targetName] = newWins;

            // 2. SUPABASE AKTUALISIERUNG (Tabelle: players)
            if (typeof supabaseAdmin !== 'undefined') {
                // Geändert: Tabellenname ist jetzt 'players'
                supabaseAdmin
                    .from('players') 
                    .update({ wins: newWins }) 
                    .eq('username', targetName)
                    .then(({ error }) => {
                        if (error) {
                            console.error("❌ Supabase Update Fehler:", error);
                            ws.send(JSON.stringify({ type: 'chat', text: "⚠️ Warnung: DB (players) konnte nicht aktualisiert werden!", system: true }));
                        } else {
                            console.log(`✅ Supabase: Siege für ${targetName} in Tabelle 'players' auf ${newWins} gesetzt.`);
                        }
                    });
            }

            // 3. Speichern und alle Spieler informieren
            if (typeof saveAll === 'function') saveAll();
            if (typeof sendLeaderboardUpdate === 'function') sendLeaderboardUpdate();

            ws.send(JSON.stringify({ 
                type: 'chat', 
                text: `🏆 UPDATE: ${targetName} hat nun ${newWins} Siege (in DB 'players' gespeichert).`, 
                system: true 
            }));
            
            console.log(`[ADMIN] ${currentName} setzte Siege für ${targetName} auf ${newWins}.`);
        } else {
            ws.send(JSON.stringify({ type: 'chat', text: "❌ Fehler: Ungültige Anzahl an Siegen!", system: true }));
        }
    } else {
        ws.send(JSON.stringify({ type: 'chat', text: "❌ Falsches Passwort!", system: true }));
    }
    return;
}
                // 21. /clearleaderboard - Alles auf Null setzen (Pop-up für ALLE!)
                if (cmd === '/clearleaderboard') {
                    leaderboard = {};
                    saveAll();
                    sendLeaderboardUpdate();
                    wss.clients.forEach(c => sendSystemAlert(c, "🏆 Das Leaderboard wurde komplett zurückgesetzt!"));
                    broadcast({ type: 'chat', text: "⚠️ ACHTUNG: Das Leaderboard wurde vom Admin gelöscht!", system: true });
                    return;
                }

                // 22. /shutdown - Wartung (Pop-up für ALLE!)
                if (cmd === '/shutdown') {
                    const delay = parseInt(target) || 10;
                    wss.clients.forEach(c => sendSystemAlert(c, "⚠️ SERVER-STOPP: Der Server wird in " + delay + " Sekunden neu gestartet!"));
                    broadcast({ type: 'chat', text: "🛑 WARTUNG: Neustart in " + delay + " Sek.", system: true });
                    setTimeout(() => {
                        wss.clients.forEach(c => c.terminate());
                    }, delay * 1000);
                    return;
                }

                // 23. /rename [AlterName] [NeuerName] [Passwort] - Namen überall korrigieren (inkl. Supabase)
if (cmd === '/rename') {
    if (parts.length < 4) {
        ws.send(JSON.stringify({ type: 'chat', text: "❌ Syntax: /rename (AlterName) (NeuerName) (Passwort)", system: true }));
        return;
    }

    const oldName = parts[1];
    const newName = parts[2];
    const providedPass = parts[3];

    if (providedPass === adminPass) {
        if (typeof leaderboard !== 'undefined' && leaderboard[oldName] !== undefined) {
            
            // 1. Lokales Leaderboard & userDB aktualisieren
            leaderboard[newName] = leaderboard[oldName];
            delete leaderboard[oldName];
            
            if (typeof userDB !== 'undefined' && userDB[oldName]) {
                userDB[newName] = userDB[oldName];
                delete userDB[oldName];
            }

            // 2. SUPABASE AKTUALISIERUNG
            if (typeof supabaseAdmin !== 'undefined') {
                // Geändert: Spaltenname ist jetzt 'username' statt 'player_name'
                supabaseAdmin
                    .from('profiles') 
                    .update({ username: newName }) // Hier geändert
                    .eq('username', oldName)      // Hier geändert
                    .then(({ error }) => {
                        if (error) {
                            console.error("❌ Supabase Rename Fehler:", error);
                            ws.send(JSON.stringify({ type: 'chat', text: "⚠️ Warnung: DB-Update fehlgeschlagen!", system: true }));
                        } else {
                            console.log(`✅ Supabase: '${oldName}' zu '${newName}' umbenannt.`);
                        }
                    });
            }

            // 3. Speichern und Synchronisieren
            if (typeof saveAll === 'function') saveAll();
            if (typeof sendLeaderboardUpdate === 'function') sendLeaderboardUpdate();
            
            ws.send(JSON.stringify({ 
                type: 'chat', 
                text: `📝 VOLLSTÄNDIG UMBENANNT: '${oldName}' heißt nun '${newName}' (auch in der DB).`, 
                system: true 
            }));
            
            console.log(`[ADMIN] ${currentName} hat ${oldName} zu ${newName} umbenannt.`);
        } else {
            ws.send(JSON.stringify({ type: 'chat', text: `❌ Fehler: '${oldName}' nicht gefunden!`, system: true }));
        }
    } else {
        ws.send(JSON.stringify({ type: 'chat', text: "❌ Falsches Passwort!", system: true }));
    }
    return;
}

                // 24. /tempban - Zeitliche Sperre (Pop-up & Chat-Info)
                if (cmd === '/tempban') {
                    const minutes = parseInt(parts[2]) || 10;
                    wss.clients.forEach(c => {
                        if (c.playerName && c.playerName.toLowerCase() === targetLower) {
                            bannedIPs.add(c.clientIP);
                            sendSystemAlert(c, "⏳ ZEIT-BAN: Du bist für " + minutes + " Minuten gesperrt!");
                            broadcast({ type: 'chat', text: "🚫 " + c.playerName + " wurde für " + minutes + " Min. verbannt!", system: true });
                            
                            setTimeout(() => c.terminate(), 500);
                            
                            setTimeout(() => {
                                bannedIPs.delete(c.clientIP);
                                saveAll();
                            }, minutes * 60000);
                        }
                    });
                    saveAll();
                    return;
                }

                // 25. /say - System-Nachricht (Erscheint fett für alle)
                if (cmd === '/say') {
                    const message = parts.slice(1, -1).join(' '); // Passwort wird weggeschnitten
                    wss.clients.forEach(c => sendSystemAlert(c, "📢 NACHRICHT VOM ADMIN:\n" + message));
                    broadcast({ type: 'chat', text: "🚨 SYSTEM: " + message, system: true });
                    return;
                }
    
                // 28. /warnip - Eine Warnung direkt an eine IP senden (auch wenn Name unbekannt)
                if (cmd === '/warnip') {
                    const targetIP = parts[1];
                    wss.clients.forEach(c => {
                        if (c.clientIP === targetIP) {
                            sendSystemAlert(c, "⚠️ LETZTE WARNUNG: Halte dich an die Regeln oder du wirst gebannt!");
                        }
                    });
                    ws.send(JSON.stringify({ type: 'chat', text: "Warnung an IP " + targetIP + " gesendet.", system: true }));
                    return;
                }
// 29. /adminmsg - Eine private Nachricht nur an einen Spieler (Flüstern)
if (cmd === '/adminmsg') {
    const targetName = parts[1];
    const targetLower = targetName ? targetName.toLowerCase() : "";
    const message = parts.slice(2).join(' '); // Geändert:slice korrigiert für Nachricht

    wss.clients.forEach(c => {
        if (c.playerName && c.playerName.toLowerCase() === targetLower) {
            c.send(JSON.stringify({ type: 'chat', text: "💬 ADMIN FLÜSTERT: " + message, system: true }));
            if (typeof sendSystemAlert === 'function') sendSystemAlert(c, "Du hast eine private Nachricht!");
        }
    });
    return;
} // <--- DIESE KLAMMER HAT GEFEHLT!
                // 30. /whois - Zeigt dir alle Infos über einen Spieler
               if (cmd === '/whois') {
    async function sendUltimateInfo() {
        try {
            // 1. Wir checken, ob der Spieler JETZT GERADE online ist (für den Live-Status)
            const targetClient = Array.from(wss.clients).find(c => 
                c.playerName && c.playerName.toLowerCase() === targetLower
            );
            const isOnline = !!targetClient;

            // 2. Wir suchen den Spieler in der Haupt-Datenbank (case-insensitive mit ilike)
            const { data: pData } = await supabaseAdmin
                .from('players')
                .select('*') // Holt absolut alle Spalten (Wins, XP, IPs, Datum, etc.)
                .ilike('username', targetLower)
                .single();

            // Wenn er weder online noch in der DB ist
            if (!pData && !targetClient) {
                return ws.send(JSON.stringify({ type: 'chat', text: `❌ Spieler "${targetLower}" existiert nicht in der Datenbank.`, system: true }));
            }

            // Der echte Name (mit korrekter Groß-/Kleinschreibung aus der DB)
            const actualName = pData ? pData.username : targetClient.playerName;

            // 3. Wir holen die komplette Python-Analyse
            const { data: sData } = await supabaseAdmin
                .from('user_stats')
                .select('*') 
                .eq('username', actualName)
                .single();

            // --- DATEN ZUSAMMENFÜHREN ---
            // Basis & Online-Status
            const statusStr = isOnline ? "🟢 ONLINE" : "🔴 OFFLINE";
            const liveIp = targetClient ? (targetClient.clientIP || targetClient._socket.remoteAddress) : null;
            const dbIp = pData?.ip_address || "Keine IP gespeichert";
            const currentIpToShow = liveIp || dbIp;
            
            // Zeiten formatieren (Falls vorhanden)
            const lastLogin = pData?.last_login ? new Date(pData.last_login).toLocaleString('de-DE') : "Unbekannt";
            const lastWin = pData?.last_win ? new Date(pData.last_win).toLocaleString('de-DE') : "Unbekannt";

            // Level & Siege
            const xp = pData?.xp || 0;
            const lvl = pData?.level || 1;
            const wins = pData?.wins || 0;
            const gamesPlayed = sData?.games_played || wins; // Zählt analysierte Spiele

            // Profi-Stats (Elo & Aggressivität)
            const elo = sData?.elo || pData?.elo || 1200;
            const aggro = sData?.aggressivity_score || 0;

            // Die tiefe Python-Analyse aus dem JSONB-Feld entpacken
            const analysis = sData?.last_analysis || {};
            const rang = analysis?.Basis_Werte?.Rang || "Unbekannt";
            const zentrum = analysis?.Positions_Analyse?.Zentrum || "Unbekannt";
            const entwicklung = analysis?.Positions_Analyse?.Entwicklung || "Unbekannt";
            const eroeffnung = analysis?.Positions_Analyse?.Eröffnung || "Unbekannt";
            const material = analysis?.Positions_Analyse?.Material_Vorteil || "0";

            // Die gigantische Info-Nachricht an den Admin
            ws.send(JSON.stringify({ 
                type: 'chat', 
                text: `━━━━━━━━━━━━━━━\n` +
                      `🔍 ULTIMATE-SCAN: ${actualName} [${statusStr}]\n` +
                      `📍 IP-Adresse: ${currentIpToShow}\n` +
                      `🕒 Letzter Login: ${lastLogin}\n` +
                      `🏆 Letzter Sieg: ${lastWin}\n` +
                      `━━━━━━━━━━━━━━━\n` +
                      `📈 STATUS: Level ${lvl} (${xp} XP) | Siege: ${wins} | Spiele: ${gamesPlayed}\n` +
                      `⚔️ WERTUNG: Elo ${elo} | Rang: ${rang}\n` +
                      `━━━━━━━━━━━━━━━\n` +
                      `🧠 TIEFEN-ANALYSE (PYTHON):\n` +
                      `🔥 Aggressivität: ${aggro}%\n` +
                      `🎯 Zentrum: ${zentrum}\n` +
                      `🚀 Entwicklung: ${entwicklung}\n` +
                      `📖 Eröffnung: ${eroeffnung}\n` +
                      `⚖️ Ø Material-Vorteil: ${material}\n` +
                      `━━━━━━━━━━━━━━━`, 
                system: true 
            }));

        } catch (err) {
            console.error("Admin Scan Error:", err.message);
            ws.send(JSON.stringify({ type: 'chat', text: `❌ Fehler beim Datenbank-Scan von "${targetLower}". Eventuell hat der Spieler noch keinen Analyse-Eintrag.`, system: true }));
        }
    }
    
    sendUltimateInfo();
    return;
}
    // =========================================================================
// =========================================================================
// 31. /offban (Name) (Passwort) - DIE ULTIMATIVE PANZER-VERSION (V2 - FULL)
// =========================================================================
if (cmd === '/offban') {
    // FEATURE 1: Schutz vor falscher Eingabe (Teile zählen)
    if (parts.length < 3) {
        ws.send(JSON.stringify({ type: 'chat', text: "❌ Syntax: /offban (Name) (Passwort)", system: true }));
        return;
    }

    // Geändert: Nutzt 'parts' statt 'args' für das Passwort am Ende
    const providedPass = parts[parts.length - 1]; 
    // FEATURE 2: "Smart-Merge" - Setzt Namen mit beliebig vielen Leerzeichen korrekt zusammen
    const targetNameInput = parts.slice(1, -1).join(' '); 

    // FEATURE 3: Hardcoded Passwort-Abgleich
    if (providedPass === adminPass) {
        
        // FEATURE 4: Validierung des Inputs (keine leeren Namen bannen)
        if (!targetNameInput || targetNameInput.trim() === "") {
            ws.send(JSON.stringify({ type: 'chat', text: "❌ Fehler: Name ist leer!", system: true }));
            return;
        }

        // FEATURE 5: "Deep Search" - Such-Pool aus allen Quellen
        // Geändert: Crash-Schutz für leaderboard hinzugefügt
        let searchPool = (typeof leaderboard !== 'undefined') ? { ...leaderboard } : {}; 
        if (typeof userDB !== 'undefined') searchPool = { ...searchPool, ...userDB };

        let actualNameInDB = null;
        // FEATURE 6: "Fuzzy Matching"
        for (let name in searchPool) {
            if (name.toLowerCase().includes(targetNameInput.toLowerCase().trim())) {
                actualNameInDB = name;
                break;
            }
        }

        const finalName = actualNameInDB || targetNameInput;

        // --- NEUE INTEGRIERTE UPGRADES (EXTRAS) ---

        // FEATURE 16: Shadow-Marking & Straf-System
        if (typeof userDB !== 'undefined') {
            if (!userDB[finalName]) userDB[finalName] = {};
            userDB[finalName].banned = true;
            userDB[finalName].wins = -999; 
            userDB[finalName].banReason = "Panzer-Offban durch Admin";
            userDB[finalName].banTimestamp = new Date().toISOString();
        }

        // FEATURE 17: IP-Deep-Scan & Multi-IP-Ban
        let hackerIP = null;
        // Geändert: Sicherer Check auf lastKnownIPs und bannedIPs
        if (typeof lastKnownIPs !== 'undefined' && lastKnownIPs[finalName]) {
            hackerIP = lastKnownIPs[finalName];
            if (typeof bannedIPs !== 'undefined') bannedIPs.add(hackerIP);
        }

        // FEATURE 18: Alt-Account-Nuker (Echtzeit-Bereinigung)
        if (hackerIP) {
            wss.clients.forEach(c => {
                // Geändert: Prüft beide IP-Quellen für den Kick
                const currentIP = c.clientIP || (c._socket ? c._socket.remoteAddress : null);
                if (currentIP === hackerIP) {
                    if (typeof sendSystemAlert === 'function') {
                        sendSystemAlert(c, "🚨 IP-TERMINIERUNG:\nDiese IP-Adresse wurde aufgrund von Hacking gesperrt!");
                    }
                    setTimeout(() => c.terminate(), 300);
                }
            });
        }

        // --- FORTFÜHRUNG DEINER ORIGINALEN LOGIK ---

        // FEATURE 7: Persistent Blacklisting
        if (typeof bannedIPs !== 'undefined') {
            bannedIPs.add(finalName.toLowerCase());
        }

        // FEATURE 8: IP-Tracking (Zusatz-Check)
        if (typeof lastKnownIPs !== 'undefined' && lastKnownIPs[finalName]) {
            bannedIPs.add(lastKnownIPs[finalName].toLowerCase());
        }

        // FEATURE 9: Automatische Leaderboard-Säuberung
        if (typeof leaderboard !== 'undefined' && leaderboard[finalName]) {
            delete leaderboard[finalName];
        }

        // FEATURE 10: Force-Save
        if (typeof saveAll === 'function') saveAll(); // Geändert: Crash-Schutz

        // FEATURE 11: Real-Time UI Sync
        if (typeof sendLeaderboardUpdate === 'function') sendLeaderboardUpdate();
        
        // FEATURE 12: Global Broadcast
        broadcast({ type: 'chat', text: `🚫 ANTI-HACK: ${finalName} wurde permanent vernichtet!`, system: true });

        // FEATURE 13: Active Session Termination
        wss.clients.forEach(c => {
            if (c.playerName && (c.playerName === finalName || c.playerName.toLowerCase().includes(targetNameInput.toLowerCase()))) {
                // FEATURE 14: System-Alert Pop-Up
                if (typeof sendSystemAlert === 'function') {
                    sendSystemAlert(c, "❌ PERMANENTER BAN:\nDein Account und deine IP wurden gesperrt!");
                }
                
                setTimeout(() => c.terminate(), 500);
            }
        });

        // FEATURE 15: Admin-Bestätigung
        ws.send(JSON.stringify({ type: 'chat', text: `✅ ERFOLG: ${finalName} ist jetzt auf der Blacklist!`, system: true }));

    } else {
        ws.send(JSON.stringify({ type: 'chat', text: "❌ Falsches Passwort!", system: true }));
    }
    return;
}
// 35. /testmail - Testet die Discord-Anbindung
                if (cmd === '/testmail') { // Geändert: Sichergestellt, dass die Klammer hier öffnet
                    // Sicherheit: Nur du als Admin (Max) darfst das auslösen
                    if (currentName === "Max") {
                        // Geändert: Holt die echte Admin-IP (ws statt c, da du selbst der Sender bist)
                        const adminIP = ws.clientIP || (ws._socket ? ws._socket.remoteAddress : "Unbekannt"); 
                        
                        console.log(`[ADMIN] ${currentName} löst Test-Discord-Alarm aus von IP: ${adminIP}`);

                        // Geändert: Nutzt adminIP (die wir gerade oben definiert haben)
                        sendBanEmail("Test-Spieler", "Manueller Test-Aufruf durch Admin", adminIP).then(success => {
                            if (success) {
                                ws.send(JSON.stringify({ 
                                    type: 'chat', 
                                    text: `✅ Erfolg: Discord-Alarm wurde ausgelöst! Schau in deinen Kanal.`, 
                                    system: true 
                                }));
                            } else {
                                ws.send(JSON.stringify({ 
                                    type: 'chat', 
                                    text: `❌ Fehler: Discord konnte nicht erreicht werden. Prüfe die Render-Logs!`, 
                                    system: true 
                                }));
                            }
                        }).catch(err => { // Geändert: Fehler-Abfangschutz (Promise-Catch)
                            console.error("Discord Test-Fehler:", err);
                            ws.send(JSON.stringify({ type: 'chat', text: "❌ Kritischer Fehler beim Senden!", system: true }));
                        });

                    } else {
                        ws.send(JSON.stringify({ 
                            type: 'chat', 
                            text: `🚫 Zugriff verweigert: Nur der Admin darf das.`, 
                            system: true 
                        }));
                    }
                    return;
                }
                    // 1. /announce [Nachricht] [Passwort] - Eine auffällige Durchsage an alle
if (cmd === '/announce') {
    // Geändert: Nutzt 'parts' statt 'args', da 'args' nicht definiert ist
    const msg = parts.slice(1, -1).join(' '); 
    
    // Geändert: Passwort-Check auf das letzte Element der 'parts'-Liste
    if (parts[parts.length - 1] === adminPass) { 
        // Geändert: Kleiner Schutz, falls die Nachricht leer ist
        if (msg.trim() !== "") {
            broadcast({ 
                type: 'chat', 
                text: `\n📢 WICHTIG:\n${msg.toUpperCase()}\n`, 
                system: true 
            });
        } else {
            ws.send(JSON.stringify({ type: 'chat', text: "❌ Fehler: Nachricht ist leer!", system: true }));
        }
    } else {
        // Geändert: Feedback bei falschem Passwort hinzugefügt
        ws.send(JSON.stringify({ type: 'chat', text: "❌ Falsches Passwort!", system: true }));
    }
    return;
}

// 32. /uptime
                if (cmd === '/uptime') {
                    // Geändert: 'args' durch 'parts' ersetzt, damit der Passwort-Check funktioniert
                    if (parts[1] === adminPass) { 
                        const uptime = process.uptime();
                        const h = Math.floor(uptime / 3600);
                        const m = Math.floor((uptime % 3600) / 60);
                        ws.send(JSON.stringify({ type: 'chat', text: `⚙️ Uptime: ${h}h ${m}m`, system: true }));
                    }
                    // Geändert: return hinzugefügt, damit der Befehl nicht als normaler Chat gesendet wird
                    return; 
                }
// 3. /kickalltrolls [Passwort] - Kickt alle ohne Namen, Gäste und "Spieler_Nummer"
if (cmd === '/kickalltrolls') {
    // Geändert: Nutzt 'parts' statt 'args', damit das Passwort erkannt wird
    if (parts[1] === adminPass) { 
        let count = 0; 
        
        wss.clients.forEach(c => {
            // Geändert: Erkennt jetzt auch Namen, die mit "Spieler_" beginnen (automatische Namen)
            const isAutoName = c.playerName && c.playerName.startsWith("Spieler_");
            const isGuest = !c.playerName || c.playerName === "Gast" || c.playerName.trim() === "";

            if (c !== ws && (isGuest || isAutoName)) {
                c.terminate();
                count++;
            }
        });
        
        ws.send(JSON.stringify({ 
            type: 'chat', 
            text: `🧹 Besen geschwungen: ${count} Trolle/Gäste entfernt (inkl. Spieler_...-Namen).`, 
            system: true 
        }));
    } else {
        ws.send(JSON.stringify({ type: 'chat', text: "❌ Falsches Passwort!", system: true }));
    }
    return;
}
// 4. /pingall [Passwort] - HIGH-TECH DIAGNOSE-VERSION (V2)
if (cmd === '/pingall') {
    if (parts[1] === adminPass) { 
        let activeCount = 0;
        let laggyPlayers = [];

        wss.clients.forEach(c => {
            if (c.readyState === 1) { // 1 = OPEN
                activeCount++;
                const start = Date.now();
                
                // Wir senden einen speziellen Ping-Check
                try {
                    c.ping(); 
                    
                    // FEATURE: Wir messen die Zeit, bis der Client antwortet (Pong)
                    c.once('pong', () => {
                        const latency = Date.now() - start;
                        c.latency = latency; // Speichert die Latenz am Client-Objekt
                        
                        // Wenn jemand über 250ms Ping hat, markieren wir ihn als "laggy"
                        if (latency > 250) {
                            laggyPlayers.push(`${c.playerName || "Unbekannt"} (${latency}ms)`);
                        }
                    });
                } catch (e) {
                    console.error("Ping-Fehler:", e);
                }
            }
        });

        // Geändert: Detailliertes Admin-Feedback mit Latenz-Info
        ws.send(JSON.stringify({ 
            type: 'chat', 
            text: `🛰 NETZWERK-SCAN gestartet...\n` +
                  `👥 Aktive Verbindungen: ${activeCount}\n` +
                  `⏱ Messung läuft im Hintergrund (Ergebnisse im Log)...`,
            system: true 
        }));

        // FEATURE: Nach 2 Sekunden schicken wir dir eine Zusammenfassung der "Lagger"
        setTimeout(() => {
            if (laggyPlayers.length > 0) {
                ws.send(JSON.stringify({ 
                    type: 'chat', 
                    text: `⚠️ LAG-ALARM: Folgende Spieler haben hohen Ping:\n${laggyPlayers.join(', ')}`, 
                    system: true 
                }));
            } else {
                ws.send(JSON.stringify({ type: 'chat', text: "✅ Netzwerk-Check: Alle Spieler haben eine gute Verbindung!", system: true }));
            }
        }, 2000);

    } else {
        ws.send(JSON.stringify({ type: 'chat', text: "❌ Falsches Passwort!", system: true }));
    }
    return;
}
// 5. /kickip [IP] [Passwort] - Kickt jemanden direkt über die IP (ULTRA-SAFE)
if (cmd === '/kickip') {
    // Geändert: Nutzt 'parts' und prüft, ob genug Daten da sind (Befehl, IP, PW)
    if (parts.length < 3) {
        ws.send(JSON.stringify({ type: 'chat', text: "❌ Syntax: /kickip (IP) (Passwort)", system: true }));
        return;
    }

    const targetIP = parts[1];
    const providedPass = parts[2]; // Geändert: Passwort ist das dritte Wort (Index 2)

    if (providedPass === adminPass) {
        let count = 0;
        
        wss.clients.forEach(c => {
            // Geändert: Wir ziehen die IP aus allen möglichen Quellen für maximalen Treffer
            const currentIP = c.clientIP || (c._socket ? c._socket.remoteAddress : null);
            
            // Geändert: Wir nutzen .includes(), falls die IP mit "::ffff:" (IPv6-Mapping) anfängt
            if (currentIP && (currentIP === targetIP || currentIP.includes(targetIP))) {
                if (typeof sendSystemAlert === 'function') {
                    sendSystemAlert(c, "🚨 IP-KICK:\nVerbindung durch Admin beendet.");
                }
                setTimeout(() => c.terminate(), 200);
                count++;
            }
        });

        // Geändert: Feedback an dich
        ws.send(JSON.stringify({ 
            type: 'chat', 
            text: `🚫 IP-KICK ERFOLGT: ${count} Verbindung(en) mit IP ${targetIP} getrennt.`, 
            system: true 
        }));
    } else {
        ws.send(JSON.stringify({ type: 'chat', text: "❌ Falsches Passwort!", system: true }));
    }
    return;
}
// 6. /myip [Passwort] - Zeigt dir deine eigene IP (ULTRA-DIAGNOSE)
if (cmd === '/myip') {
    // Geändert: Nutzt 'parts' statt 'args', damit das Passwort erkannt wird
    if (parts[1] === adminPass) {
        // Geändert: Extrahiert die saubere IP aus allen Quellen
        const rawIP = ws.clientIP || (ws._socket ? ws._socket.remoteAddress : "Unbekannt");
        
        // Geändert: Entfernt das IPv6-Präfix "::ffff:", damit die IP sauber aussieht
        const cleanIP = rawIP.replace(/^.*:/, ''); 

        // FEATURE: Zeigt dir nicht nur die IP, sondern auch deinen aktuellen Status
        ws.send(JSON.stringify({ 
            type: 'chat', 
            text: `\n🌐 DEINE VERBINDUNGS-INFO:\n` +
                  `📍 IP-Adresse: ${cleanIP}\n` +
                  `🔑 Admin-Status: Verifiziert\n` +
                  `📡 Socket-Status: Stabil\n` +
                  `💡 Tipp: Nutze diese IP für /kickip oder /offban`, 
            system: true 
        }));
        
        // Geändert: Loggt die Abfrage in der Konsole für die Sicherheit
        console.log(`[ADMIN-INFO] ${currentName} hat seine IP abgefragt: ${cleanIP}`);
    } else {
        // Geändert: Feedback bei falschem Passwort
        ws.send(JSON.stringify({ type: 'chat', text: "❌ Falsches Passwort!", system: true }));
    }
    return;
}
// 7. /players [Passwort] - Listet alle Namen und IPs der aktuellen Spieler auf
if (cmd === '/players') {
    // Geändert: Nutzt 'parts' statt 'args', damit das Passwort funktioniert
    if (parts[1] === adminPass) {
        const clients = Array.from(wss.clients);
        
        // Geändert: Erstellt eine detaillierte Liste (Name + IP)
        let playerDetails = clients.map(c => {
            const pName = c.playerName || "Unbekannt/Gast";
            const pIP = c.clientIP || (c._socket ? c._socket.remoteAddress : "???");
            const cleanIP = pIP.replace(/^.*:/, ''); // Entfernt ::ffff:
            return `${pName} [${cleanIP}]`;
        }).join("\n"); // Nutzt Zeilenumbruch für bessere Lesbarkeit

        // Geändert: Schickt eine formatierte Übersicht an dich
        ws.send(JSON.stringify({ 
            type: 'chat', 
            text: `\n👥 AKTIVE SPIELER (${clients.length}):\n${playerDetails}`, 
            system: true 
        }));
    } else {
        // Geändert: Feedback bei falschem Passwort
        ws.send(JSON.stringify({ type: 'chat', text: "❌ Falsches Passwort!", system: true }));
    }
    return;
}

// 8. /alert [Name] [Nachricht] [Passwort] - Schickt eine Warnung an EINEN bestimmten Spieler
if (cmd === '/alert') {
    // Geändert: Mindestens 4 Teile nötig (/alert Name Nachricht Passwort)
    if (parts.length < 4) {
        ws.send(JSON.stringify({ type: 'chat', text: "❌ Syntax: /alert (Name) (Nachricht) (Passwort)", system: true }));
        return;
    }

    const providedPass = parts[parts.length - 1];
    const targetNameInput = parts[1].toLowerCase();
    const msg = parts.slice(2, -1).join(' '); // Geändert: Nutzt 'parts' für die Nachricht

    if (providedPass === adminPass) {
        let found = false;

        wss.clients.forEach(c => {
            // Geändert: Erkennt den Namen auch bei unterschiedlicher Groß-/Kleinschreibung
            if (c.playerName && c.playerName.toLowerCase() === targetNameInput) {
                // 1. Nachricht im Chat
                c.send(JSON.stringify({ 
                    type: 'chat', 
                    text: `\n⚠️⚠️⚠️ DRINGENDE ADMIN-WARNUNG ⚠️⚠️⚠️\n${msg.toUpperCase()}\n`, 
                    system: true 
                }));

                // 2. FEATURE: Falls vorhanden, ein echtes System-Pop-up senden
                if (typeof sendSystemAlert === 'function') {
                    sendSystemAlert(c, `ACHTUNG:\n${msg}`);
                }
                
                found = true;
            }
        });

        if (found) {
            ws.send(JSON.stringify({ type: 'chat', text: `✅ Warnung an ${parts[1]} wurde zugestellt.`, system: true }));
        } else {
            ws.send(JSON.stringify({ type: 'chat', text: `❌ Spieler "${parts[1]}" nicht online.`, system: true }));
        }
    } else {
        ws.send(JSON.stringify({ type: 'chat', text: "❌ Falsches Passwort!", system: true }));
    }
    return;
}

// 9. /memory [Passwort] - Detaillierte System-Diagnose für Render.com
if (cmd === '/memory') {
    // Geändert: Nutzt 'parts' statt 'args', damit das Passwort erkannt wird
    if (parts[1] === adminPass) {
        const mem = process.memoryUsage();
        
        // Berechnung in MB
        const heapUsed = Math.round(mem.heapUsed / 1024 / 1024); // Aktuell genutzter Speicher
        const heapTotal = Math.round(mem.heapTotal / 1024 / 1024); // Reservierter Speicher
        const rss = Math.round(mem.rss / 1024 / 1024); // Gesamter physikalischer RAM (Wichtig für Render!)

        // FEATURE: Warn-Logik
        let status = "🟢 STABIL";
        if (rss > 400) status = "🟡 WARNUNG (Hoch)";
        if (rss > 480) status = "🔴 KRITISCH (Limit nah)";

        // Geändert: Sendet eine detaillierte Übersicht
        ws.send(JSON.stringify({ 
            type: 'chat', 
            text: `\n🖥 SERVER-STATUS:\n` +
                  `🧠 RAM (RSS): ${rss} MB / 512 MB\n` +
                  `📦 Heap (Aktiv): ${heapUsed} MB\n` +
                  `📊 Status: ${status}\n` +
                  `💡 Tipp: Bei über 500MB startet Render den Server neu.`, 
            system: true 
        }));

        console.log(`[ADMIN-DIAGNOSE] RAM-Check durch ${currentName}: ${rss}MB genutzt.`);
    } else {
        // Geändert: Feedback bei falschem Passwort
        ws.send(JSON.stringify({ type: 'chat', text: "❌ Falsches Passwort!", system: true }));
    }
    return;
}

// 10. /freeze - Chat stummschalten
if (cmd === '/freeze') {
    // Sicherstellen, dass die Variable existiert (falls nicht global definiert)
    if (typeof chatFrozen === 'undefined') {
        global.chatFrozen = false; 
    }
    
    // Geändert: 'args' durch 'parts' ersetzt
    if (parts[1] === adminPass) {
        global.chatFrozen = !global.chatFrozen; // Umschalten: an -> aus / aus -> an
        
        broadcast({ 
            type: 'chat', 
            text: global.chatFrozen ? "🧊 Chat-Sperre: AKTIVIERT (Nur Admins können schreiben)" : "🔥 Chat-Sperre: DEAKTIVIERT", 
            system: true 
        });
        
        ws.send(JSON.stringify({ 
            type: 'chat', 
            text: `Status: Chat-Sperre ist jetzt ${global.chatFrozen ? 'AN' : 'AUS'}.`, 
            system: true 
        }));
    }
    return; // WICHTIG: Verhindert, dass der Befehl im globalen Chat landet!
}
    // EXKLUSIVER BEFEHL: /radar [Passwort]
if (cmd === '/radar') {
    if (parts[1] === adminPass) {
        let radarInfo = "\n🌍 --- GLOBAL RADAR ---\n";
        let count = 0;

        wss.clients.forEach(c => {
            if (c.readyState === 1) { // Wenn der Spieler online ist
                count++;
                const name = c.playerName || "Gast";
                // Wenn der Tracker die Stadt schon gefunden hat, zeige sie an
                const stadt = c.location ? `${c.location.city}, ${c.location.country}` : "Scanne noch...";
                radarInfo += `📍 ${name}: ${stadt}\n`;
            }
        });

        radarInfo += `-----------------------\nInsgesamt: ${count} Spieler online.`;

        // Diese Nachricht geht NUR an dich!
        ws.send(JSON.stringify({ 
            type: 'chat', 
            text: radarInfo, 
            system: true 
        }));
    } else {
        ws.send(JSON.stringify({ type: 'chat', text: "❌ Falsches Passwort!", system: true }));
    }
    return;
}
               // 18. /help - Zeigt die vollständige Liste aller 50+ Admin-Befehle
if (cmd === '/help') {
    const helpText = `
🛠️ --- ADMIN BEFEHLS-LISTE (VOLLSTÄNDIG) ---
👤 NUTZER: /warn, /mute, /unmute, /kick, /kickall, /ban, /banip, /pardon, /rename, /tempban, /setwins, /stats, /whois
🚫 SPERREN: /banlist, /mutelist, /warnip, /offban, /kickip, /kickalltrolls
💬 CHAT: /say, /clearchat, /adminmsg, /broadcast, /wall, /freeze, /lock, /unlock, /slowmode, /announce
⚙️ SYSTEM: /uptime, /memory, /pingall, /players, /myip, /testmail, /shutdown, /disconnect
🧹 DATEN: /reset, /cleardb, /clearleaderboard, /save, /load
ℹ️ INFO: /help (Zeigt diese Liste)

Tipp: Die meisten Befehle benötigen das Admin-Passwort am Ende!
    `;

    ws.send(JSON.stringify({ 
        type: 'chat', 
        text: helpText, 
        system: true 
    }));
    return;
}
            }

// ======================================================
// 🛡️ ULTRA-SUPPORTER-SYSTEM (STARTET MIT '?') - 22 BEFEHLE
// ======================================================
if (data.type === 'chat' && data.text && data.text.startsWith('?')) {
    const sArgs = data.text.split(' ');
    const sCmd = sArgs[0].toLowerCase();
    const sPass = sArgs[sArgs.length - 1]; 

    // 10000% SICHERHEITS-CHECK
    if (sPass !== helperPass && sPass !== adminPass) {
        console.error(`[SECURITY-ALERT] Unbefugter Zugriff von ${ws.playerName || "Unbekannt"} auf ${sCmd}`);
        ws.send(JSON.stringify({ type: 'chat', text: "🚫 SYSTEM-REJECT: Passwort ungültig!", system: true }));
        return;
    }

    console.log(`[SUPPORTER-ACTION] EXECUTE: ${sCmd} | BY: ${ws.playerName}`);

// 1. ?warn - MULTI-WORD NAME + REASON + PASS PROTECTION
    if (sCmd === '?warn') {
        try {
            const rawText = data.text; // Der volle Text z.B. "?warn Max Mustermann Spammen pass123"
            const parts = rawText.split(' ');
            
            // SECURITY: Mindestens Befehl, Name, Grund und Passwort müssen da sein
            if (parts.length < 4) {
                ws.send(JSON.stringify({ 
                    type: 'chat', 
                    text: "❌ Syntax: ?warn [Name] [Grund] [Passwort]", 
                    system: true 
                }));
                return;
            }

            // LOGIK: 
            // Letztes Wort = Passwort
            // Vorletztes Wort = Grund
            // Alles dazwischen = Name
            const sPass = parts[parts.length - 1];
            const reason = parts[parts.length - 2];
            const targetNameInput = parts.slice(1, -2).join(' '); // Nimmt alles ab Index 1 bis zum vorletzten Wort

            // PASSWORT-CHECK
            if (sPass !== helperPass && sPass !== adminPass) {
                ws.send(JSON.stringify({ type: 'chat', text: "🚫 SYSTEM-REJECT: Passwort ungültig!", system: true }));
                console.warn(`[SECURITY] Falsches Passwort bei ?warn von: ${ws.playerName || "Unbekannt"}`);
                return;
            }

            // ADMIN-SCHUTZ: Max kann nicht verwarnt werden
            if (targetNameInput.toLowerCase() === "max") {
                ws.send(JSON.stringify({ 
                    type: 'chat', 
                    text: "🚫 SYSTEM: Aktion verweigert. Der Admin (Max) ist immun!", 
                    system: true 
                }));
                return;
            }

            const supporterName = ws.playerName || "Supporter";
            let targetClient = null;

            // Suche nach dem Spieler (berücksichtigt jetzt auch Namen mit Leerzeichen)
            wss.clients.forEach(client => {
                if (client.playerName && client.playerName.toLowerCase() === targetNameInput.toLowerCase()) {
                    targetClient = client;
                }
            });

            if (!targetClient) {
                ws.send(JSON.stringify({ type: 'chat', text: `⚠️ User '${targetNameInput}' ist offline. Logge trotzdem...`, system: true }));
            }

         // --- DIREKTES SUPABASE UPDATE (Ersetzt das alte saveToDatabase) ---
            try {
                // 1. Hol den aktuellen Stand aus der Tabelle 'players'
                const { data: updateData, error: fetchError } = await supabaseAdmin
                    .from('players')
                    .select('warnings_count')
                    .eq('username', targetNameInput)
                    .single();

                if (fetchError || !updateData) {
                    ws.send(JSON.stringify({ 
                        type: 'chat', 
                        text: `⚠️ Datenbank-Fehler: Spieler '${targetNameInput}' nicht gefunden.`, 
                        system: true 
                    }));
                } else {
                    // 2. Erhöhe die Zahl um 1
                    const newCount = (updateData.warnings_count || 0) + 1;
                    
                    // 3. Speichere den neuen Wert direkt zurück
                    const { error: updateError } = await supabaseAdmin
                        .from('players')
                        .update({ warnings_count: newCount })
                        .eq('username', targetNameInput);

                    if (updateError) throw updateError;

                    console.log(`[DB-UPDATE] ${targetNameInput} hat jetzt ${newCount} Verwarnungen.`);
                    
                    // Bestätigung für den Supporter
                    ws.send(JSON.stringify({
                        type: 'chat',
                        text: `✅ Datenbank aktualisiert: ${targetNameInput} steht nun bei ${newCount} Verwarnungen.`,
                        system: true
                    }));
                }
            } catch (dbErr) {
                console.error("❌ Schwerer Datenbankfehler:", dbErr.message);
                ws.send(JSON.stringify({ type: 'chat', text: "☣️ DB-Verbindung fehlgeschlagen.", system: true }));
            }

            // Broadcast Banner
            const finalName = targetClient ? targetClient.playerName : targetNameInput;
            const warningBanner = [
                " ",
                "██",
                `🚨 OFFIZIELLE VERWARNUNG: ${finalName.toUpperCase()} 🚨`,
                "█",
                `Grund: ${reason}`,
                " ",
                "Dieser Eintrag wurde permanent gespeichert!",
                "Bei 3 =Ban.",
                "██"
            ].join("\n");

            broadcast({ type: 'chat', text: warningBanner, system: true });

            ws.send(JSON.stringify({
                type: 'chat',
                text: `✅ Eintrag für ${finalName} erstellt (Grund: ${reason}).`,
                system: true
            }));

            console.log(`[WARN] ${supporterName} warnte ${finalName} | Grund: ${reason}`);

        } catch (fatalError) {
            console.error("KRITISCHER FEHLER IM WARN-MODUL:", fatalError);
            ws.send(JSON.stringify({ type: 'chat', text: "☣️ SYSTEM-FEHLER im Befehl.", system: true }));
        }
        return;
    }
    // 2. ?mute - Professionelles Muting
    if (sCmd === '?mute') {
        try {
            const target = (sArgs[1] || "").toLowerCase();
            if (target === "max") return ws.send(JSON.stringify({ type: 'chat', text: "❌ Fehler: Admin-Immunität aktiv.", system: true }));
            const duration = 10 * 60 * 1000;
            mutedPlayers.set(target, Date.now() + duration);
            console.log(`[MUTE] ${target} silenced for 10min`);
            broadcast({ type: 'chat', text: `🔇 SYSTEM: ${sArgs[1]} wurde für 10 Min. stummgeschaltet.`, system: true });
        } catch (e) { console.error("Error in ?mute", e); }
        return;
    }

    // 3. ?unmute - Mute-Aufhebung
    if (sCmd === '?unmute') {
        try {
            const target = (sArgs[1] || "").toLowerCase();
            if (mutedPlayers.has(target)) {
                mutedPlayers.delete(target);
                broadcast({ type: 'chat', text: `🔊 Kanal für ${sArgs[1]} wieder geöffnet.`, system: true });
            } else {
                ws.send(JSON.stringify({ type: 'chat', text: "❌ Spieler ist nicht im Mute-Register.", system: true }));
            }
        } catch (e) { console.error("Error in ?unmute", e); }
        return;
    }
// 4. ?kick - High-Security Force Disconnect
    if (sCmd === '?kick') {
        try {
            const parts = data.text.split(' ');
            // Syntax: ?kick [Name mit Leerzeichen] [Passwort]
            if (parts.length < 3) {
                ws.send(JSON.stringify({ type: 'chat', text: "❌ Syntax: ?kick [Name] [Passwort]", system: true }));
                return;
            }

            const sPass = parts[parts.length - 1];
            const targetNameInput = parts.slice(1, -1).join(' ').trim();
            const targetLower = targetNameInput.toLowerCase();

            // 1. PASSWORT-CHECK
            if (sPass !== adminPass && sPass !== "Maxi") {
                ws.send(JSON.stringify({ type: 'chat', text: "🚫 Kick abgelehnt: Passwort falsch!", system: true }));
                return;
            }

            // 2. IMMUNITÄTS-CHECK (Max & 222)
            if (targetLower === "max" || targetLower === "222") {
                ws.send(JSON.stringify({ 
                    type: 'chat', 
                    text: `🚫 SYSTEM-FEHLER: Der User '${targetNameInput}' hat Admin-Immunität!`, 
                    system: true 
                }));
                console.warn(`[SECURITY] ${ws.playerName || "Gast"} versuchte Immunität von ${targetNameInput} zu brechen!`);
                return;
            }

            let kickSuccess = false;
            let targetPlayerRealName = targetNameInput;

            // 3. SPIELER SUCHEN & KICKEN
            wss.clients.forEach(client => {
                if (client.playerName && client.playerName.toLowerCase() === targetLower) {
                    targetPlayerRealName = client.playerName;
                    
                    // Schicke dem Spieler ein Pop-up / Chat-Nachricht bevor die Verbindung stirbt
                    client.send(JSON.stringify({ 
                        type: 'chat', 
                        text: "\n⚠️⚠️⚠️ ACHTUNG ⚠️⚠️⚠️\nDu wurdest soeben vom Server gekickt!\nGrund: Fehlverhalten / Supporter-Entscheidung.\nDie Verbindung wird in 3 Sekunden getrennt...\n", 
                        system: true 
                    }));

                    // Kleiner Timeout, damit das Pop-up/die Nachricht auch wirklich ankommt
                    setTimeout(() => {
                        client.terminate(); 
                    }, 3000);
                    
                    kickSuccess = true;
                }
            });

            // 4. BESTÄTIGUNG AN DEN SUPPORTER & BROADCAST
            if (kickSuccess) {
                // Bestätigung für den Ausführenden
                ws.send(JSON.stringify({ 
                    type: 'chat', 
                    text: `✅ Erfolgreich: ${targetPlayerRealName} wurde vom Server geworfen.`, 
                    system: true 
                }));

                // Öffentliches Banner (Optional, kannst du auch weglassen)
                broadcast({ 
                    type: 'chat', 
                    text: `\n👞 KICK-SYSTEM: ${targetPlayerRealName.toUpperCase()} wurde aus dem Spiel entfernt.\n`, 
                    system: true 
                });

                console.log(`[MOD] ${ws.playerName || "Unbekannt"} hat ${targetPlayerRealName} gekickt.`);
            } else {
                ws.send(JSON.stringify({ 
                    type: 'chat', 
                    text: `❌ Fehler: Spieler '${targetNameInput}' ist aktuell nicht online.`, 
                    system: true 
                }));
            }

        } catch (fatalError) {
            console.error("KRITISCHER FEHLER IM KICK-SYSTEM:", fatalError);
            ws.send(JSON.stringify({ type: 'chat', text: "☣️ Interner Fehler im Kick-Modul.", system: true }));
        }
        return;
    }

    // 8. /pardon (Vollständig: Name & IP + Supabase Sync)
                if (sCmd === '?pardon') {
                    const input = args[1]; // Das Wort nach /pardon (Name oder IP)
                    const providedPass = args[2]; // Admin-Passwort

                    if (!input) {
                        ws.send(JSON.stringify({ type: 'chat', text: '⚠️ Nutzung: /pardon [Name oder IP] [Passwort]', system: true }));
                        return;
                    }

                    if (providedPass !== helperPass) {
                        ws.send(JSON.stringify({ type: 'chat', text: '❌ Passwort falsch!', system: true }));
                        return;
                    }

                    // 1. Identität prüfen (Ist es eine IP oder ein Name?)
                    let targetName = input;
                    let targetIP = input;

                    // Wenn es ein Name ist, versuchen wir die zugehörige IP zu finden
                    if (lastKnownIPs[input]) {
                        targetIP = lastKnownIPs[input];
                    } 
                    // Wenn es eine IP ist, versuchen wir den zugehörigen Namen zu finden
                    else {
                        const foundName = Object.keys(lastKnownIPs).find(name => lastKnownIPs[name] === input);
                        if (foundName) targetName = foundName;
                    }

                    // 2. Lokale Sperren löschen
                    bannedIPs.delete(targetIP);
                    blockedIPs.delete(targetIP);
                    loginAttempts.delete(targetIP);
                    userDB[targetName].ip_ban = false;

                    // 3. Supabase-Ban aufheben
                    fetch(`${SUPABASE_URL}/rest/v1/players?username=eq.${targetName}`, {
                        method: 'PATCH',
                        headers: {
                            'apikey': SUPABASE_KEY,
                            'Authorization': `Bearer ${SUPABASE_KEY}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ is_banned: false, ip_ban: false })
                    })
                    .then(() => {
                        console.log(`📡 Supabase: ${targetName} entbannt.`);
                        
                        // 4. Lokal im Speicher freischalten
                        if (userDB[targetName]) {
                            userDB[targetName].is_banned = false;
                        }
                        saveAll();
                        
                        ws.send(JSON.stringify({ 
                            type: 'chat', 
                            text: `✅ ${targetName} (${targetIP}) wurde vollständig entbannt!`, 
                            system: true 
                        }));
                    })
                    .catch(err => {
                        console.error("❌ DB Fehler:", err);
                        ws.send(JSON.stringify({ type: 'chat', text: '❌ Datenbank-Fehler beim Entbannen.', system: true }));
                    });

                    return;
                }
  // 9. ULTIMATIVE ?banlist 2.0 (Inklusive Supabase-Accounts)
                if (sCmd === '?banlist') {
                    let response = "📜 --- ADMIN SPERR-ZENTRALE ---\n\n";

                    // --- 1. CLOUD-BANS (Aus deiner userDB/Supabase) ---
                    response += "☁️ [ACCOUNTS IN DER CLOUD GEBANNT]\n";
                    const bannedAccounts = Object.keys(userDB).filter(name => userDB[name].is_banned === true);
                    
                    if (bannedAccounts.length > 0) {
                        bannedAccounts.forEach(name => {
                            response += `• Account: ${name}\n`;
                        });
                    } else {
                        response += "- Keine gebannten Accounts in der Cloud.\n";
                    }

                    // --- 2. IP-BANS (Lokal im Server-Speicher) ---
                    response += "\n🚫 [PERMANENTE IP-BANS]\n";
                    const permList = Array.from(bannedIPs);
                    if (permList.length > 0) {
                        permList.forEach(ip => {
                            const name = Object.keys(lastKnownIPs).find(key => lastKnownIPs[key] === ip) || "Unbekannt";
                            response += `• IP: ${ip} (${name})\n`;
                        });
                    } else {
                        response += "- Keine IP-Bans aktiv.\n";
                    }

                    // --- 3. TEMPORÄRE SPERREN (Brute-Force Schutz) ---
                    response += "\n⏳ [LOGIN-SPERREN (ABKÜHLPAUSE)]\n";
                    let activeTemp = 0;
                    blockedIPs.forEach((expiry, ip) => {
                        const restSekunden = Math.ceil((expiry - Date.now()) / 1000);
                        if (restSekunden > 0) {
                            activeTemp++;
                            const name = Object.keys(lastKnownIPs).find(key => lastKnownIPs[key] === ip) || "Gast";
                            response += `• ${name} [${ip}] -> noch ${restSekunden}s\n`;
                        }
                    });

                    if (activeTemp === 0) {
                        response += "- Keine IPs in der Abkühlpause.\n";
                    }

                    ws.send(JSON.stringify({ type: 'chat', text: response, system: true }));
                    return;
                }
// 7. ?clearchat - Optimierte Version
if (sCmd === '?clearchat') {
    const parts = data.text.split(' ');
    const providedPass = parts[1]; 

    if (providedPass === adminPass || providedPass === helperPass) {
        try {
            // VERBESSERUNG 1: Den Befehl NUR an Leute senden, die im gleichen Raum sind?
            // Oder an ALLE (Global)? Hier ist die globale Version:
            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    // Wir schicken das Leeren-Signal
                    client.send(JSON.stringify({ type: 'clear_ui' }));
                    
                    // VERBESSERUNG 2: Eine saubere System-Info direkt hinterher
                    client.send(JSON.stringify({ 
                        type: 'chat', 
                        text: `🧹 Chat-Cleanup durch Supporter (${ws.playerName || "Staff"})`, 
                        system: true 
                    }));
                }
            });
            
            console.log(`🧹 Chat-Cleanup erfolgreich ausgeführt.`);
        } catch (e) { 
            console.error("Error in ?clearchat", e); 
        }
    } else {
        ws.send(JSON.stringify({ 
            type: 'chat', 
            text: "❌ Zugriff verweigert!", 
            system: true 
        }));
    }
    return;
}

    // 8. ?freeze - Chat einfrieren
    if (sCmd === '?freeze') {
        try {
            global.chatFrozen = !global.chatFrozen;
            broadcast({ type: 'chat', text: global.chatFrozen ? "🧊 CHAT-FREEZE AKTIVIERT" : "🔥 CHAT-FREEZE DEAKTIVIERT", system: true });
        } catch (e) { console.error("Error in ?freeze", e); }
        return;
    }

    // 9. ?slow - Delay Steuerung
    if (sCmd === '?slow') {
        try {
            const sec = parseInt(sArgs[1]) || 5;
            slowModeDelay = sec;
            broadcast({ type: 'chat', text: `⏳ SLOWMODE: ${sec}s Verzögerung aktiv.`, system: true });
        } catch (e) { console.error("Error in ?slow", e); }
        return;
    }

    // 10. ?whois - Security Check
    if (sCmd === '?whois') {
        try {
            const target = (sArgs[1] || "").toLowerCase();
            let foundWhois = false;
            wss.clients.forEach(c => {
                if (c.playerName && c.playerName.toLowerCase() === target) {
                    ws.send(JSON.stringify({ type: 'chat', text: `🔍 DATA: ${c.playerName} | IP: ${c._socket.remoteAddress} | State: Connected`, system: true }));
                    foundWhois = true;
                }
            });
            if(!foundWhois) ws.send(JSON.stringify({ type: 'chat', text: "❌ User offline.", system: true }));
        } catch (e) { console.error("Error in ?whois", e); }
        return;
    }

    // 11. ?players - Client Audit
    if (sCmd === '?players') {
        try {
            const list = Array.from(wss.clients).map(c => `[${c.playerName || "Gast"}]`).join(" ");
            ws.send(JSON.stringify({ type: 'chat', text: `👥 ONLINE-CLIENTS (${wss.clients.size}): ${list}`, system: true }));
        } catch (e) { console.error("Error in ?players", e); }
        return;
    }

    // 12. ?say - System Broadcast
    if (sCmd === '?say') {
        try {
            const msg = sArgs.slice(1, -1).join(' ');
            if (msg) broadcast({ type: 'chat', text: `🛰️ SUPPORTER-NEWS: ${msg}`, system: true });
        } catch (e) { console.error("Error in ?say", e); }
        return;
    }

    // 13. ?ping - Latenz Check
    if (sCmd === '?ping') {
        try {
            ws.send(JSON.stringify({ type: 'chat', text: `🏓 PONG - Server Response OK (Node ${process.version})`, system: true }));
        } catch (e) { console.error("Error in ?ping", e); }
        return;
    }

    // 14. ?room - Standort Prüfung
    if (sCmd === '?room') {
        try {
            ws.send(JSON.stringify({ type: 'chat', text: `📍 RAUM-ZIER: ${ws.room || "MAIN_LOBBY"}`, system: true }));
        } catch (e) { console.error("Error in ?room", e); }
        return;
    }

    // 15. ?uptime - Prozess Analyse
    if (sCmd === '?uptime') {
        try {
            const ut = process.uptime();
            ws.send(JSON.stringify({ type: 'chat', text: `⚙️ UPTIME: ${Math.floor(ut/60)}m ${Math.floor(ut%60)}s`, system: true }));
        } catch (e) { console.error("Error in ?uptime", e); }
        return;
    }

    // 16. ?alert - Direct User Warning
    if (sCmd === '?alert') {
        try {
            const target = sArgs[1];
            const msg = sArgs.slice(2, -1).join(' ');
            wss.clients.forEach(c => {
                if (c.playerName === target) {
                    c.send(JSON.stringify({ type: 'chat', text: `🚨 DIREKT-ALARM: ${msg}`, system: true }));
                }
            });
            ws.send(JSON.stringify({ type: 'chat', text: `✅ Alert an ${target} raus.`, system: true }));
        } catch (e) { console.error("Error in ?alert", e); }
        return;
    }

    // 17. ?checkban - IP Validation
    if (sCmd === '?checkban') {
        try {
            const ip = sArgs[1];
            const status = bannedIPs.has(ip) ? "GEBANNT 🚫" : "CLEAN ✅";
            ws.send(JSON.stringify({ type: 'chat', text: `📋 IP-STATUS (${ip}): ${status}`, system: true }));
        } catch (e) { console.error("Error in ?checkban", e); }
        return;
    }

    // 18. ?staff - Presence Mode
    if (sCmd === '?staff') {
        try {
            broadcast({ type: 'chat', text: "🛡️ EIN SUPPORTER IST JETZT ONLINE.", system: true });
        } catch (e) { console.error("Error in ?staff", e); }
        return;
    }

    // 19. ?lobby - Mass Relocation
    if (sCmd === '?lobby') {
        try {
            wss.clients.forEach(c => { c.room = "Lobby"; });
            broadcast({ type: 'chat', text: "🔄 Lobby-Zwang durch Supporter aktiviert.", system: true });
        } catch (e) { console.error("Error in ?lobby", e); }
        return;
    }

    // 20. ?checkmute - Registry Lookup
    if (sCmd === '?checkmute') {
        try {
            const target = (sArgs[1] || "").toLowerCase();
            const isMuted = mutedPlayers.has(target);
            ws.send(JSON.stringify({ type: 'chat', text: `🔇 STATUS ${sArgs[1]}: ${isMuted ? "GEMUTED" : "FREI"}`, system: true }));
        } catch (e) { console.error("Error in ?checkmute", e); }
        return;
    }

    // 21. ?version - Build Info
    if (sCmd === '?version') {
        try {
            ws.send(JSON.stringify({ type: 'chat', text: `📡 ENGINE: WebSocket-V2.9 | SUPPORTER-MODE: ENABLED`, system: true }));
        } catch (e) { console.error("Error in ?version", e); }
        return;
    }

    // 22. ?help - SUPPORTER OVERVIEW
    if (sCmd === '?help') {
        try {
            const h1 = "🛡️ SUPPORTER (1/2): ?warn, ?mute, ?unmute, ?kick, ?unban, ?banlist, ?clearchat, ?freeze, ?slow, ?whois, ?players";
            const h2 = "🛡️ SUPPORTER (2/2): ?say, ?ping, ?room, ?uptime, ?alert, ?checkban, ?staff, ?lobby, ?checkmute, ?version, ?help";
            ws.send(JSON.stringify({ type: 'chat', text: h1 + "\n" + h2, system: true }));
            console.log(`[HELP] Menu sent to ${ws.playerName}`);
        } catch (e) { console.error("Critical Error in ?help", e); }
        return;
    }
}
// ======================================================
// ALLE 30 ÖFFENTLICHEN BEFEHLE (STARTEN MIT '!')
// ======================================================
if (data.type === 'chat' && data.text && data.text.startsWith('!')) {
    const args = data.text.split(' ');
    const cmd = args[0].toLowerCase();

    // --- KATEGORIE: INFOS & TOOLS ---
    if (cmd === '!online') {
        ws.send(JSON.stringify({ type: 'chat', text: `👥 Aktuell sind ${wss.clients.size} Spieler online.`, system: true }));
        return;
    }
    if (cmd === '!time') {
        const now = new Date().toLocaleTimeString('de-DE');
        ws.send(JSON.stringify({ type: 'chat', text: `🕒 Serverzeit: ${now}`, system: true }));
        return;
    }
    if (cmd === '!ping') {
        ws.send(JSON.stringify({ type: 'chat', text: "🏓 Pong! Verbindung steht stabil.", system: true }));
        return;
    }
    if (cmd === '!rules') {
        ws.send(JSON.stringify({ type: 'chat', text: "⚖️ Regeln: 1. Kein Spam | 2. Respekt | 3. Keine Cheats.", system: true }));
        return;
    }
    if (cmd === '!stats') {
        ws.send(JSON.stringify({ type: 'chat', text: `📊 Info: Name: ${ws.playerName || "Gast"} | Raum: ${ws.room || "Lobby"}`, system: true }));
        return;
    }
    if (cmd === '!version') {
        ws.send(JSON.stringify({ type: 'chat', text: `🤖 Schach-Server v2.5.0 | Admin: Max`, system: true }));
        return;
    }
    if (cmd === '!wetter') {
        const wetter = ["Sonnig im Rechenzentrum ☀️", "Es regnet Bits & Bytes 🌧️", "Bewölkt mit Aussicht auf Schachmatt ☁️"];
        ws.send(JSON.stringify({ type: 'chat', text: `🌡️ Server-Wetter: ${wetter[Math.floor(Math.random() * wetter.length)]}`, system: true }));
        return;
    }

    // --- KATEGORIE: GLÜCK & ZUFALL ---
    if (cmd === '!dice') {
        const roll = Math.floor(Math.random() * 6) + 1;
        broadcast({ type: 'chat', text: `🎲 ${ws.playerName || "Spieler"} würfelt eine: ${roll}`, system: true });
        return;
    }
    if (cmd === '!coin') {
        const side = Math.random() > 0.5 ? "KOPF" : "ZAHL";
        broadcast({ type: 'chat', text: `🪙 Münzwurf für ${ws.playerName || "Spieler"}: ${side}`, system: true });
        return;
    }
    if (cmd === '!rand') {
        const max = parseInt(args[1]) || 100;
        const num = Math.floor(Math.random() * max) + 1;
        broadcast({ type: 'chat', text: `🎲 Zufallszahl (1-${max}) für ${ws.playerName || "Spieler"}: ${num}`, system: true });
        return;
    }
    if (cmd === '!iq') {
        const iq = Math.floor(Math.random() * (160 - 70 + 1)) + 70;
        ws.send(JSON.stringify({ type: 'chat', text: `🧠 Dein geschätzter Schach-IQ heute: ${iq}`, system: true }));
        return;
    }

    // --- KATEGORIE: INTERAKTION & SPAẞ ---
    if (cmd === '!joke') {
        const jokes = ["Warum können Programmierer nicht kochen? Kein Rezept für 'Undefined'!", "SQL-Query geht in Bar, geht zu 2 Tischen: 'Darf ich mich joinen?'", "Hardware ist das, was man schlagen kann."];
        broadcast({ type: 'chat', text: `😂 Witz: ${jokes[Math.floor(Math.random() * jokes.length)]}`, system: true });
        return;
    }
    if (cmd === '!hug') {
        const person = args.slice(1).join(' ') || "alle";
        broadcast({ type: 'chat', text: `🤗 ${ws.playerName || "Jemand"} umarmt ${person}!`, system: true });
        return;
    }
    if (cmd === '!love') {
        const target = args.slice(1).join(' ') || "das Spiel";
        broadcast({ type: 'chat', text: `❤️ ${ws.playerName || "Spieler"} schickt Liebe an: ${target}`, system: true });
        return;
    }
    if (cmd === '!hallo') {
        broadcast({ type: 'chat', text: `👋 ${ws.playerName || "Spieler"} sagt: Hallo zusammen!`, system: true });
        return;
    }
    if (cmd === '!shout') {
        const text = args.slice(1).join(' ');
        if(text) broadcast({ type: 'chat', text: `📣 ${ws.playerName || "Spieler"} schreit: ${text.toUpperCase()}!!!`, system: true });
        return;
    }
    if (cmd === '!flip') {
        broadcast({ type: 'chat', text: `(╯°□°）╯︵ ┻━┻  - ${ws.playerName || "Spieler"} rastet aus!`, system: true });
        return;
    }
    if (cmd === '!unflip') {
        broadcast({ type: 'chat', text: `┬─┬ノ( º _ ºノ)  - ${ws.playerName || "Spieler"} stellt den Tisch wieder hin.`, system: true });
        return;
    }
    if (cmd === '!dance') {
        broadcast({ type: 'chat', text: `\\o/  |o|  /o\\  - ${ws.playerName || "Spieler"} tanzt vor Freude!`, system: true });
        return;
    }
    if (cmd === '!kaffee') {
        broadcast({ type: 'chat', text: `☕ ${ws.playerName || "Spieler"} schenkt eine Runde Kaffee aus!`, system: true });
        return;
    }
    if (cmd === '!pizza') {
        broadcast({ type: 'chat', text: `🍕 ${ws.playerName || "Spieler"} spendiert eine virtuelle Pizza!`, system: true });
        return;
    }
    if (cmd === '!cool') {
        broadcast({ type: 'chat', text: `(⌐■_■)  - ${ws.playerName || "Spieler"} ist heute extrem cool drauf.`, system: true });
        return;
    }
    if (cmd === '!sleep') {
        broadcast({ type: 'chat', text: `😴 ${ws.playerName || "Spieler"} macht ein kurzes Nickerchen...`, system: true });
        return;
    }
    if (cmd === '!fight') {
        const target = args[1] || "seinem Schatten";
        broadcast({ type: 'chat', text: `⚔️ ${ws.playerName || "Spieler"} fordert ${target} zum Duell heraus!`, system: true });
        return;
    }
    if (cmd === '!gg') {
        broadcast({ type: 'chat', text: `🤝 ${ws.playerName || "Spieler"}: Good Game! Gut gespielt.`, system: true });
        return;
    }
    if (cmd === '!brb') {
        broadcast({ type: 'chat', text: `🕒 ${ws.playerName || "Spieler"} ist gleich wieder da (Be Right Back).`, system: true });
        return;
    }
    if (cmd === '!back') {
        broadcast({ type: 'chat', text: `✅ ${ws.playerName || "Spieler"} ist wieder zurück am Brett!`, system: true });
        return;
    }
    if (cmd === '!hype') {
        broadcast({ type: 'chat', text: `🔥 HYPE! ${ws.playerName || "Spieler"} dreht völlig durch! 🔥`, system: true });
        return;
    }
    if (cmd === '!afk') {
        broadcast({ type: 'chat', text: `💤 ${ws.playerName || "Spieler"} ist jetzt AFK (Away From Keyboard).`, system: true });
        return;
    }

    // --- DER FINALE HELP BEFEHL ---
    if (cmd === '!help') {
        const h1 = "📜 TOOLS: !help, !online, !time, !ping, !rules, !stats, !version, !wetter, !gg, !afk";
        const h2 = "🎲 GLÜCK: !dice, !coin, !rand, !iq, !joke";
        const h3 = "🎭 SPAẞ: !hug, !love, !hallo, !shout, !flip, !unflip, !dance, !kaffee, !pizza, !cool, !sleep, !fight, !brb, !back, !hype";
        ws.send(JSON.stringify({ type: 'chat', text: h1 + "\n" + h2 + "\n" + h3, system: true }));
        return;
    }
}

            // --- SPIEL-KERNFUNKTIONEN ---

            // Login / Registrierung
     // --- ULTIMATE LOGIN & SECURITY V2 ---
            if (data.type === 'join' || data.type === 'find_random') {
                const cleanName = (data.playerName || data.name || "").trim(); // Fix: Namen säubern
                
                if (cleanName.length >= 2) { // Mindestens 2 Zeichen für den Namen
                    const incomingPass = data.password || data.inputPass || "";
                    const clientIP = ws.clientIP;

                    // 1. STRENGER BRUTE-FORCE SCHUTZ
                    // 1. STRENGER BRUTE-FORCE SCHUTZ
                    let attempts = loginAttempts.get(clientIP) || 0;
                    if (attempts >= 5) {
                        // NEU: IP für 10 Minuten in die Sperrliste eintragen
                        blockedIPs.set(clientIP, Date.now() + 10 * 60 * 1000); 
                        
                        ws.send(JSON.stringify({ type: 'chat', text: '🚫 ZU VIELE FEHLVERSUCHE! Deine IP wurde für 10 Min gesperrt.', system: true }));
                        console.warn(`🛑 IP GESPERRT: ${clientIP} hat 5x das falsche Passwort eingegeben.`);
                        
                        // Verbindung nach kurzer Verzögerung trennen
                        setTimeout(() => ws.terminate(), 1000);
                        return;
                    }

                    if (!userDB[cleanName]) {
                        // --- NEUREGISTRIERUNG MIT VOLLSTÄNDIGEM PROFIL ---
                        userDB[cleanName] = { 
                            password: incomingPass, 
                            wins: 0, 
                            level: 1, 
                            xp: 0,
                            lastIP: clientIP,
                            created: new Date().toISOString(),
                            role: "player" // Vorbereitung für Admin-Rollen
                        };
                        saveAll();
                        console.log(`✨ Neuer Champion registriert: ${cleanName}`);
                    } else {
                        // --- LOGIN-CHECK ---
                        const profile = userDB[cleanName];
                        const storedPass = (typeof profile === 'object') ? profile.password : profile;

                        if (storedPass !== incomingPass && storedPass !== "") {
                            loginAttempts.set(clientIP, attempts + 1);
                            ws.send(JSON.stringify({ type: 'chat', text: `❌ Passwort falsch! (Versuch ${attempts + 1}/5)`, system: true }));
                            return; 
                        }

                        // ERFOLGREICHER LOGIN -> Reset Versuche
                        loginAttempts.set(clientIP, 0);
                        if (userDB[cleanName] && userDB[cleanName].is_banned === true) {
    ws.send(JSON.stringify({ 
        type: 'chat', 
        text: '🚫 ZUGRIFF VERWEIGERT: Dein Account wurde permanent gesperrt.', 
        system: true 
    }));
    setTimeout(() => ws.terminate(), 1000); // Verbindung nach 1 Sekunde kicken
    return; // WICHTIG: Hier abbrechen, damit er nicht eingeloggt wird!
}
                        
                        // Profil-Update (Falls es noch ein alter String-Eintrag war)
                        if (typeof profile !== 'object') {
                            userDB[cleanName] = { password: storedPass, wins: 0, level: 1, xp: 0 };
                        }
                        userDB[cleanName].lastIP = clientIP;
                        userDB[cleanName].lastLogin = new Date().toISOString();
                    }

                    // --- DATEN AN WEBSOCKET BINDEN ---
                    ws.playerName = cleanName;
                    lastKnownIPs[cleanName] = clientIP;
                    
                    // Individuelle Begrüßung mit Stats
                    const stats = userDB[cleanName];
                    ws.send(JSON.stringify({ 
                        type: 'chat', 
                        text: `🔓 Willkommen, ${cleanName}! [Level: ${stats.level} | XP: ${stats.xp}]`, 
                        system: true 
                    }));
                } else if (cleanName.length > 0) {
                    ws.send(JSON.stringify({ type: 'chat', text: '⚠️ Name zu kurz (min. 2 Zeichen).', system: true }));
                }
            }

            // Random Matchmaking
if (data.type === 'find_random') {
    // FALL 1: Es wartet bereits jemand -> Echtes Match starten
    if (waitingPlayer && waitingPlayer !== ws && waitingPlayer.readyState === WebSocket.OPEN) {
        // WICHTIG: Den Bot-Timer des wartenden Spielers stoppen!
        if (waitingPlayer.botTimeout) {
            clearTimeout(waitingPlayer.botTimeout);
            console.log("🛑 Bot-Timer gestoppt, echter Gegner gefunden!");
        }

        const roomID = "room_" + Math.random();
        ws.room = roomID;
        waitingPlayer.room = roomID;
        
        // Beiden Spielern die Daten schicken
        ws.send(JSON.stringify({ type: 'gameStart', room: roomID, color: 'black', opponent: waitingPlayer.playerName || "Gegner" }));
        waitingPlayer.send(JSON.stringify({ type: 'gameStart', room: roomID, color: 'white', opponent: ws.playerName || "Gegner" }));
        
        waitingPlayer = null;

    } else {
        // FALL 2: Du bist der erste Spieler -> Warten und Timer starten
        waitingPlayer = ws;
        console.log("⏳ Suche läuft... Bot startet in 5 Sekunden, falls kein Gegner kommt.");

        // Der 5-Sekunden-Timer für den Ghostplayer
        ws.botTimeout = setTimeout(() => {
            if (waitingPlayer === ws) {
                console.log("🤖 5 Sekunden um! Ghostplayer wird aktiviert.");
                
                const roomID = "bot_room_" + Date.now();
                ws.room = roomID;
                waitingPlayer = null; // Warteschlange leeren

                // Zufälligen Bot-Namen wählen (aus deiner Liste)
                const ghostNames = ["ChessMaster99", "Grandmaster_Ghost", "Stockfish_Junior", "ShadowMove"];
                const botName = ghostNames[Math.floor(Math.random() * ghostNames.length)];

                // Dem Spieler sagen, dass das Spiel gegen den Bot startet
                ws.send(JSON.stringify({ 
                    type: 'gameStart', 
                    room: roomID, 
                    color: 'white', 
                    opponent: botName,
                    isBotMatch: true // Das Flag für script.js
                }));
                
                // Optional: Den Bot direkt begrüßen lassen
                setTimeout(() => {
                    ws.send(JSON.stringify({ 
                        type: 'chat', 
                        text: "Hallo! Viel Glück beim Spiel.", 
                        sender: botName, 
                        system: false 
                    }));
                }, 1000);
            }
        }, 5000); // 5000ms = 5 Sekunden
    }
    return;
}
// Ganz oben in deiner server.js (bei den anderen require-Befehlen)
const Replicate = require("replicate");
// 2. Den Token aus der Umgebungsvariable laden
const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN, 
});

// ... (Rest deines Codes) ...

// === ECHTE KI-VIDEO GENERIERUNG (Ersetzt die Simulation) ===
// === KOSTENLOSE VIDEO-GENERIERUNG ÜBER GIPHY (Ersetzt Replicate) ===
if (data.type === 'generate_video') {
    const creatorName = data.playerName || ws.playerName || "Unbekannt";
    const GIPHY_API_KEY = process.env.GIPHY_API_KEY;

    console.log(`🎬 Video-Anfrage (Giphy) von ${creatorName}: ${data.prompt}`);

    async function fetchGiphyVideo() {
        try {
            // Wir nutzen 'translate' um eine KI-ähnliche Interpretation des Prompts zu bekommen
            const response = await axios.get(`https://api.giphy.com/v1/gifs/translate`, {
                params: {
                    api_key: GIPHY_API_KEY,
                    s: data.prompt,
                    rating: 'pg-13'
                }
            });

            // Wir prüfen, ob Giphy ein Ergebnis geliefert hat
            if (response.data && response.data.data && response.data.data.images) {
                // Wir nutzen das MP4-Format, damit dein Video-Player im Frontend funktioniert
                const videoUrl = response.data.data.images.original.mp4;

                const videoData = {
                    type: 'video_update',
                    url: videoUrl,
                    prompt: data.prompt,
                    playerName: creatorName
                };

                // Broadcast an alle verbundenen Spieler
                wss.clients.forEach(client => {
                    if (client.readyState === 1) { // 1 = WebSocket.OPEN
                        client.send(JSON.stringify(videoData));
                    }
                });
                
                console.log("✅ Video-Link von Giphy gesendet!");

            } else {
                throw new Error("Kein passendes Clip gefunden.");
            }

        } catch (error) {
            console.error("❌ Giphy-Fehler:", error.message);
            // Fehler-Rückmeldung an den User im Chat
            ws.send(JSON.stringify({ 
                type: 'chat', 
                text: "❌ Ups! Zu diesem Thema konnte ich kein passendes Video finden.", 
                system: true 
            }));
        }
    }

    fetchGiphyVideo();
    return; // Beendet die Verarbeitung für diesen Nachrichtentyp
}
            /// === Chat & Züge ===
            if (data.type === 'chat' || data.type === 'move') {
                // Züge blockieren, wenn der Server gesperrt ist
                if (typeof serverLocked !== 'undefined' && serverLocked && data.type === 'move') {
                    return;
                }

                if (data.type === 'chat') {
                    if (isSpamming(ws, data.text)) return;
                    // 1. Prüfung: Ist der Chat eingefroren?
                    if (global.chatFrozen === true && ws.playerName !== "Max") {
                        ws.send(JSON.stringify({ 
                            type: 'chat', 
                            text: "🧊 Der Chat ist aktuell vom Admin gesperrt und niemand kann deine Nachricht sehen.", 
                            system: true 
                        }));
                        return; 
                    }
    // NEU: Emojis umwandeln
    if (typeof parseEmojis === 'function') {
        data.text = parseEmojis(data.text);
    }

                    // HTML-Tags entfernen (Sicherheit)
                    if (typeof escapeHTML === 'function') {
                        data.text = escapeHTML(data.text);
                    }

                    const now = Date.now();
                    const playerName = ws.playerName || "Gast";
                    const lowerName = playerName.toLowerCase();

                    // Anti-Spam (Prüfung auf slowModeDelay)
                    const currentDelay = typeof slowModeDelay !== 'undefined' ? slowModeDelay : 1;
                    if (now - ws.lastMessageTime < currentDelay * 1000) {
                        return;
                    }

                    if (ws.isMuted || (typeof mutedPlayers !== 'undefined' && mutedPlayers.has(lowerName) && now < mutedPlayers.get(lowerName))) {
                        if (typeof sendSystemAlert === 'function') {
                            sendSystemAlert(ws, '🔇 Du bist stummgeschaltet und kannst keine Nachrichten senden.');
                        } else {
                            ws.send(JSON.stringify({ type: 'chat', text: '🔇 Du bist stummgeschaltet!', system: true }));
                        }
                        return;
                    }
                    ws.lastMessageTime = now;
                    // === NEU: SPECTATOR BEFEHLE ===
if (data.type === 'chat' && data.text) {
    if (data.text.startsWith('/watch')) {
        const parts = data.text.split(' ');
        let target = parts[1]; // Das ist z.B. "room_123" oder "Max"
        
        // Smarte Suche: Wenn jemand /watch Max schreibt, finde den Raum von Max
        if (target && !target.startsWith('room_')) {
             let foundRoom = null;
             wss.clients.forEach(c => {
                 if (c.playerName && c.playerName.toLowerCase() === target.toLowerCase()) {
                     foundRoom = c.room;
                 }
             });
             if (foundRoom) target = foundRoom;
        }

       if (typeof addSpectator === 'function') {
    addSpectator(ws, target, wss);
    
    // NEU: Dem Zuschauer sofort das aktuelle Brett des Spielers schicken
    wss.clients.forEach(client => {
        if (client.playerName && client.playerName.toLowerCase() === target.toLowerCase() || client.room === target) {
            if (client.lastBoardState) { // Wir müssen den letzten Stand speichern (siehe Schritt 2)
                ws.send(JSON.stringify({ type: 'move', board: client.lastBoardState }));
            }
        }
    });
}
    if (data.text === '/unwatch') {
        if (typeof removeSpectator === 'function') {
            removeSpectator(ws);
        }
        return;
    }
}
}
                    }
                    // === HIER DER NEUE MOVE-BLOCK FÜR ZUSCHAUER ===
                if (data.type === 'move') {
                    // 1. ZUSCHAUER-SPERRE (Verhindert das Bewegen)
                    if (ws.isSpectator) {
                        ws.send(JSON.stringify({ 
                            type: 'chat', 
                            text: '👁️ Zuschauer dürfen nicht ziehen!', 
                            system: true 
                        }));
                        return; // WICHTIG: Stoppt die Verarbeitung für Zuschauer hier!
                    }
                    const targetRoom = data.room || ws.room || "global";
                    if (!moveCounters[targetRoom]) moveCounters[targetRoom] = 0;
                    moveCounters[targetRoom]++; // Zähler erhöhen (001, 002, 003...)
                    
                    // Foto im Hintergrund speichern
                    captureMoveSnapshot(targetRoom, data.board, moveCounters[targetRoom]);
                    // ----------------------------------------------

                    // 2. STATUS SPEICHERN (Damit neue Zuschauer das Board sehen)
                    // Wir speichern das Board beim Spieler-Objekt ab
                    ws.lastBoardState = data.board; 

                    // 3. AN ZUSCHAUER SENDEN
                    if (typeof broadcastToSpectators === 'function') {
                        const roomID = data.room || ws.room;
                        broadcastToSpectators({
                            type: 'move',
                            move: data.move,
                            board: data.board,
                            turn: data.turn
                        }, roomID);
                    }
                }

                // Nachricht oder Zug an alle Spieler im selben Raum senden
                const targetRoom = data.room || ws.room;
                wss.clients.forEach(function(client) {
                    if (client !== ws && client.readyState === 1 && client.room === targetRoom) {
                        client.send(JSON.stringify(data));
                    }
                });
                // === NEU: SPECTATOR WEITERLEITUNG ===
// === NEU: SPECTATOR WEITERLEITUNG ===
// Wenn es ein Zug oder Chat ist, schicke es auch an die Beobachter
if (typeof broadcastToSpectators === 'function') {
    broadcastToSpectators(data);
}
                // === BOT-REAKTION (GHOST-MODUS) ===
                if (data.type === 'move' && ws.isBotMatch) {
                    // Wir nehmen den gespeicherten Bot-Namen
                    const currentBotName = ws.opponentName || "Grandmaster_Ghost";
                    
                    // Der Bot lässt sich kurz Zeit zum "Nachdenken"
                    setTimeout(() => {
                        // Prüfen, ob das ghost-Modul geladen ist
                        if (typeof ghost !== 'undefined' && ghost.handleGhostMove) {
                            ghost.handleGhostMove(ws, data.board, 'black', currentBotName);
                        } else if (typeof handleGhostMove === 'function') {
                            handleGhostMove(ws, data.board, 'black', currentBotName);
                        } else {
                            console.error("❌ Fehler: handleGhostMove konnte nicht gefunden werden!");
                        }
                    }, 700); // 700ms Verzögerung für mehr Realismus
                }

            } // Ende des "if chat || move" Blocks
// ======================
            // Private Räume
            if (data.type === 'join' && !data.type.startsWith('find_')) {
                ws.room = data.room;
                ws.send(JSON.stringify({ type: 'join', room: data.room }));
            }

            // Siege & Bestenliste
         // Siege & Bestenliste (OPTIMIERT MIT LEVEL-SYSTEM)
          if (data.type === 'win') {
    const now = Date.now();
    const lastWin = lastWinTime.get(ws.clientIP) || 0;
    const name = data.name || ws.playerName || "Anonym";

    // 1. Anti-Cheat Check (Dein Original-Code)
    if (now - lastWin < 1000) {
        let streak = (winStreakCount.get(ws.clientIP) || 0) + 1;
        winStreakCount.set(ws.clientIP, streak);

        if (streak >= 3) {
            console.error("🚨 AUTO-BAN: " + name + " hat zu schnell gewonnen! IP: " + ws.clientIP);
            bannedIPs.add(ws.clientIP);
            saveAll();
            sendSystemAlert(ws, '❌ AUTO-BAN: Du hast versucht zu cheaten (zu viele Siege)!');
            setTimeout(() => ws.terminate(), 1000);
            return; 
        }
    } else {
        winStreakCount.set(ws.clientIP, 0);
    }
    lastWinTime.set(ws.clientIP, now);

    // 2. Profil & Level-Logik aus Ruby (NEU HINZUGEFÜGT)
    if (!userDB[name] || typeof userDB[name] === 'string') {
        userDB[name] = {
            uid: "ID-" + Math.random().toString(36).substring(2, 9).toUpperCase(),
            level: 1,
            xp: 0,
            wins: (leaderboard[name] || 0) 
        };
    }

    const oldLevel = userDB[name].level;
    userDB[name].wins += 1;
    userDB[name].xp += 50; // 50 XP pro Sieg
    userDB[name].level = Math.floor(userDB[name].xp / 100) + 1; // Alle 100 XP ein Level-Up

    // 3. Daten synchronisieren & Speichern (Deine Original-Funktionen)
    leaderboard[name] = {
        wins: userDB[name].wins,
        level: userDB[name].level,
        xp: userDB[name].xp
    };
    saveAll();
    sendLeaderboardUpdate();

    // --- HIER KOMMT DAS NEUE SUPABASE-UPDATE HIN ---
    fetch(`${SUPABASE_URL}/rest/v1/players?username=eq.${name}`, {
        method: 'PATCH',
        headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
            wins: userDB[name].wins,
            xp: userDB[name].xp,
            level: userDB[name].level 
        })
    })
    .then(() => console.log(`💾 Cloud-Save Erfolg: ${name}`))
    .catch(err => console.error("❌ Cloud-Save Fehler:", err));

    // --- NEU: ZUSÄTZLICHE PROFI-ANALYSE FÜR USER_STATS (ELO & AGGRO) ---
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);

        fetch("https://mein-schach-1.onrender.com/analyse", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
                spieler: name,
                von: "e2", nach: "e4", figur: "Bauer", wert: 1, ist_schlagzug: false 
            }),
            signal: controller.signal
        })
        .then(async (pythonResponse) => {
            clearTimeout(timeout);
            if (pythonResponse.ok) {
                const stats = await pythonResponse.json();
                
                const finalElo = stats?.Basis_Werte?.Geschätzte_Elo || 1200;
                const finalAggro = stats?.Aggressivitäts_Index?.Gesamt || 0;

                const { error: upsertError } = await supabaseAdmin
                    .from('user_stats')
                    .upsert({ 
                        username: name, 
                        elo: finalElo,
                        games_played: userDB[name].wins,
                        aggressivity_score: finalAggro,
                        last_analysis: stats || {},
                        updated_at: new Date()
                    }, { onConflict: 'username' });

                if (!upsertError) console.log(`📊 Profi-Analyse für ${name} in user_stats gesichert.`);
            }
        })
        .catch(err => console.error("ℹ️ Analyse-Info:", err.name === 'AbortError' ? "Python Timeout" : err.message));
    } catch (e) {
        console.error("Fehler im Analyse-Prozess:", e);
    }
    // -----------------------------------------------------------------

    // 4. Level-Up Nachricht (Die Ruby-Belohnung)
    if (userDB[name].level > oldLevel) {
        wss.clients.forEach(function each(client) {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                    type: 'chat',
                    text: `⭐ LEVEL UP: ${name} ist jetzt Level ${userDB[name].level}!`,
                    system: true
                }));
            }
        });
    }
}
   if (data.type === 'game_over') {
    const winnerName = data.player || ws.playerName; // Sicherheit: Nutzt Fallback-Namen
    const reason = data.reason || 'checkmate'; 
    const userIP = ws.clientIP || "0.0.0.0"; 
    
    console.log(`🛡️ Server-Sicherung für ${winnerName} (IP: ${userIP}) - Grund: ${reason}`);
       const targetRoom = data.room || ws.room || "global";
    generateGameVideo(targetRoom, ws);

    try {
        // --- DEINE ALTE LOGIK (UNVERÄNDERT) ---
        const { data: userData } = await supabaseAdmin
            .from('players')
            .select('wins, xp, elo')
            .eq('username', winnerName)
            .single();

        const winText = reason === 'timeout' 
            ? `🏆 Zeit abgelaufen: ${winnerName} gewinnt durch Zeitvorteil!` 
            : `🏆 Meisterschaft: ${winnerName} hat durch Schachmatt gewonnen!`;

        if (userData) {
            await supabaseAdmin.from('players').update({ 
                wins: (userData.wins || 0) + 1,
                xp: (userData.xp || 0) + 50,
                elo: (userData.elo || 1500) + 20,
                ip_address: userIP,
                last_win: new Date().toISOString() 
            }).eq('username', winnerName);
            console.log(`✅ Statistiken für ${winnerName} aktualisiert.`);
        } else {
            await supabaseAdmin.from('players').insert([{ 
                username: winnerName, wins: 1, xp: 50, elo: 1520, ip_address: userIP, last_win: new Date().toISOString()
            }]);
            console.log(`✨ Profil für ${winnerName} neu angelegt.`);
        }
        // --- ENDE DEINER ALTEN LOGIK ---


        // --- EXTREM VERBESSERTE NEUE ANALYSE-LOGIK ---
        try {
            // Wir setzen ein Zeitlimit (Timeout), damit der Server nicht hängen bleibt
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000); // 5 Sekunden Limit

            const pythonResponse = await fetch("https://mein-schach-1.onrender.com/analyse", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                    spieler: winnerName,
                    von: "e2", nach: "e4", figur: "Bauer", wert: 1, ist_schlagzug: false // Dummy-Move für End-Stats
                }),
                signal: controller.signal
            });
            clearTimeout(timeout);

            if (pythonResponse.ok) {
                const stats = await pythonResponse.json();
                
                // Wir nutzen "stats?.Feld", damit es niemals "undefined"-Fehler gibt
                const finalElo = stats?.Basis_Werte?.Geschätzte_Elo || 1200;
                const finalAggro = stats?.Aggressivitäts_Index?.Gesamt || 0;
                const gamesCount = userData ? (userData.wins || 0) + 1 : 1;

                // Speicherung in 'user_stats' mit Sicherheitsprüfung
                const { error: upsertError } = await supabaseAdmin
                    .from('user_stats')
                    .upsert({ 
                        username: winnerName, 
                        elo: finalElo,
                        games_played: gamesCount,
                        aggressivity_score: finalAggro,
                        last_analysis: stats || {}, // Speichert leeres Objekt falls stats null ist
                        updated_at: new Date()
                    }, { onConflict: 'username' });

                if (upsertError) throw upsertError;
                console.log(`📊 Profi-Analyse für ${winnerName} sicher in user_stats abgelegt.`);
            }
        } catch (pythonErr) {
            // Dieser Catch fängt Timeouts, leere Antworten und Supabase-Fehler ab
            console.error("ℹ️ Analyse-Info:", pythonErr.name === 'AbortError' ? "Python-Server Timeout" : pythonErr.message);
        }
        // --- ENDE DER VERBESSERTEN ANALYSE-LOGIK ---


        // DEIN ALTER CHAT-VERSAND (UNVERÄNDERT)
        wss.clients.forEach(function each(client) {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ type: 'chat', text: winText, system: true }));
            }
        });

    } catch (err) {
        console.error("❌ Kritischer Datenbankfehler bei Sieg-Sicherung:", err);
    }
}
    } catch (e) { // Hier schließt der try-Block der gesamten Nachrichtenverarbeitung
       console.error("Fehler bei der Nachrichtenverarbeitung:", e);
    }
}); // <--- NEU: Das hier hat gefehlt! Es schließt ws.on('message', ...)

   ws.on('close', function() {
        if (waitingPlayer === ws) {
            waitingPlayer = null;
        }
    });
}); // Schließt wss.on('connection')

const PORT = process.env.PORT || 8080;

server.listen(PORT, async function() { 
    console.log("MASTER-SERVER STARTET...");
    
    // 1. Accounts aus Supabase laden
    await loadProfilesFromSupabase(); 
    
    // 2. IP-Sperren aus der Datei laden (DAS FEHLTE)
    try {
        if (fs.existsSync(BAN_FILE)) {
            const data = fs.readFileSync(BAN_FILE, 'utf8');
            const parsed = JSON.parse(data);
            bannedIPs = new Set(parsed);
            console.log(`✅ ${bannedIPs.size} IP-Sperren geladen.`);
        }
    } catch (err) {
        console.error("❌ Fehler beim Laden der IP-Bans:", err);
    }
    if (typeof startBackupScheduler === 'function') {
        startBackupScheduler(supabaseAdmin);
    }
    if (typeof startAutoMessages === 'function') {
        startAutoMessages(wss); 
        console.log("🤖 Info-Bot (AutoMessages) wurde gestartet.");
    } else {
        console.warn("⚠️ Warnung: startAutoMessages ist nicht definiert. Hast du require('./autoMessages') vergessen?");
    }
    console.log("✅ MASTER-SERVER READY AUF PORT " + PORT);
    const { fork } = require('child_process');
    fork('./chaosLernBot.js'); 

    console.log("🚀 CHAOS-BOT ALS UNTERPROZESS AKTIVIERT!");
});
// =========================================================
// DER EXTREME GLOBALE SCHUTZSCHILD (Ganz am Ende einfügen)
// =========================================================

// =========================================================
// DER EXTREME GLOBALE SCHUTZSCHILD (Eigenständig)
// =========================================================

// Interne Hilfsfunktion: Schickt die Nachricht direkt an Discord
async function sendShieldAlert(text) {
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) return; // Falls keine URL da ist, machen wir nichts

    try {
        await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: "System-Wächter",
                avatar_url: "https://max-code01.github.io/mein-schach/favicon.ico",
                content: text
            })
        });
    } catch (e) {
        console.error("Fehler beim Senden des Schutzschild-Alarms:", e.message);
    }
}

// 1. Abfangen von kritischen Abstürzen
process.on('uncaughtException', (err) => {
    console.error('🔥 KRITISCHER ABSTURZ-FEHLER:', err);

    const stackLines = err.stack ? err.stack.split('\n') : ["Kein Stack verfügbar"];
    const location = stackLines[1] ? stackLines[1].trim() : "Unbekannter Ort";

    const discordMessage = 
        `🚨 **KRITISCHER SERVER-FEHLER ABGEFANGEN** 🚨\n\n` +
        `**❌ Fehler:** \`${err.name}: ${err.message}\`\n` +
        `**📍 Ort:** \`${location}\`\n\n` +
        `**💻 Vollständiger Stack-Trace:**\n` +
        `\`\`\`javascript\n${stackLines.slice(0, 5).join('\n')}\n\`\`\`\n` +
        `🛡️ _Der Schutzschild hält! Der Server läuft weiter._`;
    
    sendShieldAlert(discordMessage);
});

// 2. Abfangen von Fehlern in asynchronen Versprechen (Promises)
process.on('unhandledRejection', (reason, promise) => {
    console.error('🕒 UNBEHANDELTER PROMISE-FEHLER:', reason);
    
    const errorDetail = reason instanceof Error ? reason.stack : reason;
    const shortReason = reason instanceof Error ? reason.message : reason;

    const rejectMessage = 
        `⚠️ **ASYNC PROMISE-FEHLER**\n\n` +
        `**Grund:** \`${shortReason}\`\n\n` +
        `**Details:**\n` +
        `\`\`\`text\n${String(errorDetail).substring(0, 500)}\n\`\`\``;

    sendShieldAlert(rejectMessage);
});

// =========================================================
// DATEI-ENDE
// =========================================================
