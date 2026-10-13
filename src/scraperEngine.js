const EventEmitter = require("events");
const pLimit = require("p-limit").default;
const { iniciarNavegador, crearPool, buscarEnlacesEnMaps, extraerFichaNegocio } = require("./maps");
const { enriquecerNegocio } = require("./enricher");
const { guardarNegocio, guardarPendienteGeografico, checkpointWAL, contarNegocios } = require("./db");
const { exportarExcelDesdeDb } = require("./excel");
const { crearEjecucion, actualizarEjecucion } = require("./runs");
const { resolverZona, verificarUbicacion } = require("./geo");

class ScraperEngine extends EventEmitter {
  constructor() {
    super();
    this.activo = false;
    this.detenerSolicitado = false;
    this.browser = null;
    this.pool = null;
    this.estado = "idle";
    this.mensaje = "Listo para iniciar";
    this.progreso = null;
    this.fallos = [];
    this.ejecucionId = null;
    this.estadisticas = {
      busquedasTotales: 0,
      busquedasCompletadas: 0,
      negociosEncontrados: 0,
      negociosGuardados: 0,
      duplicados: 0,
      busquedasFallidas: 0,
      fichasFallidas: 0,
      fueraPeru: 0,
      fueraZona: 0,
      sinCoordenadas: 0,
      errores: 0,
      inicio: null,
      fin: null,
    };
  }

  obtenerEstado() {
    return {
      activo: this.activo,
      estado: this.estado,
      mensaje: this.mensaje,
      progreso: this.progreso,
      estadisticas: { ...this.estadisticas },
      fallos: [...this.fallos],
      ejecucionId: this.ejecucionId,
    };
  }

  publicarEstado(estado, mensaje) {
    this.estado = estado;
    this.mensaje = mensaje;
    this.emit("status", this.obtenerEstado());
  }

  publicarProgreso(indiceTermino, totalTerminos, terminoActual) {
    this.progreso = {
      indiceTermino,
      totalTerminos,
      terminoActual,
      porcentaje: Math.round((this.estadisticas.busquedasCompletadas / totalTerminos) * 100),
      estadisticas: { ...this.estadisticas },
    };
    this.emit("progress", this.progreso);
    actualizarEjecucion(this.ejecucionId, "running", this.estadisticas, this.fallos);
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
    this.estadisticas.negociosEncontrados = 0;
    this.estadisticas.errores = 0;
    this.estadisticas.duplicados = 0;
    this.estadisticas.busquedasFallidas = 0;
    this.estadisticas.fichasFallidas = 0;
    this.estadisticas.fueraPeru = 0;
    this.estadisticas.fueraZona = 0;
    this.estadisticas.sinCoordenadas = 0;
    this.estadisticas.fin = null;
    this.progreso = null;
    this.fallos = [];
    this.ejecucionId = null;

    const terminos = [];
    if (Array.isArray(configuracion.terminos)) {
      for (const item of configuracion.terminos) {
        terminos.push({ termino: `${item.categoria} ${item.distrito}`, categoria: item.categoria, distrito: item.distrito });
      }
    } else {
      for (const cat of categorias) {
        for (const dis of distritos) {
          terminos.push({ termino: `${cat} ${dis}`, categoria: cat, distrito: dis });
        }
      }
    }
    this.estadisticas.busquedasTotales = terminos.length;

    try {
      this.ejecucionId = crearEjecucion({ categorias, distritos, maxResultados, modo, terminos }, this.estadisticas);
      this.publicarEstado("running", `Iniciando extracción: ${terminos.length} combinaciones (Modo: ${modo.toUpperCase()})`);
      this.emit("log", { tipo: "info", texto: "Lanzando navegador Chromium con modo Stealth..." });
      this.browser = await iniciarNavegador(true);
      this.pool = await crearPool(this.browser, concurrenciaFichas);

      const limitEnrich = pLimit(concurrenciaEnriquecimiento);

      for (let i = 0; i < terminos.length; i++) {
        if (this.detenerSolicitado) {
          this.emit("log", { tipo: "warn", texto: "Extracción detenida por el usuario." });
          for (const pendiente of terminos.slice(i)) {
            this.fallos.push({ categoria: pendiente.categoria, distrito: pendiente.distrito, motivo: "Pendiente tras detener la extracción" });
          }
          break;
        }

        const item = terminos[i];
        const erroresAntes = this.estadisticas.errores;
        this.publicarProgreso(i + 1, terminos.length, item.termino);

        let zona;
        try {
          zona = resolverZona(item.distrito);
        } catch (err) {
          this.estadisticas.errores++;
          this.estadisticas.busquedasFallidas++;
          this.fallos.push({ categoria: item.categoria, distrito: item.distrito, motivo: err.message });
          this.emit("log", { tipo: "error", texto: err.message });
          this.estadisticas.busquedasCompletadas++;
          this.publicarProgreso(i + 1, terminos.length, item.termino);
          continue;
        }
        if (zona.ambiguo) {
          this.emit("log", { tipo: "warn", texto: `«${item.distrito}» existe en varias provincias; se aceptarán resultados dentro de cualquiera de ellas. Usa distrito / provincia / departamento para precisar.` });
        }
        const principal = zona.features[0].properties;
        const terminoMaps = zona.ambiguo
          ? `${item.categoria} ${item.distrito} Perú`
          : `${item.categoria} ${zona.tipo === "distrito" ? principal.distrito : principal.provincia} ${principal.provincia} ${principal.departamento} Perú`;
        const revisados = new Map();
        const aceptarEnlace = (enlace) => {
          let verificacion = revisados.get(enlace);
          if (!verificacion) {
            verificacion = verificarUbicacion(enlace, zona);
            revisados.set(enlace, verificacion);
            if (verificacion.estado === "fuera_peru") this.estadisticas.fueraPeru++;
            if (verificacion.estado === "fuera_zona") this.estadisticas.fueraZona++;
          }
          return verificacion.estado === "dentro_zona" || verificacion.estado === "sin_coordenadas";
        };

        this.emit("log", { tipo: "info", texto: `Buscando: "${item.termino}"...` });

        let enlaces = [];
        try {
          enlaces = await buscarEnlacesEnMaps(
            terminoMaps,
            this.browser,
            maxResultados,
            (msg) => this.emit("log", { tipo: "debug", texto: msg }),
            aceptarEnlace
          );
        } catch (err) {
          this.estadisticas.errores++;
          this.estadisticas.busquedasFallidas++;
          this.fallos.push({ categoria: item.categoria, distrito: item.distrito, motivo: err.message });
          this.emit("log", { tipo: "error", texto: `Error en Maps para "${item.termino}": ${err.message}` });
          this.estadisticas.busquedasCompletadas++;
          this.publicarProgreso(i + 1, terminos.length, item.termino);
          continue;
        }

        const fueraPeruBusqueda = [...revisados.values()].filter((v) => v.estado === "fuera_peru").length;
        const fueraZonaBusqueda = [...revisados.values()].filter((v) => v.estado === "fuera_zona").length;
        if (fueraPeruBusqueda || fueraZonaBusqueda) {
          this.emit("log", { tipo: "info", texto: `Filtro geográfico: ${fueraPeruBusqueda} fuera de Perú y ${fueraZonaBusqueda} fuera de ${item.distrito}.` });
        }

        if (!enlaces.length) {
          this.emit("log", { tipo: "warn", texto: `No se encontraron resultados para "${item.termino}".` });
          this.estadisticas.busquedasCompletadas++;
          this.publicarProgreso(i + 1, terminos.length, item.termino);
          continue;
        }

        this.emit("log", { tipo: "info", texto: `Extrayendo ${enlaces.length} fichas con pool concurrente...` });

        // Extraer fichas usando el pool
        this.estadisticas.negociosEncontrados += enlaces.length;
        const fichas = (await Promise.all(enlaces.map(async (enlace) => {
          if (this.detenerSolicitado) return null;
          let pag;
          try {
            pag = await this.pool.obtener();
            const ficha = await extraerFichaNegocio(pag, enlace, (mensaje) => {
              this.emit("log", { tipo: "warn", texto: mensaje });
            });
            if (!ficha) {
              this.estadisticas.errores++;
              this.estadisticas.fichasFallidas++;
            }
            if (ficha) {
              const urlFinal = pag.url();
              const original = verificarUbicacion(enlace, zona);
              const final = verificarUbicacion(urlFinal, zona);
              const ubicacion = final.estado === "sin_coordenadas" ? original : final;
              if (ubicacion.estado !== "dentro_zona") {
                if (ubicacion.estado === "sin_coordenadas") {
                  this.estadisticas.sinCoordenadas++;
                  guardarPendienteGeografico({
                    nombre: ficha.nombre,
                    urlMaps: enlace,
                    busqueda: item.termino,
                    motivo: "La URL de Maps no contiene coordenadas verificables",
                  });
                }
                if (original.estado === "dentro_zona" && ubicacion.estado === "fuera_peru") this.estadisticas.fueraPeru++;
                if (original.estado === "dentro_zona" && ubicacion.estado === "fuera_zona") this.estadisticas.fueraZona++;
                this.emit("log", { tipo: "warn", texto: `Ficha omitida por ubicación (${ubicacion.estado}): ${ficha.nombre}. ${enlace}` });
                return null;
              }
              ficha.urlMaps = final.estado === "dentro_zona" ? urlFinal : enlace;
            }
            return ficha && {
              ...ficha,
              categoriaUsuario: item.categoria,
              terminoBusqueda: item.termino,
            };
          } catch (err) {
            this.estadisticas.errores++;
            this.estadisticas.fichasFallidas++;
            this.emit("log", { tipo: "error", texto: `No se pudo procesar una ficha de "${item.termino}": ${err.message}` });
            return null;
          } finally {
            if (pag) this.pool.liberar(pag);
          }
        }))).filter(Boolean);

        this.emit("log", { tipo: "info", texto: `${fichas.length} fichas dentro de la zona. Enriqueciendo contactos (${modo})...` });

        // Enriquecer en paralelo
        const tareasEnriquecer = fichas.map((f) =>
          limitEnrich(async () => {
            if (this.detenerSolicitado) return null;
            let res;
            try {
              res = await enriquecerNegocio(f, {
                browser: this.browser,
                modo,
              });
            } catch (err) {
              this.estadisticas.errores++;
              this.emit("log", { tipo: "warn", texto: `No se pudo enriquecer "${f.nombre}": ${err.message}. Se conservará la ficha de Maps.` });
              res = {
                Nombre: f.nombre || "—",
                Categoría: f.categoriaUsuario || f.categoria || "—",
                Valoración: f.valoracion || "—",
                "Teléfono Maps": f.telefono || "—",
                Dirección: f.direccion || "—",
                Web: f.web || "—",
                URLMaps: f.urlMaps || "—",
                Búsqueda: f.terminoBusqueda || "",
                Método: "maps",
                Estado: `Error al revisar web: ${err.message.slice(0, 80)}`,
              };
            }
            try {
              res.ZonaBusqueda = item.distrito;
              if (typeof res.Estado === "string" && res.Estado.startsWith("Web:")) {
                this.estadisticas.errores++;
              }
              const id = guardarNegocio(res);
              if (id !== null) {
                this.estadisticas.negociosGuardados++;
                this.emit("lead", res);
              } else {
                this.estadisticas.duplicados++;
              }
              return res;
            } catch (err) {
              this.estadisticas.errores++;
              this.emit("log", { tipo: "error", texto: `Error al guardar "${f.nombre}": ${err.message}` });
              return null;
            }
          })
        );

        await Promise.all(tareasEnriquecer);
        if (this.estadisticas.errores > erroresAntes) {
          this.fallos.push({ categoria: item.categoria, distrito: item.distrito, motivo: `${this.estadisticas.errores - erroresAntes} incidencia(s) en fichas o webs` });
        } else if (this.detenerSolicitado) {
          this.fallos.push({ categoria: item.categoria, distrito: item.distrito, motivo: "Búsqueda interrumpida" });
        }
        checkpointWAL();
        this.estadisticas.busquedasCompletadas++;
        this.publicarProgreso(i + 1, terminos.length, item.termino);
      }

      let archivoExcel = null;
      try {
        this.emit("log", { tipo: "info", texto: "Generando archivo Excel actualizado..." });
        archivoExcel = (await exportarExcelDesdeDb()).ruta;
      } catch (err) {
        this.estadisticas.errores++;
        this.emit("log", { tipo: "warn", texto: `Los registros se guardaron, pero no se pudo crear el Excel local: ${err.message}` });
      }

      this.estadisticas.fin = new Date();
      const duracionSegundos = Math.round((this.estadisticas.fin - this.estadisticas.inicio) / 1000);

      const estadoFinal = this.detenerSolicitado ? "stopped" : this.estadisticas.errores ? "partial" : "completed";
      const mensajeFinal = estadoFinal === "stopped"
        ? `Extracción detenida. ${this.estadisticas.negociosGuardados} registros nuevos conservados.`
        : estadoFinal === "partial"
          ? `Terminó con ${this.estadisticas.errores} incidencias. ${this.estadisticas.negociosGuardados} registros nuevos guardados.`
          : `Extracción completada. ${this.estadisticas.negociosGuardados} registros nuevos guardados.`;
      actualizarEjecucion(this.ejecucionId, estadoFinal, this.estadisticas, this.fallos, true);
      this.emit("done", {
        estado: estadoFinal,
        ejecucionId: this.ejecucionId,
        estadisticas: this.estadisticas,
        fallos: this.fallos,
        duracionSegundos,
        archivoExcel,
        totalNegocios: contarNegocios(),
      });

      this.publicarEstado(estadoFinal, mensajeFinal);
    } catch (errorGeneral) {
      this.estadisticas.errores++;
      this.estadisticas.fin = new Date();
      actualizarEjecucion(this.ejecucionId, "error", this.estadisticas, this.fallos, true);
      this.emit("log", { tipo: "error", texto: `Error general: ${errorGeneral.message}` });
      this.publicarEstado("error", `Extracción interrumpida: ${errorGeneral.message}`);
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
