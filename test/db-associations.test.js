const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const temporal = fs.mkdtempSync(path.join(os.tmpdir(), "spider-relaciones-test-"));
process.env.SPIDER_DB_PATH = path.join(temporal, "contactos.db");
const db = require("../src/db");

test("conserva todas las búsquedas de un negocio deduplicado", () => {
  const base = { Nombre: "Negocio A", URLMaps: "https://maps.example/a" };
  assert.ok(db.guardarNegocio({ ...base, Categoría: "bodega", ZonaBusqueda: "Comas", Búsqueda: "bodega Comas" }));
  assert.equal(db.guardarNegocio({ ...base, Categoría: "minimarket", ZonaBusqueda: "Independencia", Búsqueda: "minimarket Independencia" }), null);
  assert.equal(db.contarNegocios(), 1);
  assert.deepEqual(db.obtenerZonas(), ["Comas", "Independencia"]);
  assert.equal(db.obtenerPaginados({ zona: "Independencia" }).records[0].busquedas_relacionadas.length, 2);
});

test("no fusiona sucursales con igual nombre y web cuando Maps les da fichas distintas", () => {
  const base = { Nombre: "Boticas Perú", Web: "https://boticasperu.pe", Categoría: "boticas" };
  const primera = db.guardarNegocio({ ...base, URLMaps: "https://maps.example/sucursal-comas", Dirección: "Comas", ZonaBusqueda: "Comas" });
  const segunda = db.guardarNegocio({ ...base, URLMaps: "https://maps.example/sucursal-independencia", Dirección: "Independencia", ZonaBusqueda: "Independencia" });
  assert.ok(primera);
  assert.ok(segunda);
  assert.notEqual(primera, segunda);
  assert.equal(db.obtenerPaginados({ zona: "Independencia", q: "Boticas Perú" }).filtrados, 1);
});

test("pagina y filtra sobre todos los registros, no solo los recientes", () => {
  for (let i = 0; i < 70; i++) {
    db.guardarNegocio({ Nombre: `Prueba ${i}`, URLMaps: `https://maps.example/${i}`, Categoría: "farmacia", ZonaBusqueda: "San Borja", Búsqueda: "farmacia San Borja" });
  }
  const primera = db.obtenerPaginados({ limite: 60, pagina: 1, zona: "San Borja" });
  const segunda = db.obtenerPaginados({ limite: 60, pagina: 2, zona: "San Borja" });
  assert.equal(primera.filtrados, 70);
  assert.equal(primera.records.length, 60);
  assert.equal(segunda.records.length, 10);
  assert.equal(db.obtenerPaginados({ zona: "Independencia", q: "Negocio A" }).filtrados, 1);
});

test.after(() => {
  db.cerrar();
  fs.rmSync(temporal, { recursive: true, force: true });
});
