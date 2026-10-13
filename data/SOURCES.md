# Procedencia de los límites geográficos

- `distritos-peru.geojson`: límites distritales del **Instituto Geográfico Nacional del Perú (IGN)**, publicados en el [Portal Nacional de Datos Abiertos](https://www.datosabiertos.gob.pe/dataset/limites-departamentales), recurso «Límites Distritales» (`DISTRITOS_LIMITES.zip`). El portal indica la licencia [Open Data Commons Attribution (ODC-By)](https://opendatacommons.org/licenses/by/1-0/). Se conservaron 1891 distritos y los campos UBIGEO, distrito, provincia y departamento. Las geometrías se simplificaron al 5 % de vértices mediante mapshaper 0.7.84 con `keep-shapes`.
- `peru.geojson`: límite nacional de Perú de [geoBoundaries gbOpen](https://www.geoboundaries.org/api.html), archivo `geoBoundaries-PER-ADM0_simplified.geojson` de la revisión `90a1d52`. La [ficha de Perú ADM0](https://www.geoboundaries.org/api/current/gbOpen/PER/ADM0/) identifica la fuente original como dominio público.

`node scripts/import-geo.js` descarga y transforma ambas fuentes. Los límites simplificados son aproximados cerca de las fronteras; las fichas sin coordenadas se envían a revisión en el panel.
