/**
 * Prueba funcional completa del nuevo motor modular.
 * - Arranca el navegador con Stealth
 * - Busca en Google Maps
 * - Extrae ficha de un negocio
 * - Enriquece la web con el motor Turbo (fetch real)
 * - Guarda en SQLite y genera Excel
 * Mide tiempos de cada fase.
 */

const { engine } = require("../src/scraperEngine");
const { obtenerRecientes } = require("../src/db");

let totalLeads = 0;
const tiempos = { inicio: null, finMaps: null, finEnrich: null };

engine.on("log", ({ tipo, texto }) => {
  const prefix = tipo === "error" ? "❌" : tipo === "warn" ? "⚠️" : tipo === "debug" ? "🔍" : "ℹ️";
  console.log(`  ${prefix} ${texto}`);
});

engine.on("lead", (lead) => {
  totalLeads++;
  if (!tiempos.finMaps) tiempos.finMaps = Date.now();
  console.log(`\n  ✅ Lead #${totalLeads}: ${lead.Nombre}`);
  console.log(`     Categoría  : ${lead.Categoría}`);
  console.log(`     Tel Maps   : ${lead["Teléfono Maps"]}`);
  console.log(`     Tel Web    : ${lead["Teléfono Web"]}`);
  console.log(`     WhatsApp   : ${lead.WhatsApp}`);
  console.log(`     Correo     : ${lead.Correo}`);
  console.log(`     Instagram  : ${lead.Instagram}`);
  console.log(`     Web        : ${lead.Web}`);
  console.log(`     Estado     : ${lead.Estado}`);
  console.log(`     Método     : ${lead.Método}`);
});

engine.on("done", ({ duracionSegundos, totalNegocios, archivoExcel }) => {
  tiempos.finEnrich = Date.now();
  const elapsed = ((tiempos.finEnrich - tiempos.inicio) / 1000).toFixed(1);
  console.log("\n" + "═".repeat(55));
  console.log("  PRUEBA COMPLETADA CON ÉXITO");
  console.log("═".repeat(55));
  console.log(`  Leads extraídos   : ${totalLeads}`);
  console.log(`  Total en BD       : ${totalNegocios}`);
  console.log(`  Duración total    : ${duracionSegundos}s reportados / ${elapsed}s reales`);
  console.log(`  Excel generado    : ${archivoExcel}`);
  console.log("═".repeat(55));
  process.exit(0);
});

(async () => {
  console.log("\n" + "═".repeat(55));
  console.log("  PRUEBA FUNCIONAL - Spider Maps Scraper v2.0 Turbo");
  console.log("═".repeat(55));
  console.log("  Categoría : dental");
  console.log("  Distrito  : San Isidro");
  console.log("  Máximo    : 2 negocios");
  console.log("  Modo      : turbo (HTTP Fetch rápido)");
  console.log("═".repeat(55) + "\n");

  tiempos.inicio = Date.now();
  try {
    await engine.ejecutar({
      categorias: ["dental"],
      distritos: ["San Isidro"],
      maxResultados: 2,
      modo: "turbo",
      concurrenciaFichas: 2,
      concurrenciaEnriquecimiento: 2,
    });
  } catch (err) {
    console.error("Error en prueba:", err);
    process.exit(1);
  }
})();
