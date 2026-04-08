from flask import Flask, request, jsonify
from flask_cors import CORS
from stats_manager import SchachLaborPro # Deine Klasse importieren

app = Flask(__name__)
CORS(app) # Erlaubt deinem Browser den Zugriff

# Wir speichern die Analysen im Speicher (für den Test)
analysen = {}

@app.route('/analyse', methods=['POST'])
def analyse_zug():
    data = request.json
    spieler = data.get("spieler", "Unbekannt")
    
    # Falls für diesen Spieler noch kein Labor existiert, neu erstellen
    if spieler not in analysen:
        analysen[spieler] = SchachLaborPro(spieler)
    
    labor = analysen[spieler]
    
    # Zug analysieren mit deiner Logik aus stats_manager.py
    labor.analysiere_zug(
        data['von'], 
        data['nach'], 
        data['figur'], 
        data['wert'], 
        data['ist_schlagzug']
    )
    
    # Aktuelle Stats zurückgeben
    stats = labor.berechne_end_statistik()
    return jsonify(stats)

if __name__ == '__main__':
    import os
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port)
