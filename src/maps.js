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
  const sinSandbox = process.env.SPIDER_DISABLE_SANDBOX === "1";
  return await puppeteer.launch({
    headless: headless ? "new" : false,
    args: [
      ...(sinSandbox ? ["--no-sandbox", "--disable-setuid-sandbox"] : []),
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

async function extraerFichaNegocio(pagina, enlace, onLog = null) {
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
    if (onLog) onLog(`No se pudo leer una ficha de Maps (${new URL(enlace).pathname}): ${err.message}`);
    return null;
  }
}

/**
 * Busca negocios en Google Maps y recolecta las URLs de sus fichas
 */
async function buscarEnlacesEnMaps(termino, browser, maxResultados = 30, onLog = null, aceptarEnlace = () => true, debeDetenerse = () => false, pausaMs = 900) {
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
      const enlaces = aceptarEnlace(currentUrl) ? [currentUrl] : [];
      return { enlaces, vistos: 1, motivo: enlaces.length >= maxResultados ? "objetivo" : "fin_lista" };
    }

    // Esperar al panel de resultados o lista
    const tieneLista = await page.waitForSelector('[role="feed"]', { timeout: 14000 }).then(() => true).catch(() => false);
    if (!tieneLista) {
      const texto = await page.evaluate(() => document.body?.innerText?.slice(0, 1200) || "");
      if (/unusual traffic|tráfico inusual|captcha|verify you are human|verifica que eres humano/i.test(texto)) {
        throw new Error("Google Maps solicitó una verificación. Intenta más tarde o reduce el ritmo de búsqueda.");
      }
      throw new Error("Google Maps no mostró la lista de resultados. Revisa la conexión y prueba otra búsqueda.");
    }

    let sameCount = 0;
    const encontrados = new Set();
    const aceptados = [];
    const maxIteraciones = Math.max(80, maxResultados * 2 + 30);
    const limiteTiempo = Date.now() + 20 * 60 * 1000;
    let motivo = "limite_recorrido";
    const recolectar = async () => {
      const enlacesActuales = await page.$$eval('a[href*="/maps/place/"]', (els) =>
        [...new Set(els.map((a) => a.href).filter((h) => h.includes("/maps/place/")))]
      );
      let nuevos = 0;
      for (const enlace of enlacesActuales) {
        if (encontrados.has(enlace)) continue;
        encontrados.add(enlace);
        nuevos++;
        if (aceptarEnlace(enlace)) aceptados.push(enlace);
      }
      return nuevos;
    };

    for (let s = 0; s < maxIteraciones; s++) {
      if (debeDetenerse()) { motivo = "detenido"; break; }
      if (Date.now() >= limiteTiempo) { motivo = "limite_tiempo"; break; }
      const nuevos = await recolectar();
      sameCount = nuevos ? 0 : sameCount + 1;
      if (aceptados.length >= maxResultados) { motivo = "objetivo"; break; }
      if (sameCount >= 5) { motivo = "sin_nuevos"; break; }
      if (s > 0 && s % 25 === 0) log(`Maps: ${aceptados.length}/${maxResultados} fichas en zona; ${encontrados.size} enlaces revisados.`);

      await page.evaluate(() => {
        const panel = document.querySelector('[role="feed"]');
        if (panel) panel.scrollBy(0, 2400);
      });
      if (pausaMs > 0) await new Promise((r) => setTimeout(r, pausaMs));
    }

    if (motivo !== "detenido") await recolectar();
    const enlaces = aceptados.slice(0, maxResultados);
    if (enlaces.length >= maxResultados) motivo = "objetivo";
    log(`Maps: ${encontrados.size} enlaces revisados, ${enlaces.length}/${maxResultados} candidatos en zona (${motivo}).`);
    return { enlaces, vistos: encontrados.size, motivo };
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
