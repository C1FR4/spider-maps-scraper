const fs = require("fs");
const path = require("path");

// ─── CARGAR CONFIGURACIÓN DESDE config.json ───────────────────────
const CONFIG_PATH = path.join(__dirname, "..", "config.json");
if (!fs.existsSync(CONFIG_PATH)) {
  throw new Error("No se encontró config.json. Crea el archivo antes de ejecutar.");
}
const CONFIG = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));

// ─── CARGAR TLDS VÁLIDOS DESDE tlds.json ──────────────────────────
const TLDS_PATH = path.join(__dirname, "..", "tlds.json");
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

    // Si es un número puro largo (probablemente teléfono o ID numérico), no es un username real
    if (/^\d{7,}$/.test(primero)) return null;

    if (/^[a-zA-Z0-9._]{2,40}$/.test(primero)) return primero;
    return null;
  } catch (_) {
    return null;
  }
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

function esUrlWhatsApp(href) {
  return /^https?:\/\/(wa\.me|(api\.|chat\.)?whatsapp\.com|wa\.link)\b|^\/\/(wa\.me|(api\.|chat\.)?whatsapp\.com|wa\.link)\b|^whatsapp:\/\//i.test(href);
}

function decodificarCloudflareEmail(encodedString) {
  if (!encodedString || encodedString.length < 2) return "";
  try {
    const k = parseInt(encodedString.substr(0, 2), 16);
    let email = "";
    for (let n = 2; n < encodedString.length; n += 2) {
      const charCode = parseInt(encodedString.substr(n, 2), 16) ^ k;
      email += String.fromCharCode(charCode);
    }
    return email.trim();
  } catch (_) {
    return "";
  }
}

function decodificarEntidadesHtml(str) {
  if (!str) return "";
  return str
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&commat;/gi, "@")
    .replace(/&period;/gi, ".")
    .replace(/&amp;/gi, "&");
}

module.exports = {
  // Constantes exportadas para tests (si se necesitan)
  INSTAGRAM_NO_PROFILE,
  RESERVED_USERNAMES,
  TLDS_VALIDOS,
  DOMINIOS_BASURA,
  DOMINIOS_PLACEHOLDER_RE,
  DOMINIO_CORREO_PLACEHOLDER,
  EXTENSIONES_NO_CORREO,
  PALABRAS_LOCAL_PLACEHOLDER_RE,
  // Funciones
  extraerUsuarioInstagram,
  esTelefonoValido,
  normalizarTelefonoPe,
  esCorreoValido,
  extraerNumeroDeWhatsApp,
  esUrlWhatsApp,
  decodificarCloudflareEmail,
  decodificarEntidadesHtml,
};