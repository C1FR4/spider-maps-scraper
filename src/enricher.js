const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");
const {
  extraerUsuarioInstagram,
  esTelefonoValido,
  normalizarTelefonoPe,
  esCorreoValido,
  extraerNumeroDeWhatsApp,
  esUrlWhatsApp,
  decodificarCloudflareEmail,
  decodificarEntidadesHtml,
} = require("../lib/validadores");

const CONFIG_PATH = path.join(__dirname, "..", "config.json");
let CONFIG = {
  palabrasContacto: [
    "contacto",
    "contactenos",
    "contact",
    "contactus",
    "ubicacion",
    "ubicaciones",
    "locales",
    "tiendas",
    "sucursales",
  ],
  agregadoresLinkInBio: [
    "linktr.ee",
    "beacons.ai",
    "linkin.bio",
    "bio.link",
    "solo.to",
    "lnk.bio",
    "allmylinks.com",
  ],
  umbralTextoUtil: 300,
};

if (fs.existsSync(CONFIG_PATH)) {
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
    CONFIG = { ...CONFIG, ...raw };
  } catch (_) {}
}

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0",
];

function uaAleatorio() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

const REGEX_EMOJI =
  /[\u{1F000}-\u{1FFFF}]|[\u{2600}-\u{27FF}]|[\u{2B00}-\u{2BFF}]|[\u{FE00}-\u{FEFF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FA9F}]|[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]/gu;

const REGEX = {
  telefono: /(\+?51[\s\-]?)?(9\d{8}|\d{7,8})\b/g,
  correo: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g,
};

const DOMINIOS_AGREGADORES = (CONFIG.agregadoresLinkInBio || []).map((d) => d.toLowerCase());

function esRedSocialOAgregador(url) {
  if (!url) return false;
  const partes = [
    "facebook\\.com",
    "instagram\\.com",
    "tiktok\\.com",
    "wa\\.me",
    "wa\\.link",
    ...DOMINIOS_AGREGADORES.map((d) => d.replace(/\./g, "\\.")),
  ].filter(Boolean);
  return new RegExp(partes.join("|"), "i").test(url);
}

function limpiarTexto(texto) {
  if (!texto || texto === "—") return texto;
  return (
    texto
      .replace(REGEX_EMOJI, "")
      .replace(/[\u00AD\u200B\u200C\u200D\uFEFF]/g, "")
      .replace(/\s+/g, " ")
      .trim() || "—"
  );
}

function textoLimpio($) {
  const bloques = "p,div,li,td,th,h1,h2,h3,h4,h5,h6,br,tr,section,article,header,footer,nav,aside";
  $(bloques).each((_, el) => $(el).append(" "));
  return $("body").text().replace(/\s+/g, " ").trim();
}

/**
 * Petición HTTP rápida con cabeceras de navegador reales para erradicar errores 406/403.
 */
async function fetchRapido(url, timeoutMs = 9000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": uaAleatorio(),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "es-PE,es;q=0.9,en-US;q=0.8,en;q=0.7",
        "Accept-Encoding": "gzip, deflate, br",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
        "Sec-Ch-Ua": '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"Windows"',
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
      },
    });

    clearTimeout(timer);

    if (!res.ok) {
      await res.body?.cancel().catch(() => {});
      throw new Error(`HTTP ${res.status}`);
    }

    const html = await res.text();
    return html;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

/**
 * Decodifica y extrae correos, incluyendo protección Cloudflare y entidades HTML.
 */
function extraerCorreos($, textoVisible, htmlOriginal = "") {
  const correos = new Set();
  const textoSanitizado = decodificarEntidadesHtml(
    textoVisible.replace(/[\u00AD\u200B\u200C\u200D\uFEFF]/g, "").replace(/\s+/g, " ")
  );

  // 1. Decodificar correos ofuscados por Cloudflare en atributos data-cfemail
  $("[data-cfemail]").each((_, el) => {
    const cf = $(el).attr("data-cfemail");
    const dec = decodificarCloudflareEmail(cf);
    if (dec && esCorreoValido(dec)) correos.add(dec.toLowerCase());
  });

  // 2. Enlaces /cdn-cgi/l/email-protection#HEX
  $('a[href*="/cdn-cgi/l/email-protection#"]').each((_, el) => {
    const href = $(el).attr("href") || "";
    const hex = href.split("#")[1];
    const dec = decodificarCloudflareEmail(hex);
    if (dec && esCorreoValido(dec)) correos.add(dec.toLowerCase());
  });

  // 3. mailto: links
  $("a[href^='mailto:']").each((_, el) => {
    const href = $(el).attr("href") || "";
    const correo = decodificarEntidadesHtml(href.replace(/^mailto:/i, "").split("?")[0].trim().toLowerCase());
    if (correo && esCorreoValido(correo)) correos.add(correo);
  });

  // 4. Texto visible y texto en anchors
  const matches = textoSanitizado.match(REGEX.correo) || [];
  for (const m of matches) {
    const c = m.toLowerCase();
    if (esCorreoValido(c)) correos.add(c);
  }

  return [...correos].slice(0, 5).join(" | ");
}

/**
 * Extrae teléfonos de la web y widgets flotantes.
 */
function extraerTelefonosWeb($, textoVisible) {
  const telefonosEncontrados = new Set();

  $("a[href^='tel:']").each((_, el) => {
    const href = $(el).attr("href") || "";
    const tel = href.replace(/^tel:/i, "").trim();
    const digitos = tel.replace(/\D/g, "");
    if (digitos.length >= 7) telefonosEncontrados.add(normalizarTelefonoPe(digitos));
  });

  $("a[href]").each((_, el) => {
    const href = ($(el).attr("href") || "").trim();
    if (!esUrlWhatsApp(href)) return;
    const numero = extraerNumeroDeWhatsApp(href);
    if (numero.length >= 7) telefonosEncontrados.add(normalizarTelefonoPe(numero));
  });

  // Atributos de widgets flotantes (Joinchat, WhatsApp buttons)
  $("[data-phone], [data-whatsapp], [data-tel], [data-number]").each((_, el) => {
    const raw = $(el).attr("data-phone") || $(el).attr("data-whatsapp") || $(el).attr("data-tel") || $(el).attr("data-number") || "";
    const dig = raw.replace(/\D/g, "");
    if (dig.length >= 7) telefonosEncontrados.add(normalizarTelefonoPe(dig));
  });

  const matches = textoVisible.match(REGEX.telefono) || [];
  matches.forEach((t) => {
    const digitos = normalizarTelefonoPe(t.replace(/\D/g, ""));
    telefonosEncontrados.add(digitos);
  });

  const validos = [...telefonosEncontrados].filter(esTelefonoValido);
  return [...new Set(validos)].slice(0, 3).join(" | ");
}

/**
 * Extrae WhatsApp, Instagram, Facebook y TikTok.
 */
function extraerRedesSociales($, htmlOriginal = "") {
  const redes = {
    WhatsApp: new Set(),
    Instagram: new Set(),
    Facebook: new Set(),
    TikTok: new Set(),
    fuente: { Instagram: "", Facebook: "", TikTok: "" },
  };

  const procesarUrl = (url, fuenteTipo = "sameAs") => {
    if (!url) return;
    url = url.split("?")[0].split("#")[0].replace(/\/+$/, "");
    if (/instagram\.com\//i.test(url)) {
      const u = extraerUsuarioInstagram(url);
      if (u) {
        redes.Instagram.add(`instagram.com/${u}`);
        if (!redes.fuente.Instagram) redes.fuente.Instagram = fuenteTipo;
      }
    } else if (
      /facebook\.com\//i.test(url) &&
      !/sharer|login|recover|\/photo(?:\/|\.php)|profile\.php|\/dialog\/|l\.php|\/followers?\/|\/following\/|\/messages(?:\/|$)|\/events(?:\/|$)|\/about|\/watch\/|\/marketplace\/|\/gaming\/|\/reels?\/|\/live\/|\/stories\/|\/jobs\/|\/business\/|\/developers\/|\/settings\/|\/saved\/|\/create\/|\/fundraisers\/|\/shopping\/|\/help\/|\/policies\/|\/ads\/|\/share\//i.test(url)
    ) {
      const m = url.match(/facebook\.com\/([^\s"'<>?#]+)/i);
      if (m) {
        redes.Facebook.add(`facebook.com/${m[1]}`);
        if (!redes.fuente.Facebook) redes.fuente.Facebook = fuenteTipo;
      }
    } else if (/tiktok\.com\/@/i.test(url)) {
      const m = url.match(/tiktok\.com\/@([^\s"'<>?/]+)/i);
      if (m && m[1].toLowerCase() !== "linktr.ee") {
        redes.TikTok.add(`tiktok.com/@${m[1]}`);
        if (!redes.fuente.TikTok) redes.fuente.TikTok = fuenteTipo;
      }
    }
  };

  // 1. JSON-LD sameAs
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).html().trim());
      const extraer = (obj) => {
        if (!obj) return;
        if (Array.isArray(obj)) { obj.forEach(extraer); return; }
        if (typeof obj === "string") { procesarUrl(obj, "sameAs"); return; }
        if (obj.sameAs) {
          if (Array.isArray(obj.sameAs)) obj.sameAs.forEach((u) => procesarUrl(u, "sameAs"));
          else procesarUrl(obj.sameAs, "sameAs");
        }
        Object.values(obj).forEach(extraer);
      };
      extraer(data);
    } catch (_) {}
  });

  // 2. <link rel="me">
  $('link[rel="me"]').each((_, el) => {
    procesarUrl($(el).attr("href"), "rel=me");
  });

  // 3. Enlaces tradicionales
  $("a[href]").each((_, el) => {
    const href = ($(el).attr("href") || "").trim();
    if (!href || href.toLowerCase().startsWith("javascript")) return;

    if (esUrlWhatsApp(href)) {
      try {
        const parsed = new URL(href);
        if (/wa\.link/i.test(href)) {
          redes.WhatsApp.add(href.split("?")[0]);
          return;
        }
        const numero = extraerNumeroDeWhatsApp(href);
        if (numero.length >= 7) {
          redes.WhatsApp.add(`https://wa.me/${numero}`);
        } else {
          parsed.searchParams.delete("text");
          redes.WhatsApp.add(parsed.toString());
        }
      } catch (_) {
        redes.WhatsApp.add(href);
      }
    } else {
      procesarUrl(href, "anchor");
    }
  });

  // 4. Scripts de Joinchat o widgets de WhatsApp en el HTML
  if (htmlOriginal) {
    const joinchatMatch = htmlOriginal.match(/"telephone"\s*:\s*"(\+?\d+)"/i) || htmlOriginal.match(/joinchat_obj.*?telephone.*?"(\+?\d+)"/i);
    if (joinchatMatch && joinchatMatch[1]) {
      const dig = joinchatMatch[1].replace(/\D/g, "");
      if (dig.length >= 7) redes.WhatsApp.add(`https://wa.me/${dig}`);
    }
  }

  return {
    WhatsApp: [...redes.WhatsApp].slice(0, 3).join(" | "),
    Instagram: [...redes.Instagram].slice(0, 3).join(" | "),
    Facebook: [...redes.Facebook].slice(0, 3).join(" | "),
    TikTok: [...redes.TikTok].slice(0, 3).join(" | "),
    fuente: redes.fuente,
  };
}

function buscarUrlPorPalabras($, urlBase, palabras) {
  try {
    const base = new URL(urlBase);
    const origen = base.origin;

    const candidatos = [];
    $("a[href]").each((_, el) => {
      const href = ($(el).attr("href") || "").trim();
      if (!href || /^javascript|^mailto|^tel/i.test(href)) return;

      const coincide = palabras.some((p) => href.toLowerCase().includes(p));
      if (!coincide) return;

      try {
        const urlObj = new URL(href, urlBase);
        if (urlObj.origin === origen) {
          const esFooter = $(el).closest("footer").length > 0;
          candidatos.push({ href: urlObj.href, esFooter });
        }
      } catch (_) {}
    });

    if (candidatos.length === 0) return null;
    candidatos.sort((a, b) => (a.esFooter === b.esFooter ? 0 : a.esFooter ? -1 : 1));
    return candidatos[0].href;
  } catch (_) {
    return null;
  }
}

function extraerDatosDeHtml(html) {
  const $ = cheerio.load(html);
  $("script:not([type='application/ld+json']),style,noscript").remove();
  const textoVisible = textoLimpio($);
  const redes = extraerRedesSociales($, html);

  return {
    $,
    telefonoWeb: extraerTelefonosWeb($, textoVisible),
    correo: extraerCorreos($, textoVisible, html),
    whatsapp: redes.WhatsApp,
    instagram: redes.Instagram,
    facebook: redes.Facebook,
    tiktok: redes.TikTok,
    fuenteInstagram: redes.fuente.Instagram,
    fuenteFacebook: redes.fuente.Facebook,
    fuenteTikTok: redes.fuente.TikTok,
  };
}

function combinarDatosContacto(a, b) {
  const unir = (v1, v2) => {
    if (!v1 || v1 === "—") return v2 || "—";
    if (!v2 || v2 === "—") return v1;
    const set = new Set([...v1.split(" | "), ...v2.split(" | ")]);
    return [...set].slice(0, 5).join(" | ");
  };

  return {
    telefonoWeb: unir(a.telefonoWeb, b.telefonoWeb),
    correo: unir(a.correo, b.correo),
    whatsapp: unir(a.whatsapp, b.whatsapp),
    instagram: unir(a.instagram, b.instagram),
    facebook: unir(a.facebook, b.facebook),
    tiktok: unir(a.tiktok, b.tiktok),
    fuenteInstagram: a.fuenteInstagram || b.fuenteInstagram || "anchor",
    fuenteFacebook: a.fuenteFacebook || b.fuenteFacebook || "anchor",
    fuenteTikTok: a.fuenteTikTok || b.fuenteTikTok || "anchor",
  };
}

/**
 * Enriquecimiento de un negocio individual.
 * Soporta modo 'turbo' (ultra-rápido por Fetch) y modo 'deep' (Puppeteer fallback).
 */
async function enriquecerNegocio(negocio, opciones = {}) {
  const { browser = null, modo = "turbo" } = opciones;

  let datos = {
    telefonoWeb: "",
    correo: "",
    whatsapp: "",
    instagram: "",
    facebook: "",
    tiktok: "",
    fuenteInstagram: "",
    fuenteFacebook: "",
    fuenteTikTok: "",
  };

  let metodo = "maps";
  const web = negocio.web ? negocio.web.trim() : "";

  // 1. Si la web en Maps ya es una red social directa
  if (web) {
    if (/facebook\.com\//i.test(web)) {
      const m = web.match(/facebook\.com\/([^\s"'<>?#]+)/i);
      if (m) datos.facebook = `facebook.com/${m[1]}`;
    } else if (/instagram\.com\//i.test(web)) {
      const u = extraerUsuarioInstagram(web);
      if (u) datos.instagram = `instagram.com/${u}`;
    } else if (/tiktok\.com\/@/i.test(web)) {
      const m = web.match(/tiktok\.com\/@([^\s"'<>?/]+)/i);
      if (m && m[1].toLowerCase() !== "linktr.ee") datos.tiktok = `tiktok.com/@${m[1]}`;
    } else if (esUrlWhatsApp(web)) {
      datos.whatsapp = web;
    }
  }

  const esRedSocial = esRedSocialOAgregador(web);
  let errorWeb = null;

  if (web && !esRedSocial) {
    try {
      let html = "";
      try {
        html = await fetchRapido(web, 8000);
      } catch (errFetch) {
        if (modo === "deep" && browser) {
          // Fallback a Puppeteer solo en modo profundo
          const page = await browser.newPage();
          try {
            await page.setUserAgent(uaAleatorio());
            await page.goto(web, { waitUntil: "domcontentloaded", timeout: 15000 });
            html = await page.content();
          } finally {
            await page.close().catch(() => {});
          }
        } else {
          throw errFetch;
        }
      }

      if (html) {
        metodo = "maps+web";
        const datosPrincipal = extraerDatosDeHtml(html);
        datos = datosPrincipal;

        // Subpágina de contacto o nosotros si es necesario
        const urlContacto = buscarUrlPorPalabras(datosPrincipal.$, web, CONFIG.palabrasContacto);
        if (urlContacto && urlContacto !== web) {
          try {
            const htmlContacto = await fetchRapido(urlContacto, 6000);
            if (htmlContacto) {
              const datosContacto = extraerDatosDeHtml(htmlContacto);
              datos = combinarDatosContacto(datos, datosContacto);
            }
          } catch (_) {}
        }
      }
    } catch (err) {
      errorWeb = err.message ? err.message.slice(0, 80) : "Error de conexión";
    }
  }

  const telefonoMaps = negocio.telefono
    ? normalizarTelefonoPe(negocio.telefono.replace(/\D/g, ""))
    : "";

  const estadoFinal = !web
    ? "Sin web"
    : esRedSocial
    ? "Red social/agregador"
    : errorWeb
    ? `Web: ${errorWeb}`
    : "OK";

  return {
    Nombre: limpiarTexto(negocio.nombre) || "—",
    Categoría: negocio.categoriaUsuario || limpiarTexto(negocio.categoria) || "—",
    Valoración: negocio.valoracion || "—",
    "Teléfono Maps": esTelefonoValido(telefonoMaps) ? telefonoMaps : (negocio.telefono ? negocio.telefono.trim() : "—"),
    "Teléfono Web": datos.telefonoWeb || "—",
    Correo: datos.correo || "—",
    WhatsApp: datos.whatsapp || "—",
    Instagram: datos.instagram || "—",
    Facebook: datos.facebook || "—",
    TikTok: datos.tiktok || "—",
    FuenteInstagram: datos.fuenteInstagram || "",
    FuenteFacebook: datos.fuenteFacebook || "",
    FuenteTikTok: datos.fuenteTikTok || "",
    Dirección: limpiarTexto(negocio.direccion) || "—",
    Web: web || "—",
    URLMaps: negocio.urlMaps || "—",
    Búsqueda: negocio.terminoBusqueda || "",
    Método: metodo,
    Estado: estadoFinal,
  };
}

module.exports = {
  enriquecerNegocio,
  fetchRapido,
  extraerDatosDeHtml,
  esRedSocialOAgregador,
};
