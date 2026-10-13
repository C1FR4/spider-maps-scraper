const test = require("node:test");
const assert = require("node:assert/strict");
const { resolverZona, verificarUbicacion, coordenadasDeMaps } = require("../src/geo");

const mapsUrl = (lat, lon) => `https://www.google.com/maps/place/example/data=!8m2!3d${lat}!4d${lon}`;

test("lee las coordenadas de una ficha de Maps y omite URLs sin ellas", () => {
  assert.deepEqual(coordenadasDeMaps(mapsUrl(-12.078, -76.943)), [-76.943, -12.078]);
  assert.equal(coordenadasDeMaps("https://www.google.com/maps/place/example"), null);
});

test("acepta La Molina y excluye Barcelona y Lince", () => {
  const zona = resolverZona("La Molina / Lima / Lima");
  assert.equal(verificarUbicacion(mapsUrl(-12.078, -76.943), zona).estado, "dentro_zona");
  assert.equal(verificarUbicacion(mapsUrl(41.4012562, 2.1467284), zona).estado, "fuera_peru");
  assert.equal(verificarUbicacion(mapsUrl(-12.079849, -77.029932), zona).estado, "fuera_zona");
});

test("resuelve distritos repetidos con provincia y acepta el alias Surco", () => {
  assert.ok(resolverZona("San Isidro").ambiguo);
  assert.equal(resolverZona("San Isidro / Lima / Lima").features.length, 1);
  assert.equal(resolverZona("Surco / Lima / Lima").features[0].properties.distrito, "SANTIAGO DE SURCO");
  assert.throws(() => resolverZona("Distrito inventado"), /No se encontró/);
});

test("distingue distrito de provincia cuando comparten nombre", () => {
  assert.throws(() => resolverZona("Lima"), /Distrito: Lima.*Provincia: Lima/);
  assert.equal(resolverZona("Distrito: Lima").features.length, 1);
  assert.ok(resolverZona("Provincia: Lima").features.length > 30);
});

test("deja sin verificar las URLs sin coordenadas", () => {
  assert.equal(verificarUbicacion("https://www.google.com/maps/place/example", resolverZona("La Molina")).estado, "sin_coordenadas");
});
