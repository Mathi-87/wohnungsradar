# WohnungsRadar

## Projektbeschreibung
WohnungsRadar ist eine Web-App die Mietwohnungsinserate aus verschiedenen Quellen
(Immobilienportale, Verwaltungs-Websites, Genossenschaften) in der Region Bern
aggregiert, dedupliziert und den Benutzer bei neuen Treffern benachrichtigt.

## Technologie
- Frontend: React + TypeScript (Vite)
- Backend: Node.js + TypeScript (Express)
- Datenbank: Supabase (PostgreSQL + Auth)
- Hosting: Render (Frontend = Static Site, Backend = Web Service)

## Projektstruktur
/backend          - Node.js API + Scraper-Module
/backend/src      - TypeScript Quellcode
/frontend         - React-App (Vite)
/frontend/src     - TypeScript/React Quellcode

## Spezifikation
Die vollständige Projekt-Spezifikation befindet sich in WohnungsRadar-SPEC.md.
Lies diese ZUERST bevor du mit der Entwicklung beginnst.

## Wichtige Regeln
- Immer TypeScript mit strict mode
- Code gut kommentieren (der Benutzer ist kein Programmierer)
- Scraper modular aufbauen (ein Modul pro Quelle)
- Umgebungsvariablen über .env (nie hardcoden)
- Supabase für alle DB-Operationen nutzen
- Bei Scraping: Rate-Limiting einhalten (max 1 Req/Sek pro Domain)
- robots.txt respektieren

## Entwicklungsreihenfolge (MVP)
1. Supabase DB-Schema aufsetzen (siehe SPEC)
2. Backend: Express-Server + Supabase-Client
3. Backend: Scraper-Framework (base-scraper.ts)
4. Backend: Flatfox-Scraper (am einfachsten, relativ offene Struktur)
5. Backend: Deduplizierung
6. Frontend: Grundgerüst mit Listing-Liste + Filter
7. Backend: Weitere Scraper (homegate, immoscout24)
8. E-Mail-Benachrichtigungen
