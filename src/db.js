const Database = require("better-sqlite3");
const path = require("path");

const DB_PATH = path.join(__dirname, "..", "contactos.db");

let dbInstance = null;

function getDb() {
  if (!dbInstance) {
    dbInstance = new Database(DB_PATH);
    dbInstance.pragma("journal_mode = WAL");
    inicializarEsquema(dbInstance);
  }
  return dbInstance;
}

function inicializarEsquema(db) {
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
      estado TEXT DEFAULT '',
      creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const columnasFuente = ["fuente_instagram", "fuente_facebook", "fuente_tiktok"];
  for (const col of columnasFuente) {
    try {
      db.exec(`ALTER TABLE negocios ADD COLUMN ${col} TEXT DEFAULT ''`);
    } catch (_) {}
  }

  db.exec("CREATE INDEX IF NOT EXISTS idx_url_maps ON negocios(url_maps)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_nombre_web ON negocios(nombre, web)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_nombre_direccion ON negocios(nombre, direccion)");
}

function checkpointWAL() {
  const db = getDb();
  try {
    db.pragma("wal_checkpoint(TRUNCATE)");
  } catch (_) {}
}

function existeDuplicado(datos) {
  const db = getDb();
  const nombre = (datos.Nombre || datos.nombre || "").trim().toLowerCase();
  const web = (datos.Web || datos.web || "").trim().toLowerCase();
  const urlMaps = (datos.URLMaps || datos.urlMaps || datos.url_maps || "").trim();
  const direccion = (datos.Dirección || datos.direccion || "").trim().toLowerCase();

  if (!urlMaps && (!nombre || (!web && !direccion))) return false;

  const query = db.prepare(`
    SELECT id FROM negocios
    WHERE (url_maps != '' AND url_maps = @url_maps)
       OR (web != '' AND web = @web COLLATE NOCASE AND nombre = @nombre COLLATE NOCASE)
       OR (direccion != '' AND direccion = @direccion COLLATE NOCASE AND nombre = @nombre COLLATE NOCASE)
    LIMIT 1
  `);

  const dup = query.get({ nombre, web, url_maps: urlMaps, direccion });
  return !!dup;
}

function guardarNegocio(datos) {
  const db = getDb();
  if (existeDuplicado(datos)) return null;

  const insert = db.prepare(`
    INSERT INTO negocios (
      nombre, categoria, valoracion, telefono_maps, telefono_web,
      correo, whatsapp, instagram, facebook, tiktok,
      direccion, web, url_maps, busqueda, metodo, estado,
      fuente_instagram, fuente_facebook, fuente_tiktok
    ) VALUES (
      @nombre, @categoria, @valoracion, @telefono_maps, @telefono_web,
      @correo, @whatsapp, @instagram, @facebook, @tiktok,
      @direccion, @web, @url_maps, @busqueda, @metodo, @estado,
      @fuente_instagram, @fuente_facebook, @fuente_tiktok
    )
  `);

  const info = insert.run({
    nombre: datos.Nombre || datos.nombre || "",
    categoria: datos.Categoría || datos.categoria || "",
    valoracion: datos.Valoración || datos.valoracion || "",
    telefono_maps: datos["Teléfono Maps"] || datos.telefono_maps || "",
    telefono_web: datos["Teléfono Web"] || datos.telefono_web || "",
    correo: datos.Correo || datos.correo || "",
    whatsapp: datos.WhatsApp || datos.whatsapp || "",
    instagram: datos.Instagram || datos.instagram || "",
    facebook: datos.Facebook || datos.facebook || "",
    tiktok: datos.TikTok || datos.tiktok || "",
    direccion: datos.Dirección || datos.direccion || "",
    web: datos.Web || datos.web || "",
    url_maps: datos.URLMaps || datos.url_maps || "",
    busqueda: datos.Búsqueda || datos.busqueda || "",
    metodo: datos.Método || datos.metodo || "",
    estado: datos.Estado || datos.estado || "",
    fuente_instagram: datos.FuenteInstagram || datos.fuente_instagram || "",
    fuente_facebook: datos.FuenteFacebook || datos.fuente_facebook || "",
    fuente_tiktok: datos.FuenteTikTok || datos.fuente_tiktok || "",
  });

  return info.lastInsertRowid;
}

function contarNegocios() {
  const db = getDb();
  const row = db.prepare("SELECT COUNT(*) as count FROM negocios").get();
  return row ? row.count : 0;
}

function obtenerTodos() {
  const db = getDb();
  return db.prepare("SELECT * FROM negocios ORDER BY id DESC").all();
}

function obtenerRecientes(limite = 50) {
  const db = getDb();
  return db.prepare("SELECT * FROM negocios ORDER BY id DESC LIMIT ?").all(limite);
}

function terminoYaProcesado(termino) {
  const db = getDb();
  const row = db.prepare(
    "SELECT COUNT(*) as count FROM negocios WHERE busqueda = ? AND nombre != 'ERROR-BUSQUEDA'"
  ).get(termino);
  return row ? row.count > 0 : false;
}

function obtenerEstadisticas() {
  const db = getDb();
  const total = db.prepare("SELECT COUNT(*) as count FROM negocios").get().count;
  const ok = db.prepare("SELECT COUNT(*) as count FROM negocios WHERE estado = 'OK'").get().count;
  const conTelefono = db.prepare("SELECT COUNT(*) as count FROM negocios WHERE (telefono_maps != '' AND telefono_maps != '—') OR (telefono_web != '' AND telefono_web != '—')").get().count;
  const conCorreo = db.prepare("SELECT COUNT(*) as count FROM negocios WHERE correo != '' AND correo != '—'").get().count;
  const conWhatsapp = db.prepare("SELECT COUNT(*) as count FROM negocios WHERE whatsapp != '' AND whatsapp != '—'").get().count;
  const conWeb = db.prepare("SELECT COUNT(*) as count FROM negocios WHERE web != '' AND web != '—'").get().count;

  return {
    total,
    ok,
    conTelefono,
    conCorreo,
    conWhatsapp,
    conWeb,
  };
}

function cerrar() {
  if (dbInstance) {
    try {
      checkpointWAL();
      dbInstance.close();
    } catch (_) {}
    dbInstance = null;
  }
}

module.exports = {
  getDb,
  DB_PATH,
  guardarNegocio,
  existeDuplicado,
  contarNegocios,
  obtenerTodos,
  obtenerRecientes,
  terminoYaProcesado,
  obtenerEstadisticas,
  checkpointWAL,
  cerrar,
};
