function normalizarLista(valor) {
  if (!Array.isArray(valor)) return [];
  const vistos = new Set();
  const resultado = [];
  for (const item of valor) {
    if (typeof item !== "string") continue;
    const limpio = item.trim().replace(/\s+/g, " ");
    if (!limpio || limpio.length > 80) continue;
    const clave = limpio.toLocaleLowerCase("es");
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    resultado.push(limpio);
  }
  return resultado;
}

function validarSolicitudInicio(body = {}) {
  const categorias = normalizarLista(body.categorias);
  const distritos = normalizarLista(body.distritos);
  const maxResultados = Number(body.maxResultados ?? 30);
  const modo = body.modo ?? "turbo";

  if (!categorias.length || !distritos.length) {
    return { error: "Debes ingresar al menos una categoría y un distrito." };
  }
  if (categorias.length * distritos.length > 100) {
    return { error: "Máximo 100 combinaciones por ejecución." };
  }
  if (!Number.isInteger(maxResultados) || maxResultados < 1 || maxResultados > 100) {
    return { error: "Resultados por búsqueda debe estar entre 1 y 100." };
  }
  if (!["turbo", "deep"].includes(modo)) {
    return { error: "Modo de extracción inválido." };
  }
  return { configuracion: { categorias, distritos, maxResultados, modo } };
}

module.exports = { normalizarLista, validarSolicitudInicio };
