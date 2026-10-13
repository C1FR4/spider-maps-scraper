const express = require("express");
const path = require("path");
const { exec } = require("child_process");
const { engine } = require("./scraperEngine");
const { obtenerPaginados, obtenerZonas, obtenerEstadisticas, obtenerPendientesGeograficos, contarNegocios, vaciarBaseDeDatos } = require("./db");
const { exportarExcelBufferDesdeDb } = require("./excel");
const { mostrarBanner } = require("../banner");
const { obtenerEjecuciones, obtenerEjecucion, recuperarInterrumpidas } = require("./runs");
const { validarSolicitudInicio } = require("./validation");
const { protegerApiLocal } = require("./localApi");

recuperarInterrumpidas();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "32kb" }));
app.use(express.static(path.join(__dirname, "..", "public")));
app.use("/api", protegerApiLocal);

// Clientes SSE conectados
const clientesSse = new Set();

function enviarSse(evento, data) {
  const mensaje = `event: ${evento}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clientesSse) {
    try {
      res.write(mensaje);
    } catch (_) {
      clientesSse.delete(res);
    }
  }
}

// Conectar eventos del scraper al stream SSE
engine.on("status", (data) => enviarSse("status", data));
engine.on("progress", (data) => enviarSse("progress", data));
engine.on("log", (data) => enviarSse("log", data));
engine.on("lead", (data) => enviarSse("lead", data));
engine.on("done", (data) => enviarSse("done", data));

// ─── ENDPOINTS DE API ──────────────────────────────────────────────

app.get("/api/scrape/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  clientesSse.add(res);

  // Enviar el último estado completo tras abrir o reconectar el panel.
  res.write(`event: status\ndata: ${JSON.stringify(engine.obtenerEstado())}\n\n`);

  req.on("close", () => {
    clientesSse.delete(res);
  });
});

app.get("/api/status", (req, res) => {
  res.json({
    ...engine.obtenerEstado(),
    totalBd: contarNegocios(),
  });
});

app.get("/api/records", (req, res) => {
  const limite = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 60));
  const pagina = Math.max(1, parseInt(req.query.page, 10) || 1);
  const zona = typeof req.query.zona === "string" ? req.query.zona.slice(0, 80) : "";
  const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";
  const contacto = typeof req.query.contacto === "string" ? req.query.contacto : "todos";
  res.json(obtenerPaginados({ pagina, limite, zona, q, contacto }));
});

app.get("/api/zones", (req, res) => {
  res.json({ zonas: obtenerZonas() });
});

app.get("/api/stats", (req, res) => {
  const stats = obtenerEstadisticas();
  res.json(stats);
});

app.get("/api/geography/pending", (req, res) => {
  res.json({ records: obtenerPendientesGeograficos(100) });
});

app.get("/api/runs", (req, res) => {
  res.json({ runs: obtenerEjecuciones(10) });
});

app.post("/api/scrape/start", async (req, res) => {
  if (engine.activo) {
    return res.status(400).json({ error: "Ya hay una tarea en ejecución." });
  }

  const resultado = validarSolicitudInicio(req.body);
  if (resultado.error) return res.status(400).json({ error: resultado.error });
  const { categorias, distritos, maxResultados, modo } = resultado.configuracion;

  // Iniciar en segundo plano
  engine.ejecutar({
    categorias,
    distritos,
    maxResultados,
    modo,
  }).catch((err) => {
    console.error("Error en ejecución del scraper:", err);
  });

  res.json({
    ok: true,
    mensaje: "Extracción iniciada con éxito.",
    categorias,
    distritos,
    modo,
  });
});

app.post("/api/scrape/stop", (req, res) => {
  if (!engine.activo) {
    return res.json({ ok: false, mensaje: "No hay ninguna extracción en curso." });
  }
  engine.solicitarDetencion();
  res.json({ ok: true, mensaje: "Detención solicitada." });
});

app.post("/api/scrape/retry/:id", (req, res) => {
  if (engine.activo) return res.status(409).json({ error: "Ya hay una extracción en curso." });
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: "ID de ejecución inválido." });
  const run = obtenerEjecucion(id);
  if (!run) return res.status(404).json({ error: "No se encontró la ejecución." });
  if (!run.fallos.length) return res.status(400).json({ error: "Esta ejecución no tiene búsquedas fallidas para reintentar." });

  const terminos = [...new Map(run.fallos.map(({ categoria, distrito }) =>
    [`${categoria.toLocaleLowerCase("es")}|${distrito.toLocaleLowerCase("es")}`, { categoria, distrito }]
  )).values()];
  engine.ejecutar({ ...run.configuracion, terminos }).catch((err) => {
    console.error("Error al reintentar la extracción:", err);
  });
  res.json({ ok: true, mensaje: `Reintentando ${terminos.length} búsqueda(s).` });
});

app.get("/api/download/excel", async (req, res) => {
  try {
    const { buffer, total } = await exportarExcelBufferDesdeDb();
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="contactos_spider.xlsx"');
    res.setHeader("Content-Length", buffer.length);
    res.setHeader("X-Record-Count", String(total));
    res.send(buffer);
  } catch (err) {
    console.error("Error al exportar Excel:", err);
    res.status(500).json({ error: "No se pudo generar el Excel. Revisa el registro del servidor." });
  }
});

app.post("/api/database/clear", (req, res) => {
  if (engine.activo) {
    return res.status(400).json({ error: "No puedes vaciar la base de datos mientras hay una extracción en curso." });
  }
  try {
    vaciarBaseDeDatos();
    res.json({ ok: true, mensaje: "Base de datos reiniciada con éxito." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/system/shutdown", (req, res) => {
  res.json({ ok: true, mensaje: "Servidor cerrándose..." });
  console.log("\n  [Sistema] Apagado solicitado desde el Panel Web.");
  setTimeout(() => {
    process.exit(0);
  }, 600);
});

app.use("/api", (err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err.type === "entity.parse.failed") return res.status(400).json({ error: "El JSON enviado no es válido." });
  if (err.type === "entity.too.large") return res.status(413).json({ error: "La solicitud supera el tamaño permitido." });
  console.error(`Error en ${req.method} ${req.path}:`, err);
  res.status(500).json({ error: "Error interno del servidor. Revisa la terminal para más detalles." });
});

// ─── INICIAR SERVIDOR ──────────────────────────────────────────────

function abrirNavegador(url) {
  const start =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
      ? "start"
      : "xdg-open";
  exec(`${start} ${url}`);
}

const server = app.listen(PORT, "127.0.0.1", () => {
  mostrarBanner();
  const url = `http://localhost:${PORT}`;
  console.log(`\n  Panel Web activo en: \x1b[36m${url}\x1b[0m`);
  console.log(`  Presiona \x1b[1mCtrl+C\x1b[0m para apagar el servidor.\n`);

  // Abrir navegador automáticamente si no se deshabilita
  if (process.env.NO_OPEN !== "1") {
    setTimeout(() => abrirNavegador(url), 1200);
  }
});

module.exports = { app, server };
