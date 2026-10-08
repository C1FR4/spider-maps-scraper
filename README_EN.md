# Spider Maps Scraper - Perú · v2.0 Turbo 🕷️

[![English](https://img.shields.io/badge/Language-English-blue.svg)](README_EN.md)
[![Español](https://img.shields.io/badge/Idioma-Español-brightgreen.svg)](README.md)
![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-blue)
![Tests](https://img.shields.io/badge/tests-30%20passing-success)

> [English documentation available here](README_EN.md) 🇺🇸

---

High-performance tool for collecting and enriching business contact data from Google Maps. Designed for commercial prospecting, B2B marketing, and logistics, equipped with a **real-time interactive Web Control Panel**, modular architecture, and **Turbo engine**.

---

## 🚀 What's New in Version 2.0 Turbo

- 🌐 **Modern Web Panel (`http://localhost:3000`):** Set categories and districts with interactive tags/chips, watch events in a live terminal, and see leads stream in real time using Server-Sent Events (SSE).
- ⚡ **Turbo Mode (Fast HTTP 5x to 10x):** Optimized requests with real browser headers (`Sec-Ch-Ua`, rotating `User-Agent`) preventing blocks and 406/403 errors.
- 🔍 **Deep Inspection Mode:** Full analysis with smart fallback for heavy or client-side dynamic websites.
- 🛡️ **Stealth Anti-Detection:** Native integration with `puppeteer-extra-plugin-stealth` to prevent automated traffic blocks and Google Maps captchas.
- 🔓 **Cloudflare Decoder & Widgets:** Decodes XOR-obfuscated emails (`/cdn-cgi/l/email-protection` and `data-cfemail`), floating buttons (Joinchat), and direct WhatsApp links (`wa.me`, `wa.link`).
- 📁 **Integrated Excel Exporter:** Instant download button in the leads table for styled, auto-filtered `contactos.xlsx` spreadsheets.
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
- **Node.js 18 or higher** ([nodejs.org](https://nodejs.org/)).

### 1. Clone and Install
```bash
# Clone the repository
git clone https://github.com/C1FR4/spider-maps-scraper.git
cd spider-maps-scraper

# Install dependencies
npm install
```

### 2. Run

#### Option A: Web Mode (Recommended)
Starts the local server and automatically launches your browser:
```bash
npm start
```
*On Windows:* You can simply double-click **`iniciar.bat`**.

Access the control panel anytime at: **`http://localhost:3000`**

#### Option B: Classic Terminal Mode (CLI)
If you prefer running via the original interactive terminal:
```bash
npm run cli
```

---

## 🧪 Automated Testing

Includes a full unit test suite for email sanitization, phone validation, and decoders:

```bash
npm test
```
*Guarantees 30 unit tests passing without errors.*

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
| `test/validadores.test.js`| Automated unit test suite | `npm test` |

---

## ⚠️ Disclaimer

This tool is provided for educational, research, and data automation purposes. Scraping web platforms must comply with applicable data protection regulations and platform terms of service. Use responsibly.
