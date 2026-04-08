import json
import datetime
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, asdict

@dataclass
class ZugDaten:
    """Strukturierte Daten für einen einzelnen Schachzug."""
    nr: int
    zug: str
    figur: str
    typ: str
    schach: bool
    matt: bool

class SchachLaborPro:
    """
    Ein fortgeschrittenes Analyse-Tool für Schachpartien zur Auswertung 
    von Strategie, Entwicklung und taktischer Aggressivität.
    """
    
    # Klassen-Konstanten für bessere Wartbarkeit
    FIGUREN_WERTE = {
        "Bauer": 1, "Springer": 3, "Läufer": 3, 
        "Turm": 5, "Dame": 9, "König": 0
    }
    LEICHTFIGUREN = ["Springer", "Läufer"]
    ZENTRUMS_FELDER = {"d4", "d5", "e4", "e5", "d3", "e3", "d6", "e6"}
    RAND_SPALTEN = {"a", "h"}

    def __init__(self, spieler_name: str):
        self.spieler: str = spieler_name
        self.partie_id: str = f"GAME-{datetime.datetime.now().strftime('%Y%m%d-%H%M%S')}"
        self.zuege: List[ZugDaten] = []
        
        # Originale Metriken
        self.material_wert: int = 0
        self.aggressivitaet: int = 0
        self.zentrums_kontrolle: int = 0
        self.entwicklungs_score: int = 0
        
        # ERWEITERUNG: Neue strategische Metriken
        self.koenigs_sicherheit: int = 0
        self.schach_gebote: int = 0
        self.patzer_score: int = 0

    def analysiere_zug(self, von: str, nach: str, figur: str, wert: int = 0, 
                       ist_schlagzug: bool = False, ist_schach: bool = False, ist_matt: bool = False) -> None:
        """
        Analysiert einen Zug und aktualisiert die internen Bewertungsmetriken.
        """
        # Sicherstellen, dass die Figur bekannt ist
        echter_wert = self.FIGUREN_WERTE.get(figur, 1)
        zug_typ = "Normal"
        
        # 1. Material & Aggressivität
        if ist_schlagzug:
            self.aggressivitaet += (echter_wert * 5)
            self.material_wert += echter_wert
            zug_typ = "Angriff"
            
        # ERWEITERUNG: Schach & Matt berücksichtigen
        if ist_schach:
            self.schach_gebote += 1
            self.aggressivitaet += 10
            zug_typ = "Schach"
        if ist_matt:
            self.aggressivitaet += 50
            zug_typ = "Schachmatt"

        # 2. Erweiterte Positionsbewertung
        pos_bonus = 0
        if nach in self.ZENTRUMS_FELDER: 
            pos_bonus += 3
        if any(nach.startswith(s) for s in self.RAND_SPALTEN): 
            pos_bonus -= 2 # Rand-Züge bestrafen
            
        self.zentrums_kontrolle += pos_bonus

        # 3. Entwicklungs-Check (Wichtig für Elo!)
        letzter_zug_figur = self.zuege[-1].figur if self.zuege else None
        zug_nummer = len(self.zuege)
        
        # Bestraft, wenn man die gleiche Leichtfigur zu oft zieht im Opening
        if figur == letzter_zug_figur and figur in self.LEICHTFIGUREN and zug_nummer < 15:
            self.entwicklungs_score -= 2 # Zeitverschwendung!
            self.patzer_score += 1
        elif figur in self.LEICHTFIGUREN and zug_nummer < 10:
            self.entwicklungs_score += 5 # Gute Entwicklung im Opening
            zug_typ = "Entwicklung" if zug_typ == "Normal" else zug_typ
            
        # ERWEITERUNG: Königssicherheit (Rochade erkennen)
        # Wenn der König mehr als ein Feld springt, ist es eine Rochade
        if figur == "König" and abs(ord(von[0]) - ord(nach[0])) > 1:
            self.koenigs_sicherheit += 15
            self.entwicklungs_score += 10
            zug_typ = "Rochade"
            
        # ERWEITERUNG: Frühe Damenzüge bestrafen
        if figur == "Dame" and zug_nummer < 8:
            self.entwicklungs_score -= 5
            self.patzer_score += 2

        # Daten strukturiert abspeichern
        neuer_zug = ZugDaten(
            nr=zug_nummer + 1,
            zug=f"{von} -> {nach}",
            figur=figur,
            typ=zug_typ,
            schach=ist_schach,
            matt=ist_matt
        )
        self.zuege.append(neuer_zug)

    def berechne_end_statistik(self) -> Dict[str, Any]:
        """Berechnet die finale Elo, Genauigkeit und gibt einen strukturierten Bericht zurück."""
        anzahl = len(self.zuege)
        if anzahl == 0: 
            return {"Fehler": "Es wurden keine Züge analysiert."}

        # --- DIE ERWEITERTE PROFI-FORMEL ---
        # Basis-Elo 800 + Original-Berechnungen + Neue Metriken
        strategie_score = self.zentrums_kontrolle + self.entwicklungs_score + self.koenigs_sicherheit
        
        finale_elo = (
            800 
            + (anzahl * 2) 
            + (self.material_wert * 25) 
            + (strategie_score * 3)
            + (self.schach_gebote * 15)
            - (self.patzer_score * 20)
        )
        
        # Genauigkeit detaillierter berechnen
        genauigkeit = 50 + (strategie_score / max(1, anzahl) * 10) - (self.patzer_score * 2)
        genauigkeit = max(10.0, min(99.8, genauigkeit)) # Sicherstellen, dass es zwischen 10% und 99.8% bleibt

        return {
            "Partie_Zusammenfassung": {
                "Spieler": self.spieler,
                "Züge": anzahl,
                "Partie_ID": self.partie_id,
                "Datum": datetime.datetime.now().strftime('%Y-%m-%d %H:%M')
            },
            "Performance_Metriken": {
                "Genauigkeit": f"{round(genauigkeit, 1)}%",
                "Aggressivität": self.aggressivitaet,
                "Strategie_Punkte": strategie_score,
                "Königssicherheit": self.koenigs_sicherheit,
                "Schach_Gebote": self.schach_gebote,
                "Geschätzte_Elo": int(finale_elo),
                "Rang": self.get_rang(finale_elo)
            },
            "Positions_Analyse": {
                "Material_Vorteil": f"+{self.material_wert}",
                "Zentrum": "Dominant" if self.zentrums_kontrolle > 15 else ("Neutral" if self.zentrums_kontrolle > 0 else "Schwach"),
                "Entwicklung": "Schnell & Solide" if self.entwicklungs_score > 10 else "Passiv",
                "Eröffnung": "Vorsichtig" if self.patzer_score == 0 else "Fehleranfällig"
            },
            "Zug_Historie": [asdict(zug) for zug in self.zuege]
        }

    @staticmethod
    def get_rang(elo: float) -> str:
        """Kategorisiert den Spieler basierend auf der berechneten Elo."""
        if elo > 2500: return "Stockfish-Level 🤖"
        if elo > 2000: return "Großmeister 🏆"
        if elo > 1600: return "Meister ⚔️"
        if elo > 1200: return "Fortgeschritten 🛡️"
        if elo > 800: return "Hobbyspieler ♟️"
        return "Anfänger 🌱"

# --- Beispielnutzung ---
if __name__ == "__main__":
    labor = SchachLaborPro("Max")
    labor.analysiere_zug("e2", "e4", "Bauer")
    labor.analysiere_zug("g1", "f3", "Springer")
    labor.analysiere_zug("f1", "c4", "Läufer")
    labor.analysiere_zug("e1", "g1", "König") # Erkennt Rochade!
    labor.analysiere_zug("c4", "f7", "Läufer", ist_schlagzug=True, ist_schach=True)
    
    print(json.dumps(labor.berechne_end_statistik(), indent=4, ensure_ascii=False))
