const path = require("path");
const fs = require("fs");
const { booleanPointInPolygon } = require("@turf/boolean-point-in-polygon");

const country = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "peru.geojson"), "utf8"));
const districts = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "distritos-peru.geojson"), "utf8"));

const PERU_BOUNDS = { west: -81.34, east: -68.65, south: -18.36, north: 0.0 };

function normalizar(texto) {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

const districtByName = new Map();
const provinceByName = new Map();
for (const feature of districts.features) {
  const { distrito, provincia } = feature.properties;
  const districtKey = normalizar(distrito);
  const provinceKey = normalizar(provincia);
  if (!districtByName.has(districtKey)) districtByName.set(districtKey, []);
  if (!provinceByName.has(provinceKey)) provinceByName.set(provinceKey, []);
  districtByName.get(districtKey).push(feature);
  provinceByName.get(provinceKey).push(feature);
}

function resolverZona(texto) {
  const [rawNombre, provincia, departamento] = String(texto || "").split("/").map(normalizar);
  const nombre = rawNombre === "SURCO" ? "SANTIAGO DE SURCO" : rawNombre;
  if (!nombre) throw new Error("Indica un distrito o una provincia del Perú.");
  let features = districtByName.get(nombre) || [];
  let tipo = "distrito";
  if (!features.length) {
    features = provinceByName.get(nombre) || [];
    tipo = "provincia";
  }
  if (provincia) features = features.filter((f) => normalizar(f.properties.provincia) === provincia);
  if (departamento) features = features.filter((f) => normalizar(f.properties.departamento) === departamento);
  if (!features.length) {
    throw new Error(`No se encontró la zona «${texto}» en los límites locales del Perú. Usa distrito / provincia / departamento si el nombre es ambiguo.`);
  }
  const lugares = new Set(features.map((f) => `${f.properties.distrito}|${f.properties.provincia}|${f.properties.departamento}`));
  return { nombre: texto, tipo, features, ambiguo: tipo === "distrito" && lugares.size > 1 };
}

function coordenadasDeMaps(url) {
  let value;
  try {
    value = decodeURIComponent(String(url || ""));
  } catch {
    value = String(url || "");
  }
  const matches = [...value.matchAll(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/g)];
  if (!matches.length) return null;
  const last = matches.at(-1);
  const lat = Number(last[1]);
  const lon = Number(last[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return [lon, lat];
}

function verificarUbicacion(url, zona) {
  const coords = coordenadasDeMaps(url);
  if (!coords) return { estado: "sin_coordenadas" };
  const [lon, lat] = coords;
  if (lon < PERU_BOUNDS.west || lon > PERU_BOUNDS.east || lat < PERU_BOUNDS.south || lat > PERU_BOUNDS.north) {
    return { estado: "fuera_peru", coords };
  }
  if (!country.features.some((f) => booleanPointInPolygon(coords, f))) {
    return { estado: "fuera_peru", coords };
  }
  if (!zona.features.some((f) => booleanPointInPolygon(coords, f))) {
    return { estado: "fuera_zona", coords };
  }
  return { estado: "dentro_zona", coords };
}

module.exports = { normalizar, resolverZona, coordenadasDeMaps, verificarUbicacion };
