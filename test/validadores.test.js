const test = require("node:test");
const assert = require("node:assert/strict");
const {
  extraerUsuarioInstagram,
  esTelefonoValido,
  esCorreoValido,
  extraerNumeroDeWhatsApp,
  esUrlWhatsApp,
  decodificarCloudflareEmail,
  decodificarEntidadesHtml,
} = require("../lib/validadores");

test("extraerUsuarioInstagram - username válido", () => {
  const result = extraerUsuarioInstagram("https://www.instagram.com/usuario_valido/");
  assert.equal(result, "usuario_valido");
});

test("extraerUsuarioInstagram - /reel/... debe devolver null (regresión)", () => {
  const result = extraerUsuarioInstagram("https://www.instagram.com/reel/ABC123/");
  assert.equal(result, null);
});

test("extraerUsuarioInstagram - /reels/... (plural) debe devolver null (regresión)", () => {
  const result = extraerUsuarioInstagram("https://www.instagram.com/reels/ABC123/");
  assert.equal(result, null);
});

test("extraerUsuarioInstagram - /p/... debe devolver null", () => {
  const result = extraerUsuarioInstagram("https://www.instagram.com/p/ABC123/");
  assert.equal(result, null);
});

test("extraerUsuarioInstagram - /explore/... debe devolver null", () => {
  const result = extraerUsuarioInstagram("https://www.instagram.com/explore/");
  assert.equal(result, null);
});

test("extraerUsuarioInstagram - URL inválida devuelve null", () => {
  const result = extraerUsuarioInstagram("no-es-una-url");
  assert.equal(result, null);
});

test("esTelefonoValido - números válidos peruanos", () => {
  // Móvil peruano 9 dígitos
  assert.ok(esTelefonoValido("987654321"));
  // Fijo peruano 7 dígitos
  assert.ok(esTelefonoValido("2345678"));
  // Fijo peruano 8 dígitos
  assert.ok(esTelefonoValido("23456789"));
  // Con código de país +51
  assert.ok(esTelefonoValido("+51 987 654 321"));
  assert.ok(esTelefonoValido("51987654321"));
});

test("esTelefonoValido - números muy cortos (inválidos)", () => {
  assert.ok(!esTelefonoValido("123456")); // 6 dígitos
  assert.ok(!esTelefonoValido("12345")); // 5 dígitos
  assert.ok(!esTelefonoValido("")); // vacío
});

test("esTelefonoValido - números muy largos (inválidos)", () => {
  assert.ok(!esTelefonoValido("1234567890123456")); // 16 dígitos
  assert.ok(!esTelefonoValido("51987654321098765")); // >15 dígitos
});

test("esTelefonoValido - números que empiezan con 10 o 20 de 11 dígitos (inválidos)", () => {
  assert.ok(!esTelefonoValido("10123456789"));
  assert.ok(!esTelefonoValido("20123456789"));
});

test("esTelefonoValido - números 20XXXXXX (inválidos)", () => {
  assert.ok(!esTelefonoValido("20123456"));
  assert.ok(!esTelefonoValido("20987654"));
});

test("esCorreoValido - correo normal válido", () => {
  assert.ok(esCorreoValido("usuario@ejemplo.com"));
  assert.ok(esCorreoValido("juan.perez@empresa.com.pe"));
  assert.ok(esCorreoValido("contacto+info@dominio.org"));
});

test("esCorreoValido - dominio placeholder de config.json rechazado", () => {
  // example.com está en config.json dominiosPlaceholder
  assert.ok(!esCorreoValido("test@example.com"));
  // test.com está en config.json dominiosPlaceholder
  assert.ok(!esCorreoValido("correo@test.com"));
  // tudominio.com está en config.json dominiosPlaceholder
  assert.ok(!esCorreoValido("usuario@tudominio.com"));
});

test("esCorreoValido - TLD inexistente rechazado", () => {
  // TLD que no existe en IANA (tlds.json)
  assert.ok(!esCorreoValido("usuario@dominio.invalido"));
  assert.ok(!esCorreoValido("test@empresa.noexiste"));
});

test("esCorreoValido - dominio en DOMINIOS_BASURA rechazado", () => {
  assert.ok(!esCorreoValido("algo@sentry.io"));
  assert.ok(!esCorreoValido("test@amazonaws.com"));
});

test("esCorreoValido - extensión de archivo rechazada", () => {
  assert.ok(!esCorreoValido("imagen@dominio.png"));
  assert.ok(!esCorreoValido("archivo@sitio.pdf"));
  assert.ok(!esCorreoValido("test@dominio.webp"));
});

test("esCorreoValido - palabras placeholder en parte local rechazadas", () => {
  // noreply, no-reply, placeholder, dummy, ejemplo, example, test, tuemail, tucorreo
  assert.ok(!esCorreoValido("noreply@dominio.com"));
  assert.ok(!esCorreoValido("no-reply@empresa.com"));
  assert.ok(!esCorreoValido("placeholder@test.org"));
  assert.ok(!esCorreoValido("dummy@correo.net"));
  assert.ok(!esCorreoValido("ejemplo@dominio.com"));
  assert.ok(!esCorreoValido("example@empresa.org"));
  assert.ok(!esCorreoValido("test@correo.com"));
  assert.ok(!esCorreoValido("tuemail@dominio.net"));
  assert.ok(!esCorreoValido("tucorreo@empresa.com"));
});

test("esCorreoValido - correo.* placeholder rechazado", () => {
  assert.ok(!esCorreoValido("usuario@correo.dominio.com"));
});

test("extraerNumeroDeWhatsApp - desde wa.me", () => {
  const result = extraerNumeroDeWhatsApp("https://wa.me/51987654321");
  assert.equal(result, "51987654321");
});

test("extraerNumeroDeWhatsApp - desde whatsapp.com con phone param", () => {
  const result = extraerNumeroDeWhatsApp("https://api.whatsapp.com/send?phone=51987654321");
  assert.equal(result, "51987654321");
});

test("extraerNumeroDeWhatsApp - desde wa.link", () => {
  const result = extraerNumeroDeWhatsApp("https://wa.link/51987654321");
  assert.equal(result, "51987654321");
});

test("extraerNumeroDeWhatsApp - URL inválida devuelve vacío", () => {
  const result = extraerNumeroDeWhatsApp("no-es-url");
  assert.equal(result, "");
});

test("esUrlWhatsApp - wa.me", () => {
  assert.ok(esUrlWhatsApp("https://wa.me/51987654321"));
  assert.ok(esUrlWhatsApp("http://wa.me/51987654321"));
});

test("esUrlWhatsApp - whatsapp.com", () => {
  assert.ok(esUrlWhatsApp("https://api.whatsapp.com/send?phone=51987654321"));
  assert.ok(esUrlWhatsApp("https://chat.whatsapp.com/invite/xxx"));
  assert.ok(esUrlWhatsApp("https://whatsapp.com/xxxx"));
});

test("esUrlWhatsApp - wa.link", () => {
  assert.ok(esUrlWhatsApp("https://wa.link/abc123"));
});

test("esUrlWhatsApp - protocolo whatsapp://", () => {
  assert.ok(esUrlWhatsApp("whatsapp://send?phone=51987654321"));
});

test("esUrlWhatsApp - URLs no WhatsApp devuelven false", () => {
  assert.ok(!esUrlWhatsApp("https://facebook.com/usuario"));
  assert.ok(!esUrlWhatsApp("https://instagram.com/usuario"));
  assert.ok(!esUrlWhatsApp("https://google.com"));
  assert.ok(!esUrlWhatsApp("mailto:test@test.com"));
  assert.ok(!esUrlWhatsApp("tel:+51987654321"));
});

test("decodificarCloudflareEmail - decodifica emails protegidos por Cloudflare", () => {
  // Test con string hex típico de Cloudflare (k=0x5a, 'contacto@ejemplo.com')
  // 'c' = 99 ^ 0x5a = 99 ^ 90 = 57 -> 0x39
  const original = "contacto@ejemplo.com";
  const key = 0x5a;
  let hex = key.toString(16).padStart(2, "0");
  for (let i = 0; i < original.length; i++) {
    hex += (original.charCodeAt(i) ^ key).toString(16).padStart(2, "0");
  }
  const decoded = decodificarCloudflareEmail(hex);
  assert.equal(decoded, "contacto@ejemplo.com");
});

test("decodificarEntidadesHtml - decodifica entidades en correos", () => {
  const encoded = "ventas&#64;negocio.pe";
  assert.equal(decodificarEntidadesHtml(encoded), "ventas@negocio.pe");
});