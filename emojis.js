// emojis.js - Chat-Verschönerung für Max' Server

const emojiMap = {
    ":win:": "🏆",
    ":lose:": "💀",
    ":fire:": "🔥",
    ":check:": "✅",
    ":x:": "❌",
    ":chess:": "♟️",
    ":king:": "👑",
    ":cool:": "😎",
    ":love:": "❤️",
    ":haha:": "😂",
    ":wow:": "😮",
    ":gg:": "🤝",
    ":party:": "🎉",
    ":rip:": "🪦",
    ":robot:": "🤖",
    ":ghost:": "👻"
};

/**
 * Ersetzt Text-Shortcuts durch echte Emojis
 * @param {string} text - Die Chat-Nachricht
 * @returns {string} - Der Text mit Emojis
 */
function parseEmojis(text) {
    if (!text || typeof text !== 'string') return text;

    let newText = text;
    
    // Geht alle Emojis in der Liste durch und ersetzt sie
    for (const [shortcut, emoji] of Object.entries(emojiMap)) {
        // Nutzt einen regulären Ausdruck, um ALLE Vorkommen zu ersetzen
        const regex = new RegExp(shortcut, 'g');
        newText = newText.replace(regex, emoji);
    }

    return newText;
}

module.exports = { parseEmojis };
