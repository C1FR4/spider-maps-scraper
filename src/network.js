const dns = require("node:dns");
const http = require("node:http");
const https = require("node:https");
const ipaddr = require("ipaddr.js");

const MAX_HTML_BYTES = 3 * 1024 * 1024;
const MAX_REDIRECTS = 5;

function esDireccionPublica(direccion) {
  try {
    const ip = ipaddr.parse(direccion);
    if (ip.kind() === "ipv6" && ip.isIPv4MappedAddress()) {
      return ip.toIPv4Address().range() === "unicast";
    }
    return ip.range() === "unicast";
  } catch (_) {
    return false;
  }
}

function analizarUrl(url) {
  const parsed = new URL(url);
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error("La web debe usar HTTP o HTTPS sin credenciales.");
  }
  const host = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    throw new Error("No se permiten direcciones locales.");
  }
  if (ipaddr.isValid(host) && !esDireccionPublica(host)) {
    throw new Error("No se permiten direcciones IP privadas o reservadas.");
  }
  return parsed;
}

async function validarUrlPublica(url) {
  const parsed = analizarUrl(url);
  const host = parsed.hostname.replace(/^\[|\]$/g, "");
  if (!ipaddr.isValid(host)) {
    const direcciones = await dns.promises.lookup(host, { all: true });
    if (!direcciones.length || direcciones.some(({ address }) => !esDireccionPublica(address))) {
      throw new Error("El dominio apunta a una dirección privada o reservada.");
    }
  }
  return parsed;
}

function lookupPublico(host, opciones, callback) {
  dns.lookup(host, opciones, (error, address, family) => {
    if (error) return callback(error);
    if (Array.isArray(address)) {
      if (address.some((item) => !esDireccionPublica(item.address))) {
        return callback(new Error("El dominio apunta a una dirección privada o reservada."));
      }
      return callback(null, address);
    }
    if (!esDireccionPublica(address)) return callback(new Error("El dominio apunta a una dirección privada o reservada."));
    callback(null, address, family);
  });
}

async function obtenerHtmlPublico(url, { timeoutMs = 9000, headers = {} } = {}) {
  const deadline = Date.now() + timeoutMs;
  let actual = url;
  for (let salto = 0; salto <= MAX_REDIRECTS; salto++) {
    const parsed = await validarUrlPublica(actual);
    const restante = deadline - Date.now();
    if (restante <= 0) throw new Error("Tiempo de espera agotado al leer la web.");
    let timer;
    const resultado = await new Promise((resolve, reject) => {
      const cliente = parsed.protocol === "https:" ? https : http;
      const req = cliente.get(parsed, { headers, lookup: lookupPublico }, (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          res.resume();
          resolve({ redirect: new URL(res.headers.location, parsed).href });
          return;
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        const partes = [];
        let bytes = 0;
        res.on("data", (parte) => {
          bytes += parte.length;
          if (bytes > MAX_HTML_BYTES) {
            req.destroy(new Error("La página supera el límite de 3 MB."));
            return;
          }
          partes.push(parte);
        });
        res.on("end", () => resolve({ html: Buffer.concat(partes).toString("utf8") }));
        res.on("error", reject);
      });
      timer = setTimeout(() => req.destroy(new Error("Tiempo de espera agotado al leer la web.")), restante);
      req.on("error", reject);
    }).finally(() => clearTimeout(timer));
    if (resultado.html !== undefined) return resultado.html;
    actual = resultado.redirect;
  }
  throw new Error("La web redirigió demasiadas veces.");
}

module.exports = { esDireccionPublica, validarUrlPublica, obtenerHtmlPublico };
