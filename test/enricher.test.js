const test = require("node:test");
const assert = require("node:assert/strict");
const { extraerDatosDeHtml, esRedSocialOAgregador } = require("../src/enricher");

test("extrae teléfonos visibles sin confundir RUC ni precios", () => {
  const html = "<body>RUC: 20123456789. Precio S/ 12345678. Teléfono: 999 123 456. Fijo: 23456789.</body>";
  const telefono = extraerDatosDeHtml(html).telefonoWeb;
  assert.match(telefono, /999123456/);
  assert.ok(!telefono.includes("23456789"));
  assert.ok(!telefono.includes("12345678"));
});

test("acepta un fijo cuando la etiqueta indica que es un teléfono", () => {
  assert.equal(extraerDatosDeHtml("<body>Teléfono: 234 5678</body>").telefonoWeb, "2345678");
});

test("prioriza el número visible si el enlace tel contiene un dígito extra", () => {
  const html = '<body><a href="tel:+510120677000">01 206-7000</a></body>';
  assert.equal(extraerDatosDeHtml(html).telefonoWeb, "012067000");
});

test("clasifica redes sociales por dominio real", () => {
  assert.equal(esRedSocialOAgregador("https://www.facebook.com/empresa"), true);
  assert.equal(esRedSocialOAgregador("https://notfacebook.com/empresa"), false);
  assert.equal(esRedSocialOAgregador("https://ejemplo.com/facebook.com/empresa"), false);
});
