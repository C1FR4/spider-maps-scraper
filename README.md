# Spider Maps Scraper - Perú · v2.0 Turbo 🕷️

[![English](https://img.shields.io/badge/Language-English-blue.svg)](README_EN.md)
[![Español](https://img.shields.io/badge/Idioma-Español-brightgreen.svg)](README.md)
![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-blue)
![Status](https://img.shields.io/badge/status-activo-brightgreen)
![Tests](https://img.shields.io/badge/tests-30%20passing-success)

> [🇺🇸 Read English Documentation](README_EN.md)

Herramienta de alto rendimiento para recolectar y enriquecer datos de contacto de negocios desde Google Maps. Diseñada para proyectos de prospección comercial, marketing B2B y logística, equipada con un **Panel de Control Web interactivo en tiempo real**, arquitectura modular y **motor Turbo**.

---

## 🚀 Novedades de la Versión 2.0 Turbo

- 🌐 **Panel Web Moderno (`http://localhost:3000`):** Configura categorías y distritos mediante etiquetas/chips interactivos, visualiza eventos en una consola en vivo y mira los prospectos aparecer en tiempo real mediante SSE (Server-Sent Events).
- ⚡ **Modo Turbo (HTTP Rápido 5x a 10x):** Peticiones optimizadas con cabeceras de navegador reales (`Sec-Ch-Ua`, rotación de `User-Agent`) erradicando bloqueos y errores 406/403.
- 🔍 **Modo Revisión Profunda:** Inspección completa con fallback inteligente para sitios dinámicos pesados o dependientes de renderizado cliente.
- 🛡️ **Anti-Detección Stealth:** Integración nativa con `puppeteer-extra-plugin-stealth` para evitar bloqueos por tráfico automatizado o captchas de Google Maps.
- 🔓 **Decodificador Cloudflare & Widgets:** Descifra correos protegidos con algoritmos XOR (`/cdn-cgi/l/email-protection` y `data-cfemail`), botones flotantes (Joinchat) y enlaces de WhatsApp (`wa.me`, `wa.link`).
- 📁 **Exportador Excel Integrado:** Botón directo en la tabla de prospectos para descargar el archivo `contactos.xlsx` estilizado con filtros automáticos.
- 🖱️ **Lanzador en un clic:** Archivo `iniciar.bat` para arrancar en Windows sin necesidad de abrir terminales manualmente.

---

## 📊 ¿Qué datos extrae?

| Campo | Origen | Descripción |
|---|---|---|
| **Nombre** | Google Maps | Nombre comercial limpio de caracteres especiales |
| **Categoría** | Búsqueda | Categoría asignada o definida por el usuario |
| **Valoración** | Google Maps | Calificación promedio (ej. 4.8) |
| **Dirección** | Google Maps | Ubicación física del local |
| **Teléfono Maps** | Google Maps | Teléfono verificado normalizado para Perú |
| **Teléfono Web** | Web del negocio | Números extraídos de cabeceras, pie de página o enlaces `tel:` |
| **WhatsApp** | Web del negocio | Enlaces directos a chats `wa.me` o widgets flotantes |
| **Correo** | Web del negocio | Correos corporativos (incluye decodificación de Cloudflare) |
| **Instagram** | Web / Maps | Handles y perfiles limpios de usuario |
| **Facebook** | Web / Maps | Fanpages de negocios filtradas |
| **TikTok** | Web / Maps | Perfiles oficiales de TikTok |
| **Web** | Google Maps | Sitio web oficial o red social principal |
| **URL Maps** | Google Maps | Enlace directo a la ficha del negocio |
| **Método** | Sistema | `maps` (solo ficha) o `maps+web` (enriquecido con sitio web) |
| **Estado** | Sistema | `OK`, `Sin web`, `Red social/agregador` o detalle de error |

---

## ⚙️ Arquitectura del Motor

```
[Usuario: Panel Web o CLI]
         │
         ▼
[Google Maps con Stealth Engine] ───► Extrae enlaces y fichas básicas
         │
         ▼
[Pool Concurrente de Pestañas] ────► Lectura paralela de detalles
         │
         ▼
[Motor de Enriquecimiento] ────────► Modo Turbo (HTTP Fetch) o Revisión Profunda
         │                           ├─ Cloudflare Email Decoder (XOR)
         │                           ├─ Extracción de WhatsApp y Redes Sociales
         │                           └─ Subpáginas (/contacto, /nosotros)
         │
         ▼
[Persistencia SQLite WAL] ─────────► Deduplicación automática (contactos.db)
         │
         ├─────────────────────────► Transmisión SSE en vivo a la Web
         └─────────────────────────► Generación de reporte Excel (contactos.xlsx)
```

---

## 📦 Instalación y Uso Rápido

### Requisitos
- **Node.js 18 o superior** instalado ([nodejs.org](https://nodejs.org/)).

### 1. Clonar e Instalar
```bash
# Clonar el repositorio
git clone https://github.com/C1FR4/spider-maps-scraper.git
cd spider-maps-scraper

# Instalar dependencias
npm install
```

### 2. Ejecutar

#### Opción A: Modo Web (Recomendado)
Inicia el servidor local y abre automáticamente tu navegador:
```bash
npm start
```
*O en Windows:* Simplemente haz doble clic en el archivo **`iniciar.bat`**.

Accede al panel en cualquier momento desde: **`http://localhost:3000`**

#### Opción B: Modo Terminal Clásico (CLI)
Si prefieres usar la consola interactiva original:
```bash
npm run cli
```

---

## 🧪 Pruebas Automatizadas

El proyecto cuenta con una suite completa de pruebas unitarias para validar sanitización de correos, números peruanos y decodificadores:

```bash
npm test
```
*Garantiza 30 tests unitarios pasando sin errores.*

---

## 🛠️ Configuración Avanzada (`config.json`)

Puedes personalizar parámetros generales editando `config.json`:

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

## 💡 Conceptos Clave de Clasificación

- **`OK`:** El negocio cuenta con página web accesible y fue inspeccionada exitosamente.
- **`Sin web`:** La ficha de Maps no tiene sitio web asociado.
- **`Red social/agregador`:** El negocio colocó un enlace directo a su Facebook, Instagram o Linktree como sitio web; el scraper lo clasifica en la columna adecuada sin forzar peticiones que puedan generar bloqueos.

---

## 📋 Resumen de Scripts

| Script | Descripción | Comando |
|---|---|---|
| `src/server.js` | Servidor Express con API REST, SSE y panel web | `npm start` |
| `scraper.js` | Scraper interactivo clásico para terminal | `npm run cli` |
| `check_db.js` | Inspección rápida por consola de los datos en SQLite | `node check_db.js` |
| `test/validadores.test.js`| Batería de tests unitarios de validación | `npm test` |

---

## ⚠️ Disclaimer

Este proyecto se proporciona con fines de investigación, desarrollo y optimización de flujos de datos. El scraping automatizado de plataformas web debe realizarse respetando las leyes de protección de datos aplicables y los términos de servicio correspondientes. Úsalo con responsabilidad.
