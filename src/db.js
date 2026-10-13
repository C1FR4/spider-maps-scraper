const Database = require("better-sqlite3");
const path = require("path");

const DB_PATH = process.env.SPIDER_DB_PATH || path.join(__dirname, "..", "contactos.db");

let dbInstance = null;

function getDb() {
  if (!dbInstance) {
    dbInstance = new Database(DB_PATH);
    dbInstance.pragma("journal_mode = WAL");
    dbInstance.pragma("foreign_keys = ON");
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
      zona_busqueda TEXT DEFAULT '',
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

  const columnas = new Set(db.pragma("table_info(negocios)").map(({ name }) => name));
  for (const col of ["fuente_instagram", "fuente_facebook", "fuente_tiktok", "zona_busqueda"]) {
    if (!columnas.has(col)) db.exec(`ALTER TABLE negocios ADD COLUMN ${col} TEXT DEFAULT ''`);
  }
  db.exec(`
    UPDATE negocios SET zona_busqueda = TRIM(SUBSTR(busqueda, LENGTH(categoria) + 2))
    WHERE zona_busqueda = '' AND categoria != ''
      AND SUBSTR(busqueda, 1, LENGTH(categoria) + 1) = categoria || ' '
  `);

  db.exec("CREATE INDEX IF NOT EXISTS idx_url_maps ON negocios(url_maps)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_nombre_web ON negocios(nombre, web)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_nombre_direccion ON negocios(nombre, direccion)");
  db.exec(`
    CREATE TABLE IF NOT EXISTS negocio_busquedas (
      negocio_id INTEGER NOT NULL REFERENCES negocios(id) ON DELETE CASCADE,
      categoria TEXT NOT NULL,
      zona_busqueda TEXT NOT NULL,
      termino TEXT NOT NULL,
      creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (negocio_id, categoria, zona_busqueda)
    )
  `);
  db.exec("CREATE INDEX IF NOT EXISTS idx_busquedas_zona ON negocio_busquedas(zona_busqueda, negocio_id)");
  db.exec(`
    INSERT OR IGNORE INTO negocio_busquedas (negocio_id, categoria, zona_busqueda, termino)
    SELECT id, categoria, zona_busqueda,
      CASE WHEN busqueda != '' THEN busqueda ELSE TRIM(categoria || ' ' || zona_busqueda) END
    FROM negocios WHERE categoria != '' OR zona_busqueda != '' OR busqueda != ''
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS ejecuciones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      inicio TEXT NOT NULL,
      fin TEXT,
      estado TEXT NOT NULL,
      configuracion TEXT NOT NULL,
      estadisticas TEXT NOT NULL,
      fallos TEXT NOT NULL DEFAULT '[]'
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS geografia_pendiente (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      url_maps TEXT NOT NULL,
      busqueda TEXT NOT NULL,
      motivo TEXT NOT NULL,
      creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(url_maps, busqueda)
    )
  `);
}

function guardarPendienteGeografico({ nombre, urlMaps, busqueda, motivo }) {
  getDb().prepare(`
    INSERT INTO geografia_pendiente (nombre, url_maps, busqueda, motivo)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(url_maps, busqueda) DO UPDATE SET
      nombre = excluded.nombre,
      motivo = excluded.motivo
  `).run(nombre, urlMaps, busqueda, motivo);
}

function obtenerPendientesGeograficos(limite = 100) {
  return getDb().prepare("SELECT * FROM geografia_pendiente ORDER BY id DESC LIMIT ?").all(limite);
}

function checkpointWAL() {
  const db = getDb();
  try {
    db.pragma("wal_checkpoint(TRUNCATE)");
  } catch (_) {}
}

function buscarDuplicado(datos) {
  const db = getDb();
  const nombre = (datos.Nombre || datos.nombre || "").trim().toLowerCase();
  const web = (datos.Web || datos.web || "").trim().toLowerCase();
  const urlMaps = (datos.URLMaps || datos.urlMaps || datos.url_maps || "").trim();
  const direccion = (datos.Dirección || datos.direccion || "").trim().toLowerCase();

  if (urlMaps && urlMaps !== "—") {
    return db.prepare("SELECT id FROM negocios WHERE url_maps = ? LIMIT 1").get(urlMaps) || null;
  }
  if (!nombre || (!web || web === "—") && (!direccion || direccion === "—")) return null;

  const query = db.prepare(`
    SELECT id FROM negocios
    WHERE (url_maps = '' OR url_maps = '—') AND (
      (web != '' AND web != '—' AND web = @web COLLATE NOCASE AND nombre = @nombre COLLATE NOCASE)
       OR (direccion != '' AND direccion != '—' AND direccion = @direccion COLLATE NOCASE AND nombre = @nombre COLLATE NOCASE)
    )
    LIMIT 1
  `);

  return query.get({ nombre, web, url_maps: urlMaps, direccion }) || null;
}

function existeDuplicado(datos) {
  return !!buscarDuplicado(datos);
}

function registrarBusqueda(db, id, datos) {
  const categoria = datos.Categoría || datos.categoria || "";
  const zona = datos.ZonaBusqueda || datos.zona_busqueda || "";
  const termino = datos.Búsqueda || datos.busqueda || `${categoria} ${zona}`.trim();
  if (!termino) return;
  db.prepare(`
    INSERT OR IGNORE INTO negocio_busquedas (negocio_id, categoria, zona_busqueda, termino)
    VALUES (?, ?, ?, ?)
  `).run(id, categoria, zona, termino);
}

function guardarNegocio(datos) {
  const db = getDb();
  return db.transaction(() => {
  const duplicado = buscarDuplicado(datos);
  if (duplicado) {
    registrarBusqueda(db, duplicado.id, datos);
    return null;
  }
  const insert = db.prepare(`
    INSERT INTO negocios (
      nombre, categoria, zona_busqueda, valoracion, telefono_maps, telefono_web,
      correo, whatsapp, instagram, facebook, tiktok,
      direccion, web, url_maps, busqueda, metodo, estado,
      fuente_instagram, fuente_facebook, fuente_tiktok
    ) VALUES (
      @nombre, @categoria, @zona_busqueda, @valoracion, @telefono_maps, @telefono_web,
      @correo, @whatsapp, @instagram, @facebook, @tiktok,
      @direccion, @web, @url_maps, @busqueda, @metodo, @estado,
      @fuente_instagram, @fuente_facebook, @fuente_tiktok
    )
  `);

  const info = insert.run({
    nombre: datos.Nombre || datos.nombre || "",
    categoria: datos.Categoría || datos.categoria || "",
    zona_busqueda: datos.ZonaBusqueda || datos.zona_busqueda || "",
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

  registrarBusqueda(db, info.lastInsertRowid, datos);
  return info.lastInsertRowid;
  })();
}

function contarNegocios() {
  const db = getDb();
  const row = db.prepare("SELECT COUNT(*) as count FROM negocios").get();
  return row ? row.count : 0;
}

function obtenerTodos() {
  const db = getDb();
  return adjuntarBusquedas(db.prepare("SELECT * FROM negocios ORDER BY id DESC").all());
}

function obtenerRecientes(limite = 50) {
  const db = getDb();
  return adjuntarBusquedas(db.prepare("SELECT * FROM negocios ORDER BY id DESC LIMIT ?").all(limite));
}

function adjuntarBusquedas(rows) {
  if (!rows.length) return rows;
  const ids = rows.map((row) => row.id);
  const placeholders = ids.map(() => "?").join(",");
  const asociaciones = getDb().prepare(`
    SELECT negocio_id, categoria, zona_busqueda, termino
    FROM negocio_busquedas WHERE negocio_id IN (${placeholders})
    ORDER BY creado_en, rowid
  `).all(...ids);
  const porId = new Map(ids.map((id) => [id, []]));
  for (const asociacion of asociaciones) porId.get(asociacion.negocio_id).push(asociacion);
  return rows.map((row) => ({ ...row, busquedas_relacionadas: porId.get(row.id) }));
}

function obtenerZonas() {
  return getDb().prepare(`
    SELECT DISTINCT zona_busqueda FROM negocio_busquedas
    WHERE zona_busqueda != '' ORDER BY zona_busqueda COLLATE NOCASE
  `).all().map((row) => row.zona_busqueda);
}

function obtenerPaginados({ pagina = 1, limite = 60, zona = "", q = "", contacto = "todos" } = {}) {
  const db = getDb();
  const condiciones = [];
  const params = {};
  if (zona) {
    params.zona = zona;
    condiciones.push("EXISTS (SELECT 1 FROM negocio_busquedas b WHERE b.negocio_id = n.id AND b.zona_busqueda = @zona)");
  }
  if (q) {
    params.q = q;
    condiciones.push(`(
    instr(lower(n.nombre), lower(@q)) > 0 OR instr(lower(n.categoria), lower(@q)) > 0
    OR instr(lower(n.direccion), lower(@q)) > 0 OR instr(lower(n.web), lower(@q)) > 0
    OR instr(lower(n.telefono_maps), lower(@q)) > 0 OR instr(lower(n.telefono_web), lower(@q)) > 0
    OR instr(lower(n.correo), lower(@q)) > 0 OR instr(lower(n.whatsapp), lower(@q)) > 0
    OR instr(lower(n.estado), lower(@q)) > 0
    OR EXISTS (SELECT 1 FROM negocio_busquedas b WHERE b.negocio_id = n.id
      AND (instr(lower(b.categoria), lower(@q)) > 0 OR instr(lower(b.zona_busqueda), lower(@q)) > 0))
  )`);
  }
  const contactoSql = {
    telefono: "((n.telefono_maps != '' AND n.telefono_maps != '—') OR (n.telefono_web != '' AND n.telefono_web != '—'))",
    correo: "(n.correo != '' AND n.correo != '—')",
    whatsapp: "(n.whatsapp != '' AND n.whatsapp != '—')",
    incidencia: "(n.estado LIKE 'Web:%' OR n.estado LIKE 'Error%')",
  };
  if (contactoSql[contacto]) condiciones.push(contactoSql[contacto]);
  const where = condiciones.length ? `WHERE ${condiciones.join(" AND ")}` : "";
  const total = db.prepare("SELECT COUNT(*) AS count FROM negocios").get().count;
  const consultaConteo = db.prepare(`SELECT COUNT(*) AS count FROM negocios n ${where}`);
  const filtrados = (Object.keys(params).length ? consultaConteo.get(params) : consultaConteo.get()).count;
  const paginas = Math.max(1, Math.ceil(filtrados / limite));
  const paginaActual = Math.min(pagina, paginas);
  const records = db.prepare(`SELECT n.* FROM negocios n ${where} ORDER BY n.id DESC LIMIT @limite OFFSET @offset`)
    .all({ ...params, limite, offset: (paginaActual - 1) * limite });
  return { records: adjuntarBusquedas(records), total, filtrados, pagina: paginaActual, paginas };
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
  const pendientesGeograficos = db.prepare("SELECT COUNT(*) as count FROM geografia_pendiente").get().count;

  return {
    total,
    ok,
    conTelefono,
    conCorreo,
    conWhatsapp,
    conWeb,
    pendientesGeograficos,
  };
}

function vaciarBaseDeDatos() {
  const db = getDb();
  db.exec("DELETE FROM negocio_busquedas; DELETE FROM negocios; DELETE FROM ejecuciones; DELETE FROM geografia_pendiente; DELETE FROM sqlite_sequence WHERE name IN ('negocios', 'ejecuciones', 'geografia_pendiente');");
  checkpointWAL();
  return true;
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
  guardarPendienteGeografico,
  obtenerPendientesGeograficos,
  existeDuplicado,
  contarNegocios,
  obtenerTodos,
  obtenerRecientes,
  obtenerPaginados,
  obtenerZonas,
  terminoYaProcesado,
  obtenerEstadisticas,
  vaciarBaseDeDatos,
  checkpointWAL,
  cerrar,
};
