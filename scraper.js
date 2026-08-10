const cheerio = require("cheerio");
const ExcelJS = require("exceljs");
const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
const pLimit = require("p-limit").default;
const Database = require("better-sqlite3");
const readline = require("readline/promises");
const { mostrarBanner } = require("./banner.js");

// ─── CARGAR CONFIGURACIÓN DESDE config.json ───────────────────────
const configPath = path.join(__dirname, "config.json");
if (!fs.existsSync(configPath)) {
  console.error(" No se encontró config.json. Crea el archivo antes de ejecutar.");
  process.exit(1);
}
const CONFIG = JSON.parse(fs.readFileSync(configPath, "utf-8"));
// ─────────────────────────────────────────────────────────────────

// ─── USER-AGENT ────────────────────────────────────────────────────

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0",
];

function uaAleatorio() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

async function configurarPagina(page) {
  await page.setUserAgent(uaAleatorio());
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    ["image", "stylesheet", "font", "media"].includes(req.resourceType())
      ? req.abort()
      : req.continue();
  });
}

// ─── CONFIGURACIÓN INTERACTIVA (categorías y distritos) ──────────

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function preguntarConfiguracion() {
  // Modo no interactivo: node scraper.js --categorias "a,b" --distritos "c,d"
  const args = process.argv;
  const iCat = args.indexOf("--categorias");
  const iDis = args.indexOf("--distritos");
  if (iCat !== -1 && iDis !== -1) {
    CONFIG.CATEGORIAS = args[iCat + 1].split(",").map((s) => s.trim()).filter(Boolean);
    CONFIG.DISTRITOS = args[iDis + 1].split(",").map((s) => s.trim()).filter(Boolean);
    if (CONFIG.CATEGORIAS.length && CONFIG.DISTRITOS.length) return;
  }

  const dim = "\x1b[2m";
  const cyan = "\x1b[36m";
  const reset = "\x1b[0m";

  console.log();

  let categorias = [];
  while (categorias.length === 0) {
    const resp = await rl.question(
      `\n${cyan}?${reset}  Categorías a buscar ${dim}[1/2]${reset}\n   ${dim}›${reset} `
    );
    categorias = resp.split(",").map((s) => s.trim()).filter(Boolean);
    if (categorias.length === 0) {
      console.log(`   ${dim}Debes ingresar al menos una categoría.${reset}`);
    }
  }

  let distritos = [];
  while (distritos.length === 0) {
    const resp = await rl.question(
      `\n${cyan}?${reset}  Distritos a buscar ${dim}[2/2]${reset}\n   ${dim}›${reset} `
    );
    distritos = resp.split(",").map((s) => s.trim()).filter(Boolean);
    if (distritos.length === 0) {
      console.log(`   ${dim}Debes ingresar al menos un distrito.${reset}`);
    }
  }

  console.log(`\n   ${categorias.length} categorías · ${distritos.length} distritos · ${categorias.length * distritos.length} combinaciones`);
  console.log(`   Categorías: ${categorias.join(" | ")}`);
  console.log(`   Distritos: ${distritos.join(" | ")}\n`);

  const confirmar = await rl.question(`   ¿Es correcto? (S/n) › `);
  if (confirmar.trim().toLowerCase() === "n") {
    rl.close();
    console.log("   Cancelado. Vuelve a correr el programa.");
    process.exit(0);
  }

  rl.close();

  CONFIG.CATEGORIAS = categorias;
  CONFIG.DISTRITOS = distritos;
}
// ─────────────────────────────────────────────────────────────────

// ─── SQLITE ────────────────────────────────────────────────────────
const DB_PATH = path.join(__dirname, "contactos.db");
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS negocios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT DEFAULT '',
    categoria TEXT DEFAULT '',
    valoracion TEXT DEFAULT '',
    telefono_maps TEXT DEFAULT '',
    telefono_web TEXT DEFAULT '',
    correo TEXT DEFAULT '',
    whatsapp TEXT DEFAULT '',
    instagram TEXT DEFAULT '',
    facebook TEXT DEFAULT '',
    tiktok TEXT DEFAULT '',
    direccion TEXT DEFAULT '',
    web TEXT DEFAULT '',
    url_maps TEXT DEFAULT '',
    busqueda TEXT DEFAULT '',
    metodo TEXT DEFAULT '',
    via TEXT DEFAULT '',
    estado TEXT DEFAULT '',
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Columnas de fuente/confianza (segura para re-ejecución)
const columnasFuente = ['fuente_instagram', 'fuente_facebook', 'fuente_tiktok'];
for (const col of columnasFuente) {
  try { db.exec(`ALTER TABLE negocios ADD COLUMN ${col} TEXT DEFAULT ''`); } catch (_) {}
}

// Índices para acelerar deduplicación
db.exec("CREATE INDEX IF NOT EXISTS idx_url_maps ON negocios(url_maps)");
db.exec("CREATE INDEX IF NOT EXISTS idx_nombre_web ON negocios(nombre, web)");
db.exec("CREATE INDEX IF NOT EXISTS idx_nombre_direccion ON negocios(nombre, direccion)");

function checkpointWAL() {
  db.pragma("wal_checkpoint(TRUNCATE)");
}

const existeDuplicado = db.prepare(`
  SELECT id FROM negocios
  WHERE (url_maps != '' AND url_maps = @url_maps)
     OR (web != '' AND web = @web COLLATE NOCASE AND nombre = @nombre COLLATE NOCASE)
     OR (direccion != '' AND direccion = @direccion COLLATE NOCASE AND nombre = @nombre COLLATE NOCASE)
  LIMIT 1
`);

const insertNegocio = db.prepare(`
  INSERT INTO negocios (
    nombre, categoria, valoracion, telefono_maps, telefono_web,
    correo, whatsapp, instagram, facebook, tiktok,
    direccion, web, url_maps, busqueda, metodo, via, estado,
    fuente_instagram, fuente_facebook, fuente_tiktok
  ) VALUES (
    @nombre, @categoria, @valoracion, @telefono_maps, @telefono_web,
    @correo, @whatsapp, @instagram, @facebook, @tiktok,
    @direccion, @web, @url_maps, @busqueda, @metodo, @via, @estado,
    @fuente_instagram, @fuente_facebook, @fuente_tiktok
  )
`);

function guardarNegocio(datos) {
  const nombre = (datos.Nombre || '').trim().toLowerCase();
  const web = (datos.Web || '').trim().toLowerCase();
  const urlMaps = (datos.URLMaps || '').trim();
  const direccion = (datos.Dirección || '').trim().toLowerCase();

  // Deduplicación: url_maps, nombre+web, o nombre+dirección
  if (urlMaps || (nombre && web) || (nombre && direccion)) {
    const dup = existeDuplicado.get({ nombre, web, url_maps: urlMaps, direccion });
    if (dup) return;
  }

  insertNegocio.run({
    nombre: datos.Nombre || '',
    categoria: datos.Categoría || '',
    valoracion: datos.Valoración || '',
    telefono_maps: datos['Teléfono Maps'] || '',
    telefono_web: datos['Teléfono Web'] || '',
    correo: datos.Correo || '',
    whatsapp: datos.WhatsApp || '',
    instagram: datos.Instagram || '',
    facebook: datos.Facebook || '',
    tiktok: datos.TikTok || '',
    direccion: datos.Dirección || '',
    web: datos.Web || '',
    url_maps: datos.URLMaps || '',
    busqueda: datos.Búsqueda || '',
    metodo: datos.Método || '',
    via: datos.Vía || '',
    estado: datos.Estado || '',
    fuente_instagram: datos.FuenteInstagram || '',
    fuente_facebook: datos.FuenteFacebook || '',
    fuente_tiktok: datos.FuenteTikTok || '',
  });
}

function contarNegocios() {
  const row = db.prepare('SELECT COUNT(*) as count FROM negocios').get();
  return row.count;
}
// ─────────────────────────────────────────────────────────────────

// Cargar TLDs válidos para validación de correos
const TLDS_PATH = path.join(__dirname, "tlds.json");
const TLDS_VALIDOS = new Set(
  JSON.parse(fs.readFileSync(TLDS_PATH, "utf-8")).map((t) => t.toUpperCase())
);

// Dominios de herramientas de desarrollo / tracking que no son correos reales
const DOMINIOS_BASURA =
  /sentry\.io|example\.com|amazonaws\.com|cloudfront\.net|w3\.org|schema\.org|hotjar\.com|klaviyo\.com|googleapis\.com|gstatic\.com|jquery\.com|bootstrapcdn\.com/i;

// Dominios placeholder genéricos tipo "correo.*" ("el correo que quieres"), no son de empresas reales
const DOMINIO_CORREO_PLACEHOLDER = /^correo\./i;

// Extensiones de archivo para filtrar falsos correos
const EXTENSIONES_NO_CORREO =
  /\.(webp|png|jpg|jpeg|gif|svg|mp4|mp3|pdf|zip|ico|woff|woff2|ttf|wav|mpga|aac|flac|ogg)$/i;

// Palabras placeholder en la parte local del correo (antes de la @)
const PALABRAS_LOCAL_PLACEHOLDER = (CONFIG.palabrasLocalPlaceholder || []).map((p) =>
  p.toLowerCase()
);
const PALABRAS_LOCAL_PLACEHOLDER_RE = PALABRAS_LOCAL_PLACEHOLDER.length
  ? new RegExp("\\b(" + PALABRAS_LOCAL_PLACEHOLDER.join("|") + ")\\b", "i")
  : null;

// Dominios placeholder completos a rechazar
const DOMINIOS_PLACEHOLDER = (CONFIG.dominiosPlaceholder || []).map((d) =>
  d.replace(/\./g, "\\.")
);
const DOMINIOS_PLACEHOLDER_RE = DOMINIOS_PLACEHOLDER.length
  ? new RegExp(DOMINIOS_PLACEHOLDER.join("|"), "i")
  : null;

// Dominios de agregadores link-in-bio (no se pueden scrapear)
const DOMINIOS_AGREGADORES = (CONFIG.agregadoresLinkInBio || []).map((d) =>
  d.toLowerCase()
);

// Regex de emojis para limpiar texto antes de guardar en Excel
const REGEX_EMOJI =
  /[\u{1F000}-\u{1FFFF}]|[\u{2600}-\u{27FF}]|[\u{2B00}-\u{2BFF}]|[\u{FE00}-\u{FEFF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FA9F}]|[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]/gu;

// Regex para teléfonos peruanos y correos
const REGEX = {
  telefono: /(\+?51[\s\-]?)?(9\d{8}|\d{7,8})\b/g,
  correo: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g,
};

// Rutas genéricas de Instagram que NO son perfiles de usuario
const INSTAGRAM_NO_PROFILE = /^\/(stories|explore|accounts|direct|p(?:$|\/)|reels?(?:$|\/)|tv(?:$|\/)|shop(?:$|\/)|ar(?:$|\/)|login|signup|register|about|legal|privacy|terms|support|ads|graphql|oauth|authorize|create|share|web|developer|download|help|blog|press|jobs|safety|cookies|security|discover|language|report|remove)/i;

// Usernames reservados (603 nombres de shouldbee/reserved-usernames, extraídos de instagram-reserved.json; defensa contra colisiones con nombres genéricos reservados por sistemas)
const RESERVED_USERNAMES = new Set([
  "0", "about", "access", "account", "accounts", "activate", "activities", "activity", "ad", "add", "address", "adm",
  "admin", "administration", "administrator", "ads", "adult", "advertising", "affiliate", "affiliates", "ajax", "all", "alpha", "analysis",
  "analytics", "android", "anon", "anonymous", "api", "app", "apps", "archive", "archives", "article", "asct", "asset",
  "atom", "auth", "authentication", "avatar", "backup", "balancer-manager", "banner", "banners", "beta", "billing", "bin", "blog",
  "blogs", "board", "book", "bookmark", "bot", "bots", "bug", "business", "cache", "cadastro", "calendar", "call",
  "campaign", "cancel", "captcha", "career", "careers", "cart", "categories", "category", "cgi", "cgi-bin", "changelog", "chat",
  "check", "checking", "checkout", "client", "cliente", "clients", "code", "codereview", "comercial", "comment", "comments", "communities",
  "community", "company", "compare", "compras", "config", "configuration", "connect", "contact", "contact-us", "contact_us", "contactus", "contest",
  "contribute", "corp", "create", "css", "dashboard", "data", "db", "default", "delete", "demo", "design", "designer",
  "destroy", "dev", "devel", "developer", "developers", "diagram", "diary", "dict", "dictionary", "die", "dir", "direct_messages",
  "directory", "dist", "doc", "docs", "documentation", "domain", "download", "downloads", "ecommerce", "edit", "editor", "edu",
  "education", "email", "employment", "empty", "end", "enterprise", "entries", "entry", "error", "errors", "eval", "event",
  "exit", "explore", "facebook", "linktr.ee", "faq", "favorite", "favorites", "feature", "features", "feed", "feedback", "feeds",
  "file", "files", "first", "flash", "fleet", "fleets", "flog", "follow", "followers", "following", "forgot", "form",
  "forum", "forums", "founder", "free", "friend", "friends", "ftp", "gadget", "gadgets", "game", "games", "get",
  "ghost", "gift", "gifts", "gist", "github", "graph", "group", "groups", "guest", "guests", "help", "home",
  "homepage", "host", "hosting", "hostmaster", "hostname", "howto", "hpg", "html", "http", "httpd", "https", "i",
  "iamges", "icon", "icons", "id", "idea", "ideas", "image", "images", "imap", "img", "index", "indice",
  "info", "information", "inquiry", "instagram", "intranet", "invitations", "invite", "ipad", "iphone", "irc", "is", "issue",
  "issues", "it", "item", "items", "java", "javascript", "job", "jobs", "join", "js", "json", "jump",
  "knowledgebase", "language", "languages", "last", "ldap-status", "legal", "license", "link", "links", "linux", "list", "lists",
  "log", "log-in", "log-out", "log_in", "log_out", "login", "logout", "logs", "m", "mac", "mail", "mail1",
  "mail2", "mail3", "mail4", "mail5", "mailer", "mailing", "maintenance", "manager", "manual", "map", "maps", "marketing",
  "master", "me", "media", "member", "members", "message", "messages", "messenger", "microblog", "microblogs", "mine", "mis",
  "mob", "mobile", "movie", "movies", "mp3", "msg", "msn", "music", "musicas", "mx", "my", "mysql",
  "name", "named", "nan", "navi", "navigation", "net", "network", "new", "news", "newsletter", "nick", "nickname",
  "notes", "noticias", "notification", "notifications", "notify", "ns", "ns1", "ns10", "ns2", "ns3", "ns4", "ns5",
  "ns6", "ns7", "ns8", "ns9", "null", "oauth", "oauth_clients", "offer", "offers", "official", "old", "online",
  "openid", "operator", "order", "orders", "organization", "organizations", "overview", "owner", "owners", "page", "pager", "pages",
  "panel", "password", "payment", "perl", "phone", "photo", "photoalbum", "photos", "php", "phpmyadmin", "phppgadmin", "phpredisadmin",
  "pic", "pics", "ping", "plan", "plans", "plugin", "plugins", "policy", "pop", "pop3", "popular", "portal",
  "post", "postfix", "postmaster", "posts", "pr", "premium", "press", "price", "pricing", "privacy", "privacy-policy", "privacy_policy",
  "privacypolicy", "private", "product", "products", "profile", "project", "projects", "promo", "pub", "public", "purpose", "put",
  "python", "query", "random", "ranking", "read", "readme", "recent", "recruit", "recruitment", "register", "registration", "release",
  "remove", "replies", "report", "reports", "repositories", "repository", "req", "request", "requests", "reset", "roc", "root",
  "rss", "ruby", "rule", "sag", "sale", "sales", "sample", "samples", "save", "school", "script", "scripts",
  "search", "secure", "security", "self", "send", "server", "server-info", "server-status", "service", "services", "session", "sessions",
  "setting", "settings", "setup", "share", "shop", "show", "sign-in", "sign-up", "sign_in", "sign_up", "signin", "signout",
  "signup", "site", "sitemap", "sites", "smartphone", "smtp", "soporte", "source", "spec", "special", "sql", "src",
  "ssh", "ssl", "ssladmin", "ssladministrator", "sslwebmaster", "staff", "stage", "staging", "start", "stat", "state", "static",
  "stats", "status", "store", "stores", "stories", "style", "styleguide", "stylesheet", "stylesheets", "subdomain", "subscribe", "subscriptions",
  "suporte", "support", "svn", "swf", "sys", "sysadmin", "sysadministrator", "system", "tablet", "tablets", "tag", "talk",
  "task", "tasks", "team", "teams", "tech", "telnet", "term", "terms", "terms-of-service", "terms_of_service", "termsofservice", "test",
  "test1", "test2", "test3", "teste", "testing", "tests", "theme", "themes", "thread", "threads", "tmp", "todo",
  "tool", "tools", "top", "topic", "topics", "tos", "tour", "translations", "trends", "tutorial", "tux", "tv",
  "twitter", "undef", "unfollow", "unsubscribe", "update", "upload", "uploads", "url", "usage", "user", "username", "users",
  "usuario", "vendas", "ver", "version", "video", "videos", "visitor", "watch", "weather", "web", "webhook", "webhooks",
  "webmail", "webmaster", "website", "websites", "welcome", "widget", "widgets", "wiki", "win", "windows", "word", "work",
  "works", "workshop", "ww", "wws", "www", "www1", "www2", "www3", "www4", "www5", "www6", "www7",
  "wwws", "wwww", "xfn", "xml", "xmpp", "xpg", "xxx", "yaml", "year", "yml", "you", "yourdomain",
  "yourname", "yoursite", "yourusername",
]);

function extraerUsuarioInstagram(url) {
  try {
    const parsed = new URL(url);
    let path = parsed.pathname.replace(/\/+$/, '');
    if (!path || path === '/') return null;
    const segments = path.split('/').filter(Boolean);

    if (!segments || segments.length === 0) return null;
    const primero = segments[0];

    if (primero.toLowerCase() === 'stories' && segments.length >= 2) {
      const user = segments[1];
      if (/^[a-zA-Z0-9._]{2,40}$/.test(user) && !['stories','explore','accounts','direct'].includes(user.toLowerCase())) return user;
      return null;
    }

    if (INSTAGRAM_NO_PROFILE.test('/' + primero)) return null;

    if (RESERVED_USERNAMES.has(primero.toLowerCase())) return null;

    if (/^[a-zA-Z0-9._]{2,40}$/.test(primero)) return primero;
    return null;
  } catch (_) {
    return null;
  }
}

// ─── GENERADOR DE BÚSQUEDAS ───────────────────────────────────────

function generarTerminosDeBusqueda() {
  const terminos = [];
  for (const categoria of CONFIG.CATEGORIAS) {
    for (const distrito of CONFIG.DISTRITOS) {
      terminos.push({ termino: `${categoria} ${distrito}`, categoria });
    }
  }
  return terminos;
}

// ─── UTILIDADES ───────────────────────────────────────────────────

function esperarMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function esperarAleatorio(minMs, maxMs) {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise((r) => setTimeout(r, ms));
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

function normalizarTelefonoPe(digitos) {
  if (/^51[9][0-9]{8}$/.test(digitos)) return digitos.slice(2);
  if (/^51[0-9]{7,8}$/.test(digitos)) return digitos.slice(2);
  return digitos;
}

function esTelefonoValido(t) {
  const digitos = t.replace(/\D/g, "");
  if (digitos.length < 7 || digitos.length > 15) return false;
  if (digitos.length === 11 && /^(10|20)/.test(digitos)) return false;
  if (/^20[0-9]{6}$/.test(digitos)) return false;
  return true;
}

// ─────────────────────────────────────────────────────────────────

function esCorreoValido(correo) {
  const m = correo.match(/^([a-zA-Z0-9._%+\-]+)@(.+)$/);
  if (!m) return false;
  const localPart = m[1].toLowerCase();
  const dominio = m[2].toLowerCase();

  // Rechazar si la parte local contiene palabras placeholder
  if (PALABRAS_LOCAL_PLACEHOLDER_RE && PALABRAS_LOCAL_PLACEHOLDER_RE.test(localPart)) return false;

  // Rechazar si el dominio está en lista de basura o dominios placeholder
  if (DOMINIOS_BASURA.test(dominio)) return false;
  if (DOMINIOS_PLACEHOLDER_RE && DOMINIOS_PLACEHOLDER_RE.test(dominio)) return false;
  if (DOMINIO_CORREO_PLACEHOLDER.test(dominio)) return false;

  // Rechazar si parece una extensión de archivo (falso positivo de regex)
  if (EXTENSIONES_NO_CORREO.test("." + dominio.split(".").pop())) return false;

  // Validar que el TLD (última etiqueta) exista en IANA
  const partes = dominio.split(".");
  const tld = partes[partes.length - 1].toUpperCase();
  if (!TLDS_VALIDOS.has(tld)) return false;

  return true;
}

function extraerNumeroDeWhatsApp(href) {
  try {
    const parsed = new URL(href);
    const porPath = parsed.pathname.match(/\/([\d]+)/);
    const porParam = parsed.searchParams.get("phone");
    return (porPath?.[1] || porParam || "").replace(/\D/g, "");
  } catch (_) {
    return "";
  }
}

function limpiarTelefonoMaps(texto) {
  if (!texto || texto === "—") return "";
  const digitos = texto.replace(/\D/g, "");
  if (!digitos) return "";
  const normalizado = normalizarTelefonoPe(digitos);
  return esTelefonoValido(normalizado) ? normalizado : "";
}

function esUrlWhatsApp(href) {
  return /^https?:\/\/(wa\.me|(api\.|chat\.)?whatsapp\.com|wa\.link)\b|^\/\/(wa\.me|(api\.|chat\.)?whatsapp\.com|wa\.link)\b|^whatsapp:\/\//i.test(href);
}

function buscarUrlPorPalabras($, urlBase, palabras) {
  try {
    const base = new URL(urlBase);
    const origen = base.origin;

    function prioridad(href) {
      const h = href.toLowerCase();
      if (/contacto|contactenos|contactus|contact/i.test(h)) return 0;
      if (/mensaje|escribenos|comunicate|comunicarse/i.test(h)) return 1;
      if (/atencion|soporte|support/i.test(h)) return 2;
      if (/ubicacion|ubicaciones|sucursales|tiendas|locales/i.test(h)) return 3;
      return 4;
    }

    const candidatos = [];

    $("a[href]").each((_, el) => {
      const href = ($(el).attr("href") || "").trim();
      if (
        !href ||
        href.toLowerCase().startsWith("javascript") ||
        href.toLowerCase().startsWith("mailto") ||
        href.toLowerCase().startsWith("tel")
      )
        return;

      const contieneContacto = palabras.some((p) =>
        href.toLowerCase().includes(p)
      );
      if (!contieneContacto) return;

      try {
        const urlObj = new URL(href, urlBase);
        if (urlObj.origin === origen) {
          const esFooter = $(el).closest("footer").length > 0;
          candidatos.push({ href: urlObj.href, prioridad: prioridad(href), esFooter });
        }
      } catch (_) {}
    });

    if (candidatos.length === 0) return null;

    candidatos.sort((a, b) => {
      if (a.prioridad !== b.prioridad) return a.prioridad - b.prioridad;
      if (a.esFooter && !b.esFooter) return -1;
      if (!a.esFooter && b.esFooter) return 1;
      return 0;
    });

    return candidatos[0].href;
  } catch (_) {
    return null;
  }
}

function combinarDatosContacto(datosPrincipal, datosContacto) {
  const combinar = (a, b) => {
    if (!a || a === "—") return b || "—";
    if (!b || b === "—") return a;
    const set = new Set([...a.split(" | "), ...b.split(" | ")]);
    return [...set].slice(0, 5).join(" | ");
  };

  const priorizarFuente = (fuenteA, fuenteB) => {
    if (fuenteA === 'sameAs' && fuenteB !== 'sameAs') return fuenteA;
    if (fuenteB === 'sameAs' && fuenteA !== 'sameAs') return fuenteB;
    if (fuenteA === 'rel=me' && fuenteB === 'anchor') return fuenteA;
    if (fuenteB === 'rel=me' && fuenteA === 'anchor') return fuenteB;
    return fuenteA || fuenteB || 'anchor';
  };

  return {
    telefonoWeb: combinar(datosPrincipal.telefonoWeb, datosContacto.telefonoWeb),
    correo: combinar(datosPrincipal.correo, datosContacto.correo),
    whatsapp: combinar(datosPrincipal.whatsapp, datosContacto.whatsapp),
    instagram: combinar(datosPrincipal.instagram, datosContacto.instagram),
    facebook: combinar(datosPrincipal.facebook, datosContacto.facebook),
    tiktok: combinar(datosPrincipal.tiktok, datosContacto.tiktok),
    fuenteInstagram: priorizarFuente(datosPrincipal.fuenteInstagram, datosContacto.fuenteInstagram),
    fuenteFacebook: priorizarFuente(datosPrincipal.fuenteFacebook, datosContacto.fuenteFacebook),
    fuenteTikTok: priorizarFuente(datosPrincipal.fuenteTikTok, datosContacto.fuenteTikTok),
  };
}

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

  const matches = textoVisible.match(REGEX.telefono) || [];
  matches.forEach((t) => {
    const digitos = normalizarTelefonoPe(t.replace(/\D/g, ""));
    telefonosEncontrados.add(digitos);
  });

  const validos = [...telefonosEncontrados].filter(esTelefonoValido);
  return [...new Set(validos)].slice(0, 3).join(" | ");
}

function extraerCorreos($, textoVisible) {
  const correos = new Set();
  const textoSanitizado = textoVisible
    .replace(/[\u00AD\u200B\u200C\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ");

  $("a[href^='mailto:']").each((_, el) => {
    const href = $(el).attr("href") || "";
    const correo = href.replace(/^mailto:/i, "").split("?")[0].trim().toLowerCase();
    if (correo && esCorreoValido(correo)) correos.add(correo);
  });

  $("a").each((_, el) => {
    const texto = $(el).text().trim().toLowerCase();
    const matches = texto.match(REGEX.correo) || [];
    for (const m of matches) {
      if (esCorreoValido(m)) correos.add(m);
    }
  });

  const matches = textoSanitizado.match(REGEX.correo) || [];
  for (const m of matches) {
    const correo = m.toLowerCase();
    if (esCorreoValido(correo)) correos.add(correo);
  }

  return [...correos].slice(0, 5).join(" | ");
}

function extraerRedesSemanticas($) {
  const resultado = { Instagram: [], Facebook: [], TikTok: [], fuente: '' };

  const procesarUrl = (url) => {
    url = url.split('?')[0].split('#')[0].replace(/\/+$/, '');
    if (/instagram\.com\//i.test(url)) {
      const u = extraerUsuarioInstagram(url);
      if (u) resultado.Instagram.push(`instagram.com/${u}`);
    } else if (/facebook\.com\//i.test(url) && !/sharer|login|recover|\/photo(?:\/|\.php)|profile\.php|\/dialog\/|l\.php|\/followers?\/|\/following\/|\/messages(?:\/|$)|\/events(?:\/|$)|\/about|\/watch\/|\/marketplace\/|\/gaming\/|\/reels?\/|\/live\/|\/stories\/|\/jobs\/|\/business\/|\/developers\/|\/settings\/|\/saved\/|\/create\/|\/fundraisers\/|\/shopping\/|\/help\/|\/policies\/|\/ads\/|\/share\//i.test(url)) {
      const m = url.match(/facebook\.com\/([^\s"'<>?#]+)/i);
      if (m) resultado.Facebook.push(`facebook.com/${m[1]}`);
    } else if (/tiktok\.com\/@/i.test(url)) {
      const m = url.match(/tiktok\.com\/@([^\s"'<>?/]+)/i);
      if (m && m[1].toLowerCase() !== 'linktr.ee') resultado.TikTok.push(`tiktok.com/@${m[1]}`);
    }
  };

  // 1. JSON-LD sameAs
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const texto = $(el).html().trim();
      if (!texto) return;
      const data = JSON.parse(texto);
      const extraerSameAs = (obj) => {
        if (!obj) return;
        if (Array.isArray(obj)) { obj.forEach(extraerSameAs); return; }
        if (typeof obj === 'string') { procesarUrl(obj); return; }
        if (obj.sameAs) {
          if (Array.isArray(obj.sameAs)) obj.sameAs.forEach(procesarUrl);
          else procesarUrl(obj.sameAs);
        }
        Object.values(obj).forEach(extraerSameAs);
      };
      extraerSameAs(data);
    } catch (_) {}
  });

  // 2. <link rel="me">
  $('link[rel="me"]').each((_, el) => {
    const href = $(el).attr('href');
    if (href) procesarUrl(href);
  });

  if (resultado.Instagram.length || resultado.Facebook.length || resultado.TikTok.length) {
    resultado.fuente = 'sameAs';
  }

  return resultado;
}

function extraerRedesSociales($) {
  const semanticas = extraerRedesSemanticas($);
  const instagramSem = semanticas.Instagram[0];
  const facebookSem = semanticas.Facebook[0];
  const tiktokSem = semanticas.TikTok[0];

  const haySemanticas = instagramSem || facebookSem || tiktokSem;

  const redes = {
    WhatsApp: new Set(),
    Instagram: new Set(instagramSem ? [instagramSem] : []),
    Facebook: new Set(facebookSem ? [facebookSem] : []),
    TikTok: new Set(tiktokSem ? [tiktokSem] : []),
  };

  const fuente = {
    Instagram: haySemanticas && instagramSem ? 'sameAs' : '',
    Facebook: haySemanticas && facebookSem ? 'sameAs' : '',
    TikTok: haySemanticas && tiktokSem ? 'sameAs' : '',
  };

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
        if (parsed.protocol === 'whatsapp:' && !parsed.searchParams.get('phone') && !parsed.pathname.match(/\/([\d]+)/)) return;
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
    } else if (!instagramSem && /instagram\.com\//i.test(href)) {
      const usuario = extraerUsuarioInstagram(href);
      if (usuario) { redes.Instagram.add(`instagram.com/${usuario}`); fuente.Instagram = 'anchor'; }
    } else if (!facebookSem && /facebook\.com\//i.test(href) && !/sharer|login|recover|\/photo(?:\/|\.php)|profile\.php|\/dialog\/|l\.php|\/followers?\/|\/following\/|\/messages(?:\/|$)|\/events(?:\/|$)|\/about|\/watch\/|\/marketplace\/|\/gaming\/|\/reels?\/|\/live\/|\/stories\/|\/jobs\/|\/business\/|\/developers\/|\/settings\/|\/saved\/|\/create\/|\/fundraisers\/|\/shopping\/|\/help\/|\/policies\/|\/ads\/|\/share\//i.test(href)) {
      const m = href.match(/facebook\.com\/([^\s"'<>?#]+)/i);
      if (m) { redes.Facebook.add(`facebook.com/${m[1]}`); fuente.Facebook = 'anchor'; }
    } else if (!tiktokSem && /tiktok\.com\/@/i.test(href)) {
      const m = href.match(/tiktok\.com\/@([^\s"'<>?/]+)/i);
      if (m && m[1].toLowerCase() !== 'linktr.ee') { redes.TikTok.add(`tiktok.com/@${m[1]}`); fuente.TikTok = 'anchor'; }
    }
  });

  return {
    WhatsApp: [...redes.WhatsApp].slice(0, 3).join(" | "),
    Instagram: [...redes.Instagram].slice(0, 3).join(" | "),
    Facebook: [...redes.Facebook].slice(0, 3).join(" | "),
    TikTok: [...redes.TikTok].slice(0, 3).join(" | "),
    fuente,
  };
}

function textoLimpio($) {
  const bloques =
    "p,div,li,td,th,h1,h2,h3,h4,h5,h6,br,tr,section,article,header,footer,nav,aside";
  $(bloques).each((_, el) => $(el).append(" "));
  return $("body").text().replace(/\s+/g, " ").trim();
}

function extraerDatosDeHtml(html) {
  const $ = cheerio.load(html);
  $("script,style,noscript").remove();
  const textoVisible = textoLimpio($);
  const redes = extraerRedesSociales($);

  return {
    $,
    telefonoWeb: extraerTelefonosWeb($, textoVisible),
    correo: extraerCorreos($, textoVisible),
    whatsapp: redes.WhatsApp,
    instagram: redes.Instagram,
    facebook: redes.Facebook,
    tiktok: redes.TikTok,
    fuenteInstagram: redes.fuente.Instagram,
    fuenteFacebook: redes.fuente.Facebook,
    fuenteTikTok: redes.fuente.TikTok,
  };
}

// ─── SELECTORES FRÁGILES DE GOOGLE MAPS ─────────────────────────

const SELECTORES_MAPS = {
  nombre: "h1",
  telefonoBoton: 'button[data-item-id^="phone"]',
  direccionBoton: 'button[data-item-id="address"]',
  webEnlace: 'a[data-item-id="authority"]',
  categoriaBoton: 'button[jsaction*="category"]',
  categoriaFallback: ".DkEaL",
  valoracion: ".F7nice span",
};

// ─────────────────────────────────────────────────────────────────

// ─── VISITAR WEB DEL NEGOCIO ──────────────────────────────────────

async function visitarWebConPuppeteer(url, browser) {
  const page = await browser.newPage();
  await configurarPagina(page);

  let html = "";
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
    await esperarAleatorio(800, 1500);
  } catch (e) {
    console.warn(`     Timeout o error cargando ${url}, procesando lo que haya...`);
  } finally {
    html = await conReintentoNavegacion(
      () => page.content(),
      "page.content()"
    );
    await page.close();
  }
  return html;
}

async function visitarWebConFetch(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);

  const res = await fetch(url, {
    signal: controller.signal,
    headers: {
      "User-Agent": uaAleatorio(),
    },
  });

  clearTimeout(timer);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const html = await res.text();
  const $chk = cheerio.load(html);
  $chk("script,style").remove();

  if ($chk("body").text().trim().length < CONFIG.umbralTextoUtil) {
    throw new Error("página vacía o renderizada por JS");
  }

  return html;
}

async function visitarUrl(url, browser) {
  try {
    const html = await visitarWebConFetch(url);
    return { html, via: "fetch" };
  } catch (errFetch) {
    console.warn(`   Fetch falló (${errFetch.message}), usando Puppeteer...`);
  }

  try {
    const html = await visitarWebConPuppeteer(url, browser);
    return { html, via: "puppeteer" };
  } catch (errPuppeteer) {
    throw new Error(`puppeteer: ${errPuppeteer.message}`);
  }
}

// ─── REINTENTO ANTE ERRORES DE NAVEGACIÓN ─────────────────────────

const MENSAJE_CONTEXT_DESTROYED = "Execution context was destroyed";

async function conReintentoNavegacion(fn, etiqueta, maxReintentos = 2) {
  for (let i = 0; i <= maxReintentos; i++) {
    try {
      return await fn();
    } catch (err) {
      if (err.message && err.message.includes(MENSAJE_CONTEXT_DESTROYED) && i < maxReintentos) {
        console.warn(`   Contexto destruido en ${etiqueta}, reintentando (${i + 1}/${maxReintentos})...`);
        await esperarAleatorio(1000, 2000);
        continue;
      }
      throw err;
    }
  }
}

// ─── POOL DE PÁGINAS ─────────────────────────────────────────────

async function crearPoolPaginas(browser, n) {
  const paginas = [];
  for (let i = 0; i < n; i++) {
    const p = await browser.newPage();
    await configurarPagina(p);
    paginas.push(p);
  }
  return paginas;
}

function crearGestorPool(paginas) {
  const libres = [...paginas];
  const esperando = [];

  function obtener() {
    if (libres.length > 0) return Promise.resolve(libres.pop());
    return new Promise((resolve) => esperando.push(resolve));
  }

  function liberar(pagina) {
    const siguiente = esperando.shift();
    if (siguiente) siguiente(pagina);
    else libres.push(pagina);
  }

  return { obtener, liberar };
}

async function extraerFichaNegocio(pagina, enlace) {
  const MAX_INTENTOS_FICHA = 2;
  let cargado = false;
  let ultimoError = null;

  for (let intento = 1; intento <= MAX_INTENTOS_FICHA; intento++) {
    try {
      await pagina.goto(enlace, { waitUntil: "domcontentloaded", timeout: 15000 });
      cargado = true;
      break;
    } catch (err) {
      ultimoError = err;
      if (intento < MAX_INTENTOS_FICHA) {
        await esperarAleatorio(1500, 2500);
      }
    }
  }
  if (!cargado) throw ultimoError;

  await pagina.waitForSelector(SELECTORES_MAPS.nombre, { timeout: 6000 }).catch(() => {});

  const datos = await conReintentoNavegacion(
    () => pagina.evaluate((sel) => {
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
      document.querySelectorAll(sel.webEnlace).forEach((a) => { web = a.href || ""; });
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
    }, SELECTORES_MAPS),
    "extraerFichaNegocio.evaluate()"
  );

  if (datos.nombre) return { ...datos, urlMaps: enlace };
  return null;
}

// ─── GOOGLE MAPS: SCRAPING PRINCIPAL ─────────────────────────────

async function detectarBloqueo(page) {
  const bloqueado = await page.evaluate(() =>
    document.body.innerText.includes("unusual traffic") ||
    document.body.innerText.includes("tráfico inusual") ||
    document.body.innerText.includes("tráfico anormal") ||
    !!document.querySelector('form[action*="sorry"]')
  );
  return bloqueado;
}

async function buscarEnMaps(termino, browser) {
  const page = await browser.newPage();
  await configurarPagina(page);

  try {
    const url = `https://www.google.com/maps/search/${encodeURIComponent(termino)}`;
    console.log(`   Abriendo Maps: ${url}`);

    const MAX_INTENTOS_NAVEGACION = 3;
    let ultimoError = null;
    let navegado = false;

    for (let intento = 1; intento <= MAX_INTENTOS_NAVEGACION; intento++) {
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
        navegado = true;
        break;
      } catch (err) {
        ultimoError = err;
        console.warn(`   Fallo al abrir Maps (intento ${intento}/${MAX_INTENTOS_NAVEGACION}): ${err.message}`);
        if (intento < MAX_INTENTOS_NAVEGACION) {
          await esperarMs(5000 * intento);
        }
      }
    }

    if (!navegado) throw ultimoError;

    if (await detectarBloqueo(page)) {
      console.warn(`   Google bloqueó la búsqueda (tráfico inusual). Esperando 60s...`);
      await esperarMs(60000);
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      if (await detectarBloqueo(page)) {
        throw new Error("Google bloqueó la búsqueda después de reintentar");
      }
    }

    await page.waitForSelector('[role="feed"]', { timeout: 15000 });

    let prevCount = 0;
    let sameCount = 0;
    const maxIteraciones = 20;

    for (let s = 0; s < maxIteraciones; s++) {
      const enlacesActuales = await page.$$eval('a[href*="/maps/place/"]', (els) =>
        [...new Set(els.map((a) => a.href).filter((h) => h.includes("/maps/place/")))]
      );

      if (enlacesActuales.length === prevCount) sameCount++;
      else sameCount = 0;
      prevCount = enlacesActuales.length;

      if (enlacesActuales.length >= CONFIG.maxResultadosPorBusqueda) break;
      if (sameCount >= 3) break;

      await page.evaluate(() => {
        const panel = document.querySelector('[role="feed"]');
        if (panel) panel.scrollBy(0, 2000);
      });
      await esperarAleatorio(1000, 1800);
    }

    const enlaces = await page.$$eval('a[href*="/maps/place/"]', (els) =>
      [...new Set(els.map((a) => a.href).filter((h) => h.includes("/maps/place/")))]
    );

    console.log(`   Encontrados ${enlaces.length} negocios en "${termino}"`);
    return enlaces;
  } finally {
    await page.close();
  }
}

// ─── PROCESAR FICHAS EN PARALELO ────────────────────────────────

class BlockError extends Error {
  constructor(message, negociosParciales = [], enlacesFallidos = []) {
    super(message);
    this.name = 'BlockError';
    this.negociosParciales = negociosParciales;
    this.enlacesFallidos = enlacesFallidos;
  }
}

async function procesarFichasEnParalelo(enlaces, gestor, concurrenciaFichas) {
  const limite = Math.min(enlaces.length, CONFIG.maxResultadosPorBusqueda);
  if (limite === 0) return { negocios: [], fallidos: [] };

  const TAMANO_LOTE = concurrenciaFichas * 3;
  const enlacesRecortados = enlaces.slice(0, limite);

  let negocios = [];
  let fallidos = [];
  let totalAttempted = 0;
  let nullCount = 0;

  for (let inicio = 0; inicio < enlacesRecortados.length; inicio += TAMANO_LOTE) {
    const lote = enlacesRecortados.slice(inicio, inicio + TAMANO_LOTE);

    const resultados = await Promise.all(
      lote.map(async (enlace) => {
          const pagina = await gestor.obtener();
          totalAttempted++;
          try {
            const datos = await extraerFichaNegocio(pagina, enlace);
            await esperarAleatorio(300, 700);
            if (!datos) nullCount++;
            return { enlace, datos };
          } catch (err) {
            console.warn(`   Error en ficha: ${err.message}`);
            nullCount++;
            return { enlace, datos: null };
          } finally {
            gestor.liberar(pagina);
          }
        }
      )
    );

    negocios = negocios.concat(resultados.filter((r) => r.datos).map((r) => r.datos));
    fallidos = fallidos.concat(resultados.filter((r) => !r.datos).map((r) => r.enlace));

    const nullRatio = totalAttempted > 0 ? nullCount / totalAttempted : 0;
    const MIN_INTENTOS_PARA_BLOQUEO = 5;

    if (totalAttempted >= MIN_INTENTOS_PARA_BLOQUEO && nullRatio > 0.6) {
      console.warn(`   Alta tasa de fichas vacías (${(nullRatio * 100).toFixed(0)}%). Posible bloqueo de Google.`);
      const restantes = enlacesRecortados.slice(inicio + TAMANO_LOTE);
      throw new BlockError(
        `Posible bloqueo: ${(nullRatio * 100).toFixed(0)}% de fichas vacías`,
        negocios,
        [...fallidos, ...restantes]
      );
    }
  }

  return { negocios, fallidos };
}

// ─── PROCESAR UN NEGOCIO ──────────────────────────────────────────

async function procesarNegocio(negocio, browser, terminoBusqueda, categoriaUsuario) {
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
  let via = "—";

  // Extraer redes desde la URL de Maps si la web es una red social
  if (negocio.web) {
    const web = negocio.web;
    if (/facebook\.com\//i.test(web)) {
      const m = web.match(/facebook\.com\/([^\s"'<>?#]+)/i);
      if (m) datos.facebook = `facebook.com/${m[1]}`;
    } else if (/instagram\.com\//i.test(web)) {
      const usuario = extraerUsuarioInstagram(web);
      if (usuario) datos.instagram = `instagram.com/${usuario}`;
    } else if (/tiktok\.com\/@/i.test(web)) {
      const m = web.match(/tiktok\.com\/@([^\s"'<>?/]+)/i);
      if (m && m[1].toLowerCase() !== 'linktr.ee') datos.tiktok = `tiktok.com/@${m[1]}`;
    } else if (esUrlWhatsApp(web)) {
      datos.whatsapp = web;
    }
  }

  // Saltar webs que son redes sociales o agregadores (no se pueden scrapear)
  const partesRedSocial = [
    "facebook\\.com", "instagram\\.com", "tiktok\\.com", "wa\\.me", "wa\\.link",
    ...DOMINIOS_AGREGADORES.map((d) => d.replace(/\./g, "\\."))
  ].filter(Boolean);
  const esRedSocial = partesRedSocial.length > 0
    ? new RegExp(partesRedSocial.join("|"), "i").test(negocio.web)
    : false;

  let errorWeb = null;

  if (CONFIG.visitarWebDelNegocio && negocio.web && !esRedSocial) {
    try {
      const resultadoPrincipal = await visitarUrl(negocio.web, browser);
      const datosPrincipal = extraerDatosDeHtml(resultadoPrincipal.html);
      metodo = "maps+web";
      via = resultadoPrincipal.via;

      const urlContacto = buscarUrlPorPalabras(datosPrincipal.$, negocio.web, CONFIG.palabrasContacto);
      const urlSobreNostros = buscarUrlPorPalabras(datosPrincipal.$, negocio.web, ["sobre", "nosotros", "quienes", "quien-somos", "quien", "historia", "nuestra", "empresa"]);

      datos = datosPrincipal;
      const subpaginas = [urlContacto, urlSobreNostros];
      const yaVisitadas = new Set([negocio.web]);
      for (const url of subpaginas) {
        if (!url || url === negocio.web || yaVisitadas.has(url)) continue;
        yaVisitadas.add(url);
        try {
          console.log(`   Visitando subpagina: ${url}`);
          const resultadoSub = await visitarUrl(url, browser);
          const datosSub = extraerDatosDeHtml(resultadoSub.html);
          datos = combinarDatosContacto(datos, datosSub);
        } catch (_) {
          console.warn(`   No se pudo visitar subpagina (${url}), usando lo recopilado...`);
        }
      }
    } catch (err) {
      const msg = err.message.slice(0, 80);
      console.warn(`   No se pudo visitar web (${negocio.web}): ${msg}`);
      errorWeb = msg;
    }
  }

  const telefonoMaps = negocio.telefono
    ? limpiarTelefonoMaps(negocio.telefono) || "—"
    : "";

  const estadoFinal = !negocio.web
    ? "Sin web"
    : esRedSocial
    ? "Red social/agregador"
    : errorWeb
    ? `Web: ${errorWeb}`
    : "OK";

return {
    Nombre: limpiarTexto(negocio.nombre) || "—",
    Categoría: categoriaUsuario || limpiarTexto(negocio.categoria) || "—",
    Valoración: negocio.valoracion || "—",
    "Teléfono Maps": telefonoMaps || "—",
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
    Web: negocio.web || "—",
    URLMaps: negocio.urlMaps || "—",
    Búsqueda: terminoBusqueda,
    Método: metodo,
    Vía: via,
    Estado: estadoFinal,
  };
}

// ─── WRAPPER SEGURO PARA CONCURRENCIA ─────────────────────────────

async function procesarNegocioConError(negocio, browser, termino, categoria) {
  try {
    return await procesarNegocio(negocio, browser, termino, categoria);
  } catch (err) {
    console.error(`   Error inesperado: ${err.message}`);
    return {
      Nombre: negocio.nombre || "ERROR",
      Categoría: negocio.categoria || "",
      Valoración: "",
      "Teléfono Maps": negocio.telefono ? limpiarTelefonoMaps(negocio.telefono) || "—" : "",
      "Teléfono Web": "",
      Correo: "",
      WhatsApp: "",
      Instagram: "",
      Facebook: "",
      TikTok: "",
      FuenteInstagram: "",
      FuenteFacebook: "",
      FuenteTikTok: "",
      Dirección: negocio.direccion || "",
      Web: negocio.web || "",
      URLMaps: negocio.urlMaps || "",
      Búsqueda: termino,
      Método: "maps",
      Estado: err.message.slice(0, 100),
    };
  }
}

// ─── GUARDAR EXCEL ────────────────────────────────────────────────

async function guardarExcel(datos, ruta) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Contactos");

  ws.columns = [
    { header: "Nombre", key: "Nombre", width: 35 },
    { header: "Categoría", key: "Categoría", width: 25 },
    { header: "Valoración", key: "Valoración", width: 12 },
    { header: "Teléfono Maps", key: "Teléfono Maps", width: 22 },
    { header: "Teléfono Web", key: "Teléfono Web", width: 22 },
    { header: "Correo", key: "Correo", width: 35 },
    { header: "WhatsApp", key: "WhatsApp", width: 35 },
    { header: "Instagram", key: "Instagram", width: 30 },
    { header: "Facebook", key: "Facebook", width: 35 },
    { header: "TikTok", key: "TikTok", width: 28 },
    { header: "Dirección", key: "Dirección", width: 40 },
    { header: "Web", key: "Web", width: 40 },
    { header: "URL Maps", key: "URLMaps", width: 45 },
    { header: "Búsqueda", key: "Búsqueda", width: 35 },
    { header: "Método", key: "Método", width: 12 },
    { header: "Estado", key: "Estado", width: 18 },
  ];

  ws.getRow(1).eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E79" } };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });
  ws.getRow(1).height = 22;

  datos.forEach((r, i) => {
    const row = ws.addRow(r);

    if (i % 2 === 0) {
      row.eachCell((cell) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFE8F0FE" },
        };
      });
    }

    if (r.Estado !== "OK") {
      row.getCell("Estado").font = { color: { argb: "FFCC0000" }, bold: true };
    }

    row.alignment = { vertical: "middle" };
  });

  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 16 } };
  ws.views = [{ state: "frozen", ySplit: 1 }];

  await wb.xlsx.writeFile(ruta);
}

// ─── EXPORTAR EXCEL DESDE BD ───────────────────────────────────────

async function exportarExcel() {
  const todos = db.prepare(
    `SELECT nombre, categoria, valoracion, telefono_maps, telefono_web,
            correo, whatsapp, instagram, facebook, tiktok,
            direccion, web, url_maps, busqueda, metodo, via, estado
     FROM negocios ORDER BY id`
  ).all();

  // Dedupe por url_maps: los duplicados se conservan en la BD pero se omiten en el Excel
  const vistosUrlMaps = new Set();
  const unicos = [];
  for (const r of todos) {
    const u = r.url_maps;
    if (u && vistosUrlMaps.has(u)) continue;
    if (u) vistosUrlMaps.add(u);
    unicos.push(r);
  }
  const omitidos = todos.length - unicos.length;

  const exportData = unicos.map((r) => ({
    Nombre: r.nombre || "—",
    Categoría: r.categoria || "—",
    Valoración: r.valoracion || "—",
    "Teléfono Maps": r.telefono_maps || "—",
    "Teléfono Web": r.telefono_web || "—",
    Correo: r.correo || "—",
    WhatsApp: r.whatsapp || "—",
    Instagram: r.instagram || "—",
    Facebook: r.facebook || "—",
    TikTok: r.tiktok || "—",
    Dirección: r.direccion || "—",
    Web: r.web || "—",
    URLMaps: r.url_maps || "—",
    Búsqueda: r.busqueda || "—",
    Método: r.metodo || "—",
    Estado: r.estado || "—",
  }));

  checkpointWAL();
  await guardarExcel(exportData, CONFIG.archivoExcel);

  const ok = unicos.filter((r) => r.estado === "OK").length;
  const sinWeb = unicos.filter((r) => r.estado === "Sin web").length;
  const redSocial = unicos.filter((r) => r.estado === "Red social/agregador").length;
  const erroresBusqueda = unicos.filter((r) => r.nombre === "ERROR-BUSQUEDA").length;

  const busquedasUnicas = new Set(unicos.map((r) => r.busqueda).filter(Boolean)).size;

  console.log(`\n${"═".repeat(50)}`);
  console.log(` Exportación completada`);
  console.log(`   Búsquedas     : ${busquedasUnicas}`);
  console.log(`   Negocios      : ${unicos.length}${omitidos ? `  (${omitidos} duplicados omitidos)` : ""}`);
  console.log(`   Exitosos (OK)          : ${ok}`);
  console.log(`   Sin web (hallazgo)     : ${sinWeb}`);
  console.log(`   Red social como web    : ${redSocial}`);
  console.log(`   Búsquedas fallidas     : ${erroresBusqueda}`);
  console.log(`   Archivo       : ${CONFIG.archivoExcel}`);
  console.log(`   BD SQLite     : ${DB_PATH}`);
  console.log(`${"═".repeat(50)}\n`);
}

// ─── REANUDACIÓN ─────────────────────────────────────────────────

function terminoYaProcesado(termino) {
  const row = db.prepare(
    `SELECT COUNT(*) as count FROM negocios WHERE busqueda = ? AND nombre != 'ERROR-BUSQUEDA'`
  ).get(termino);
  return row.count > 0;
}

// ─── INTERRUPCIÓN POR TECLA ─────────────────────────────────────────

let accionInterrupcion = null;
let resolverMenu = null;

function esperarRespuestaMenu() {
  return new Promise((resolve) => {
    resolverMenu = resolve;
  });
}

function activarManejadorInterrupcion() {
  const rl = require("readline");
  rl.emitKeypressEvents(process.stdin);
  try { process.stdin.setRawMode(true); } catch (e) {}
  process.stdin.resume();

  process.stdin.on("keypress", (_str, key) => {
    if (!key) return;

    // Modo menú: capturar respuesta
    if (resolverMenu) {
      const r = (_str || "").trim().toLowerCase();
      if (r === "t") {
        accionInterrupcion = "terminar";
        console.log("   → Terminando y exportando...");
      } else {
        accionInterrupcion = "continuar";
        console.log("   → Continuando proceso...");
      }
      const resolve = resolverMenu;
      resolverMenu = null;
      resolve();
      return;
    }

    // Primera tecla durante scraping: marcar como interrumpido (sin mostrar menú aún)
    if (accionInterrupcion === null) {
      accionInterrupcion = "interrumpido";
    }
  });
}

function mostrarMenuInterrupcion() {
  console.log("\n\n   ⚠  Proceso interrumpido por el usuario\n");
  console.log(
    `   ¿Qué deseas hacer?\n` +
    `     [c] Continuar proceso\n` +
    `     [t] Terminar y exportar a Excel\n` +
    `   › `
  );
}

// Restaurar raw mode al salir para no dejar la terminal mal
process.on("exit", () => {
  try { if (process.stdin.isRaw) process.stdin.setRawMode(false); } catch (e) {}
});

let browserActivo = null;

async function cerrarLimpio(señal) {
  console.log(`\n\n   Señal ${señal} recibida, cerrando navegador y BD...`);
  try { if (browserActivo) await browserActivo.close(); } catch (_) {}
  try { checkpointWAL(); db.close(); } catch (_) {}
  try { if (process.stdin.isRaw) process.stdin.setRawMode(false); } catch (_) {}
  process.exit(0);
}

process.on("SIGINT", () => cerrarLimpio("SIGINT"));
process.on("SIGTERM", () => cerrarLimpio("SIGTERM"));

// ─── MAIN ─────────────────────────────────────────────────────────

async function main() {
  mostrarBanner();

  // Modo --export: solo genera Excel desde la BD sin scrapear
  if (process.argv.includes("--export")) {
    console.log(`\n   Modo exportación: generando Excel desde la BD...\n`);
    checkpointWAL();
    await exportarExcel();
    db.close();
    return;
  }

  console.log(`\n   ${'\x1b[36m'}ℹ${'\x1b[0m'}  Presiona ${'\x1b[1m'}cualquier tecla${'\x1b[0m'} durante el scraping para pausar. El menú de opciones aparece al terminar la búsqueda actual.\n`);
  await preguntarConfiguracion();
  activarManejadorInterrupcion();
  const terminos = generarTerminosDeBusqueda();
  const totalCombinaciones = CONFIG.CATEGORIAS.length * CONFIG.DISTRITOS.length;
  const concurrencia = CONFIG.concurrencia || 5;
  const concurrenciaFichas = CONFIG.concurrenciaFichas || 4;

  console.log(`\n Spider Maps Scraper`);
  console.log(`   Categorias    : ${CONFIG.CATEGORIAS.length}`);
  console.log(`   Distritos     : ${CONFIG.DISTRITOS.length}`);
  console.log(`   Combinaciones : ${totalCombinaciones}`);
  console.log(`   Max. negocios por busqueda : ${CONFIG.maxResultadosPorBusqueda}`);
  console.log(`   Concurrencia fichas: ${concurrenciaFichas}`);
  console.log(`   Concurrencia webs: ${concurrencia}`);
  console.log(`   Presiona cualquier tecla para pausar (menú al terminar la búsqueda actual)\n`);
  console.log(`${"─".repeat(50)}\n`);

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--lang=es-PE"],
    });
  } catch (err) {
    const msg = err.message || "";
    if (
      msg.includes("Could not find Chrome") ||
      msg.includes("Could not find expected browser") ||
      msg.includes("No Chrome binary found")
    ) {
      const red = "\x1b[31m";
      const yellow = "\x1b[33m";
      const cyan = "\x1b[36m";
      const reset = "\x1b[0m";
      console.error(`${red} ✖${reset}  ${red}No se encontró Chrome instalado${reset}`);
      console.log(`\n   ${cyan}Puppeteer necesita Chrome para funcionar.${reset}`);
      console.log(`   Solución: desde la raíz del proyecto, ejecuta:`);
      console.log(`     ${yellow}npx puppeteer browsers install chrome${reset}\n`);
      process.exit(1);
    }
    throw err;
  }
  browserActivo = browser;

  let pool = [];
  try {
    pool = await crearPoolPaginas(browser, concurrenciaFichas);
  } catch (err) {
    console.error(` Error creando pool de páginas: ${err.message}`);
    await browser.close();
    process.exit(1);
  }
  const gestor = crearGestorPool(pool);
  const limit = pLimit(concurrencia);

  try {
    for (let i = 0; i < terminos.length; i++) {
      const { termino, categoria: catUsuario } = terminos[i];
      console.log(`\n[Busqueda ${i + 1}/${terminos.length}] "${termino}"`);

      // Reanudación: saltar si ya fue procesado
      if (terminoYaProcesado(termino)) {
        console.log(`   Ya procesado anteriormente, saltando...`);
        continue;
      }

      let enlaces = [];
      try {
        enlaces = await buscarEnMaps(termino, browser);
      } catch (err) {
        console.error(` Error al buscar en Maps: ${err.message}`);
        guardarNegocio({
          Nombre: "ERROR-BUSQUEDA",
          Categoría: catUsuario,
          Búsqueda: termino,
          Estado: err.message.slice(0, 100),
        });
        continue;
      }

      let negocios = [];
      let fichasOk = false;
      let enlacesPendientes = enlaces;
      for (let intento = 0; intento < 3; intento++) {
        try {
          const resultado = await procesarFichasEnParalelo(enlacesPendientes, gestor, concurrenciaFichas);
          negocios = negocios.concat(resultado.negocios);
          fichasOk = true;
          break;
        } catch (err) {
          if (err.name !== 'BlockError') {
            console.error(`   Error inesperado en fichas: ${err.message}`);
            break;
          }
          negocios = negocios.concat(err.negociosParciales || []);
          enlacesPendientes = err.enlacesFallidos || enlacesPendientes;
          if (intento < 2) {
            console.warn(`   Reintentando tras posible bloqueo (intento ${intento + 1}/3) en 60s...`);
            await esperarMs(60000);
          }
        }
      }
      if (!fichasOk) {
        if (negocios.length > 0) {
          console.warn(`   Bloqueo persistente, pero se conservan ${negocios.length} fichas parciales extraídas antes del bloqueo.`);
        } else {
          console.error(`   Bloqueo persistente en fichas. Saltando término.`);
          guardarNegocio({
            Nombre: "ERROR-BUSQUEDA",
            Categoría: catUsuario,
            Búsqueda: termino,
            Estado: "Bloqueo persistente en extracción de fichas",
          });
          continue;
        }
      }

      console.log(`   Extraidas ${negocios.length} fichas. Enriquiciendo (concurrencia: ${concurrencia})...`);

      const promises = negocios.map((negocio) =>
        limit(() => procesarNegocioConError(negocio, browser, termino, catUsuario))
      );

      const resultados = await Promise.all(promises);

      for (const datos of resultados) {
        guardarNegocio(datos);
      }

      const total = contarNegocios();
      console.log(`   Almacenados: ${resultados.length} registros  Total en BD: ${total}`);
      checkpointWAL();

      // — Verificar interrupción (solo en punto seguro, después del batch)
      if (accionInterrupcion !== null) {
        mostrarMenuInterrupcion();
        await esperarRespuestaMenu();
        if (accionInterrupcion === "terminar") {
          break;
        }
        accionInterrupcion = null;
      }

      if (i < terminos.length - 1 && !accionInterrupcion) {
        await esperarAleatorio(
          CONFIG.esperaMsEntreBusquedas,
          CONFIG.esperaMsEntreBusquedas + 2000
        );
      }
    }
  } finally {
    for (const p of pool) await p.close().catch(() => {});
    await browser.close();
    browserActivo = null;
  }

  // ─── EXPORTAR A EXCEL DESDE SQLITE ─────────────────────────────

  await exportarExcel();

  checkpointWAL();
  db.close();
}

main().catch(console.error);
