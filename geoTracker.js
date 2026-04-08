// geoTracker.js - High-Tech Radar & Sicherheits-Monitor
// Nutzt die Render-Umgebungsvariable: process.env.DISCORD_WEBHOOK_URL

async function getLocationFromIP(ip) {
    // 1. Check auf lokale Verbindungen (kein Tracking nötig)
    if (!ip || ip === '::1' || ip === '127.0.0.1' || ip.startsWith('192.168.')) {
        return { city: "Lokales Netzwerk", country: "Home", status: "local" };
    }

    try {
        // 2. Abfrage der Profi-Daten (Felder: Stadt, Land, Region, Lat/Lon, ISP, ZIP)
        const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,message,country,countryCode,regionName,city,zip,lat,lon,timezone,isp,org,as,query`);
        const data = await response.json();

        if (data.status === 'success') {
            // 3. Den Discord-Alarm im Hintergrund senden
            sendDiscordRadarAlert(data);

            // 4. Daten für server.js zurückgeben
            return {
                city: data.city,
                country: data.country,
                region: data.regionName,
                zip: data.zip,
                lat: data.lat,
                lon: data.lon,
                isp: data.isp,
                ip: data.query
            };
        } else {
            return { city: "Unbekannt", country: "Unbekannt" };
        }
    } catch (error) {
        console.error("🕵️ Extrem-Radar Fehler:", error.message);
        return { city: "Fehler", country: "Fehler" };
    }
}

// Interne Funktion für den Discord-Alarm (Nutzt Render Umgebungsvariable)
async function sendDiscordRadarAlert(d) {
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) return; // Falls keine URL gesetzt ist, nichts tun

    // Google Maps Link erstellen
    const mapsLink = `https://www.google.com/maps/search/?api=1&query=${d.lat},${d.lon}`;

    const payload = {
        username: "PROCHESS RADAR",
        avatar_url: "https://max-code01.github.io/mein-schach/favicon.ico",
        embeds: [{
            title: "🌍 Echtzeit-Standort erkannt",
            description: `Ein neuer Spieler ist live beigetreten.`,
            color: 3447003, // Blau
            fields: [
                { name: "📍 Ort", value: `${d.city} (${d.zip}), ${d.regionName}`, inline: true },
                { name: "🏳️ Land", value: `${d.country} :flag_${d.countryCode.toLowerCase()}:`, inline: true },
                { name: "📶 Anbieter", value: `${d.isp}`, inline: false },
                { name: "🌐 IP-Adresse", value: `||${d.query}||`, inline: true },
                { name: "🕒 Zeitzone", value: `${d.timezone}`, inline: true },
                { name: "🗺️ Karte", value: `[Auf Google Maps anzeigen](${mapsLink})`, inline: false }
            ],
            footer: { text: "System-Sicherheit: Standort-Analyse aktiv" },
            timestamp: new Date()
        }]
    };

    try {
        await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    } catch (err) {
        console.error("Discord Radar Sende-Fehler:", err.message);
    }
}

module.exports = { getLocationFromIP };
