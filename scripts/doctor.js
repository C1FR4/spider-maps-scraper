const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
let errores = 0;

async function revisar(nombre, prueba, ayuda) {
  try {
    const detalle = await prueba();
    console.log(`[OK] ${nombre}${detalle ? `: ${detalle}` : ""}`);
  } catch (err) {
    errores++;
    console.error(`[FALLO] ${nombre}: ${err.message}`);
    if (ayuda) console.error(`        ${ayuda}`);
  }
}

(async () => {
await revisar("Node.js", () => {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 22 || (major === 22 && minor < 12)) {
    throw new Error(`v${process.versions.node} es anterior a 22.12`);
  }
  return `v${process.versions.node}`;
}, "Instala Node.js 22.12 o superior y repite npm ci.");

await revisar("Dependencias", () => {
  for (const paquete of ["express", "better-sqlite3", "exceljs", "puppeteer", "cheerio"]) {
    require.resolve(paquete, { paths: [root] });
  }
  return "paquetes principales disponibles";
}, "Ejecuta npm ci desde la carpeta del proyecto.");

await revisar("SQLite nativo", () => {
  const Database = require("better-sqlite3");
  const db = new Database(":memory:");
  db.prepare("SELECT 1").get();
  db.close();
  return "módulo cargado";
}, "Si aparece node-gyp o MSBuild, usa Node 22 LTS o instala Visual Studio Build Tools con C++. ");

await revisar("Chrome de Puppeteer", async () => {
  const ejecutable = await require("puppeteer").executablePath();
  if (!fs.existsSync(ejecutable)) throw new Error(`no se encontró en ${ejecutable}`);
  return ejecutable;
}, "Ejecuta npx puppeteer browsers install chrome.");

await revisar("Carpeta de datos", () => {
  fs.accessSync(root, fs.constants.W_OK);
  return "escritura disponible";
}, "Mueve el proyecto a una carpeta donde tengas permiso de escritura.");

console.log(errores ? `\n${errores} comprobación(es) requieren atención.` : "\nEntorno listo para iniciar el panel.");
process.exitCode = errores ? 1 : 0;
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
