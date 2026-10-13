const assert = require("node:assert/strict");
const puppeteer = require("puppeteer");

const url = process.env.UI_TEST_URL || "http://127.0.0.1:3001/";

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded" });

    const logo = await page.$eval(".spider-hero-section", (element) => {
      const box = element.getBoundingClientRect();
      return { visible: getComputedStyle(element).display !== "none", height: box.height };
    });
    assert.ok(logo.visible && logo.height > 0, "El logo RGB debe ser visible");

    await page.type("#inputDistrito", "San Borja");
    assert.equal(await page.$eval("#chipsDistritos", (element) => element.children.length), 0);
    await page.keyboard.press("Enter");
    assert.deepEqual(await page.$$eval("#chipsDistritos .chip", (elements) => elements.map((element) => element.firstChild.textContent)), ["San Borja"]);
    assert.equal(await page.$eval("#inputDistrito", (element) => element.placeholder), "");

    await page.type("#inputCategoria", "clínica dental,restaurante,");
    assert.deepEqual(await page.$$eval("#chipsCategorias .chip", (elements) => elements.map((element) => element.firstChild.textContent)), ["clínica dental", "restaurante"]);
    assert.equal(await page.$eval("#inputCategoria", (element) => element.placeholder), "");

    await page.click("#chipsDistritos .chip-remove");
    assert.equal(await page.$eval("#inputDistrito", (element) => element.placeholder), "Ej. Miraflores");

    const estado = await page.evaluate(async () => {
      const response = await fetch("/api/status");
      return response.json();
    });
    assert.ok(["idle", "running", "completed", "partial", "stopped", "error"].includes(estado.estado));
    assert.ok(estado.estadisticas);

    const historial = await page.evaluate(async () => (await fetch("/api/runs")).json());
    assert.ok(Array.isArray(historial.runs));

    const reintentoInvalido = await page.evaluate(async () => {
      const response = await fetch("/api/scrape/retry/no-valido", { method: "POST" });
      return response.status;
    });
    assert.equal(reintentoInvalido, 400);

    const descarga = await page.evaluate(async () => {
      const response = await fetch("/api/download/excel");
      return { status: response.status, type: response.headers.get("content-type"), bytes: (await response.arrayBuffer()).byteLength };
    });
    assert.equal(descarga.status, 200);
    assert.match(descarga.type, /spreadsheetml/);
    assert.ok(descarga.bytes > 1000);

    console.log("Panel comprobado: logo, etiquetas con espacios, ejemplos, estado y descarga Excel.");
  } finally {
    await browser.close();
  }
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
