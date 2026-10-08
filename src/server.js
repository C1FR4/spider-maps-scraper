const express = require("express");
const path = require("path");
const fs = require("fs");
const { exec } = require("child_process");
const { engine } = require("./scraperEngine");
const { obtenerRecientes, obtenerEstadisticas, contarNegocios } = require("./db");
const { exportarExcelDesdeDb } = require("./excel");
const { mostrarBanner } = require("../banner");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

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

  // Enviar estado inicial
  res.write(
    `event: status\ndata: ${JSON.stringify({
      estado: engine.activo ? "running" : "idle",
      mensaje: engine.activo ? "Extrayendo datos en segundo plano..." : "Listo para iniciar",
    })}\n\n`
  );

  req.on("close", () => {
    clientesSse.delete(res);
  });
});

app.get("/api/status", (req, res) => {
  res.json({
    activo: engine.activo,
    estadisticas: engine.estadisticas,
    totalBd: contarNegocios(),
  });
});

app.get("/api/records", (req, res) => {
  const limite = parseInt(req.query.limit, 10) || 50;
  const records = obtenerRecientes(limite);
  res.json({ records });
});

app.get("/api/stats", (req, res) => {
  const stats = obtenerEstadisticas();
  res.json(stats);
});

app.post("/api/scrape/start", async (req, res) => {
  if (engine.activo) {
    return res.status(400).json({ error: "Ya hay una tarea en ejecución." });
  }

  const {
    categorias = [],
    distritos = [],
    maxResultados = 30,
    modo = "turbo",
  } = req.body;

  if (!categorias.length || !distritos.length) {
    return res.status(400).json({ error: "Debes ingresar al menos una categoría y un distrito." });
  }

  // Iniciar en segundo plano
  engine.ejecutar({
    categorias,
    distritos,
    maxResultados: Number(maxResultados) || 30,
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

app.get("/api/download/excel", async (req, res) => {
  try {
    const { ruta } = await exportarExcelDesdeDb();
    if (fs.existsSync(ruta)) {
      res.download(ruta, "contactos_spider.xlsx");
    } else {
      res.status(404).json({ error: "No se encontró el archivo Excel." });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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

const server = app.listen(PORT, () => {
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
