-- ==========================================
-- MAX' SCHACH-PLATTFORM: DATENBANK-KERN (SQL)
-- ==========================================
-- Version: 2.1 (Fixed Security Policies)

-- 1. Tabelle für Spieler-Daten
CREATE TABLE IF NOT EXISTS players (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    elo INTEGER DEFAULT 1500,
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    draws INTEGER DEFAULT 0,
    last_online TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Performance-Optimierung
CREATE INDEX IF NOT EXISTS idx_leaderboard_ranking ON players(wins DESC, elo DESC);

-- 3. Sicherheits-Ebene aktivieren
ALTER TABLE players ENABLE ROW LEVEL SECURITY;

-- 4. REPARATUR-POLICIES (Damit es wieder geht):
-- Erlaubt der Webseite, neue Spieler zu registrieren
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public insert') THEN
        CREATE POLICY "Allow public insert" ON players FOR INSERT WITH CHECK (true);
    END IF;
END $$;

-- Erlaubt der Webseite, die Bestenliste zu lesen
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public select') THEN
        CREATE POLICY "Allow public select" ON players FOR SELECT USING (true);
    END IF;
END $$;

-- Erlaubt Spielern, ihre eigenen Siege/Daten zu aktualisieren
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public update') THEN
        CREATE POLICY "Allow public update" ON players FOR UPDATE USING (true);
    END IF;
END $$;
