# WohnungsRadar – Spezifikation

## Projektübersicht

WohnungsRadar ist eine Web-App, die Mietwohnungsinserate aus verschiedenen Quellen (Immobilienportale, Verwaltungs-Websites, Genossenschaften) aggregiert, dedupliziert und den Benutzer bei neuen Treffern per E-Mail/Push benachrichtigt. Ziel ist es, den fragmentierten Schweizer Mietwohnungsmarkt in der Region Bern in einer einzigen Oberfläche durchsuchbar zu machen – inklusive Inserate, die nie auf den grossen Portalen landen.

---

## Suchprofil (Standardwerte / Erstbenutzer)

| Kriterium | Wert |
|---|---|
| Gebiete | Bern (Stadt), Wabern, Ittigen, Ostermundigen, Köniz, Schliern b. Köniz, Liebefeld |
| Zimmer | 4.5 – 6.5 |
| Bruttomiete max. | CHF 3'000 |
| Fläche min. | 100 m² (Soft-Filter, anzeigen aber markieren wenn kleiner) |
| Aussenfläche (Prio) | 1. Garten/Gartenanteil, 2. Terrasse/grosser Balkon, 3. Normaler Balkon |
| Must-Haves | Minergie / gute Isolation (Tag), Kinderfreundliche Lage (Tag) |
| Nice-to-Haves | Eigene Waschmaschine/Tumbler, Lift, Einstellplatz verfügbar |

> Diese Kriterien sind benutzerspezifisch und sollen in der App konfigurierbar sein. Das Suchprofil wird in Supabase gespeichert.

---

## Tech-Stack

| Komponente | Technologie |
|---|---|
| Frontend | React + TypeScript (Vite) |
| Backend | Node.js + TypeScript (Express) |
| Datenbank | Supabase (PostgreSQL + Auth + Realtime) |
| Hosting Frontend | Render (Static Site) |
| Hosting Backend | Render (Web Service) |
| Scraping/Jobs | Node.js Cron-Jobs auf Render (oder Supabase Edge Functions) |
| Code & CI | GitHub |
| Entwicklung | Claude Code (Web via GitHub) |

---

## Datenquellen

### Tier 1: Grosse Immobilienportale (Scraping)

Diese Portale decken ca. 70-80% des öffentlich inserierten Marktes ab. Jedes Portal hat unterschiedliche Verwaltungen als Kunden, daher ist die Abdeckung aller wichtig.

| Portal | URL | Priorität | Anmerkungen |
|---|---|---|---|
| homegate.ch | homegate.ch/mieten/wohnung/ | Hoch | Grösste Plattform CH |
| ImmoScout24.ch | immoscout24.ch/de/wohnung/mieten/ | Hoch | Zweitgrösste |
| flatfox.ch | flatfox.ch/de/search/ | Hoch | Viele kleinere Verwaltungen, relativ offene Struktur |
| newhome.ch | newhome.ch | Mittel | Kantonalbank-Portal |
| comparis.ch | comparis.ch/immobilien/ | Mittel | Aggregiert teilweise selbst |
| home.ch | home.ch/de/mieten/ | Mittel | Ergänzend |
| alle-immobilien.ch | alle-immobilien.ch | Mittel | Aggregiert teilweise |
| immostreet.ch | immostreet.ch | Niedrig | Ergänzend |
| RealAdvisor | realadvisor.ch/de/mieten/ | Niedrig | Aggregiert, evtl. wenig Unique |

**Strategie:** Mit homegate, immoscout24 und flatfox starten (>80% Abdeckung), dann iterativ erweitern.

### Tier 2: Liegenschaftsverwaltungen (Direkt-Websites)

Diese Verwaltungen haben Liegenschaften in den Zielgebieten und inserieren teilweise nur auf der eigenen Website oder nur auf ausgewählten Portalen.

| Verwaltung | Website | Zielgebiete |
|---|---|---|
| Von Graffenried AG Liegenschaften | graffenried-liegenschaften.ch | Köniz, Schliern, Bern |
| Livit AG | livit.ch | Bern, Köniz, Liebefeld |
| Wincasa AG | wincasa.ch | Bern, Wabern, Köniz |
| Immobilia AG | immobilia-bern.ch | Bern, Region |
| Burgergemeinde Bern | bgbern.ch/themen/immobilien | Bern, Agglomeration |
| Immobilien Stadt Bern | bern.ch/themen/wohnen/mietobjekte | Stadt Bern |
| PVK Bern (Personalvorsorgekasse) | pvkbern.ch/topics/vermoegensanlagen/immobilien | Bern, Umgebung (~1'550 Whg.) |
| Immoplus Bern | immoplus-bern.ch | Bern, Region |
| Wotreva AG | wotreva.ch | Region Bern |
| Terrenum Bern AG | terrenum-bern.ch | Bern, Region |
| Zollinger Immobilien | zollinger.ch | Bern, Region |
| Brigitte Senn Immobilien | brigittesenn.immo | Köniz, Schliern |
| Gemeinde Köniz Immobilien | koeniz.ch/verwaltung/.../immobilien | Köniz, Schliern, Liebefeld, Wabern |

**Strategie:** Pro Verwaltung die "Freie Objekte"-Seite identifizieren und periodisch parsen. Viele nutzen ein standardisiertes Format (z.B. Flatfox-Widget eingebettet, oder eigene Listings-Seite).

### Tier 3: Wohnbaugenossenschaften

Genossenschaften inserieren häufig NUR auf der eigenen Website oder vergeben über Wartelisten. In der Region Bern gibt es über 200 gemeinnützige Wohnbauträger.

**Wichtigste Genossenschaften in den Zielgebieten:**

| Genossenschaft | Website | Gebiet | Whg. ca. |
|---|---|---|---|
| Fambau | fambau.ch | Bern | ~3'000 |
| EBG Bern (Eisenbahner-BG) | ebgbern.ch | Bern, Zollikofen | ~700 |
| WOGENO Bern | wogeno-bern.ch | Bern (diverse) | ~200 |
| Hauptstadt-Genossenschaft | hauptstadt-genossenschaft.ch | Bern | Mittel |
| BG Brünnen-Eichholz | bg-bruennen.ch | Bern Brünnen | Mittel |
| TerraBern | terrabern.ch | Stadt Bern | Mittel |
| WBG Murifeld | wbg-murifeld.ch | Schliern b. Köniz | 24 |
| WBG Neuhaus | wbg-neuhaus.ch | Köniz, Schliern, Wabern, Thörishaus | Mittel |
| Genossenschaft «Am Hof» | – | Köniz | Klein |
| Warmbächli | warmbachli.ch | Bern (Holliger) | Mittel |
| LEWO | lewo.info | Muri b. Bern / Region | Mittel |

**Ergänzend:**
| Quelle | URL | Anmerkungen |
|---|---|---|
| laos.io | laos.io/de/kanton/Bern/ | Aggregator für Genossenschaftswohnungen – prüfen ob API/RSS vorhanden |
| IG Bern Mitgliederliste | wbg-beso.ch/.../mitglieder | Vollständige Liste aller BG in der Region |

**Strategie:** Die grossen Genossenschaften (Fambau, EBG, WOGENO, WBG Neuhaus) priorisieren. Viele haben einfache Websites, die sich gut parsen lassen. Wartelisten-Links ebenfalls erfassen und anzeigen.

### Tier 4: Sonstige Quellen (Best-Effort)

| Quelle | Art | Machbarkeit |
|---|---|---|
| Facebook-Gruppen ("Wohnung frei in Bern") | Social Media | Technisch schwierig (TOS), manuell als Tipp anzeigen |
| tutti.ch / anibis.ch | Kleinanzeigen | Machbar, aber Qualität gemischt |
| ronorp.net | Community-Inserate | Machbar, Bern-Community |
| Nachmieter-Portale | Diverse | Ergänzend |

**Strategie:** Tier 4 nur bei Bedarf, nicht in MVP.

---

## Datenmodell (Supabase / PostgreSQL)

### Tabelle: `listings`

```sql
CREATE TABLE listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Kerndaten
  title TEXT NOT NULL,
  description TEXT,
  address TEXT,
  zip_code VARCHAR(10),
  city VARCHAR(100),
  district VARCHAR(100),        -- Schliern, Liebefeld, etc.
  
  -- Wohnungsdaten
  rooms DECIMAL(3,1),
  area_m2 INTEGER,
  floor INTEGER,
  rent_net INTEGER,              -- CHF netto
  rent_gross INTEGER,            -- CHF brutto (inkl. NK)
  additional_costs INTEGER,      -- Nebenkosten
  
  -- Features (Tags)
  has_garden BOOLEAN DEFAULT FALSE,
  has_terrace BOOLEAN DEFAULT FALSE,
  has_balcony BOOLEAN DEFAULT FALSE,
  has_lift BOOLEAN DEFAULT FALSE,
  has_own_washer BOOLEAN DEFAULT FALSE,
  has_parking BOOLEAN DEFAULT FALSE,
  parking_cost INTEGER,
  is_minergie BOOLEAN DEFAULT FALSE,
  is_child_friendly BOOLEAN DEFAULT FALSE,
  property_type VARCHAR(50),     -- 'wohnung', 'maisonette', 'attika', 'reihenhaus', etc.
  
  -- Verfügbarkeit
  available_from DATE,
  
  -- Quell-Tracking
  source VARCHAR(50) NOT NULL,   -- 'homegate', 'immoscout24', 'flatfox', 'von_graffenried', etc.
  source_url TEXT NOT NULL,
  source_id VARCHAR(200),        -- ID auf dem Quellportal
  source_ref VARCHAR(200),       -- Referenznummer aus dem Inserat
  
  -- Verwaltung
  agency_name VARCHAR(200),
  agency_url TEXT,
  
  -- Bilder
  image_urls TEXT[],             -- Array von Bild-URLs
  
  -- Deduplizierung
  dedup_hash VARCHAR(64),        -- Hash aus Adresse + Zimmer + Fläche + Miete
  canonical_id UUID REFERENCES listings(id),  -- Verweis auf Haupteintrag bei Duplikaten
  
  -- Geo
  latitude DECIMAL(9,6),
  longitude DECIMAL(9,6),
  
  -- Meta
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indices
CREATE INDEX idx_listings_dedup ON listings(dedup_hash);
CREATE INDEX idx_listings_active ON listings(is_active, zip_code, rooms);
CREATE INDEX idx_listings_source ON listings(source, source_id);
CREATE INDEX idx_listings_geo ON listings(latitude, longitude);
```

### Tabelle: `search_profiles`

```sql
CREATE TABLE search_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  
  name VARCHAR(100) DEFAULT 'Mein Suchprofil',
  
  -- Kriterien
  zip_codes TEXT[],              -- ['3098', '3084', '3063', '3072', '3097', '3000-3030']
  cities TEXT[],                 -- ['Köniz', 'Schliern b. Köniz', 'Bern', etc.]
  rooms_min DECIMAL(3,1),
  rooms_max DECIMAL(3,1),
  rent_gross_max INTEGER,
  area_min INTEGER,
  
  -- Prioritäten
  outdoor_priority TEXT[],       -- ['garden', 'terrace', 'balcony'] in Reihenfolge
  must_haves TEXT[],             -- ['minergie', 'child_friendly']
  nice_to_haves TEXT[],          -- ['own_washer', 'lift', 'parking']
  
  -- Benachrichtigungen
  notify_email BOOLEAN DEFAULT TRUE,
  notify_push BOOLEAN DEFAULT FALSE,
  
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Tabelle: `scrape_sources`

```sql
CREATE TABLE scrape_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  name VARCHAR(100) NOT NULL,     -- 'homegate', 'flatfox', 'wbg_neuhaus', etc.
  tier INTEGER NOT NULL,          -- 1, 2, 3, 4
  type VARCHAR(50) NOT NULL,      -- 'portal', 'verwaltung', 'genossenschaft', 'other'
  base_url TEXT NOT NULL,
  scrape_url TEXT,                -- Konkrete URL zum Scrapen
  
  scrape_interval_minutes INTEGER DEFAULT 60,
  last_scraped_at TIMESTAMPTZ,
  last_error TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  
  notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Tabelle: `notifications`

```sql
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  listing_id UUID REFERENCES listings(id),
  
  type VARCHAR(20) NOT NULL,     -- 'new_listing', 'price_change', 'listing_removed'
  sent_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Deduplizierung

Gleiche Wohnungen erscheinen oft auf mehreren Portalen. Deduplizierung erfolgt über:

1. **Hash-basiert:** `dedup_hash = SHA256(normalized_address + rooms + area + rent_net)`
   - Adresse normalisieren: Kleinschreibung, Leerzeichen/Sonderzeichen bereinigen, "strasse" → "str", PLZ extrahieren
2. **Fuzzy-Match:** Bei Hash-Miss aber ähnlicher Adresse + ähnlichem Preis (±5%) → Kandidat prüfen
3. **Canonical-Eintrag:** Das Duplikat verweist via `canonical_id` auf den Ersteintrag. Alle Quell-URLs werden angezeigt.

---

## Scraping-Architektur

### Scraper-Module (je Quelle ein Modul)

```
/src/scrapers/
  ├── base-scraper.ts          -- Abstrakte Basisklasse
  ├── portals/
  │   ├── homegate.ts
  │   ├── immoscout24.ts
  │   ├── flatfox.ts
  │   └── newhome.ts
  ├── verwaltungen/
  │   ├── von-graffenried.ts
  │   ├── livit.ts
  │   ├── burgergemeinde-bern.ts
  │   ├── immobilien-stadt-bern.ts
  │   └── pvk-bern.ts
  ├── genossenschaften/
  │   ├── fambau.ts
  │   ├── ebg-bern.ts
  │   ├── wogeno.ts
  │   ├── wbg-neuhaus.ts
  │   └── wbg-murifeld.ts
  └── scheduler.ts             -- Cron-basierter Scheduler
```

### Scrape-Zyklus

1. **Scheduler** triggert Scraper gemäss `scrape_interval_minutes`
2. **Scraper** holt die Listings-Seite, extrahiert Inserate
3. **Parser** normalisiert die Daten in das `listings`-Schema
4. **Deduplicator** prüft ob das Inserat schon existiert
5. **Matcher** prüft ob ein Suchprofil matcht → ggf. Notification erstellen
6. **Updater** setzt `last_seen_at` für bekannte, `is_active = false` für verschwundene Inserate

### Intervalle

| Tier | Intervall | Begründung |
|---|---|---|
| Tier 1 (Portale) | Alle 60 Min. | Neue Inserate schnell erfassen |
| Tier 2 (Verwaltungen) | Alle 4 Std. | Weniger Inserate, weniger Änderungen |
| Tier 3 (Genossenschaften) | Alle 12 Std. | Sehr selten neue Inserate |

### Rate-Limiting & Ethik

- User-Agent klar identifizieren: `WohnungsRadar/1.0 (privat, nicht-kommerziell)`
- Max. 1 Request/Sekunde pro Domain
- robots.txt respektieren
- Keine Login-geschützten Inhalte scrapen
- Nur öffentlich zugängliche Inserate

---

## Frontend

### Seiten

1. **Dashboard** – Übersicht neue Inserate, Statistiken
2. **Listing-Suche/Filter** – Karte + Liste, Filter nach allen Kriterien
3. **Listing-Detail** – Alle Infos, Links zu allen Quellen, Bilder, Karte
4. **Suchprofil** – Kriterien konfigurieren
5. **Benachrichtigungen** – Liste aller Alerts
6. **Quellen-Status** – Admin: Welche Scraper laufen, letzte Fehler

### Listing-Karte

Alle Inserate auf einer Karte anzeigen (Leaflet/OpenStreetMap), farbcodiert:
- 🟢 Grün = Matcht Suchprofil vollständig
- 🟡 Gelb = Teilweise Match (z.B. Preis knapp drüber)
- ⚪ Grau = Ausserhalb Kriterien

### Listing-Score

Jedes Inserat bekommt einen Score basierend auf dem Suchprofil:
- Zimmer im Bereich: +20
- Preis im Budget: +20
- Garten vorhanden: +15
- Terrasse/grosser Balkon: +10
- Normaler Balkon: +5
- Minergie/gut isoliert: +10
- Kinderfreundliche Lage: +10
- Eigene Waschmaschine: +5
- Lift: +5
- Einstellplatz: +5

---

## MVP (Phase 1)

**Ziel:** Funktionierender Aggregator mit den 3 wichtigsten Portalen + Benachrichtigungen.

1. Supabase Setup (DB, Auth)
2. Backend mit Scraper-Framework + 3 Portal-Scraper (homegate, immoscout24, flatfox)
3. Deduplizierung
4. Einfaches React-Frontend (Liste + Filter + Detail)
5. E-Mail-Benachrichtigungen bei neuem Match
6. Deployment auf Render + GitHub

**Phase 2:** Verwaltungs-Websites (Tier 2) hinzufügen
**Phase 3:** Genossenschaften (Tier 3) + Karten-View + Scoring
**Phase 4:** Push-Notifications, erweiterte Filter, Statistiken

---

## Entwicklungshinweise für Claude Code

- Der Benutzer (Mathi) ist kein Programmierer – Code muss klar strukturiert und gut kommentiert sein
- Entwicklung erfolgt via Claude Code (Web) über GitHub
- Bevorzugt: Schritt-für-Schritt-Anweisungen, ein Feature nach dem anderen
- Backend zuerst deployen und testen, dann Frontend
- Supabase-Projekt muss zuerst manuell erstellt werden (Free Tier)
- Render-Deployment analog zum Ferienplaner-Projekt einrichten
- `.env`-Variablen für Supabase-URL, Supabase-Key, SMTP-Credentials
- TypeScript strict mode, ESLint aktiviert

---

## Offene Fragen / Entscheidungen

- [ ] Flatfox API: Hat eine relativ offene Struktur – prüfen ob es eine undokumentierte API gibt
- [ ] Homegate/ImmoScout24: Nutzen oft dynamisches Rendering (React/Angular) – evtl. Headless Browser nötig (Puppeteer)
- [ ] laos.io: Prüfen ob Integration möglich (API, RSS, oder nur als Link-Empfehlung)
- [ ] E-Mail-Service: Supabase Auth E-Mails vs. separater SMTP (z.B. Resend, Mailgun Free Tier)
- [ ] Hosting-Limits: Render Free Tier hat Spin-down nach 15 Min. Inaktivität – Cron-Jobs müssen das berücksichtigen
