const test = require("node:test");
const assert = require("node:assert/strict");
const { protegerApiLocal } = require("../src/localApi");

function comprobar(headers, method = "POST") {
  let estado = 200;
  let permitido = false;
  protegerApiLocal(
    { headers, method, socket: { localPort: 3001 } },
    { status(value) { estado = value; return this; }, json() {} },
    () => { permitido = true; }
  );
  return { estado, permitido };
}

test("solo permite acciones desde el origen local del panel", () => {
  assert.equal(comprobar({ host: "localhost:3001", origin: "http://localhost:3001" }).permitido, true);
  assert.equal(comprobar({ host: "localhost:3001", origin: "https://sitio-ajeno.example" }).estado, 403);
  assert.equal(comprobar({ host: "localhost:3001", "sec-fetch-site": "cross-site" }).estado, 403);
  assert.equal(comprobar({ host: "sitio-ajeno.example:3001" }, "GET").estado, 403);
});
