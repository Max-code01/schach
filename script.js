const boardEl = document.getElementById("chess-board");
const statusEl = document.getElementById("status-display");
const chatMessages = document.getElementById("chat-messages");
const chatInput = document.getElementById("chat-input");
// --- FARBWAHL LOGIK ---
const cpWhite = document.getElementById("colorWhite");
const cpBlack = document.getElementById("colorBlack");

if (cpWhite && cpBlack) {
    [cpWhite, cpBlack].forEach(cp => {
        cp.oninput = () => {
            document.documentElement.style.setProperty('--board-white', cpWhite.value);
            document.documentElement.style.setProperty('--board-black', cpBlack.value);
        };
    });
}
// Diese Funktion wird aufgerufen, wenn der Balken bei 100% ist
function onVideoReady(videoUrl, promptText) {
    const statusEl = document.getElementById("videoStatus"); // Das Textfeld unter dem Button
    const container = document.getElementById("videoResultContainer"); // Ein Container für das Ergebnis

    if (statusEl) {
        statusEl.innerHTML = "✅ Video fertig erstellt!";
    }

    if (container) {
        // Hier wird der Button erzeugt
        container.innerHTML = `
            <div class="video-success-box">
                <p>🎬 <strong>Dein Video:</strong> ${promptText}</p>
                <button onclick="playVideo('${videoUrl}')" class="play-btn">
                    ▶ JETZT ANSEHEN
                </button>
            </div>
        `;
    }
}

const gameModeSelect = document.getElementById("gameMode");
const nameInput = document.getElementById("playerName");
const passInput = document.getElementById("playerPass"); // Neu für Passwort
let illegalMoveCount = 0;
let opponentName = "Unbekannt"; // Diese Zeile neu einfügen
let onlineRoom = ""; // Hier wird sie erstellt
let myColor = "white"; // Hier wird sie erstellt
let lastMove = null;
let premove = null;
let moveTimeLimit = 300; // 5 Minuten in Sekunden
let currentTimerValue = moveTimeLimit;
let timerInterval = null;
let isGlobalLocked = false;
// FÜGE ES HIER EIN:
// 1. Einmalig beim Laden der Seite einen festen Zufallsnamen erstellen
const fixedRandomName = "Spieler_" + Math.floor(Math.random() * 10000);

function getMyName() { 
    // 2. Wenn ein Name im Feld steht, nimm den
    if (nameInput && nameInput.value.trim() !== "") {
        return nameInput.value.trim();
    }
    // 3. Wenn NICHTS im Feld steht, nimm IMMER den festen Namen von oben
    return fixedRandomName; 
}

function getMyPass() { 
    return (passInput && passInput.value) || ""; 
}
const SUPABASE_URL = 'https://sfbubqwnuthicpenmwye.supabase.co';
const SUPABASE_KEY = 'sb_publishable_H-ZV5me7vxZN_fNPdQ0ifA_--7AdGnZ';
let pingStart;

function startPingCheck() {
    setInterval(() => {
        // Prüfen, ob der WebSocket (socket) existiert und offen ist
        if (window.socket && window.socket.readyState === WebSocket.OPEN) {
            pingStart = performance.now(); 
            window.socket.send(JSON.stringify({ type: 'ping' }));
        } else {
            const statusEl = document.getElementById('server-status');
            if (statusEl) {
                statusEl.innerText = "Offline";
                statusEl.style.color = "red";
            }
        }
    }, 5000); // Alle 5 Sekunden prüfen
}

// Starte die Prüfung
startPingCheck();
// NEU: Wir nutzen let und warten auf die index.html
let supabase;

function connectToSupabase() {
    if (window.supabase) {
        supabase = window.supabase;
        console.log("✅ Supabase-Verbindung steht!");
    } else {
        setTimeout(connectToSupabase, 100);
    }
}
connectToSupabase();
async function getIP() {
    try {
        const response = await fetch('https://api.ipify.org?format=json');
        const ipData = await response.json();
        return ipData.ip;
    } catch(e) {
        console.error("IP-Abruf fehlgeschlagen");
        return "Nicht erkannt";
    }
}

// --- 1. KONFIGURATION ---
// Variable für DEINEN Bot -> nutzt DEINE Datei
let myEngineWorker = new Worker('engineWorker.js'); 

// Variable für STOCKFISH -> nutzt die NEUE Datei
let stockfishWorker = new Worker('stockfishWorker.js');
const socket = new WebSocket("wss://mein-schach-uten.onrender.com");

const sounds = {
    move: new Audio('https://images.chesscomfiles.com/chess-themes/pieces/neo/sounds/move-self.mp3'),
    cap: new Audio('https://images.chesscomfiles.com/chess-themes/pieces/neo/sounds/capture.mp3'),
    check: new Audio('https://images.chesscomfiles.com/chess-themes/pieces/neo/sounds/move-check.mp3')
};

const PIECES = {
    'P': 'https://upload.wikimedia.org/wikipedia/commons/4/45/Chess_plt45.svg', 'R': 'https://upload.wikimedia.org/wikipedia/commons/7/72/Chess_rlt45.svg',
    'N': 'https://upload.wikimedia.org/wikipedia/commons/7/70/Chess_nlt45.svg', 'B': 'https://upload.wikimedia.org/wikipedia/commons/b/b1/Chess_blt45.svg',
    'Q': 'https://upload.wikimedia.org/wikipedia/commons/1/15/Chess_qlt45.svg', 'K': 'https://upload.wikimedia.org/wikipedia/commons/4/42/Chess_klt45.svg',
    'p': 'https://upload.wikimedia.org/wikipedia/commons/c/c7/Chess_pdt45.svg', 'r': 'https://upload.wikimedia.org/wikipedia/commons/f/ff/Chess_rdt45.svg',
    'n': 'https://upload.wikimedia.org/wikipedia/commons/e/ef/Chess_ndt45.svg', 'b': 'https://upload.wikimedia.org/wikipedia/commons/9/98/Chess_bdt45.svg',
    'q': 'https://upload.wikimedia.org/wikipedia/commons/4/47/Chess_qdt45.svg', 'k': 'https://upload.wikimedia.org/wikipedia/commons/f/f0/Chess_kdt45.svg'
};

let board, turn = "white", selected = null, history = [];

// --- SPEZIALZUG VARIABLEN ---
let hasMoved = {
    whiteK: false, whiteR1: false, whiteR8: false,
    blackK: false, blackR1: false, blackR8: false
};
let enPassantTarget = null; 

// --- REMIS-VARIABLEN ---
let halfMoveClock = 0; // Für die 50-Züge-Regel
let positionHistory = {}; // Für die 3-fache Wiederholung

// --- NEU: FEN-GENERATOR ---
function boardToFEN() {
    let fen = "";
    for (let r = 0; r < 8; r++) {
        let empty = 0;
        for (let c = 0; c < 8; c++) {
            let p = board[r][c];
            if (p === "") {
                empty++;
            } else {
                if (empty > 0) { fen += empty; empty = 0; }
                fen += p;
            }
        }
        if (empty > 0) fen += empty;
        if (r < 7) fen += "/";
    }
    fen += ` ${turn === "white" ? "w" : "b"} `;
    let castling = "";
    if (!hasMoved.whiteK) {
        if (!hasMoved.whiteR8) castling += "K";
        if (!hasMoved.whiteR1) castling += "Q";
    }
    if (!hasMoved.blackK) {
        if (!hasMoved.blackR8) castling += "k";
        if (!hasMoved.blackR1) castling += "q";
    }
    fen += (castling || "-") + " - 0 1";
    return fen;
}

// --- 🐍 PYTHON ANALYSE SCHNITTSTELLE (Optimiert für Ultra-Stats) ---
async function sendeAnAnalyse(fr, fc, tr, tc, figur, istSchlag) {
    // Umwandlung in Schach-Notation (z.B. e2, e4)
    const von = String.fromCharCode(97 + fc) + (8 - fr);
    const nach = String.fromCharCode(97 + tc) + (8 - tr);
    
    const zugDaten = {
        spieler: getMyName(),
        von: von,
        nach: nach,
        figur: figur,
        wert: 100, 
        ist_schlagzug: istSchlag
    };

    try {
        // Ruf an deinen Render-Server
        const response = await fetch('https://mein-schach-1.onrender.com/analyse', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(zugDaten)
        });

        if (!response.ok) throw new Error("Server antwortet nicht korrekt");

        const ergebnis = await response.json();

// UI AKTUALISIERUNG (Dashboard-Style) - ANGEPASST AN NEUEN PYTHON CODE
        const eloDisp = document.getElementById("elo-display");
        
        // Wir prüfen jetzt auf "Performance_Metriken", wie im neuen Python-Code definiert
        if(eloDisp && ergebnis.Performance_Metriken) {
            const perf = ergebnis.Performance_Metriken;
            const pos = ergebnis.Positions_Analyse;

            eloDisp.innerHTML = `
                <div style="background: rgba(0,0,0,0.25); padding: 12px; border-radius: 10px; border-left: 5px solid #f1c40f; box-shadow: 0 4px 15px rgba(0,0,0,0.3);">
                    <div style="font-size: 0.8em; color: #bdc3c7; letter-spacing: 1px; margin-bottom: 5px;">🐍 PYTHON LIVE-LABOR</div>
                    
                    <div style="font-size: 1.3em; font-weight: bold; display: flex; align-items: center; gap: 8px;">
                        Elo: <span style="color: #f1c40f;">${perf["Geschätzte_Elo"]}</span> 
                        <span style="font-size: 0.5em; background: #f1c40f; color: #2c3e50; padding: 2px 6px; border-radius: 4px; vertical-align: middle;">
                            ${perf["Rang"]}
                        </span>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px; font-size: 0.85em; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 8px;">
                        <div>🎯 Präzision: <b style="color: #2ecc71;">${perf["Genauigkeit"]}</b></div>
                        <div>⚔️ Aggro: <b style="color: #e74c3c;">${perf["Aggressivität"]}</b></div>
                        <div>🏰 Zentrum: <b>${pos["Zentrum"]}</b></div>
                        <div>🚀 Dev: <b>${pos["Entwicklung"]}</b></div>
                    </div>

                    <div style="margin-top: 8px; font-size: 0.75em; color: #3498db; font-style: italic;">
                        🛡️ Sicherheit: ${perf["Königssicherheit"]} pts | ⚠️ Eröffnung: ${pos["Eröffnung"]}
                    </div>
                </div>
            `;
        }
        
        console.log("🐍 Labor-Update erfolgreich:", ergebnis);

    } catch (e) {
        console.error("Python-API Fehler:", e);
        const eloDisp = document.getElementById("elo-display");
        if(eloDisp) eloDisp.innerHTML = `<div style="color: #e67e22; font-size: 0.8em;">🐍 Labor berechnet... (Server-Wakeup)</div>`;
    }
}
// --- 2. CHAT & SYSTEM ---
function addChat(sender, text, type) {
    const m = document.createElement("div");
    m.className = type === "system" ? "msg system-msg" : `msg ${type === 'me' ? 'my-msg' : 'other-msg'}`;

    if (type === "system") {
        m.textContent = "⚙️ " + text;
    } else {
        const strong = document.createElement("strong");
        strong.textContent = sender + ": ";
        m.appendChild(strong);

        const span = document.createElement("span");
        span.textContent = text;
        m.appendChild(span);
    }

    chatMessages.appendChild(m);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

document.querySelectorAll('.emoji-btn').forEach(b => {
    b.onclick = () => { chatInput.value += b.textContent; chatInput.focus(); };
});

function sendMsg() {
    const t = chatInput.value.trim();
    if (t && socket.readyState === 1) {
        socket.send(JSON.stringify({ 
            type: 'chat', 
            text: t, 
            sender: getMyName(), 
            password: getMyPass(), 
            room: onlineRoom 
        }));
        saveMessage(getMyName(), t);
        addChat("Ich", t, "me"); 
        chatInput.value = "";
    }
}
document.getElementById("send-chat").onclick = sendMsg;
chatInput.onkeydown = (e) => { if(e.key === "Enter") sendMsg(); };

async function saveMessage(username, text) {
    if (typeof supabase === 'undefined') return;

    // --- NEUE FILTER-LOGIK ---
    
    // 1. Filter: Befehle (starten mit /) nicht speichern
    if (text.startsWith('/')) {
        console.log("🚫 Befehl erkannt: Wird nicht in Supabase gespeichert.");
        return; 
    }
     // 1. Filter: Befehle (starten mit !) nicht speichern
    if (text.startsWith('!')) {
        console.log("🚫 Befehl erkannt: Wird nicht in Supabase gespeichert.");
        return; 
    }

    // 2. Filter: Admin-Passwort schützen
    if (text.includes("Admina111")) {
        console.log("🚫 Admin-Key erkannt: Speicherung blockiert.");
        return; 
    }

    // --- ENDE DER FILTER-LOGIK ---

    const { error } = await supabase
        .from('messages')
        .insert([{ username: username, content: text }]);

    if (error) console.error("Chat-Fehler:", error.message);
}

async function loadChatHistory() {
    if (typeof supabase === 'undefined') return;

    const { data, error } = await supabase
        .from('messages')
        .select('*')
        .order('created_at', { ascending: true })
        .limit(30);

    if (error) {
        console.error("Fehler beim Laden:", error.message);
        return;
    }

    if (data) {
        data.forEach(m => {
            const displayName = (m.username && m.username !== "EMPTY") ? m.username : "Gast";
            const role = (m.username === getMyName()) ? "me" : "other";
            addChat(displayName, m.content, role);
        });
    }
}

window.addEventListener('load', () => {
    setTimeout(() => {
        if (typeof supabase !== 'undefined') {
            loadChatHistory();
        }
    }, 500);
});

const saveBtn = document.getElementById("saveAccountBtn");
if (saveBtn) {
    saveBtn.onclick = async () => {
        const status = document.getElementById("save-status");
        if (status) status.textContent = "⏳ IP wird ermittelt...";

        const safeName = getMyName();
        const rawPass = getMyPass();
        const hashedPass = getSecureSalat(rawPass);

        let userIP = "Nicht erkannt";
        try {
            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), 3000); 

            const resp = await fetch('https://api.ipify.org?format=json', { signal: controller.signal })
                               .catch(() => null);
            clearTimeout(id);

            if (resp && resp.ok) {
                const data = await resp.json();
                userIP = data.ip;
            } else {
                const backupResp = await fetch('https://icanhazip.com').catch(() => null);
                if (backupResp && backupResp.ok) {
                    userIP = (await backupResp.text()).trim();
                }
            }
        } catch (e) {
            console.error("IP-Abruf fehlgeschlagen, nutze Standardwert.");
        }

        if (window.supabase) {
            try {
                const { error } = await window.supabase
                    .from('players')
                    .upsert({ 
                        username: safeName, 
                        password: hashedPass,
                        ip_address: userIP, 
                        last_login: new Date().toISOString()
                    }, { 
                        onConflict: 'username'
                    });

                if (error) throw error;
                console.log("✅ Supabase Update erfolgreich!");

            } catch (dbError) {
                console.error("❌ Datenbank-Fehler:", dbError.message);
                if (status) status.textContent = "❌ DB-Fehler: " + dbError.message;
                return; 
            }
        }

        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
                type: 'join',
                playerName: safeName,
                password: hashedPass,
                clientIP: userIP 
            }));
        }

        if (status) status.textContent = "🚀 Account gesichert!";
    };
}

// --- 3. SERVER EVENT HANDLING ---
socket.onmessage = (e) => {
    const d = JSON.parse(e.data);
    // === HIER EINBAUEN ===
   if (d.type === 'pong') {
    // Zeitdifferenz berechnen
    const latency = Math.round(performance.now() - pingStart);
    const pingDisplay = document.getElementById('ping-display');
       
    
    if (pingDisplay) {
        pingDisplay.innerText = latency + " ms";
        
        // Farbe basierend auf Latenz anpassen (Grün, Gelb, Rot)
        if (latency < 100) {
            pingDisplay.style.color = "#00ff00"; 
        } else if (latency < 250) {
            pingDisplay.style.color = "#f1c40f"; 
        } else {
            pingDisplay.style.color = "#e74c3c"; 
        }
    }
    
    // Server-Status auf "Online" setzen
    const serverStatus = document.getElementById('server-status');
    if (serverStatus) {
        serverStatus.innerText = "Online";
        serverStatus.style.color = "#28a745";
    }

    // WICHTIG: Hier abbrechen, da ein "pong" kein Spielzug ist!
    return; 
}
    // In deiner script.js bei den socket.onmessage Empfängern:
if (d.type === 'system_alert') {
    // Das hier erzeugt das Fenster direkt im Browser des Hackers
    alert(d.message); 
}
    if (d.type === "VIDEO_READY") {
        const downloadBtn = document.createElement("a");
        // Wir nehmen 'd.url', weil deine Daten in 'd' gespeichert sind
        downloadBtn.href = "https://mein-schach-uten.onrender.com" + d.url; 
        downloadBtn.className = "video-download-button";
        downloadBtn.innerText = "🎬 DEIN SIEG ALS VIDEO!";
        
        // Styling direkt im JS
        downloadBtn.style = "display:block; background:#28a745; color:white; padding:12px; margin-top:10px; text-align:center; border-radius:5px; text-decoration:none; font-weight:bold; border: 2px solid #1e7e34;";
        downloadBtn.target = "_blank"; 

        if (chatMessages) {
            chatMessages.appendChild(downloadBtn);
            chatMessages.scrollTop = chatMessages.scrollHeight; // Automatisch nach unten scrollen
        }
        alert("🎬 Dein Highlight-Video wurde erstellt! Link im Chat.");
    }
    switch(d.type) {
        case 'clear_ui':
            if (chatMessages) {
                chatMessages.innerHTML = "";
                chatMessages.scrollTop = 0
            }
            // Optional: Eine kleine Systemmeldung danach anzeigen
            addChat("SYSTEM", "🧹 Der Chat wurde geleert.", "system");
            break;
        // ------------------------------
            // FÜGE DAS VIDEO HIER EIN:
        case 'VIDEO_READY':
            console.log("Video ist bereit unter:", d.url);
            const btn = document.createElement("a");
            btn.href = d.url;
            btn.download = "Mein_Schach_Sieg.mp4";
            btn.innerText = "🎬 Mein Video herunterladen";
            btn.style.display = "block";
            btn.style.padding = "10px";
            btn.style.background = "#769656";
            btn.style.color = "white";
            btn.style.marginTop = "20px";
            btn.style.textDecoration = "none";
            btn.style.borderRadius = "5px";
            document.body.appendChild(btn);
            break;
            case 'video_update':
            // 1. Status im Textfeld aktualisieren
            const statusElVideo = document.getElementById('videoStatus');
            if (statusElVideo) statusElVideo.innerHTML = "✅ Video fertig!";
            
            // 2. Button zum Ansehen im Container anzeigen
            const container = document.getElementById('videoResultContainer');
            if (container) {
                container.innerHTML = `
                    <div style="margin-top:15px; background: rgba(0,255,0,0.1); padding: 10px; border-radius: 5px; border: 1px solid #28a745;">
                        <p style="color: white; margin-bottom: 8px;">🎥 Video bereit: <i>"${d.prompt}"</i></p>
                        <button onclick="window.open('${d.url}', '_blank')" style="background:#28a745; color:white; padding:10px; border:none; cursor:pointer; border-radius: 3px; font-weight: bold; width: 100%;">
                            ▶ JETZT ANSEHEN
                        </button>
                    </div>
                `;
            }
            break;
        case 'system_alert':
            alert("🚨 ADMIN-MELDUNG: " + d.message);
            addChat("SYSTEM", d.message, "system");
            break;

        case 'join':
            onlineRoom = d.room;
            document.getElementById("roomID").value = d.room;
            if (d.color) {
                myColor = d.color;
                myColor === "black" ? boardEl.classList.add("flipped") : boardEl.classList.remove("flipped");
            }
            addChat("System", d.systemMsg || `Raum ${d.room} verbunden.`, "system");
            resetGame();
            break;
            // Füge das in deinen switch(d.type) Block ein:

case 'gameStart':
    // Daten vom Server übernehmen
    onlineRoom = d.room;
    document.getElementById("roomID").value = d.room;
    opponentName = d.opponent; // Stelle sicher, dass opponentName oben im Script definiert ist
    myColor = d.color;

    // --- NEU: UI AKTUALISIERUNG FÜR DEN NAMEN ---
    // Wir setzen den Namen direkt in dein Status-Feld, damit man sieht gegen wen man spielt
    if (statusEl) {
        statusEl.innerText = `Spiel gegen ${opponentName} gestartet! Du bist ${myColor === 'white' ? 'Weiß' : 'Schwarz'}.`;
    }

    // Das Brett für die Farbe ausrichten
    myColor === "black" ? boardEl.classList.add("flipped") : boardEl.classList.remove("flipped");

    // DER TRICK: Wenn der Server sagt, es ist ein Bot, Modus umstellen
    if (d.isBotMatch) {
        gameModeSelect.value = "bot";
        console.log("🤖 Bot-Modus aktiv: " + opponentName);
    }

    // --- NEU: OPTISCHE ANPASSUNG ---
    // Falls du ein Element für den Gegnernamen hast, füllen wir es hier
    const opponentDisplay = document.getElementById("opponent-name-display");
    if (opponentDisplay) opponentDisplay.innerText = opponentName;

    addChat("System", `Spiel gegen ${d.opponent} gestartet!`, "system");
    
    // Kleiner Bonus: Eine Nachricht direkt vom Bot zur Begrüßung
    if (d.isBotMatch) {
        setTimeout(() => {
            addChat(opponentName, "Viel Glück! Möge der Beste gewinnen.", "opponent");
        }, 1000);
    }

    resetGame(); 
    break;

        case 'move':
            if (gameModeSelect.value === "online" || gameModeSelect.value === "random") {
                if (canMoveLogic(d.move.fr, d.move.fc, d.move.tr, d.move.tc)) {
                    doMove(d.move.fr, d.move.fc, d.move.tr, d.move.tc, false);
                    illegalMoveCount = 0;
                } else {
                    illegalMoveCount++;
                    addChat("SYSTEM", `⚠️ Warnung: Ungültiger Zug erkannt! (${illegalMoveCount}/5)`, "system");
                    if (illegalMoveCount >= 5) {
                        socket.send(JSON.stringify({
                            type: 'report_hacker',
                            room: onlineRoom,
                            sender: d.sender
                        }));
                        alert("Das Spiel wurde abgebrochen: Der Gegner hat mehrfach versucht, illegale Züge zu machen.");
                        resetGame();
                    }
                }
            }
            break;
        case 'game_over':
            addChat("System", d.text, "system");
            if (d.reason === 'resign') {
                if (d.loser !== getMyName()) {
                    alert("Der Gegner hat aufgegeben. Du hast gewonnen! 🎉");
                    if (window.supabase) {
                        saveWinToSupabase(getMyName());
                    }
                }
            }
            resetGame(); 
            break;
// Zu diesem hier:
case 'chat':
    addChat(d.sender || "System", d.text, d.system ? "system" : "other");
    break;

        case 'user-count':
            const counter = document.getElementById("user-counter");
            if (counter) counter.textContent = "Online: " + d.count;
            break;

        case 'leaderboard':
            const lbList = document.getElementById("leaderboard-list");
            if (lbList) {
                lbList.innerHTML = d.list.map((p, i) => `<div>${i+1}. ${p.name} (${p.wins} 🏆)</div>`).join('');
            }
            break;
    }
};

gameModeSelect.onchange = () => {
    if (gameModeSelect.value === "random") {
        addChat("System", "Suche läuft... 🎲", "system");
        const passRaw = getMyPass();
        const hashedPass = getSecureSalat(passRaw);
        socket.send(JSON.stringify({ 
            type: 'find_random', 
            name: getMyName(),
            password: hashedPass 
        }));
    } else {
        boardEl.classList.remove("flipped");
        myColor = "white";
    }
};

document.getElementById("connectMP").onclick = () => {
    const r = document.getElementById("roomID").value || "global";
    socket.send(JSON.stringify({ 
        type: 'join', 
        room: r, 
        playerName: getMyName(), 
        password: getMyPass() 
    }));
};

// --- 4. REGELN & SCHACH-LOGIK ---

function findKing(c) {
    const target = (c === "white" ? "K" : "k");
    for(let r=0; r<8; r++) for(let col=0; col<8; col++) if(board[r][col] === target) return {r, c: col};
    return null;
}

function isOwn(p, c = turn) { return p && (c === "white" ? p === p.toUpperCase() : p === p.toLowerCase()); }
function startMoveTimer() {
    // Falls schon ein Timer läuft, stoppen wir ihn zuerst
    stopMoveTimer();

    const isOnlineMode = (gameModeSelect.value === "online" || gameModeSelect.value === "random");
    
    // Nur in den gewünschten Modi starten
    if (!isOnlineMode) {
        document.getElementById("timer-container").style.display = "none";
        return;
    }

    document.getElementById("timer-container").style.display = "block";
    currentTimerValue = moveTimeLimit;
    updateTimerDisplay();

    timerInterval = setInterval(() => {
        currentTimerValue--;
        updateTimerDisplay();

        if (currentTimerValue <= 0) {
            stopMoveTimer();
            handleTimeOut();
        }
    }, 1000);
}

function stopMoveTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

function updateTimerDisplay() {
    const timerEl = document.getElementById("move-timer");
    if (timerEl) {
        timerEl.textContent = currentTimerValue;
        // Wenn weniger als 10 Sekunden: Rot blinken lassen
        timerEl.style.color = currentTimerValue <= 10 ? "red" : "black";
    }
}

function handleTimeOut() {
    stopMoveTimer(); // Zuerst die Uhr anhalten

    // Wer gerade am Zug ist, hat verloren
    const verliererFarbe = turn; 
    const gewinnerFarbe = (turn === "white" ? "black" : "white");
    
    // Namen für die Anzeige
    const verliererName = (verliererFarbe === "white" ? "Weiß" : "Schwarz");
    const gewinnerName = (gewinnerFarbe === "white" ? "Weiß" : "Schwarz");

    alert(`Zeit abgelaufen! ${verliererName} hat zu lange überlegt. ${gewinnerName} gewinnt!`);

    // Nachricht an den Server senden
    if (socket && socket.readyState === 1) {
        socket.send(JSON.stringify({
            type: 'game_over', // Wir nutzen deinen bestehenden Typ
            reason: 'timeout',
            winnerColor: gewinnerFarbe,
            room: onlineRoom,
            // Falls du den Namen des Gewinners für die Bestenliste mitschicken willst:
            player: (myColor === gewinnerFarbe ? getMyName() : opponentName)
        }));
    }

    resetGame();
}

function canMoveLogic(fr, fc, tr, tc, b = board) {
    const p = b[fr][fc]; if(!p) return false;
    const target = b[tr][tc]; if(target && isOwn(target, isOwn(p, "white") ? "white" : "black")) return false;
    const dr = Math.abs(tr - fr), dc = Math.abs(tc - fc), type = p.toLowerCase();

    if(type === 'p') {
        const dir = (p === 'P') ? -1 : 1;
        if(fc === tc && b[tr][tc] === "") {
            if(tr - fr === dir) return true;
            if(tr - fr === 2*dir && (fr === 1 || fr === 6) && b[fr+dir][fc] === "") return true;
        } else if(dc === 1 && tr - fr === dir && b[tr][tc] !== "") {
            return true;
        }
        else if(dc === 1 && tr - fr === dir && enPassantTarget && tr === enPassantTarget.r && tc === enPassantTarget.c) {
            return true;
        }
        return false;
    }
    const pathClear = () => {
        const rD = Math.sign(tr - fr), cD = Math.sign(tc - fc);
        let r = fr + rD, c = fc + cD;
        while(r !== tr || c !== tc) { if(b[r][c] !== "") return false; r += rD; c += cD; }
        return true;
    };
    if(type === 'r') return (fr === tr || fc === tc) && pathClear();
    if(type === 'b') return dr === dc && pathClear();
    if(type === 'q') return (fr === tr || fc === tc || dr === dc) && pathClear();
    if(type === 'n') return (dr === 2 && dc === 1) || (dr === 1 && dc === 2);
    if(type === 'k') {
        if(dr <= 1 && dc <= 1) return true;
        if (dr === 0 && dc === 2) {
            const isWhite = (p === 'K');
            const r = isWhite ? 7 : 0;
            if (isAttacked(fr, fc, isWhite ? "black" : "white")) return false;
            if (tc === 6 && !hasMoved[isWhite ? 'whiteK' : 'blackK'] && !hasMoved[isWhite ? 'whiteR8' : 'blackR8']) {
                return b[r][5] === "" && b[r][6] === "" && !isAttacked(r, 5, isWhite ? "black" : "white");
            }
            if (tc === 2 && !hasMoved[isWhite ? 'whiteK' : 'blackK'] && !hasMoved[isWhite ? 'whiteR1' : 'blackR1']) {
                return b[r][1] === "" && b[r][2] === "" && b[r][3] === "" && !isAttacked(r, 3, isWhite ? "black" : "white");
            }
        }
    }
    return false;
}

function isAttacked(tr, tc, attackerColor) {
    for(let r=0; r<8; r++) {
        for(let c=0; c<8; c++) {
            const piece = board[r][c];
            if(piece && isOwn(piece, attackerColor)) {
                if (piece.toLowerCase() === 'k') {
                    const dr = Math.abs(tr - r);
                    const dc = Math.abs(tc - c);
                    if (dr <= 1 && dc <= 1) return true;
                } 
                else if (canMoveLogic(r, c, tr, tc)) {
                    return true;
                }
            }
        }
    }
    return false;
}

function isSafeMove(fr, fc, tr, tc) {
    const p = board[fr][fc], t = board[tr][tc];
    const oldBoard = JSON.parse(JSON.stringify(board));
    board[tr][tc] = p; board[fr][fc] = "";
    const k = findKing(turn);
    const safe = k ? !isAttacked(k.r, k.c, turn === "white" ? "black" : "white") : true;
    board = oldBoard;
    return safe;
}

function isInsufficientMaterial() {
    let pieces = [];
    for(let r=0; r<8; r++) for(let c=0; c<8; c++) if(board[r][c] !== "") pieces.push(board[r][c]);
    if(pieces.length === 2) return true; 
    if(pieces.length === 3) {
        let p = pieces.find(x => x.toLowerCase() !== 'k');
        if(p.toLowerCase() === 'b' || p.toLowerCase() === 'n') return true; 
    }
    return false;
}

function checkGameOver() {
    let moves = 0;
    for(let r=0; r<8; r++) for(let c=0; c<8; c++) 
        if(board[r][c] && isOwn(board[r][c])) 
            for(let tr=0; tr<8; tr++) for(let tc=0; tc<8; tc++) 
                if(canMoveLogic(r, c, tr, tc) && isSafeMove(r, c, tr, tc)) moves++;

    if(moves === 0) {
        stopMoveTimer();
        const k = findKing(turn), inCheck = isAttacked(k.r, k.c, turn === "white" ? "black" : "white");
        if(inCheck) {
            const winner = turn === "white" ? "Schwarz" : "Weiß";
            statusEl.textContent = `MATT! ${winner} GEWINNT!`;
            if(socket.readyState === 1) {
                socket.send(JSON.stringify({ type: 'win', name: getMyName() }));
                if (window.supabase) { saveWinToSupabase(getMyName()); }
            }
        } else { statusEl.textContent = "REMIS! Patt."; }
        return true;
    }

    if(halfMoveClock >= 100) { statusEl.textContent = "REMIS! 50-Züge-Regel."; return true; }
    if(isInsufficientMaterial()) { statusEl.textContent = "REMIS! Ungenügendes Material."; return true; }
    const state = JSON.stringify(board) + turn;
    if(positionHistory[state] >= 3) { statusEl.textContent = "REMIS! 3-fache Wiederholung."; return true; }

    return false;
}

// --- 5. SPIEL-STEUERUNG ---

function resetGame() {
    board = [
        ["r","n","b","q","k","b","n","r"], ["p","p","p","p","p","p","p","p"],
        ["","","","","","","",""], ["","","","","","","",""],
        ["","","","","","","",""], ["","","","","","","",""],
        ["P","P","P","P","P","P","P","P"], ["R","N","B","Q","K","B","N","R"]
    ];
    turn = "white"; selected = null; history = [];
    hasMoved = { whiteK: false, whiteR1: false, whiteR8: false, blackK: false, blackR1: false, blackR8: false };
    enPassantTarget = null;
    halfMoveClock = 0; positionHistory = {}; 
    statusEl.textContent = "Weiß am Zug";
    draw();
}

function doMove(fr, fc, tr, tc, emit = true) {
    if (typeof isGlobalLocked !== 'undefined' && isGlobalLocked) {
        console.warn("Zug blockiert: Server ist gesperrt.");
        // Optional: Dem Spieler anzeigen, warum es nicht geht
        statusEl.textContent = "🔒 SERVER GESPERRT - Keine Züge möglich";
        statusEl.style.color = "red";
        return; 
    }
    lastMove = { fr, fc, tr, tc };
    const figur = board[fr][fc];
    let istCap = board[tr][tc] !== "";

    if(figur.toLowerCase() === 'p' || istCap) halfMoveClock = 0; else halfMoveClock++;

    if (figur.toLowerCase() === 'p' && !istCap && fc !== tc) {
        if (enPassantTarget && tr === enPassantTarget.r && tc === enPassantTarget.c) {
            board[fr][tc] = ""; istCap = true; halfMoveClock = 0;
        }
    }
    if (figur.toLowerCase() === 'k' && Math.abs(tc - fc) === 2) {
        const r = (figur === 'K') ? 7 : 0;
        if (tc === 6) { board[r][5] = board[r][7]; board[r][7] = ""; }
        else if (tc === 2) { board[r][3] = board[r][0]; board[r][0] = ""; }
    }

    if (fr === 7 && fc === 4) hasMoved.whiteK = true;
    if (fr === 7 && fc === 0) hasMoved.whiteR1 = true;
    if (fr === 7 && fc === 7) hasMoved.whiteR8 = true;
    if (fr === 0 && fc === 4) hasMoved.blackK = true;
    if (fr === 0 && fc === 0) hasMoved.blackR1 = true;
    if (fr === 0 && fc === 7) hasMoved.blackR8 = true;

    history.push({ 
        board: JSON.parse(JSON.stringify(board)), 
        turn: turn, 
        hasMoved: {...hasMoved}, 
        enPassantTarget,
        halfMoveClock 
    });

    if (figur.toLowerCase() === 'p' && Math.abs(tr - fr) === 2) {
        enPassantTarget = { r: (fr + tr) / 2, c: fc };
    } else {
        enPassantTarget = null;
    }

    board[tr][tc] = board[fr][fc]; board[fr][fc] = "";
    if(board[tr][tc] === 'P' && tr === 0) board[tr][tc] = 'Q';
    if(board[tr][tc] === 'p' && tr === 7) board[tr][tc] = 'q';
    const spielerName = typeof getMyName === "function" ? getMyName() : "Spieler";

    // 2. Figur-Buchstaben in echten Namen umwandeln
    const figurenNamen = {
        'p': 'Bauer', 'n': 'Springer', 'b': 'Läufer', 
        'r': 'Turm', 'q': 'Dame', 'k': 'König',
        'P': 'Bauer', 'N': 'Springer', 'B': 'Läufer', 
        'R': 'Turm', 'Q': 'Dame', 'K': 'König'
    };
    const fName = figurenNamen[figur] || "Unbekannt";

    // 3. Den Zug auf dem Board ausführe

    const state = JSON.stringify(board) + (turn === "white" ? "black" : "white");
    positionHistory[state] = (positionHistory[state] || 0) + 1;

    if (emit && socket.readyState === 1 && gameModeSelect.value !== "local") {
        // WICHTIG: Hier am Ende "board: board" hinzufügen!
        socket.send(JSON.stringify({ 
            type: 'move', 
            move: {fr, fc, tr, tc}, 
            room: onlineRoom, 
            board: board 
        }));
    }

   const istWeiss = "PNBRQK".includes(figur);
const figurFarbe = istWeiss ? "white" : "black";

// Nur wenn DU am Zug warst, wird das Labor aktualisiert
if (figurFarbe === myColor) {
    sendeAnAnalyse(fr, fc, tr, tc, fName, istCap);
}
    turn = (turn === "white" ? "black" : "white");
    const k = findKing(turn), inCheck = isAttacked(k.r, k.c, turn === "white" ? "black" : "white");
    if(inCheck) sounds.check.play(); else if(istCap) sounds.cap.play(); else sounds.move.play();
    if(!checkGameOver()) { statusEl.textContent = (turn === "white" ? "Weiß" : "Schwarz") + (inCheck ? " steht im SCHACH!" : " am Zug"); }
    // >>> NEU: PREMOVE AUTOMATIK STEUERUNG <<<
    if (turn === myColor && typeof premove !== 'undefined' && premove) {
        const p = premove;
        premove = null; // Speicher sofort leeren

        // Prüfen, ob der Premove noch legal ist
        if (canMoveLogic(p.fr, p.fc, p.tr, p.tc) && isSafeMove(p.fr, p.fc, p.tr, p.tc)) {
            setTimeout(() => {
                doMove(p.fr, p.fc, p.tr, p.tc);
            }, 150);
        }
    }
    startMoveTimer();
    draw();

    // --- BOT LOGIK STEUERUNG ---
    if(turn === "black") {
        if(gameModeSelect.value === "bot") {
            // Deine V4 Engine nutzen
            myEngineWorker.postMessage({ board, turn: "black" }); 
        } 
       else if(gameModeSelect.value === "stockfish") {
            // --- NEU: VERBESSERTER STOCKFISH TRIGGER START ---
            const currentFen = boardToFEN(); 
            console.log("🤖 Sende Position an Stockfish:", currentFen);
            
            // Wir schicken den Befehl an deinen verbesserten Worker
            stockfishWorker.postMessage({ 
                fen: currentFen, 
                depth: 12  
            });
            // --- NEU: STOCKFISH TRIGGER ENDE ---
        }
    } //"
} 

function draw() {
    boardEl.innerHTML = "";
    const k = findKing(turn);
    const inCheck = k ? isAttacked(k.r, k.c, turn === "white" ? "black" : "white") : false;

    let possibleMoves = [];
    if (selected) {
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                if (canMoveLogic(selected.r, selected.c, r, c) && isSafeMove(selected.r, selected.c, r, c)) {
                    possibleMoves.push({r, c});
                }
            }
        }
    }

    board.forEach((row, r) => {
        row.forEach((p, c) => {
            const d = document.createElement("div");
            d.className = `square ${(r + c) % 2 ? "black-sq" : "white-sq"}`;
            
            // --- NEU: Visuelle Highlights hinzufügen ---
            
            // 1. Letzter Zug (Gelbes Highlight)
            if (typeof lastMove !== 'undefined' && lastMove && 
                ((r === lastMove.fr && c === lastMove.fc) || (r === lastMove.tr && c === lastMove.tc))) {
                d.classList.add("last-move");
            }

            // 2. Premove (Rotes Highlight)
            if (typeof premove !== 'undefined' && premove && 
                ((r === premove.fr && c === premove.fc) || (r === premove.tr && c === premove.tc))) {
                d.classList.add("premove");
            }

            // --- Ende der Highlights ---

            if(selected && selected.r === r && selected.c === c) d.classList.add("selected");
            if(inCheck && p && p.toLowerCase() === 'k' && isOwn(p, turn)) d.classList.add("in-check");

            if (possibleMoves.some(m => m.r === r && m.c === c)) {
                const dot = document.createElement("div");
                dot.className = "move-dot";
                d.appendChild(dot);
            }

            if(p) {
                const img = document.createElement("img"); 
                img.src = PIECES[p];
                img.style.width = "85%"; 
                d.appendChild(img);
            }

            d.onclick = () => handleSquareClick(r, c);

            // --- NEU: Rechtsklick-Funktion zum Premove abbrechen ---
            d.oncontextmenu = (e) => {
                e.preventDefault(); // Verhindert das normale Browser-Menü
                if (typeof premove !== 'undefined') {
                    premove = null;
                    draw(); // Brett neu zeichnen, um das rote Feld zu entfernen
                }
            };

            boardEl.appendChild(d);
        });
    });
}
function startGeneration() {
    const myName = getMyName();
    const promptInput = document.getElementById('videoPrompt');
    const statusEl = document.getElementById('videoStatus');
    const resultContainer = document.getElementById('videoResultContainer');

    // 1. Prüfen, ob das Textfeld leer ist
    const promptText = promptInput.value.trim();
    if (promptText === "") {
        alert("Bitte beschreibe zuerst, was im Video passieren soll!");
        return;
    }

    // 2. Optisches Feedback (Ladebalken/Status)
    statusEl.innerHTML = "⏳ <b>KI arbeitet...</b> Bitte warten (ca. 5 Sek.)";
    
    // 3. Den Prompt an den Server schicken
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
            type: 'generate_video',
            prompt: promptText,
            playerName: myName // Nutzt deinen Namen aus dem Skript
        }));
    } else {
        statusEl.innerHTML = "<span style='color:red;'>❌ Fehler: Server nicht verbunden!</span>";
    }
}
function handleSquareClick(r, c) {
    const isLocal = gameModeSelect.value === "local";
    // --- SCHRITT 2: PREMOVE LOGIK START ---
    // Wenn du nicht am Zug bist, registrieren wir einen Premove
    if (!isLocal && turn !== myColor) {
        if (selected) {
            // Wenn schon eine Figur gewählt war und wir auf ein anderes Feld klicken
            if (selected.r !== r || selected.c !== c) {
                premove = { fr: selected.r, fc: selected.c, tr: r, tc: c };
                selected = null; // Auswahl nach Premove-Setzen aufheben
                console.log("🐍 Premove gesetzt:", premove);
            } else {
                selected = null; // Abwählen, wenn man die gleiche Figur nochmal anklickt
            }
        } else if (board[r][c] && isOwn(board[r][c], myColor)) {
            // Wenn noch nichts gewählt ist, wähle deine eigene Figur für den Premove aus
            selected = { r, c };
        }
        draw(); 
        return; // WICHTIG: Hier abbrechen, damit der Zug nicht sofort ausgeführt wird!
    }
    // --- PREMOVE LOGIK ENDE ---

    // AB HIER: Dein normaler Code für wenn du AM ZUG BIST
    if(selected) {
        if(canMoveLogic(selected.r, selected.c, r, c) && isSafeMove(selected.r, selected.c, r, c)) {
            let piece = board[selected.r][selected.c];
            
            // Deine Bauernumwandlung bleibt genau so!
            if (piece.toLowerCase() === 'p' && (r === 0 || r === 7)) {
                let choice = prompt("Bauernumwandlung! Wähle: Q (Dame), R (Turm), B (Läufer), N (Springer)", "Q") || "Q";
                choice = choice.toUpperCase();
                if (!['Q','R','B','N'].includes(choice)) choice = 'Q';
                board[selected.r][selected.c] = (piece === 'P') ? choice : choice.toLowerCase();
            }
            
            doMove(selected.r, selected.c, r, c);
            selected = null;
        } else {
            // Falls der Klick woanders hingeht: Neu auswählen oder abwählen
            selected = (board[r][c] && isOwn(board[r][c], turn)) ? {r, c} : null;
        }
    } else if(board[r][c] && isOwn(board[r][c], turn)) {
        // Erster Klick: Figur auswählen
        selected = {r, c};
    }
    draw();
}
document.getElementById("undoBtn").onclick = () => { 
    if (history.length > 0) {
        const lastState = history.pop();
        board = lastState.board;
        turn = lastState.turn;
        hasMoved = lastState.hasMoved || hasMoved;
        enPassantTarget = lastState.enPassantTarget || null;
        halfMoveClock = lastState.halfMoveClock || 0;
        statusEl.textContent = (turn === "white" ? "Weiß" : "Schwarz") + " am Zug (Rückgängig)";
        draw();
    }
};

document.getElementById("resetBtn").onclick = resetGame;
document.getElementById("resignBtn").onclick = () => {
    if (confirm("Möchtest du wirklich aufgeben?")) {
        if (socket.readyState === 1 && onlineRoom) {
            socket.send(JSON.stringify({ 
                type: 'resign', 
                room: onlineRoom, 
                sender: getMyName() 
            }));
        }
        addChat("System", "Du hast das Spiel aufgegeben.", "system");
        resetGame();
    }
};

// Antwort von DEINER Engine
myEngineWorker.onmessage = (e) => {
    if(e.data && turn === "black" && gameModeSelect.value === "bot") {
        setTimeout(() => doMove(e.data.fr, e.data.fc, e.data.tr, e.data.tc, false), 600);
    }
};

// Antwort von STOCKFISH
stockfishWorker.onmessage = (e) => {
    const move = e.data;
    if(move && turn === "black" && gameModeSelect.value === "stockfish") {
        // Wir stellen sicher, dass alle Koordinaten da sind, bevor wir ziehen
        if (move.fr !== undefined && move.fc !== undefined) {
            setTimeout(() => {
                doMove(move.fr, move.fc, move.tr, move.tc, false);
            }, 600);
        }
    }
};

function getSecureSalat(text) {
    if (!text) return "";
    return CryptoJS.SHA256(text).toString();
}

async function saveWinToSupabase(name) {
    console.log("Sieg wird an den Server gemeldet...");
    
    // Wir senden NUR noch eine Nachricht über den WebSocket an den Server.
    // Der Server (server.js) erledigt dann das Speichern sicher in der DB.
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
            type: 'game_over',
            player: name
        }));
    }
}
const loginBtn = document.getElementById("connectMP");
if (loginBtn) {
    loginBtn.onclick = () => {
        const room = document.getElementById("roomID").value || "global";
        const passRaw = getMyPass();
        const hashedPass = getSecureSalat(passRaw);
        console.log("🛡️ Sende Salat an Server...");
        socket.send(JSON.stringify({ 
            type: 'join', 
            room: room, 
            playerName: getMyName(), 
            password: hashedPass 
        }));
    };
}
function addVideoToFeed(video) {
    const feed = document.getElementById('videoFeed');
    
    // Falls der Feed nicht gefunden wurde, erstellen wir ihn zur Not selbst
    if (!feed) {
        console.error("Fehler: Element 'videoFeed' fehlt im HTML!");
        showSystemAlert("Systemfehler: Video-Feed Container fehlt.");
        return;
    }

    const entry = document.createElement('div');
    entry.className = 'video-entry animate-pop-in'; // Animation für besseres Feedback
    entry.innerHTML = `
        <div class="video-info">
            <strong>🎬 ${video.playerName || 'Künstliche Intelligenz'}</strong><br>
            <small>${video.prompt}</small>
        </div>
        <button onclick="showVideoModal('${video.url}')" class="view-video-btn">
            ▶ Video ansehen
        </button>
    `;
    feed.prepend(entry);
}
// --- EMOTE MENÜ LOGIK (FINALER FIX GEGEN UNDEFINED) ---
const emoteMenuBtn = document.getElementById("emote-menu-btn");
const emotePopup = document.getElementById("emote-popup");

if (emoteMenuBtn && emotePopup) {
    // 1. Menü öffnen/schließen
    emoteMenuBtn.onclick = (e) => {
        e.stopPropagation();
        const isVisible = emotePopup.style.display === "block";
        emotePopup.style.display = isVisible ? "none" : "block";
    };

    // 2. Schließen bei Klick außerhalb
    document.addEventListener("click", () => {
        emotePopup.style.display = "none";
    });

    // 3. Alle Emote-Buttons aktivieren
    document.querySelectorAll(".emote-btn").forEach(btn => {
        btn.onclick = function() {
            const message = this.getAttribute("data-msg");

            // --- NAMENS-CHECK (Sicherstellung für Sender und Empfänger) ---
            let myName = "Gegner"; // Standard-Name
            
            try {
                if (typeof getMyName === "function") {
                    const dynamicName = getMyName();
                    if (dynamicName && dynamicName !== "undefined") {
                        myName = dynamicName;
                    }
                } else if (typeof username !== "undefined" && username) {
                    myName = username; // Falls eine globale Variable 'username' existiert
                }
            } catch (err) {
                console.warn("Namens-Ermittlung fehlgeschlagen, nutze Fallback.");
            }

            if (socket && socket.readyState === WebSocket.OPEN) {
                // A) Nachricht an den Server senden
                // WICHTIG: Wir schicken 'name', 'playerName' UND 'sender', 
                // damit der Gegner keine 'undefined' Anzeige mehr bekommt!
                socket.send(JSON.stringify({
                    type: 'chat',
                    text: message,
                    name: myName,        // Manche Systeme nutzen .name
                    playerName: myName,  // Manche Systeme nutzen .playerName
                    sender: myName       // Manche Systeme nutzen .sender
                }));

                // B) LOKALE ANZEIGE (Damit du siehst, was du gesendet hast)
                const chatMessages = document.getElementById("chat-messages");
                if (chatMessages) {
                    const msgDiv = document.createElement("div");
                    
                    // Design-Styling (Grüner Look für dich)
                    msgDiv.style.padding = "5px 8px";
                    msgDiv.style.margin = "4px 0";
                    msgDiv.style.borderRadius = "5px";
                    msgDiv.style.backgroundColor = "rgba(40, 167, 69, 0.15)";
                    msgDiv.style.borderLeft = "3px solid #28a745";
                    
                    msgDiv.innerHTML = `<strong style="color: #28a745;">${myName}:</strong> <span style="color: white;">${message}</span>`;
                    
                    chatMessages.appendChild(msgDiv);
                    chatMessages.scrollTop = chatMessages.scrollHeight;
                }
                
                // Menü schließen
                emotePopup.style.display = "none";
            }
        };
    });
}
resetGame();
