-- ============================================================
-- WohnungsRadar – Supabase Datenbankschema
-- ============================================================
-- Dieses SQL-Skript im Supabase SQL-Editor ausführen:
-- Supabase Dashboard → SQL Editor → New Query → Paste → Run
-- ============================================================


-- ============================================================
-- HILFSFUNKTION: updated_at automatisch aktualisieren
-- ============================================================

-- Trigger-Funktion: setzt updated_at auf den aktuellen Zeitstempel
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ============================================================
-- TABELLE: listings
-- Alle gefundenen Wohnungsinserate aus allen Quellen
-- ============================================================

CREATE TABLE listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Kerndaten des Inserats
  title TEXT NOT NULL,                    -- Titel des Inserats
  description TEXT,                       -- Beschreibungstext
  address TEXT,                           -- Strassenadresse
  zip_code VARCHAR(10),                   -- Postleitzahl (z.B. '3097')
  city VARCHAR(100),                      -- Gemeinde (z.B. 'Köniz')
  district VARCHAR(100),                  -- Quartier/Ortsteil (z.B. 'Schliern', 'Liebefeld')

  -- Wohnungsdaten
  rooms DECIMAL(3,1),                     -- Zimmeranzahl (z.B. 4.5)
  area_m2 INTEGER,                        -- Wohnfläche in m²
  floor INTEGER,                          -- Stockwerk (0 = Erdgeschoss)
  rent_net INTEGER,                       -- Nettomiete in CHF
  rent_gross INTEGER,                     -- Bruttomiete (inkl. Nebenkosten) in CHF
  additional_costs INTEGER,               -- Nebenkosten in CHF

  -- Ausstattungsmerkmale (Tags)
  has_garden BOOLEAN DEFAULT FALSE,       -- Garten oder Gartenanteil
  has_terrace BOOLEAN DEFAULT FALSE,      -- Terrasse
  has_balcony BOOLEAN DEFAULT FALSE,      -- Balkon
  has_lift BOOLEAN DEFAULT FALSE,         -- Lift vorhanden
  has_own_washer BOOLEAN DEFAULT FALSE,   -- Eigene Waschmaschine/Tumbler
  has_parking BOOLEAN DEFAULT FALSE,      -- Parkplatz verfügbar
  parking_cost INTEGER,                   -- Parkplatzkosten in CHF/Monat
  is_minergie BOOLEAN DEFAULT FALSE,      -- Minergie-zertifiziert / gute Isolation
  is_child_friendly BOOLEAN DEFAULT FALSE, -- Kinderfreundliche Lage
  property_type VARCHAR(50),              -- Typ: 'wohnung', 'maisonette', 'attika', 'reihenhaus', etc.

  -- Verfügbarkeit
  available_from DATE,                    -- Ab wann beziehbar

  -- Quell-Tracking (woher kommt das Inserat?)
  source VARCHAR(50) NOT NULL,            -- z.B. 'homegate', 'immoscout24', 'flatfox', 'von_graffenried'
  source_url TEXT NOT NULL,               -- Direkte URL zum Originalinserat
  source_id VARCHAR(200),                 -- ID des Inserats auf dem Quellportal
  source_ref VARCHAR(200),               -- Referenznummer aus dem Inserat (z.B. '1234.5.ABC')

  -- Verwaltungsangaben
  agency_name VARCHAR(200),              -- Name der Liegenschaftsverwaltung
  agency_url TEXT,                       -- Website der Verwaltung

  -- Bilder
  image_urls TEXT[],                     -- Array mit URLs aller Bilder

  -- Deduplizierung: gleiche Wohnung auf mehreren Portalen erkennen
  dedup_hash VARCHAR(64),               -- SHA256-Hash aus: Adresse + Zimmer + Fläche + Miete
  canonical_id UUID REFERENCES listings(id), -- Zeigt auf den Haupteintrag (bei Duplikaten)

  -- Geo-Koordinaten für Kartenansicht
  latitude DECIMAL(9,6),               -- Breitengrad (z.B. 46.947975)
  longitude DECIMAL(9,6),              -- Längengrad (z.B. 7.447447)

  -- Meta-Informationen
  first_seen_at TIMESTAMPTZ DEFAULT NOW(), -- Wann das Inserat zuerst gefunden wurde
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),  -- Wann das Inserat zuletzt gesehen wurde
  is_active BOOLEAN DEFAULT TRUE,          -- FALSE wenn Inserat nicht mehr verfügbar

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indices für häufige Abfragen
CREATE INDEX idx_listings_dedup ON listings(dedup_hash);                         -- Schnelle Duplikatserkennung
CREATE INDEX idx_listings_active ON listings(is_active, zip_code, rooms);        -- Filter: aktive Inserate nach PLZ + Zimmer
CREATE INDEX idx_listings_source ON listings(source, source_id);                  -- Lookup nach Quelle
CREATE INDEX idx_listings_geo ON listings(latitude, longitude);                   -- Geo-Abfragen für Karte
CREATE INDEX idx_listings_rent ON listings(rent_gross, rooms, is_active);         -- Filter nach Preis + Zimmer

-- Trigger: updated_at automatisch setzen bei jeder Änderung
CREATE TRIGGER trg_listings_updated_at
  BEFORE UPDATE ON listings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Row Level Security (RLS) aktivieren
-- Inserate sind öffentlich lesbar (alle eingeloggten User können sie sehen)
ALTER TABLE listings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Listings sind öffentlich lesbar"
  ON listings FOR SELECT
  USING (true);

-- Schreiben nur über den Service-Role-Key (Backend/Scraper)
CREATE POLICY "Listings schreiben nur via Service Role"
  ON listings FOR ALL
  USING (auth.role() = 'service_role');


-- ============================================================
-- TABELLE: search_profiles
-- Suchkriterien eines Benutzers
-- ============================================================

CREATE TABLE search_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE, -- Gehört zu einem Supabase-User

  name VARCHAR(100) DEFAULT 'Mein Suchprofil',

  -- Geografische Kriterien
  zip_codes TEXT[],              -- PLZ-Liste z.B. ['3097', '3084', '3063', '3072']
  cities TEXT[],                 -- Städte/Gemeinden z.B. ['Köniz', 'Bern', 'Schliern b. Köniz']

  -- Wohnungskriterien
  rooms_min DECIMAL(3,1),        -- Mindest-Zimmeranzahl (z.B. 4.5)
  rooms_max DECIMAL(3,1),        -- Maximal-Zimmeranzahl (z.B. 6.5)
  rent_gross_max INTEGER,        -- Maximale Bruttomiete in CHF (z.B. 3000)
  area_min INTEGER,              -- Mindestfläche in m² (Soft-Filter)

  -- Präferenzen (in Reihenfolge der Priorität)
  outdoor_priority TEXT[],       -- ['garden', 'terrace', 'balcony']
  must_haves TEXT[],             -- Pflichtkriterien z.B. ['minergie', 'child_friendly']
  nice_to_haves TEXT[],          -- Wünschenswert z.B. ['own_washer', 'lift', 'parking']

  -- Benachrichtigungseinstellungen
  notify_email BOOLEAN DEFAULT TRUE,   -- E-Mail-Benachrichtigung bei neuem Treffer
  notify_push BOOLEAN DEFAULT FALSE,   -- Push-Benachrichtigung (für spätere Phase)

  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger: updated_at automatisch setzen
CREATE TRIGGER trg_search_profiles_updated_at
  BEFORE UPDATE ON search_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Row Level Security: User sieht nur seine eigenen Profile
ALTER TABLE search_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "User sieht nur eigene Suchprofile"
  ON search_profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "User kann eigene Suchprofile erstellen"
  ON search_profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "User kann eigene Suchprofile bearbeiten"
  ON search_profiles FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "User kann eigene Suchprofile löschen"
  ON search_profiles FOR DELETE
  USING (auth.uid() = user_id);


-- ============================================================
-- TABELLE: scrape_sources
-- Alle konfigurierten Scraping-Quellen
-- ============================================================

CREATE TABLE scrape_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  name VARCHAR(100) NOT NULL UNIQUE,      -- Eindeutiger Bezeichner z.B. 'homegate', 'flatfox', 'wbg_neuhaus'
  tier INTEGER NOT NULL CHECK (tier IN (1, 2, 3, 4)),  -- Prioritätsstufe (siehe SPEC)
  type VARCHAR(50) NOT NULL CHECK (type IN ('portal', 'verwaltung', 'genossenschaft', 'other')),
  display_name VARCHAR(200),              -- Anzeigename z.B. 'Homegate.ch', 'WBG Neuhaus'
  base_url TEXT NOT NULL,                 -- Hauptwebsite der Quelle
  scrape_url TEXT,                        -- Konkrete URL für den Scraper

  -- Scraping-Konfiguration
  scrape_interval_minutes INTEGER DEFAULT 60, -- Wie oft scrapen?
  last_scraped_at TIMESTAMPTZ,            -- Letzter erfolgreicher Scrape
  last_error TEXT,                        -- Letzter Fehlertext (NULL = kein Fehler)
  consecutive_errors INTEGER DEFAULT 0,   -- Anzahl aufeinanderfolgender Fehler
  is_active BOOLEAN DEFAULT TRUE,         -- FALSE = Quelle deaktiviert

  notes TEXT,                             -- Interne Notizen

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Row Level Security: Scrape-Quellen sind öffentlich lesbar (für Frontend-Status-Seite)
ALTER TABLE scrape_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Scrape-Quellen sind öffentlich lesbar"
  ON scrape_sources FOR SELECT
  USING (true);

CREATE POLICY "Scrape-Quellen schreiben nur via Service Role"
  ON scrape_sources FOR ALL
  USING (auth.role() = 'service_role');


-- ============================================================
-- TABELLE: notifications
-- Benachrichtigungen an User bei neuen Treffern
-- ============================================================

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  listing_id UUID REFERENCES listings(id) ON DELETE CASCADE,
  search_profile_id UUID REFERENCES search_profiles(id) ON DELETE SET NULL,

  type VARCHAR(20) NOT NULL CHECK (type IN ('new_listing', 'price_change', 'listing_removed')),
  sent_at TIMESTAMPTZ,    -- NULL = noch nicht gesendet
  read_at TIMESTAMPTZ,    -- NULL = noch nicht gelesen

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index für schnelle Abfrage: alle ungelesenen Notifications eines Users
CREATE INDEX idx_notifications_user ON notifications(user_id, read_at);

-- Row Level Security: User sieht nur seine eigenen Benachrichtigungen
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "User sieht nur eigene Benachrichtigungen"
  ON notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "User kann eigene Benachrichtigungen als gelesen markieren"
  ON notifications FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Benachrichtigungen erstellen nur via Service Role"
  ON notifications FOR INSERT
  WITH CHECK (auth.role() = 'service_role');


-- ============================================================
-- INITIALDATEN: Scraping-Quellen vorbefüllen
-- ============================================================

INSERT INTO scrape_sources (name, tier, type, display_name, base_url, scrape_url, scrape_interval_minutes, notes) VALUES
  -- Tier 1: Grosse Portale (stündlich)
  ('homegate',      1, 'portal',         'Homegate.ch',       'https://www.homegate.ch',       'https://www.homegate.ch/mieten/wohnung/kanton-bern/trefferliste',   60,  'Grösste Plattform CH. Dynamisches Rendering, evtl. Puppeteer nötig.'),
  ('immoscout24',   1, 'portal',         'ImmoScout24.ch',    'https://www.immoscout24.ch',    'https://www.immoscout24.ch/de/wohnung/mieten/kanton-bern',          60,  'Zweitgrösste Plattform. Dynamisches Rendering, evtl. Puppeteer nötig.'),
  ('flatfox',       1, 'portal',         'Flatfox.ch',        'https://flatfox.ch',            'https://flatfox.ch/de/search/?east=7.647&west=7.247&north=47.05&south=46.85',  60,  'Viele kleinere Verwaltungen. Relativ offene Struktur, wahrscheinlich JSON-API vorhanden.'),
  ('newhome',       1, 'portal',         'Newhome.ch',        'https://www.newhome.ch',        NULL,                                                                60,  'Kantonalbank-Portal.'),

  -- Tier 2: Verwaltungen (alle 4 Stunden)
  ('von_graffenried', 2, 'verwaltung',   'Von Graffenried AG', 'https://www.graffenried-liegenschaften.ch', NULL,                                                  240, 'Köniz, Schliern, Bern'),
  ('livit',           2, 'verwaltung',   'Livit AG',           'https://www.livit.ch',          NULL,                                                                240, 'Bern, Köniz, Liebefeld'),
  ('wincasa',         2, 'verwaltung',   'Wincasa AG',         'https://www.wincasa.ch',        NULL,                                                                240, 'Bern, Wabern, Köniz'),
  ('burgergemeinde',  2, 'verwaltung',   'Burgergemeinde Bern','https://www.bgbern.ch',         NULL,                                                                240, 'Bern, Agglomeration'),
  ('immo_stadt_bern', 2, 'verwaltung',   'Immobilien Stadt Bern', 'https://www.bern.ch',        NULL,                                                                240, 'Stadt Bern'),
  ('pvk_bern',        2, 'verwaltung',   'PVK Bern',           'https://www.pvkbern.ch',        NULL,                                                                240, 'Bern, Umgebung. Ca. 1550 Wohnungen.'),

  -- Tier 3: Genossenschaften (alle 12 Stunden)
  ('fambau',         3, 'genossenschaft', 'Fambau',            'https://www.fambau.ch',         NULL,                                                                720, 'Bern, ca. 3000 Wohnungen'),
  ('ebg_bern',       3, 'genossenschaft', 'EBG Bern',          'https://www.ebgbern.ch',        NULL,                                                                720, 'Bern, Zollikofen, ca. 700 Wohnungen'),
  ('wogeno',         3, 'genossenschaft', 'WOGENO Bern',       'https://www.wogeno-bern.ch',    NULL,                                                                720, 'Bern, ca. 200 Wohnungen'),
  ('wbg_neuhaus',    3, 'genossenschaft', 'WBG Neuhaus',       'https://www.wbg-neuhaus.ch',    NULL,                                                                720, 'Köniz, Schliern, Wabern, Thörishaus'),
  ('wbg_murifeld',   3, 'genossenschaft', 'WBG Murifeld',      'https://www.wbg-murifeld.ch',   NULL,                                                                720, 'Schliern b. Köniz, 24 Wohnungen');
