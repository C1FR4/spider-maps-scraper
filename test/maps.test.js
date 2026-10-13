const test = require("node:test");
const assert = require("node:assert/strict");
const { buscarEnlacesEnMaps } = require("../src/maps");

test("conserva enlaces de Maps aunque desaparezcan al desplazar la lista", async () => {
  const enlaces = ["uno", "dos", "tres"].map((nombre) => `https://www.google.com/maps/place/${nombre}`);
  let lectura = 0;
  const page = {
    setUserAgent: async () => {},
    setViewport: async () => {},
    setRequestInterception: async () => {},
    on: () => {},
    goto: async () => {},
    $: async () => null,
    url: () => "https://www.google.com/maps/search/prueba",
    waitForSelector: async () => true,
    $$eval: async () => [enlaces[Math.min(lectura++, enlaces.length - 1)]],
    evaluate: async () => {},
    close: async () => {},
  };
  const resultado = await buscarEnlacesEnMaps("prueba", { newPage: async () => page }, 3, null, () => true, () => false, 0);
  assert.deepEqual(resultado.enlaces, enlaces);
  assert.equal(resultado.motivo, "objetivo");
});

test("una cantidad personalizada de 300 supera el antiguo límite de 80 desplazamientos", async () => {
  let lectura = 0;
  const page = {
    setUserAgent: async () => {}, setViewport: async () => {}, setRequestInterception: async () => {},
    on: () => {}, goto: async () => {}, $: async () => null,
    url: () => "https://www.google.com/maps/search/prueba",
    waitForSelector: async () => true,
    $$eval: async () => [`https://www.google.com/maps/place/${++lectura}`],
    evaluate: async () => {}, close: async () => {},
  };
  const resultado = await buscarEnlacesEnMaps("prueba", { newPage: async () => page }, 300, null, () => true, () => false, 0);
  assert.equal(resultado.enlaces.length, 300);
  assert.equal(resultado.motivo, "objetivo");
});

test("la búsqueda de enlaces termina cuando se solicita detenerla", async () => {
  let lecturas = 0;
  const page = {
    setUserAgent: async () => {}, setViewport: async () => {}, setRequestInterception: async () => {},
    on: () => {}, goto: async () => {}, $: async () => null,
    url: () => "https://www.google.com/maps/search/prueba",
    waitForSelector: async () => true,
    $$eval: async () => { lecturas++; return []; },
    evaluate: async () => {}, close: async () => {},
  };
  const resultado = await buscarEnlacesEnMaps("prueba", { newPage: async () => page }, 300, null, () => true, () => true, 0);
  assert.equal(resultado.motivo, "detenido");
  assert.equal(lecturas, 0);
});

test("informa cuando Maps deja de mostrar fichas antes del máximo solicitado", async () => {
  const page = {
    setUserAgent: async () => {}, setViewport: async () => {}, setRequestInterception: async () => {},
    on: () => {}, goto: async () => {}, $: async () => null,
    url: () => "https://www.google.com/maps/search/prueba",
    waitForSelector: async () => true,
    $$eval: async () => ["https://www.google.com/maps/place/unico"],
    evaluate: async () => {}, close: async () => {},
  };
  const resultado = await buscarEnlacesEnMaps("prueba", { newPage: async () => page }, 300, null, () => true, () => false, 0);
  assert.equal(resultado.enlaces.length, 1);
  assert.equal(resultado.motivo, "sin_nuevos");
});
