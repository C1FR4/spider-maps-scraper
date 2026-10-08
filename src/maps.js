const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");

puppeteer.use(StealthPlugin());

const SELECTORES_MAPS = {
  nombre: "h1",
  telefonoBoton: 'button[data-item-id^="phone"]',
  direccionBoton: 'button[data-item-id="address"]',
  webEnlace: 'a[data-item-id="authority"]',
  categoriaBoton: 'button[jsaction*="category"]',
  categoriaFallback: ".DkEaL",
  valoracion: ".F7nice span",
};

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
];

function uaAleatorio() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

async function configurarPagina(page) {
  await page.setUserAgent(uaAleatorio());
  await page.setViewport({ width: 1280, height: 800 });
  await page.setRequestInterception(true);

  page.on("request", (req) => {
    const type = req.resourceType();
    if (["image", "media", "font"].includes(type)) {
      req.abort();
    } else {
      req.continue();
    }
  });
}

async function descartarBannerCookies(page) {
  try {
    const btn = await page.$(
      'button[aria-label*="Aceptar todo"], button[aria-label*="Accept all"], form[action*="consent"] button'
    );
    if (btn) {
      await btn.click();
      await new Promise((r) => setTimeout(r, 1000));
    }
  } catch (_) {}
}

async function iniciarNavegador(headless = true) {
  return await puppeteer.launch({
    headless: headless ? "new" : false,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--no-zygote",
      "--lang=es-PE",
      "--window-size=1280,800",
    ],
  });
}

async function crearPool(browser, n = 3) {
  const paginas = [];
  for (let i = 0; i < n; i++) {
    const p = await browser.newPage();
    await configurarPagina(p);
    paginas.push(p);
  }

  const libres = [...paginas];
  const cola = [];

  function obtener() {
    if (libres.length > 0) return Promise.resolve(libres.pop());
    return new Promise((resolve) => cola.push(resolve));
  }

  function liberar(p) {
    const sig = cola.shift();
    if (sig) sig(p);
    else libres.push(p);
  }

  async function destruir() {
    for (const p of paginas) {
      await p.close().catch(() => {});
    }
  }

  return { obtener, liberar, destruir };
}

async function extraerFichaNegocio(pagina, enlace) {
  try {
    await pagina.goto(enlace, { waitUntil: "domcontentloaded", timeout: 16000 });
    await descartarBannerCookies(pagina);
    await pagina.waitForSelector(SELECTORES_MAPS.nombre, { timeout: 6000 }).catch(() => {});

    const datos = await pagina.evaluate((sel) => {
      const txt = (s) => document.querySelector(s)?.textContent?.trim() || "";
      const nombre = txt(sel.nombre);

      let telefono = "";
      const btnTelefono = document.querySelector(sel.telefonoBoton);
      if (btnTelefono) {
        telefono = btnTelefono.getAttribute("aria-label")?.replace(/^Teléfono:\s*/i, "") || "";
      }
      if (!telefono) {
        const btnGenerico = [...document.querySelectorAll("button[aria-label]")].find((btn) => {
          const label = btn.getAttribute("aria-label") || "";
          return /^\+?[\d\s\-().]{7,}$/.test(label.trim());
        });
        if (btnGenerico) telefono = btnGenerico.getAttribute("aria-label").trim();
      }

      let direccion = "";
      document.querySelectorAll(sel.direccionBoton).forEach((btn) => {
        direccion = btn.getAttribute("aria-label")?.replace(/^Dirección:\s*/i, "") || "";
      });

      let web = "";
      document.querySelectorAll(sel.webEnlace).forEach((a) => {
        web = a.href || "";
      });
      if (!web) {
        document.querySelectorAll("a[aria-label]").forEach((a) => {
          if (/sitio web/i.test(a.getAttribute("aria-label") || "")) web = a.href;
        });
      }

      const categoria =
        txt(sel.categoriaBoton) ||
        document.querySelector(sel.categoriaFallback)?.textContent?.trim() ||
        "";

      const valoracion = (() => {
        const raw = txt(sel.valoracion) || txt('[aria-label*="estrellas"]') || "";
        const m = raw.match(/\d+(?:[.,]\d+)?/);
        if (!m) return "";
        const v = parseFloat(m[0].replace(",", "."));
        return v > 0 && v <= 5 ? String(v) : "";
      })();

      return { nombre, telefono, direccion, web, categoria, valoracion };
    }, SELECTORES_MAPS);

    if (datos.nombre) {
      return { ...datos, urlMaps: enlace };
    }
    return null;
  } catch (err) {
    return null;
  }
}

/**
 * Busca negocios en Google Maps y recolecta las URLs de sus fichas
 */
async function buscarEnlacesEnMaps(termino, browser, maxResultados = 30, onLog = null) {
  const log = (msg) => onLog && onLog(msg);
  const page = await browser.newPage();
  await configurarPagina(page);

  try {
    const url = `https://www.google.com/maps/search/${encodeURIComponent(termino)}`;
    log(`Navegando en Google Maps: "${termino}"`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await descartarBannerCookies(page);

    // Caso de resultado único: si redirige directamente a /maps/place/...
    const currentUrl = page.url();
    if (currentUrl.includes("/maps/place/")) {
      log(`Detectado negocio único directo.`);
      return [currentUrl];
    }

    // Esperar al panel de resultados o lista
    await page.waitForSelector('[role="feed"]', { timeout: 14000 }).catch(() => {});

    let prevCount = 0;
    let sameCount = 0;
    const maxIteraciones = Math.ceil(maxResultados / 3) + 2;

    for (let s = 0; s < maxIteraciones; s++) {
      const enlacesActuales = await page.$$eval('a[href*="/maps/place/"]', (els) =>
        [...new Set(els.map((a) => a.href).filter((h) => h.includes("/maps/place/")))]
      );

      if (enlacesActuales.length === prevCount) sameCount++;
      else sameCount = 0;
      prevCount = enlacesActuales.length;

      if (enlacesActuales.length >= maxResultados) break;
      if (sameCount >= 3) break;

      await page.evaluate(() => {
        const panel = document.querySelector('[role="feed"]');
        if (panel) panel.scrollBy(0, 2400);
      });
      await new Promise((r) => setTimeout(r, 900));
    }

    const enlaces = await page.$$eval('a[href*="/maps/place/"]', (els) =>
      [...new Set(els.map((a) => a.href).filter((h) => h.includes("/maps/place/")))]
    );

    log(`Encontrados ${enlaces.length} negocios en Maps.`);
    return enlaces.slice(0, maxResultados);
  } finally {
    await page.close().catch(() => {});
  }
}

module.exports = {
  iniciarNavegador,
  crearPool,
  buscarEnlacesEnMaps,
  extraerFichaNegocio,
};
