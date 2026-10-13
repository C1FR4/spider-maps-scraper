const { getDb } = require("./db");

function serializar(fila) {
  if (!fila) return null;
  return {
    id: fila.id,
    inicio: fila.inicio,
    fin: fila.fin,
    estado: fila.estado,
    configuracion: JSON.parse(fila.configuracion),
    estadisticas: JSON.parse(fila.estadisticas),
    fallos: JSON.parse(fila.fallos),
  };
}

function crearEjecucion(configuracion, estadisticas) {
  const db = getDb();
  const info = db.prepare(`
    INSERT INTO ejecuciones (inicio, estado, configuracion, estadisticas, fallos)
    VALUES (?, 'running', ?, ?, '[]')
  `).run(new Date().toISOString(), JSON.stringify(configuracion), JSON.stringify(estadisticas));
  return Number(info.lastInsertRowid);
}

function actualizarEjecucion(id, estado, estadisticas, fallos, terminada = false) {
  if (!id) return;
  getDb().prepare(`
    UPDATE ejecuciones
    SET estado = ?, estadisticas = ?, fallos = ?, fin = CASE WHEN ? THEN ? ELSE fin END
    WHERE id = ?
  `).run(estado, JSON.stringify(estadisticas), JSON.stringify(fallos), terminada ? 1 : 0, new Date().toISOString(), id);
}

function obtenerEjecucion(id) {
  return serializar(getDb().prepare("SELECT * FROM ejecuciones WHERE id = ?").get(id));
}

function obtenerEjecuciones(limite = 10) {
  return getDb().prepare("SELECT * FROM ejecuciones ORDER BY id DESC LIMIT ?").all(limite).map(serializar);
}

function recuperarInterrumpidas() {
  const db = getDb();
  const pendientes = db.prepare("SELECT * FROM ejecuciones WHERE estado = 'running'").all();
  const actualizar = db.prepare("UPDATE ejecuciones SET estado = 'interrupted', fin = ?, fallos = ? WHERE id = ?");
  db.transaction(() => {
    for (const fila of pendientes) {
      const configuracion = JSON.parse(fila.configuracion);
      const estadisticas = JSON.parse(fila.estadisticas);
      const fallos = JSON.parse(fila.fallos);
      const terminos = configuracion.terminos || configuracion.categorias.flatMap((categoria) =>
        configuracion.distritos.map((distrito) => ({ categoria, distrito }))
      );
      const claves = new Set(fallos.map((f) => `${f.categoria}\0${f.distrito}`));
      for (const termino of terminos.slice(estadisticas.busquedasCompletadas || 0)) {
        const clave = `${termino.categoria}\0${termino.distrito}`;
        if (claves.has(clave)) continue;
        fallos.push({ categoria: termino.categoria, distrito: termino.distrito, motivo: "Pendiente tras interrupción del servidor" });
        claves.add(clave);
      }
      actualizar.run(new Date().toISOString(), JSON.stringify(fallos), fila.id);
    }
  })();
}

module.exports = { crearEjecucion, actualizarEjecucion, obtenerEjecucion, obtenerEjecuciones, recuperarInterrumpidas };
