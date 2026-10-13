const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const SOURCES = {
  country: "https://github.com/wmgeolab/geoBoundaries/raw/90a1d52/releaseData/gbOpen/PER/ADM0/geoBoundaries-PER-ADM0_simplified.geojson",
  districts: "https://www.datosabiertos.gob.pe/sites/default/files/DISTRITOS_LIMITES.zip",
};

async function download(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response;
}

async function main() {
  const output = path.join(__dirname, "..", "data");
  fs.mkdirSync(output, { recursive: true });
  const [countryResponse, districtResponse] = await Promise.all([
    download(SOURCES.country),
    download(SOURCES.districts),
  ]);
  const country = await countryResponse.json();
  if (country.type !== "FeatureCollection" || !country.features?.length) {
    throw new Error("El límite de Perú no es válido.");
  }
  const zipPath = path.join(output, ".ign-distritos.zip");
  const geojsonPath = path.join(output, ".ign-distritos.geojson");
  let districts;
  try {
    fs.writeFileSync(zipPath, Buffer.from(await districtResponse.arrayBuffer()));
    const result = spawnSync("npx", [
      "--yes", "mapshaper@0.7.84", zipPath,
      "-simplify", "5%", "keep-shapes",
      "-o", "format=geojson", geojsonPath,
    ], { stdio: "inherit", shell: process.platform === "win32" });
    if (result.error || result.status !== 0) throw result.error || new Error("No se pudo simplificar la capa del IGN.");
    districts = JSON.parse(fs.readFileSync(geojsonPath, "utf8"));
  } finally {
    for (const file of [zipPath, geojsonPath]) {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
  }
  if (districts.type !== "FeatureCollection" || districts.features?.length < 1890) {
    throw new Error("El catálogo distrital del IGN está incompleto.");
  }
  const minimal = {
    type: "FeatureCollection",
    features: districts.features.map(({ properties, geometry }) => ({
      type: "Feature",
      properties: {
        ubigeo: properties.UBIGEO,
        distrito: properties.DISTRITO,
        provincia: properties.PROVINCIA,
        departamento: properties.DEPARTAMEN,
      },
      geometry,
    })),
  };
  fs.writeFileSync(path.join(output, "peru.geojson"), JSON.stringify(country));
  fs.writeFileSync(path.join(output, "distritos-peru.geojson"), JSON.stringify(minimal));
  console.log(`Datos geográficos listos: ${minimal.features.length} distritos.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
