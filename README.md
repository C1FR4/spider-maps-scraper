# Spider Maps Scraper - Perú · v2.1.0 Turbo 🕷️

[![English](https://img.shields.io/badge/Language-English-blue.svg)](README_EN.md)
[![Español](https://img.shields.io/badge/Idioma-Español-brightgreen.svg)](README.md)
![Node.js](https://img.shields.io/badge/Node.js-22.12%2B-339933?logo=node.js&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-blue)
![Status](https://img.shields.io/badge/status-activo-brightgreen)

> [🇺🇸 Read English Documentation](README_EN.md)

Herramienta de alto rendimiento para recolectar y enriquecer datos de contacto de negocios desde Google Maps. Diseñada para proyectos de prospección comercial, marketing B2B y logística, equipada con un **Panel de Control Web interactivo en tiempo real**, arquitectura modular y **motor Turbo**.

---

## Novedades de la versión 2.1.0

- Verificación geográfica de resultados del panel con límites distritales del IGN y revisión separada de fichas sin coordenadas.
- Historial de búsquedas, reintento de trabajos y validación de entradas en el panel.
- Mejoras en la extracción de contactos, la estabilidad de las búsquedas y la descarga del Excel.

---

## 🚀 Novedades de la Versión 2.0 Turbo

- 🌐 **Panel Web Moderno (`http://localhost:3000`):** Configura categorías y distritos mediante etiquetas/chips interactivos, visualiza eventos en una consola en vivo y mira los prospectos aparecer en tiempo real mediante SSE (Server-Sent Events).
- ⚡ **Modo Turbo:** Primero consulta la web del negocio por HTTP y, si falla, intenta abrirla en Chromium.
- 🔍 **Modo Revisión Profunda:** Inspección completa con fallback inteligente para sitios dinámicos pesados o dependientes de renderizado cliente.
- 🛡️ **Navegador automatizado:** Chromium y `puppeteer-extra-plugin-stealth` ayudan a cargar Maps; una verificación o cambio de la página todavía puede interrumpir la extracción.
- 🔓 **Decodificador Cloudflare & Widgets:** Descifra correos protegidos con algoritmos XOR (`/cdn-cgi/l/email-protection` y `data-cfemail`), botones flotantes (Joinchat) y enlaces de WhatsApp (`wa.me`, `wa.link`).
- 📁 **Exportador Excel Integrado:** Descarga un `.xlsx` completo desde el panel, incluso mientras se ejecuta una búsqueda. Cada descarga se genera por separado.
- 🖱️ **Lanzador en un clic:** Archivo `iniciar.bat` para arrancar en Windows sin necesidad de abrir terminales manualmente.

---

## 📊 ¿Qué datos extrae?

| Campo | Origen | Descripción |
|---|---|---|
| **Nombre** | Google Maps | Nombre comercial limpio de caracteres especiales |
| **Categoría** | Búsqueda | Etiqueta introducida por el usuario; no representa necesariamente la categoría real de la ficha en Maps |
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
- **Node.js 22.12 o superior** y npm. Recomiendo Node 22 LTS. Las versiones instaladas de Puppeteer y Cheerio requieren una versión más reciente que Node 18.
- Windows 10/11, macOS o Linux. Puppeteer instala su propio navegador Chrome durante `npm ci`.

### 1. Clonar e Instalar
```bash
# Clonar el repositorio
git clone https://github.com/C1FR4/spider-maps-scraper.git
cd spider-maps-scraper

# Instalar exactamente las versiones del package-lock.json
npm ci
```

Si Puppeteer indica que no encuentra Chrome, ejecuta `npx puppeteer browsers install chrome` y vuelve a iniciar el programa. La instalación necesita conexión a Internet.

En Windows, `better-sqlite3` puede intentar compilarse si no existe un binario compatible con tu combinación de Node y sistema. Si aparece un error de **`node-gyp`**, **`MSBuild`** o **`C++`**, instala **Visual Studio Build Tools 2022** con la carga *Desktop development with C++* (MSVC y Windows SDK) y Python 3. Después abre una terminal nueva y repite `npm ci`. Usar Node 22 LTS reduce la probabilidad de necesitar compilación local.

### 2. Ejecutar

#### Opción A: Modo Web (Recomendado)
Inicia el servidor local y abre automáticamente tu navegador:
```bash
npm start
```
*O en Windows:* Simplemente haz doble clic en el archivo **`iniciar.bat`**.

Accede al panel en cualquier momento desde: **`http://localhost:3000`**

Escribe categorías y distritos y confirma cada etiqueta con **Enter o coma**. Los espacios forman parte del nombre, por ejemplo `San Isidro` o `clínica dental`. El panel muestra cuántas combinaciones se ejecutarán y acepta hasta 100 por ejecución. Puedes volver a ejecutar una búsqueda anterior; los negocios ya registrados se deduplican. Si una web falla, la ficha obtenida de Maps se conserva. El progreso y las incidencias de la ejecución se recuperan al recargar el panel.

**Cómo interpretar los resultados:** el panel busca en Google Maps con la categoría y la zona que ingresas y recopila las fichas que Maps muestra, hasta el límite de resultados elegido y siempre que pasen la verificación geográfica descrita abajo. No aplica un filtro por la categoría real de la ficha. La columna **Categoría** conserva tu término de búsqueda: si buscas `bodegas`, Maps también puede mostrar cafeterías, bares u otros negocios. Si aparecen resultados no deseados, prueba una categoría más específica (por ejemplo, `tienda de abarrotes`) y precisa el distrito o provincia. Una búsqueda más concreta puede reducir resultados ajenos, aunque Maps no garantiza una coincidencia exacta.

El panel guarda las últimas ejecuciones en SQLite. Cuando una búsqueda queda pendiente o presenta incidencias, el botón **Reintentar** lanza solo esas combinaciones; la deduplicación evita volver a guardar negocios existentes. **Nueva Sesión** borra tanto los negocios como el historial después de pedir confirmación.

#### Opción B: Modo Terminal Clásico (CLI)
Si prefieres usar la consola interactiva original:
```bash
npm run cli
```

---

## 🧪 Pruebas Automatizadas

La suite normal valida extracción de datos y descargas simultáneas de Excel sin consultar Maps ni modificar `contactos.db`:

```bash
npm test
```
Para revisar Node, SQLite nativo, Chrome y permisos después de clonar el repositorio, ejecuta `npm run doctor`.

Para comprobar la interfaz con Chromium sin consultar Maps, inicia un servidor de prueba con una base separada y ejecuta `npm run test:ui` con `UI_TEST_URL` apuntando a ese servidor. El valor predeterminado es `http://127.0.0.1:3001/`.
La prueba real de Maps se ejecuta **por separado** con `npm run test:live`. Abre Chromium, consulta Maps y guarda registros en la base de datos configurada.

### Si algo falla

| Mensaje o síntoma | Qué revisar |
|---|---|
| `Could not find Chrome` | Ejecuta `npx puppeteer browsers install chrome`. |
| `node-gyp`, `MSBuild` o `C++` durante `npm ci` | Comprueba Node 22 LTS; si persiste, instala Visual Studio Build Tools y Python 3. |
| Maps pide verificación o no muestra resultados | Revisa la conexión, prueba menos combinaciones y vuelve a intentarlo más tarde. Los selectores de Maps pueden cambiar. |
| Una web devuelve 403, 406 o tarda demasiado | El motor intenta cargarla con Chromium; si también falla, conserva la ficha de Maps y muestra el error en `Estado`. |
| No se descarga Excel | Consulta la terminal donde corre el servidor. La descarga se genera en memoria y los datos permanecen en SQLite. |

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
| `test/*.test.js` | Pruebas unitarias y de exportación | `npm test` |
| `test/prueba_funcional.js` | Prueba real con Maps; modifica la base configurada | `npm run test:live` |

---

## Filtro geográfico del panel web

Las búsquedas del panel usan límites locales de Perú y de sus distritos. Se añade «Perú» a la consulta de Maps; después, cada URL con coordenadas se contrasta con el distrito o provincia elegido **antes de abrir la ficha y su sitio web**. Los resultados de otro país o de otra zona se cuentan en el resumen y se omiten. El máximo de resultados corresponde a candidatos dentro de la zona, por lo que el panel puede seguir desplazando la lista de Maps si encuentra resultados fuera de ella.

Escribe un distrito, o `distrito / provincia / departamento` cuando haya nombres repetidos; también se acepta el nombre de una provincia. Las sugerencias rápidas de Lima ya incluyen provincia y departamento. Si Maps no proporciona coordenadas ni siquiera al abrir la ficha, esta queda en la tabla de revisión, visible en el enlace «Ver fichas con ubicación por verificar» del panel y en `/api/geography/pending`; no entra al Excel. Los registros antiguos de la base de datos se conservan como estaban. El filtro geográfico se aplica a las búsquedas iniciadas desde el panel web.

Los límites se incluyen en `data/`, así que la verificación no necesita una API por negocio. `node scripts/import-geo.js` regenera los archivos desde las fuentes fijadas. El límite nacional procede de [geoBoundaries](https://www.geoboundaries.org/api.html) y los distritos de la [capa oficial de límites distritales del Instituto Geográfico Nacional](https://www.datosabiertos.gob.pe/dataset/limites-departamentales). La capa distrital se simplificó para reducir su tamaño y puede ser imprecisa junto a las fronteras. Consulta [la procedencia y atribución de los datos](data/SOURCES.md).

---

## ⚠️ Disclaimer

Este proyecto se proporciona con fines de investigación, desarrollo y optimización de flujos de datos. El scraping automatizado de plataformas web debe realizarse respetando las leyes de protección de datos aplicables y los términos de servicio correspondientes. Úsalo con responsabilidad.
