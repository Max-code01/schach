const ffmpeg = require('fluent-ffmpeg');
const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const path = require('path');

/**
 * Erstellt ein Video aus einer Schachpartie
 * @param {Array} moveImages - Pfade zu den Bildern der Züge
 * @param {string} outputName - Name der fertigen MP4-Datei
 */
async function createChessVideo(moveImages, outputName) {
    return new Promise((resolve, reject) => {
        const videoPath = path.join(__currentDir, 'videos', `${outputName}.mp4`);
        const audioPath = path.join(__currentDir, 'assets', 'chess_music.mp3'); // Deine Hintergrundmusik

        // Falls der Video-Ordner nicht existiert, erstellen
        if (!fs.existsSync(path.join(__currentDir, 'videos'))) {
            fs.mkdirSync(path.join(__currentDir, 'videos'));
        }

        const command = ffmpeg();

        // 1. Alle Bilder als Input hinzufügen
        moveImages.forEach((img) => {
            command.input(img).loop(1); // Jedes Bild für x Sekunden anzeigen
        });

        command
            .fps(2) // 2 Bilder pro Sekunde (angenehmes Tempo für Schach)
            .addInput(audioPath) // Musik hinzufügen
            .audioCodec('aac')
            .videoCodec('libx264')
            .format('mp4')
            .outputOptions([
                '-pix_fmt yuv420p', // Kompatibilität für Handys/Browser
                '-shortest'         // Video endet, wenn die Bilder vorbei sind
            ])
            .on('start', (cmd) => {
                console.log('🎬 Video-Rendering gestartet: ' + cmd);
            })
            .on('error', (err) => {
                console.error('❌ Fehler beim Video-Schnitt:', err);
                reject(err);
            })
            .on('end', () => {
                console.log('✅ Video fertig erstellt: ' + videoPath);
                resolve(videoPath);
            })
            .save(videoPath);
    });
}

// Beispiel-Aufruf (wird nach Spielende getriggert)
// createChessVideo(['zug1.png', 'zug2.png', 'zug3.png'], 'Highlight_Match_Max_vs_Bot');
