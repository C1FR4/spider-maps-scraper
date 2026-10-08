const ExcelJS = require("exceljs");
const path = require("path");
const fs = require("fs");
const { obtenerTodos, checkpointWAL } = require("./db");

const CONFIG_PATH = path.join(__dirname, "..", "config.json");
let CONFIG = { archivoExcel: "contactos.xlsx" };
if (fs.existsSync(CONFIG_PATH)) {
  try {
    CONFIG = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
  } catch (_) {}
}

async function guardarExcel(datos, ruta = null) {
  const rutaDestino = ruta || path.join(__dirname, "..", CONFIG.archivoExcel || "contactos.xlsx");
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Contactos");

  ws.columns = [
    { header: "Nombre", key: "Nombre", width: 32 },
    { header: "Categoría", key: "Categoría", width: 22 },
    { header: "Valoración", key: "Valoración", width: 12 },
    { header: "Teléfono Maps", key: "Teléfono Maps", width: 20 },
    { header: "Teléfono Web", key: "Teléfono Web", width: 20 },
    { header: "Correo", key: "Correo", width: 32 },
    { header: "WhatsApp", key: "WhatsApp", width: 32 },
    { header: "Instagram", key: "Instagram", width: 28 },
    { header: "Facebook", key: "Facebook", width: 30 },
    { header: "TikTok", key: "TikTok", width: 26 },
    { header: "Dirección", key: "Dirección", width: 38 },
    { header: "Web", key: "Web", width: 38 },
    { header: "URL Maps", key: "URLMaps", width: 42 },
    { header: "Búsqueda", key: "Búsqueda", width: 30 },
    { header: "Método", key: "Método", width: 12 },
    { header: "Estado", key: "Estado", width: 16 },
  ];

  ws.getRow(1).eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });
  ws.getRow(1).height = 24;

  datos.forEach((r, i) => {
    const row = ws.addRow(r);

    if (i % 2 === 0) {
      row.eachCell((cell) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF8FAFC" },
        };
      });
    }

    if (r.Estado !== "OK" && r.Estado !== "Sin web") {
      row.getCell("Estado").font = { color: { argb: "FFDC2626" }, bold: true };
    } else if (r.Estado === "OK") {
      row.getCell("Estado").font = { color: { argb: "FF16A34A" }, bold: true };
    }

    row.alignment = { vertical: "middle" };
  });

  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 16 } };
  ws.views = [{ state: "frozen", ySplit: 1 }];

  await wb.xlsx.writeFile(rutaDestino);
  return rutaDestino;
}

async function exportarExcelDesdeDb(rutaPersonalizada = null) {
  checkpointWAL();
  const todos = obtenerTodos();

  const vistosUrlMaps = new Set();
  const unicos = [];
  for (const r of todos) {
    const u = r.url_maps;
    if (u && vistosUrlMaps.has(u)) continue;
    if (u) vistosUrlMaps.add(u);
    unicos.push(r);
  }

  const exportData = unicos.map((r) => ({
    Nombre: r.nombre || "—",
    Categoría: r.categoria || "—",
    Valoración: r.valoracion || "—",
    "Teléfono Maps": r.telefono_maps || "—",
    "Teléfono Web": r.telefono_web || "—",
    Correo: r.correo || "—",
    WhatsApp: r.whatsapp || "—",
    Instagram: r.instagram || "—",
    Facebook: r.facebook || "—",
    TikTok: r.tiktok || "—",
    Dirección: r.direccion || "—",
    Web: r.web || "—",
    URLMaps: r.url_maps || "—",
    Búsqueda: r.busqueda || "—",
    Método: r.metodo || "—",
    Estado: r.estado || "—",
  }));

  const rutaFinal = await guardarExcel(exportData, rutaPersonalizada);
  return {
    ruta: rutaFinal,
    total: unicos.length,
    omitidos: todos.length - unicos.length,
  };
}

module.exports = {
  guardarExcel,
  exportarExcelDesdeDb,
};
