const EventEmitter = require("events");
const pLimit = require("p-limit").default;
const { iniciarNavegador, crearPool, buscarEnlacesEnMaps, extraerFichaNegocio } = require("./maps");
const { enriquecerNegocio } = require("./enricher");
const { guardarNegocio, terminoYaProcesado, checkpointWAL, contarNegocios } = require("./db");
const { exportarExcelDesdeDb } = require("./excel");

class ScraperEngine extends EventEmitter {
  constructor() {
    super();
    this.activo = false;
    this.detenerSolicitado = false;
    this.browser = null;
    this.pool = null;
    this.estadisticas = {
      busquedasTotales: 0,
      busquedasCompletadas: 0,
      negociosEncontrados: 0,
      negociosGuardados: 0,
      inicio: null,
      fin: null,
    };
  }

  solicitarDetencion() {
    if (this.activo) {
      this.detenerSolicitado = true;
      this.emit("log", { tipo: "warn", texto: "Detención solicitada. Finalizando tareas en curso..." });
    }
  }

  async ejecutar(configuracion) {
    if (this.activo) {
      throw new Error("Ya hay una tarea de extracción en ejecución.");
    }

    const {
      categorias = [],
      distritos = [],
      maxResultados = 30,
      modo = "turbo", // 'turbo' | 'deep'
      concurrenciaFichas = 3,
      concurrenciaEnriquecimiento = 6,
    } = configuracion;

    if (!categorias.length || !distritos.length) {
      throw new Error("Debes indicar al menos una categoría y un distrito.");
    }

    this.activo = true;
    this.detenerSolicitado = false;
    this.estadisticas.inicio = new Date();
    this.estadisticas.busquedasCompletadas = 0;
    this.estadisticas.negociosGuardados = 0;

    const terminos = [];
    for (const cat of categorias) {
      for (const dis of distritos) {
        terminos.push({ termino: `${cat} ${dis}`, categoria: cat, distrito: dis });
      }
    }
    this.estadisticas.busquedasTotales = terminos.length;

    this.emit("status", {
      estado: "running",
      mensaje: `Iniciando extracción: ${terminos.length} combinaciones (Modo: ${modo.toUpperCase()})`,
      totalTerminos: terminos.length,
    });

    try {
      this.emit("log", { tipo: "info", texto: "Lanzando navegador Chromium con modo Stealth..." });
      this.browser = await iniciarNavegador(true);
      this.pool = await crearPool(this.browser, concurrenciaFichas);

      const limitEnrich = pLimit(concurrenciaEnriquecimiento);

      for (let i = 0; i < terminos.length; i++) {
        if (this.detenerSolicitado) {
          this.emit("log", { tipo: "warn", texto: "Extracción detenida por el usuario." });
          break;
        }

        const item = terminos[i];
        this.emit("progress", {
          indiceTermino: i + 1,
          totalTerminos: terminos.length,
          terminoActual: item.termino,
          porcentaje: Math.round(((i) / terminos.length) * 100),
        });

        if (terminoYaProcesado(item.termino)) {
          this.emit("log", { tipo: "info", texto: `"${item.termino}" ya procesado anteriormente. Omitiendo.` });
          this.estadisticas.busquedasCompletadas++;
          continue;
        }

        this.emit("log", { tipo: "info", texto: `Buscando: "${item.termino}"...` });

        let enlaces = [];
        try {
          enlaces = await buscarEnlacesEnMaps(
            item.termino,
            this.browser,
            maxResultados,
            (msg) => this.emit("log", { tipo: "debug", texto: msg })
          );
        } catch (err) {
          this.emit("log", { tipo: "error", texto: `Error en Maps para "${item.termino}": ${err.message}` });
          continue;
        }

        if (!enlaces.length) {
          this.emit("log", { tipo: "warn", texto: `No se encontraron resultados para "${item.termino}".` });
          this.estadisticas.busquedasCompletadas++;
          continue;
        }

        this.emit("log", { tipo: "info", texto: `Extrayendo ${enlaces.length} fichas con pool concurrente...` });

        // Extraer fichas usando el pool
        const fichas = [];
        for (const enlace of enlaces) {
          if (this.detenerSolicitado) break;
          const pag = await this.pool.obtener();
          try {
            const ficha = await extraerFichaNegocio(pag, enlace);
            if (ficha) {
              fichas.push({
                ...ficha,
                categoriaUsuario: item.categoria,
                terminoBusqueda: item.termino,
              });
            }
          } finally {
            this.pool.liberar(pag);
          }
        }

        this.emit("log", { tipo: "info", texto: `${fichas.length} fichas obtenidas. Enriqueciendo contactos (${modo})...` });

        // Enriquecer en paralelo
        const tareasEnriquecer = fichas.map((f) =>
          limitEnrich(async () => {
            if (this.detenerSolicitado) return null;
            try {
              const res = await enriquecerNegocio(f, {
                browser: this.browser,
                modo,
              });
              guardarNegocio(res);
              this.estadisticas.negociosGuardados++;
              this.emit("lead", res);
              return res;
            } catch (err) {
              return null;
            }
          })
        );

        await Promise.all(tareasEnriquecer);
        checkpointWAL();
        this.estadisticas.busquedasCompletadas++;
      }

      this.emit("log", { tipo: "info", texto: "Generando archivo Excel actualizado..." });
      const resultadoExcel = await exportarExcelDesdeDb();

      this.estadisticas.fin = new Date();
      const duracionSegundos = Math.round((this.estadisticas.fin - this.estadisticas.inicio) / 1000);

      this.emit("done", {
        estadisticas: this.estadisticas,
        duracionSegundos,
        archivoExcel: resultadoExcel.ruta,
        totalNegocios: contarNegocios(),
      });

      this.emit("status", {
        estado: "completed",
        mensaje: `Extracción finalizada en ${duracionSegundos}s. Total en BD: ${contarNegocios()}`,
      });
    } catch (errorGeneral) {
      this.emit("log", { tipo: "error", texto: `Error general: ${errorGeneral.message}` });
      this.emit("status", { estado: "error", mensaje: errorGeneral.message });
      throw errorGeneral;
    } finally {
      if (this.pool) await this.pool.destruir().catch(() => {});
      if (this.browser) await this.browser.close().catch(() => {});
      this.browser = null;
      this.pool = null;
      this.activo = false;
      this.detenerSolicitado = false;
    }
  }
}

const engineInstance = new ScraperEngine();
module.exports = {
  engine: engineInstance,
  ScraperEngine,
};
