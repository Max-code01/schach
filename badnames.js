// badnames.js - Namensfilter für Max' Server

// Hier kannst du alle Namen eintragen, die verboten sein sollen
const FORBIDDEN_NAMES = [
    "admin",
    "administrator",
    "moderator",
    "mod",      // Damit sich niemand als du ausgeben kann
    "system",
    "root",
    "server",
    "support"
];

// Hier kannst du Schimpfwörter ergänzen
const BAD_WORDS = [
    "idiot",
    "hacker",
    "cheater"
    // Füge hier weitere Wörter hinzu, die im Namen nicht vorkommen dürfen
];

/**
 * Prüft, ob ein Name erlaubt ist
 * @param {string} name - Der gewählte Name
 * @returns {boolean} - true wenn okay, false wenn verboten
 */
function isNameAllowed(name) {
    if (!name || typeof name !== 'string') return false;
    
    const lowerName = name.toLowerCase().trim();

    // 1. Exakte Treffer (z.B. jemand nennt sich genau "Admin")
    if (FORBIDDEN_NAMES.includes(lowerName)) return false;

    // 2. Enthaltene Schimpfwörter (z.B. "IchBinEinIdiot")
    for (let word of BAD_WORDS) {
        if (lowerName.includes(word)) return false;
    }

    // 3. Sonderzeichen-Schutz (Nur Buchstaben und Zahlen erlauben)
    const regex = /^[a-zA-Z0-9_ ]+$/;
    if (!regex.test(lowerName)) return false;

    return true;
}

module.exports = { isNameAllowed };
