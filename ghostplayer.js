// ghostplayer.js - ULTIMATIVE GHOST-KI VERSION (VERBESSERT)
const engine = require('./engineWorker.js');

// Umfangreiche Datenbank für menschliche Reaktionen
const GHOST_MESSAGES = {
    greetings: ["Hallo!", "Viel Glück!", "Hi, auf ein gutes Spiel!", "Schach ist meine Leidenschaft.", "Huhu! 🤖", "Na dann, zeig mal was du kannst!"],
    thinking: ["Hmm...", "Mal sehen...", "Interessant!", "Puh...", "Guter Zug!", "Nicht schlecht!", "Da muss ich kurz nachdenken...", "Oha!", "🤖", "Interessante Variante..."],
    aggressive: ["Ups, die Figur nehme ich mal mit!", "Schach!", "Das war ein Fehler, oder?", "Danke für das Geschenk!", "Druck erhöht!"],
    defensive: ["Gute Verteidigung.", "Du machst es mir nicht leicht.", "Knappe Kiste!", "Muss aufpassen..."],
    endgame: ["Spannendes Finale!", "Jetzt wird es ernst.", "Gut gespielt bis hierhin."],
    check: ["Schach!", "Pass auf deinen König auf!", "Eng für den König, oder?", "Schach! 👑"] // NEU: Reaktionen auf Schach-Gebote
};

/**
 * NEU: Begrüßung beim Spielstart
 */
function handleGhostGreeting(ws, botName) {
    const spruch = GHOST_MESSAGES.greetings[Math.floor(Math.random() * GHOST_MESSAGES.greetings.length)];
    setTimeout(() => {
        if (ws.readyState === 1) {
            ws.send(JSON.stringify({ 
                type: 'chat', 
                text: spruch, 
                sender: botName, 
                system: false 
            }));
        }
    }, 1500);
}

/**
 * Die Hauptfunktion für den Ghost-Player
 */
function handleGhostMove(ws, board, color, botName = "Grandmaster_Ghost") {
    console.log(`[Ghost] ${botName} analysiert die Stellung...`);

    // Nutzt deinen vorhandenen engineWorker für die Zugberechnung
    const moves = engine.generateMoves(board, color);

    if (moves && moves.length > 0) {
        // 1. ZUG-AUSWAHL (Menschlicher Fehler-Faktor)
        const move = moves.slice(0, 3)[Math.floor(Math.random() * Math.min(moves.length, 3))];

        // 2. DYNAMISCHE CHAT-LOGIK
        const chance = Math.random();
        let spruch = "";

        // Nur in ca. 35% der Fälle etwas schreiben, damit es natürlich wirkt
        if (chance < 0.35) {
            // NEU: Priorität auf Schach-Sprüche, falls der Zug Schach gibt
            if (move.check || move.isCheck) {
                spruch = GHOST_MESSAGES.check[Math.floor(Math.random() * GHOST_MESSAGES.check.length)];
            } else if (move.capture) {
                spruch = GHOST_MESSAGES.aggressive[Math.floor(Math.random() * GHOST_MESSAGES.aggressive.length)];
            } else if (moves.length < 10) {
                spruch = GHOST_MESSAGES.endgame[Math.floor(Math.random() * GHOST_MESSAGES.endgame.length)];
            } else {
                spruch = GHOST_MESSAGES.thinking[Math.floor(Math.random() * GHOST_MESSAGES.thinking.length)];
            }
        }

        // Nachricht senden (mit einer Verzögerung, als würde er tippen)
        if (spruch && ws.readyState === 1) {
            const typingSpeed = 500 + Math.random() * 1000;
            setTimeout(() => {
                if (ws.readyState === 1) {
                    ws.send(JSON.stringify({ 
                        type: 'chat', 
                        text: spruch, 
                        sender: botName, 
                        system: false 
                    }));
                }
            }, typingSpeed);
        }

        // 3. VARIABLE REAKTIONSZEIT (Verbessert)
        // Wenn viele Züge möglich sind (komplex), überlegt er tendenziell länger
        let complexityBonus = moves.length * 20; 
        let thinkingTime = 1000 + Math.random() * 2000 + complexityBonus; 
        
        if (move.capture) thinkingTime += 400;

        setTimeout(() => {
            if (ws.readyState === 1) {
                // Der Zug-Befehl an das Frontend
                ws.send(JSON.stringify({
                    type: 'move',
                    move: move,
                    sender: botName,
                    nextTurn: color === 'white' ? 'black' : 'white',
                    board: board 
                }));
                console.log(`✅ Ghost (${botName}) hat ${move.fr}${move.fc} -> ${move.tr}${move.tc} gezogen.`);
            }
        }, thinkingTime);

    } else {
        // Wenn der Bot keine Züge mehr hat (Patt oder Matt)
        console.log("🏳️ Ghost hat keine legalen Züge mehr.");
        if (ws.readyState === 1) {
            ws.send(JSON.stringify({ 
                type: 'chat', 
                text: "Gut gespielt! Das war's wohl.", 
                sender: botName, 
                system: false 
            }));
        }
    }
}

// Export der erweiterten Funktionen
module.exports = { handleGhostMove, handleGhostGreeting };
