// script2.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

// 1. Supabase Verbindung
const supabaseUrl = 'https://sfbubqwnuthicpenmwye.supabase.co'
const supabaseKey = 'sb_publishable_H-ZV5me7vxZN_fNPdQ0ifA_--7AdGnZ'
const supabase = createClient(supabaseUrl, supabaseKey)

window.supabase = supabase;

// 2. Demo-Modus (Das automatische Schachspiel im Hintergrund)
const demoMoves = [
    { from: 'e2', to: 'e4' }, { from: 'e7', to: 'e5' },
    { from: 'g1', to: 'f3' }, { from: 'b8', to: 'c6' },
    { from: 'f1', to: 'b5' }, { from: 'a7', to: 'a6' },
    { from: 'b5', to: 'a4' }, { from: 'g8', to: 'f6' }
];
let demoInterval;
let moveIndex = 0;

function startDemo() {
    if (!window.makeMove) {
        setTimeout(startDemo, 500);
        return;
    }
    demoInterval = setInterval(() => {
        if (moveIndex < demoMoves.length) {
            const move = demoMoves[moveIndex];
            window.makeMove(move.from, move.to);
            moveIndex++;
        } else {
            moveIndex = 0;
            if (window.resetGame) window.resetGame();
        }
    }, 1800);
}

// 3. AGB & Start-Logik
window.addEventListener('load', () => {
    if (!localStorage.getItem('agbAkzeptiert')) {
        const popup = document.getElementById('agb-popup');
        if(popup) popup.style.display = 'flex';
        setTimeout(startDemo, 1000); 
    }
});

window.acceptAGB = function() {
    clearInterval(demoInterval); 
    localStorage.setItem('agbAkzeptiert', 'true');
    const popup = document.getElementById('agb-popup');
    if(popup) popup.style.display = 'none';
    if (window.resetGame) window.resetGame(); 
};

// 4. Leaderboard laden (JETZT SICHER!)
async function loadLeaderboard() {
    const { data, error } = await supabase
        .from('players')
        .select('username, wins, level, xp') // <--- WICHTIG: Kein Passwort auswählen!
        .order('wins', { ascending: false })
        .limit(10);

    const listEl = document.getElementById('leaderboard-list');
    if (error) return;
    
    if (data && listEl) {
        // Wir nutzen .map(), um aus jedem Spieler (p) ein Stück HTML zu machen
        listEl.innerHTML = data.map((p, i) => `
            <div style="background: rgba(255,255,255,0.05); padding: 8px; border-radius: 8px; margin-bottom: 8px; border: 1px solid rgba(255,255,255,0.1); display: flex; flex-direction: column;">
                
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="color: #888; font-size: 0.8em;">#${i + 1}</span>
                        <strong style="color: white;">${p.username}</strong>
                    </div>
                    <span style="color: #f1c40f; font-size: 0.9em;">${p.wins || 0} 🏆</span>
                </div>
                
                <div style="display: flex; gap: 12px; font-size: 10px; margin-top: 5px; padding: 0 5px; color: #00ff00; align-items: center;">
                    <span>⭐ LVL: ${p.level || 1}</span>
                    
                    <button onclick="window.location.href='https://mein-schach-uten.onrender.com/download-contact/${p.username}'"
                            style="background: #3498db; border: none; color: white; cursor: pointer; border-radius: 4px; padding: 3px 8px; font-size: 9px; margin-left: auto;">
                        👤 KONTAKT +
                    </button>
                </div>
            </div>
        `).join(''); // .join('') macht aus der Liste einen langen Text für HTML
    }
}

// 5. Account speichern (Login/Registrierung)
const saveBtn = document.getElementById('saveAccountBtn');
if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
        const name = document.getElementById('playerName').value;
        const pass = document.getElementById('playerPass').value;
        const status = document.getElementById('save-status');

        if (!name || !pass) {
            status.innerHTML = "<span style='color: #ff4444;'>❌ Felder leer!</span>";
            return;
        }

        status.innerText = "⏳ Synchronisiere...";
        
        // Passwort hashen (Verschlüsseln), bevor es in die Datenbank geht
        const hashedPass = CryptoJS.SHA256(pass).toString();

        const { error } = await supabase
            .from('players')
            .upsert([{ username: name, password: hashedPass, elo: 1500 }], { onConflict: 'username' });

        if (error) {
            status.innerHTML = "<span style='color: #ff4444;'>❌ Fehler</span>";
        } else {
            status.innerHTML = "<span style='color: #00ff00;'>✅ Profil gesichert!</span>";
            loadLeaderboard();
        }
    });
}

// Ruby Social Funktionen (Dummy)
window.addToRubySocial = function(n) { console.log("Ruby Add:", n); };

// Start
loadLeaderboard();
setInterval(loadLeaderboard, 30000);
