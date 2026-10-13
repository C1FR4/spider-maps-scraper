const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Database = require("better-sqlite3");

const temporal = fs.mkdtempSync(path.join(os.tmpdir(), "spider-zona-test-"));
process.env.SPIDER_DB_PATH = path.join(temporal, "contactos.db");

test("recupera la zona de registros anteriores solo cuando coincide con la categoría", () => {
  const antigua = new Database(process.env.SPIDER_DB_PATH);
  antigua.exec(`
    CREATE TABLE negocios (
      id INTEGER PRIMARY KEY, nombre TEXT, categoria TEXT,
      web TEXT, direccion TEXT, url_maps TEXT, busqueda TEXT
    );
    INSERT INTO negocios (nombre, categoria, busqueda)
    VALUES ('Uno', 'clínica dental', 'clínica dental San Borja'),
           ('Dos', 'heladerías', 'restaurantes Comas');
  `);
  antigua.close();

  const { obtenerTodos, cerrar } = require("../src/db");
  const rows = obtenerTodos();
  assert.equal(rows.find((row) => row.nombre === "Uno").zona_busqueda, "San Borja");
  assert.equal(rows.find((row) => row.nombre === "Dos").zona_busqueda, "");
  cerrar();
});

test.after(() => fs.rmSync(temporal, { recursive: true, force: true }));
