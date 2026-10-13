const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const temporal = fs.mkdtempSync(path.join(os.tmpdir(), "spider-runs-test-"));
process.env.SPIDER_DB_PATH = path.join(temporal, "contactos.db");

const { cerrar, vaciarBaseDeDatos } = require("../src/db");
const { crearEjecucion, actualizarEjecucion, obtenerEjecucion, obtenerEjecuciones, recuperarInterrumpidas } = require("../src/runs");

test("el historial conserva incidencias y recupera ejecuciones interrumpidas", () => {
  const configuracion = { categorias: ["clínica dental"], distritos: ["San Borja"], modo: "turbo", maxResultados: 10, terminos: [{ categoria: "clínica dental", distrito: "San Borja" }] };
  const id = crearEjecucion(configuracion, { busquedasTotales: 1, busquedasCompletadas: 0 });
  assert.equal(obtenerEjecucion(id).estado, "running");
  recuperarInterrumpidas();
  assert.equal(obtenerEjecucion(id).estado, "interrupted");
  assert.equal(obtenerEjecucion(id).fallos.length, 1);

  const fallos = [{ categoria: "clínica dental", distrito: "San Borja", motivo: "Error en Maps" }];
  actualizarEjecucion(id, "partial", { busquedasTotales: 1, busquedasCompletadas: 1, errores: 1 }, fallos, true);
  assert.deepEqual(obtenerEjecuciones(10)[0].fallos, fallos);
  assert.equal(obtenerEjecucion(id).configuracion.distritos[0], "San Borja");

  vaciarBaseDeDatos();
  assert.equal(obtenerEjecuciones(10).length, 0);
});

test.after(() => {
  cerrar();
  fs.rmSync(temporal, { recursive: true, force: true });
});
