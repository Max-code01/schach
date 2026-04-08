// autoBackup.js - ULTIMATE TITAN EDITION (RENDER & DISCORD & LOGGING)
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const axios = require('axios'); 
const FormData = require('form-data'); 

/**
 * --- ERWEITERTE KONFIGURATION ---
 * Alles an einem Ort, damit du nichts im Code suchen musst.
 */
const CONFIG = {
    TABLES_TO_BACKUP: ['players', 'user_stats'], // Sichert alle wichtigen Tabellen
    BACKUP_INTERVAL_MS: 86400000,                // 24 Stunden Rhythmus
    KEEP_BACKUPS_DAYS: 7,                        // Speicherplatz-Schutz
    MIN_ROWS_EXPECTED: 1,                        // Fail-Safe gegen Datenverlust
    LOG_FILE: 'backup_history.log',               // Dein Audit-Logbuch
    // Holt sich die URL automatisch aus den Render-Umgebungsvariablen
    DISCORD_WEBHOOK_URL: process.env.DISCORD_WEBHOOK_URL 
};

/**
 * Sendet die Backup-Datei direkt in deinen Discord-Kanal.
 * Nutzt axios und form-data für stabilen Upload.
 */
async function sendToDiscord(filePath, fileName, rowCount, tableName) {
    if (!CONFIG.DISCORD_WEBHOOK_URL) {
        console.warn("⚠️ Discord-Versand übersprungen: DISCORD_WEBHOOK_URL nicht konfiguriert.");
        return;
    }

    try {
        const form = new FormData();
        form.append('file', fs.createReadStream(filePath), fileName);
        form.append('content', `🛡️ **Titan-Backup-System meldet:**\n✅ Tabelle **${tableName}** wurde erfolgreich gesichert.\n📊 Einträge: \`${rowCount}\`\n📂 Datei: \`${fileName}\`\n🕒 Zeit: ${new Date().toLocaleString('de-DE')}`);

        await axios.post(CONFIG.DISCORD_WEBHOOK_URL, form, {
            headers: form.getHeaders(),
            timeout: 30000 // 30 Sekunden Zeit für den Upload
        });
        console.log(`🚀 [DISCORD] ${fileName} erfolgreich übertragen!`);
    } catch (err) {
        console.error(`❌ [DISCORD ERROR] Versand von ${tableName} fehlgeschlagen:`, err.message);
    }
}

/**
 * Der Kernprozess: Lädt Daten, komprimiert sie und speichert sie lokal + Discord.
 */
async function runBackup(supabaseAdmin) {
    console.log("💾 [BACKUP] Starte Hochsicherheits-Sicherungsprozess...");
    const backupDir = path.join(__dirname, 'backups');
    
    // Ordner erstellen, falls er fehlt
    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir);
    }

    try {
        const now = new Date();
        // Zeitstempel für Dateinamen (sicher gegen Sonderzeichen)
        const dateStr = now.toISOString().replace(/:/g, '-').split('.')[0]; 
        let totalRowsOverall = 0;

        for (const tableName of CONFIG.TABLES_TO_BACKUP) {
            console.log(`⏳ [DB] Lade Tabelle: ${tableName}...`);
            
            const { data, error } = await supabaseAdmin.from(tableName).select('*');
            
            if (error) {
                throw new Error(`Supabase-Fehler bei Tabelle ${tableName}: ${error.message}`);
            }

            // FAIL-SAFE: Verhindert das Sichern leerer Tabellen (Schutz vor DB-Fehlern)
            if (data.length < CONFIG.MIN_ROWS_EXPECTED && tableName === 'players') {
                throw new Error(`KRITISCHER FEHLER: Tabelle ${tableName} ist fast leer! Backup abgebrochen.`);
            }

            totalRowsOverall += data.length;

            const fileName = `backup_${tableName}_${dateStr}.json.gz`;
            const filePath = path.join(backupDir, fileName);

            // HOCHLEISTUNGS-KOMPRIMIERUNG (zlib)
            const jsonString = JSON.stringify(data, null, 2);
            const compressedData = zlib.gzipSync(jsonString);
            
            fs.writeFileSync(filePath, compressedData);
            console.log(`✅ [LOCAL] ${tableName} gesichert: ${data.length} Einträge.`);

            // SOFORT-VERSAND AN DISCORD
            await sendToDiscord(filePath, fileName, data.length, tableName);
        }

        // AUDIT-LOG SCHREIBEN (Deine Geschichte)
        const logEntry = `[${now.toISOString()}] SUCCESS | Tabellen: ${CONFIG.TABLES_TO_BACKUP.join(', ')} | Total Rows: ${totalRowsOverall}\n`;
        fs.appendFileSync(path.join(backupDir, CONFIG.LOG_FILE), logEntry);

        // Aufräumen: Löscht Dateien, die älter als 7 Tage sind
        cleanOldBackups(backupDir);

    } catch (err) {
        const errorMsg = `❌ [BACKUP FATAL ERROR]: ${err.message}`;
        console.error(errorMsg);
        
        // Fehler im Logbuch vermerken
        const errorLog = `[${new Date().toISOString()}] ERROR | ${err.message}\n`;
        const backupDir = path.join(__dirname, 'backups');
        if (fs.existsSync(backupDir)) {
            fs.appendFileSync(path.join(backupDir, CONFIG.LOG_FILE), errorLog);
        }
    }
}

/**
 * Bereinigt alte Dateien, um die Festplatte nicht zu verstopfen.
 */
function cleanOldBackups(directory) {
    try {
        const files = fs.readdirSync(directory);
        const now = Date.now();
        const maxAgeMs = CONFIG.KEEP_BACKUPS_DAYS * 24 * 60 * 60 * 1000;
        let deletedCount = 0;

        files.forEach(file => {
            if (file === CONFIG.LOG_FILE) return; // Das Logbuch wird nie gelöscht

            const filePath = path.join(directory, file);
            const stats = fs.statSync(filePath);
            
            if (now - stats.mtimeMs > maxAgeMs) {
                fs.unlinkSync(filePath);
                deletedCount++;
            }
        });

        if (deletedCount > 0) {
            console.log(`🗑️ [CLEANUP] ${deletedCount} alte Backup-Dateien entfernt.`);
        }
    } catch (e) {
        console.error("⚠️ Fehler beim Aufräumen alter Backups:", e.message);
    }
}

/**
 * Startet den automatischen Rhythmus.
 */
function startBackupScheduler(supabaseAdmin) {
    console.log("🛠️ [SYSTEM] Backup-Scheduler aktiviert.");

    // Wartet 10 Sekunden nach Serverstart, damit die DB bereit ist
    setTimeout(() => {
        runBackup(supabaseAdmin);
    }, 10000);

    // Wiederholt den Prozess alle 24 Stunden
    setInterval(() => {
        runBackup(supabaseAdmin);
    }, CONFIG.BACKUP_INTERVAL_MS);
}

// Export der Hauptfunktion
module.exports = { startBackupScheduler };
