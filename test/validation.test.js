const test = require("node:test");
const assert = require("node:assert/strict");
const { validarSolicitudInicio } = require("../src/validation");

test("la API conserva nombres compuestos y elimina duplicados sin distinguir mayúsculas", () => {
  const { configuracion } = validarSolicitudInicio({
    categorias: [" clínica dental ", "CLÍNICA DENTAL"],
    distritos: [" San   Borja ", "san borja"],
    maxResultados: 10,
  });
  assert.deepEqual(configuracion.categorias, ["clínica dental"]);
  assert.deepEqual(configuracion.distritos, ["San Borja"]);
});

test("la API limita combinaciones y resultados", () => {
  const categorias = Array.from({ length: 11 }, (_, i) => `categoría ${i}`);
  const distritos = Array.from({ length: 10 }, (_, i) => `distrito ${i}`);
  assert.match(validarSolicitudInicio({ categorias, distritos }).error, /100 combinaciones/);
  assert.match(validarSolicitudInicio({ categorias: ["x"], distritos: ["y"], maxResultados: 1001 }).error, /entre 1 y 1000/);
  assert.equal(validarSolicitudInicio({ categorias: ["x"], distritos: ["y"], maxResultados: 300 }).configuracion.maxResultados, 300);
  assert.equal(validarSolicitudInicio({ categorias: ["x"], distritos: ["y"], maxResultados: 1000 }).configuracion.maxResultados, 1000);
  assert.match(validarSolicitudInicio({ categorias: ["x"], distritos: ["y"], maxResultados: 35.5 }).error, /entero/);
});
