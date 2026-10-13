const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const ExcelJS = require("exceljs");

const temporal = fs.mkdtempSync(path.join(os.tmpdir(), "spider-excel-test-"));
process.env.SPIDER_DB_PATH = path.join(temporal, "contactos.db");

const { guardarNegocio, cerrar } = require("../src/db");
const { exportarExcelBufferDesdeDb } = require("../src/excel");

test("dos descargas simultáneas entregan libros completos sin tocar el mismo archivo", async () => {
  guardarNegocio({ Nombre: "Prueba Uno", Categoría: "cafetería", URLMaps: "https://maps.example/uno", Estado: "OK" });
  guardarNegocio({ Nombre: "Prueba Dos", Categoría: "farmacia", URLMaps: "https://maps.example/dos", Estado: "Sin web" });

  const resultados = await Promise.all([exportarExcelBufferDesdeDb(), exportarExcelBufferDesdeDb()]);
  for (const { buffer, total } of resultados) {
    assert.equal(total, 2);
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(buffer);
    const hoja = libro.getWorksheet("Contactos");
    assert.equal(hoja.rowCount, 3);
    assert.deepEqual([hoja.getCell("A2").value, hoja.getCell("A3").value], ["Prueba Dos", "Prueba Uno"]);
  }
});

test.after(() => {
  cerrar();
  fs.rmSync(temporal, { recursive: true, force: true });
});
