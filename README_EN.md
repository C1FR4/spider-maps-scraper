# Spider Maps Scraper - Perú · v2.1.0 Turbo 🕷️

[![English](https://img.shields.io/badge/Language-English-blue.svg)](README_EN.md)
[![Español](https://img.shields.io/badge/Idioma-Español-brightgreen.svg)](README.md)
![Node.js](https://img.shields.io/badge/Node.js-22.12%2B-339933?logo=node.js&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-blue)

> [English documentation available here](README_EN.md) 🇺🇸

---

High-performance tool for collecting and enriching business contact data from Google Maps. Designed for commercial prospecting, B2B marketing, and logistics, equipped with a **real-time interactive Web Control Panel**, modular architecture, and **Turbo engine**.

---

## What's New in Version 2.1.0

- Geographic verification for panel results using IGN district boundaries, with a separate review list for listings without coordinates.
- Search history, job retry, and input validation in the panel.
- Improvements to contact extraction, search reliability, and Excel downloads.

District boundaries are from the [Instituto Geográfico Nacional open data portal](https://www.datosabiertos.gob.pe/dataset/limites-departamentales). See [data sources and attribution](data/SOURCES.md).

---

## 🚀 What's New in Version 2.0 Turbo

- 🌐 **Modern Web Panel (`http://localhost:3000`):** Set categories and districts with interactive tags/chips, watch events in a live terminal, and see leads stream in real time using Server-Sent Events (SSE).
- ⚡ **Turbo Mode:** Fetches the business website over HTTP first and falls back to Chromium if the request fails.
- 🔍 **Deep Inspection Mode:** Full analysis with smart fallback for heavy or client-side dynamic websites.
- 🛡️ **Browser automation:** Chromium and `puppeteer-extra-plugin-stealth` help load Maps, but verification challenges and site changes may still interrupt extraction.
- 🔓 **Cloudflare Decoder & Widgets:** Decodes XOR-obfuscated emails (`/cdn-cgi/l/email-protection` and `data-cfemail`), floating buttons (Joinchat), and direct WhatsApp links (`wa.me`, `wa.link`).
- 📁 **Integrated Excel Exporter:** Each download creates a separate workbook in memory, including during a running search.
- 🖱️ **One-Click Launcher:** Windows `iniciar.bat` launcher to run without manually opening a terminal.

---

## 📊 Extracted Data

| Field | Source | Description |
|---|---|---|
| **Name** | Google Maps | Business trade name sanitized from special characters |
| **Category** | Search | Category assigned or defined by the user |
| **Rating** | Google Maps | Average rating score (e.g. 4.8) |
| **Address** | Google Maps | Physical venue address |
| **Maps Phone** | Google Maps | Verified phone number normalized for Peru |
| **Web Phone** | Business Web | Numbers extracted from headers, footers, or `tel:` links |
| **WhatsApp** | Business Web | Direct chat links (`wa.me`) or floating widgets |
| **Email** | Business Web | Corporate emails (includes Cloudflare decoding) |
| **Instagram** | Web / Maps | Clean profile handles |
| **Facebook** | Web / Maps | Filtered official business pages |
| **TikTok** | Web / Maps | Official TikTok accounts |
| **Website** | Google Maps | Official site or primary social profile |
| **Maps URL** | Google Maps | Direct Google Maps business listing URL |
| **Method** | Engine | `maps` (listing only) or `maps+web` (enriched via website) |
| **Status** | Engine | `OK`, `Sin web` (No website), `Red social/agregador` (Social network), or error detail |

---

## ⚙️ Engine Architecture

```
[User: Web Panel or CLI]
         │
         ▼
[Google Maps with Stealth Engine] ───► Extract listing links and basic info
         │
         ▼
[Concurrent Tab Pool] ───────────────► Parallel detail extraction
         │
         ▼
[Enrichment Engine] ─────────────────► Turbo Mode (HTTP Fetch) or Deep Inspection
         │                             ├─ Cloudflare XOR Email Decoder
         │                             ├─ WhatsApp & Social Media Extraction
         │                             └─ Subpage Crawling (/contact, /about)
         │
         ▼
[SQLite WAL Persistence] ────────────► Automatic deduplication (contactos.db)
         │
         ├───────────────────────────► Real-time SSE streaming to Web UI
         └───────────────────────────► Excel report generation (contactos.xlsx)
```

---

## 📦 Quick Installation and Usage

### Prerequisites
- **Node.js 22.12 or higher** and npm. Node 22 LTS is recommended. The installed Puppeteer and Cheerio versions require a newer runtime than Node 18.
- Windows 10/11, macOS or Linux. Puppeteer downloads its own Chrome during installation.

### 1. Clone and Install
```bash
# Clone the repository
git clone https://github.com/C1FR4/spider-maps-scraper.git
cd spider-maps-scraper

# Install dependencies
npm ci
```

If Puppeteer cannot find Chrome, run `npx puppeteer browsers install chrome` and restart. Installation requires Internet access.

On Windows, `better-sqlite3` may need a local build when no compatible binary is available. For **`node-gyp`**, **`MSBuild`**, or **`C++`** errors, install **Visual Studio Build Tools 2022** with *Desktop development with C++* (MSVC and Windows SDK) plus Python 3. Open a new terminal and rerun `npm ci`. Node 22 LTS is less likely to require a local build.

### 2. Run

#### Option A: Web Mode (Recommended)
Starts the local server and automatically launches your browser:
```bash
npm start
```
*On Windows:* You can simply double-click **`iniciar.bat`**.

Access the control panel anytime at: **`http://localhost:3000`**

Confirm each category or district with **Enter or comma**. Spaces remain part of names such as `San Isidro` or `dental clinic`. The panel previews the number of searches; the limit is 100 combinations per run. Previous searches can be run again, and existing businesses are deduplicated. Maps records are kept if website enrichment fails; progress and incidents are restored when the panel reloads.

The panel stores recent runs in SQLite. **Retry** runs only combinations that were pending or had incidents; deduplication prevents existing businesses from being saved twice. **New Session** clears both records and run history after confirmation.

#### Option B: Classic Terminal Mode (CLI)
If you prefer running via the original interactive terminal:
```bash
npm run cli
```

---

## 🧪 Automated Testing

The normal suite tests data validation and concurrent Excel downloads without visiting Maps or changing `contactos.db`:

```bash
npm test
```
Run `npm run doctor` to check Node, native SQLite, Chrome, and write permissions after cloning. For a browser UI check without querying Maps, start a test server with a separate database and run `npm run test:ui` with `UI_TEST_URL` set to its address (default: `http://127.0.0.1:3001/`).
The real Maps test is separate: `npm run test:live`. It launches Chromium, searches Maps and writes to the configured database.

### Troubleshooting

| Symptom | Check |
|---|---|
| `Could not find Chrome` | Run `npx puppeteer browsers install chrome`. |
| `node-gyp`, `MSBuild`, or `C++` during installation | Use Node 22 LTS; if needed, install Visual Studio Build Tools and Python 3. |
| Maps requests verification or shows no result list | Check connectivity, reduce the number of searches, and retry later. Maps selectors can change. |
| A website returns 403/406 or times out | The engine tries Chromium; if that fails, the Maps listing remains and the status shows the error. |
| Excel download fails | Check the server terminal. Downloads are generated in memory; SQLite records remain available. |

---

## 🛠️ Advanced Configuration (`config.json`)

You can customize runtime parameters by editing `config.json`:

```json
{
  "archivoExcel": "contactos.xlsx",
  "maxResultadosPorBusqueda": 50,
  "esperaMsEntreBusquedas": 3000,
  "concurrencia": 6,
  "concurrenciaFichas": 3,
  "palabrasContacto": ["contacto", "contactenos", "ubicacion", "locales"]
}
```

---

## 💡 Status Definitions

- **`OK`:** The business has an accessible website that was inspected successfully.
- **`Sin web`:** No website link is listed on the Google Maps profile.
- **`Red social/agregador`:** The business used a direct link to Facebook, Instagram, or Linktree as their primary website; the scraper organizes it into the correct column without triggering bot protections.

---

## 📋 Available Scripts

| Script | Description | Command |
|---|---|---|
| `src/server.js` | Express server with REST API, SSE, and Web Panel | `npm start` |
| `scraper.js` | Classic interactive CLI scraper | `npm run cli` |
| `check_db.js` | Fast console viewer for SQLite stored records | `node check_db.js` |
| `test/*.test.js` | Unit and export tests | `npm test` |
| `test/prueba_funcional.js` | Real Maps test; writes to the configured database | `npm run test:live` |

---

## ⚠️ Disclaimer

This tool is provided for educational, research, and data automation purposes. Scraping web platforms must comply with applicable data protection regulations and platform terms of service. Use responsibly.
