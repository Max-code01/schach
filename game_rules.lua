--[[ 
    🏆 MAX' ULTIMATE CHESS - ENGINE CORE STRATEGY (v5.0.0)
    System: High-Performance Rule Management
    Zweck: Zentrale Steuerung der Spielregeln und Spieler-Einstufung.
--]]

-- Das Haupt-Modul (Framework)
local ChessCore = {}
ChessCore.__index = ChessCore

-- 1. INITIALISIERUNG
-- Erstellt die Engine mit allen Standardwerten
function ChessCore.init()
    local self = setmetatable({}, ChessCore)
    
    -- Zentrale Konfiguration (Balancing)
    self.config = {
        base_elo = 1500,
        anti_cheat = true,
        rank_thresholds = {
            grandmaster = 2200,
            expert = 1800,
            professional = 1400,
            rookie = 0
        },
        time_settings = {
            blitz = 180,
            rapid = 600,
            classical = 1800
        }
    }
    return self
end

-- 2. DYNAMISCHE ANALYSE
-- Verarbeitet jeden Spieler (Egal ob Max, ZeroMercy oder neue User)
function ChessCore:analyzePlayer(username, elo, total_wins)
    local rank_name = "Challenger"
    
    -- Bestimmung des Ranges basierend auf der Elo
    if elo >= self.config.rank_thresholds.grandmaster then
        rank_name = "Grandmaster"
    elseif elo >= self.config.rank_thresholds.expert then
        rank_name = "Expert"
    elseif elo >= self.config.rank_thresholds.professional then
        rank_name = "Professional" -- Trifft auf 1500 Elo zu
    else
        rank_name = "Rookie"
    end

    -- Rückgabe eines strukturierten Datensatzes
    return {
        user = tostring(username),
        elo = tonumber(elo),
        wins = tonumber(total_wins),
        rank = rank_name,
        is_top_tier = (total_wins > 20) -- Erkennt Power-User wie Max
    }
end

-- 3. ELO-RISIKO BERECHNUNG
-- Berechnet die Schwierigkeit eines Matches
function ChessCore:calculateMatchDifficulty(p1_elo, p2_elo)
    local diff = math.abs(p1_elo - p2_elo)
    if diff == 0 then return "Perfektes Match" end
    if diff > 300 then return "Hohes Risiko" end
    return "Standard Match"
end

-- 4. AUSFÜHRUNG (PROTOTYP)
-- Hier wird die Engine gestartet
local engine = ChessCore.init()

-- Beispiel-Daten (Simuliert deine Datenbank-Einträge)
local currentPlayers = {
    {name = "Max", wins = 27, elo = 1500},
    {name = "ZeroMercy", wins = 1, elo = 1500},
    {name = "Prüfen", wins = 1, elo = 1500}
}

print("--- [MAX CHESS ENGINE SYSTEM LOG] ---")
print("Engine Version: " .. engine.config.base_elo .. " Base-Ready")

-- Verarbeitet alle Spieler in einer Schleife
for _, p in ipairs(currentPlayers) do
    local info = engine:analyzePlayer(p.name, p.elo, p.wins)
    print(string.format("Spieler: %-10s | Rang: %-12s | Elo: %d", 
          info.user, info.rank, info.elo))
end

return ChessCore
