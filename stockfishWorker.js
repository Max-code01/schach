// ==========================================
// STOCKFISH WORKER - ULTIMATE TITAN EDITION
// ==========================================

// 1. Konfiguration mit Redundanz
const LIB_URL = 'https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js';
const FALLBACK_URL = 'https://cdn.jsdelivr.net/npm/stockfish@10.0.2/src/stockfish.js';

let engine = null;
let isReady = false;
let engineSearching = false;
let pendingMove = null;
let initRetries = 0;

// 2. Erweitertes Laden & Fehler-Management
function loadAndStart() {
    console.log("📡 [Worker] Starte Download-Prozess...");
    try {
        importScripts(LIB_URL);
        console.log("✅ [Worker] Primäres CDN geladen.");
    } catch (e) {
        console.warn("⚠️ [Worker] Primäres CDN fehlgeschlagen, wechsle zu Fallback...");
        try {
            importScripts(FALLBACK_URL);
            console.log("✅ [Worker] Fallback-CDN geladen.");
        } catch (e2) {
            console.error("❌ [Worker] TOTALAUSFALL: Keine Engine-Datei erreichbar!");
        }
    }
    checkConstruction();
}

function checkConstruction() {
    const Constructor = 
        (typeof self.STOCKFISH === "function") ? self.STOCKFISH : 
        (typeof STOCKFISH === "function") ? STOCKFISH : 
        (typeof self.Stockfish === "function") ? self.Stockfish : 
        (typeof Stockfish === "function") ? Stockfish : 
        (typeof this.STOCKFISH === "function") ? this.STOCKFISH : null;

    if (Constructor) {
        initializeEngine(Constructor);
    } else {
        initRetries++;
        if(initRetries < 20) {
            console.log(`🔍 [Worker] Suche Konstruktor (Versuch ${initRetries})...`);
            setTimeout(checkConstruction, 300);
        } else {
            console.error("❌ [Worker] Konstruktor wurde nach 20 Versuchen nicht gefunden.");
        }
    }
}

// 3. Die Engine-Herzschlag-Logik
function initializeEngine(Constructor) {
    console.log("🚀 [Worker] Initialisiere Titan-Instanz...");
    try {
        engine = Constructor();

        engine.onmessage = function(event) {
            const line = event.data;
            
            // Debugging: Alles sehen, was die Engine sagt
            if (line.includes("info depth")) {
                // Optional: Berechnungsprozess loggen
                // console.log("🧠 Thinking: " + line.split(" pv ")[0]);
            }

            // UCI Status: Ready Check
            if (line === "readyok" || line.includes("readyok")) {
                isReady = true;
                console.log("✅ [Worker] STOCKFISH IST ONLINE & BEREIT!");
                if (pendingMove) {
                    console.log("📦 [Worker] Verarbeite geparkten Zug...");
                    execute(pendingMove.fen, pendingMove.depth);
                    pendingMove = null;
                }
            }

            // Best Move Logik - HIER passiert die Magie für script.js
            if (line.includes("bestmove")) {
                engineSearching = false;
                const match = line.match(/bestmove\s([a-h][1-8])([a-h][1-8])(q|r|b|n)?/);
                
                if (match) {
                    const cols = "abcdefgh";
                    const moveData = {
                        fr: 8 - parseInt(match[1][1]), 
                        fc: cols.indexOf(match[1][0]),
                        tr: 8 - parseInt(match[2][1]), 
                        tc: cols.indexOf(match[2][0]),
                        promotion: match[3] || null,
                        raw: match[0]
                    };

                    console.log(`🎯 [Worker] BESTER ZUG GEFUNDEN: ${match[1]}->${match[2]}`);
                    
                    // WICHTIG: Sende das Ergebnis an script.js zurück
                    postMessage(moveData);
                } else {
                    console.warn("⚠️ [Worker] Bestmove-Format nicht erkannt:", line);
                }
            }
        };

        // UCI Protokoll Starten
        engine.postMessage("uci");
        engine.postMessage("setoption name Skill Level value 20"); // Maximale Stärke
        engine.postMessage("setoption name Hash value 32"); // 32MB Speicher
        engine.postMessage("isready");

        // Sicherheits-Ping: Falls readyok nie kommt
        setInterval(() => {
            if (!isReady) engine.postMessage("isready");
        }, 2000);

    } catch (err) {
        console.error("❌ [Worker] Kritischer Fehler bei Instanziierung:", err);
    }
}

// 4. Rechen-Befehl ausführen
function execute(fen, depth) {
    if (!engine || !isReady) {
        console.log("📥 [Worker] Engine nicht bereit, parke Position.");
        pendingMove = { fen, depth };
        return;
    }

    engineSearching = true;
    console.log(`🧠 [Worker] Berechne Position: ${fen}`);
    engine.postMessage("stop"); // Alten Rechenvorgang abbrechen
    engine.postMessage(`position fen ${fen}`);
    engine.postMessage(`go depth ${depth || 15}`);
}

// 5. Interface zu script.js
onmessage = function(e) {
    const { fen, depth, type } = e.data;
    
    // Support für direkten Stop
    if (type === "stop") {
        if (engine) engine.postMessage("stop");
        return;
    }

    if (fen) {
        execute(fen, depth);
    } else {
        console.warn("⚠️ [Worker] Nachricht ohne FEN erhalten.");
    }
};

// Start des gesamten Systems
loadAndStart();
