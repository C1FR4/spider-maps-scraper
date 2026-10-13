const test = require("node:test");
const assert = require("node:assert/strict");
const { esDireccionPublica, validarUrlPublica } = require("../src/network");

test("rechaza direcciones locales, privadas y reservadas", async () => {
  for (const address of ["127.0.0.1", "192.168.1.1", "10.0.0.2", "100.64.0.1", "::1", "::ffff:127.0.0.1"]) {
    assert.equal(esDireccionPublica(address), false, address);
  }
  assert.equal(esDireccionPublica("8.8.8.8"), true);
  await assert.rejects(validarUrlPublica("http://localhost:3000/api/status"), /locales/);
  await assert.rejects(validarUrlPublica("http://192.168.1.1/"), /privadas/);
  await assert.rejects(validarUrlPublica("file:///etc/passwd"), /HTTP o HTTPS/);
});
