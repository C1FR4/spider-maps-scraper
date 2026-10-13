// ─── ESTADO GLOBAL DE LA APP ──────────────────────────────────────
const state = {
  categorias: [],
  distritos: [],
  isScraping: false,
  leads: [],
  pagina: 1,
  paginas: 1,
};

// ─── ELEMENTOS DEL DOM ─────────────────────────────────────────────
const chipsCategorias = document.getElementById("chipsCategorias");
const inputCategoria = document.getElementById("inputCategoria");
const chipsDistritos = document.getElementById("chipsDistritos");
const inputDistrito = document.getElementById("inputDistrito");
const selectMax = document.getElementById("selectMax");
const inputMaxPersonalizado = document.getElementById("inputMaxPersonalizado");
const selectModo = document.getElementById("selectModo");
const btnIniciar = document.getElementById("btnIniciar");
const btnDetener = document.getElementById("btnDetener");
const btnDescargarExcel = document.getElementById("btnDescargarExcel");
const btnLimpiarBd = document.getElementById("btnLimpiarBd");
const btnApagarServidor = document.getElementById("btnApagarServidor");
const progressBar = document.getElementById("progressBar");
const progressText = document.getElementById("progressText");
const progressPercent = document.getElementById("progressPercent");
const resumenEjecucion = document.getElementById("resumenEjecucion");
const historialEjecuciones = document.getElementById("historialEjecuciones");
const consoleLogs = document.getElementById("consoleLogs");
const btnLimpiarLogs = document.getElementById("btnLimpiarLogs");
const tbodyLeads = document.getElementById("tbodyLeads");
const filtroTabla = document.getElementById("filtroTabla");
const filtroZona = document.getElementById("filtroZona");
const filtroContacto = document.getElementById("filtroContacto");
const contadorFilas = document.getElementById("contadorFilas");
const paginaAnterior = document.getElementById("paginaAnterior");
const paginaSiguiente = document.getElementById("paginaSiguiente");
const estadoPagina = document.getElementById("estadoPagina");
const resumenBusqueda = document.getElementById("resumenBusqueda");
const contadorCategorias = document.getElementById("contadorCategorias");
const contadorDistritos = document.getElementById("contadorDistritos");

const statTotal = document.getElementById("statTotal");
const statTelefonos = document.getElementById("statTelefonos");
const statWhatsapp = document.getElementById("statWhatsapp");
const statCorreos = document.getElementById("statCorreos");

// ─── MANEJO DE CHIPS (CATEGORÍAS Y DISTRITOS) ───────────────────────

function escaparHtml(valor) {
  return String(valor ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function urlSegura(valor) {
  try {
    const url = new URL(String(valor));
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch (_) {
    return "";
  }
}

function actualizarResumenBusqueda() {
  contadorCategorias.textContent = state.categorias.length;
  contadorDistritos.textContent = state.distritos.length;
  const total = state.categorias.length * state.distritos.length;
  if (!total) {
    resumenBusqueda.textContent = "Agrega categorías y distritos para preparar las combinaciones.";
    return;
  }
  const ejemplos = state.categorias.flatMap((cat) => state.distritos.map((dist) => `${cat} en ${dist}`));
  const maximo = cantidadPorBusqueda();
  const estimacion = maximo ? ` · hasta ${new Intl.NumberFormat("es-PE").format(total * maximo)} fichas solicitadas` : "";
  resumenBusqueda.textContent = `${total} ${total === 1 ? "búsqueda" : "búsquedas"}: ${ejemplos.slice(0, 3).join(" · ")}${total > 3 ? ` · y ${total - 3} más` : ""}${estimacion}`;
}

function cantidadPorBusqueda() {
  const valor = selectMax.value === "otro" ? inputMaxPersonalizado.value.trim() : selectMax.value;
  if (!/^\d+$/.test(valor)) return null;
  const cantidad = Number(valor);
  return Number.isInteger(cantidad) && cantidad >= 1 && cantidad <= 1000 ? cantidad : null;
}

selectMax.addEventListener("change", () => {
  inputMaxPersonalizado.hidden = selectMax.value !== "otro";
  if (!inputMaxPersonalizado.hidden) inputMaxPersonalizado.focus();
  actualizarResumenBusqueda();
});
inputMaxPersonalizado.addEventListener("input", actualizarResumenBusqueda);

function renderChips(tipo) {
  const lista = tipo === "cat" ? state.categorias : state.distritos;
  const contenedor = tipo === "cat" ? chipsCategorias : chipsDistritos;
  const input = tipo === "cat" ? inputCategoria : inputDistrito;

  contenedor.innerHTML = "";
  lista.forEach((item, index) => {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.appendChild(document.createTextNode(item));
    const quitar = document.createElement("button");
    quitar.type = "button";
    quitar.className = "chip-remove";
    quitar.dataset.tipo = tipo;
    quitar.dataset.index = String(index);
    quitar.setAttribute("aria-label", `Quitar ${item}`);
    quitar.textContent = "×";
    chip.appendChild(quitar);
    contenedor.appendChild(chip);
  });
  input.placeholder = lista.length ? "" : input.dataset.placeholder;
  actualizarResumenBusqueda();
}

function agregarChip(tipo, valor) {
  const limpio = valor.trim().replace(/^['"]|['"]$/g, "").replace(/\s+/g, " ");
  const v = limpio.toLocaleLowerCase("es");
  if (!v) return;
  const lista = tipo === "cat" ? state.categorias : state.distritos;
  if (!lista.some((x) => x.toLocaleLowerCase("es") === v)) {
    lista.push(limpio);
    renderChips(tipo);
  }
}

function configurarEntrada(input, tipo) {
  input.dataset.placeholder = input.placeholder;
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      agregarChip(tipo, input.value);
      input.value = "";
    }
  });
  input.addEventListener("input", () => {
    if (!input.value.includes(",")) return;
    const partes = input.value.split(",");
    partes.slice(0, -1).forEach((parte) => agregarChip(tipo, parte));
    input.value = partes.at(-1);
  });
}

configurarEntrada(inputCategoria, "cat");
configurarEntrada(inputDistrito, "dist");

document.addEventListener("click", (e) => {
  if (e.target.classList.contains("chip-remove")) {
    const tipo = e.target.getAttribute("data-tipo");
    const index = parseInt(e.target.getAttribute("data-index"), 10);
    const lista = tipo === "cat" ? state.categorias : state.distritos;
    lista.splice(index, 1);
    renderChips(tipo);
  }

  // Sugerencias rápidas (pills)
  if (e.target.hasAttribute("data-cat")) {
    agregarChip("cat", e.target.getAttribute("data-cat"));
  }
  if (e.target.hasAttribute("data-dist")) {
    agregarChip("dist", e.target.getAttribute("data-dist"));
  }
});

// Limpiar consola
btnLimpiarLogs.addEventListener("click", () => {
  consoleLogs.innerHTML = "";
});

// ─── LOGS Y CONSOLA ────────────────────────────────────────────────

function agregarLog(texto, tipo = "info") {
  const div = document.createElement("div");
  div.className = `log-line ${tipo}`;
  const hora = new Date().toLocaleTimeString();
  div.textContent = `[${hora}] ${texto}`;
  consoleLogs.appendChild(div);
  consoleLogs.scrollTop = consoleLogs.scrollHeight;
}

// ─── TABLA DE RESULTADOS ───────────────────────────────────────────

function renderFilaLead(r, prepend = false) {
  const tr = document.createElement("tr");

  const nombre = r.nombre || r.Nombre || "—";
  const categoria = r.categoria || r.Categoría || "—";
  const zonas = [...new Set((r.busquedas_relacionadas || []).map((item) => item.zona_busqueda).filter(Boolean))];
  const zonaBusqueda = zonas.join(" · ") || r.zona_busqueda || r.ZonaBusqueda || "—";
  const telMaps = r.telefono_maps || r["Teléfono Maps"] || "";
  const telWeb = r.telefono_web || r["Teléfono Web"] || "";
  const telefonos = [
    telMaps && telMaps !== "—" ? `<span title="Obtenido de Google Maps"><small>Maps</small> ${escaparHtml(telMaps)}</span>` : "",
    telWeb && telWeb !== "—" ? `<span title="Obtenido de la web del negocio"><small>Web</small> ${escaparHtml(telWeb)}</span>` : "",
  ].filter(Boolean).join("<br>") || "—";
  const whatsapp = r.whatsapp || r.WhatsApp || "—";
  const correo = r.correo || r.Correo || "—";
  const ig = r.instagram || r.Instagram || "";
  const fb = r.facebook || r.Facebook || "";
  const tt = r.tiktok || r.TikTok || "";
  const web = r.web || r.Web || "";
  const urlMaps = r.url_maps || r.URLMaps || "";
  const estado = r.estado || r.Estado || "OK";
  tr.dataset.telefono = String(Boolean(telMaps && telMaps !== "—" || telWeb && telWeb !== "—"));
  tr.dataset.correo = String(Boolean(correo && correo !== "—"));
  tr.dataset.whatsapp = String(Boolean(whatsapp && whatsapp !== "—"));
  tr.dataset.zona = zonaBusqueda;
  tr.dataset.incidencia = String(Boolean(estado.startsWith("Web:") || estado.startsWith("Error")));

  // Badges sociales
  let redesHtml = "";
  if (ig && ig !== "—" && urlSegura(`https://${ig}`)) redesHtml += `<a href="${escaparHtml(urlSegura(`https://${ig}`))}" target="_blank" rel="noopener noreferrer" class="social-pill">IG</a> `;
  if (fb && fb !== "—" && urlSegura(`https://${fb}`)) redesHtml += `<a href="${escaparHtml(urlSegura(`https://${fb}`))}" target="_blank" rel="noopener noreferrer" class="social-pill">FB</a> `;
  if (tt && tt !== "—" && urlSegura(`https://${tt}`)) redesHtml += `<a href="${escaparHtml(urlSegura(`https://${tt}`))}" target="_blank" rel="noopener noreferrer" class="social-pill">TT</a> `;
  if (!redesHtml) redesHtml = '<span class="text-muted">—</span>';

  // WhatsApp clickeable
  let waHtml = "—";
  if (whatsapp && whatsapp !== "—") {
    const waFirst = whatsapp.split(" | ")[0];
    const waHref = waFirst.startsWith("http") ? waFirst : `https://${waFirst}`;
    const destino = urlSegura(waHref);
    if (destino) waHtml = `<a href="${escaparHtml(destino)}" target="_blank" rel="noopener noreferrer" class="link-out">💬 ${escaparHtml(waFirst)}</a>`;
  }

  // Links Web / Maps
  let linksHtml = "";
  if (web && web !== "—") {
    const destino = urlSegura(web);
    if (destino) linksHtml += `<a href="${escaparHtml(destino)}" target="_blank" rel="noopener noreferrer" class="link-out" title="${escaparHtml(web)}">🌐 Web</a> `;
  }
  if (urlMaps && urlMaps !== "—") {
    const destino = urlSegura(urlMaps);
    if (destino) linksHtml += `<a href="${escaparHtml(destino)}" target="_blank" rel="noopener noreferrer" class="link-out" title="Ver en Maps">📍 Maps</a>`;
  }
  if (!linksHtml) linksHtml = "—";

  // Badge estado
  let badgeClass = "badge-ok";
  if (estado === "Sin web") badgeClass = "badge-noweb";
  else if (estado !== "OK") badgeClass = "badge-error";

  tr.innerHTML = `
    <td><strong>${escaparHtml(nombre)}</strong></td>
    <td><span class="badge-tag">${escaparHtml(categoria)}</span></td>
    <td>${escaparHtml(zonaBusqueda)}</td>
    <td>${telefonos}</td>
    <td>${waHtml}</td>
    <td>${correo !== "—" ? `<span class="text-warning" title="Obtenido de la web del negocio">${escaparHtml(correo)}</span>` : '<span class="text-muted">—</span>'}</td>
    <td><div class="social-icons">${redesHtml}</div></td>
    <td>${linksHtml}</td>
    <td><span class="badge-tag ${badgeClass}">${escaparHtml(estado)}</span></td>
  `;

  if (prepend && tbodyLeads.firstChild) {
    tbodyLeads.insertBefore(tr, tbodyLeads.firstChild);
  } else {
    tbodyLeads.appendChild(tr);
  }
}

let ultimaCarga = 0;
async function cargarDatosIniciales() {
  const carga = ++ultimaCarga;
  try {
    const parametros = new URLSearchParams({
      page: String(state.pagina), limit: "60", zona: filtroZona.value,
      q: filtroTabla.value.trim(), contacto: filtroContacto.value,
    });
    const [statsResponse, recordsResponse, zonasResponse] = await Promise.all([
      fetch("/api/stats"),
      fetch(`/api/records?${parametros}`),
      fetch("/api/zones"),
    ]);
    if (!statsResponse.ok || !recordsResponse.ok || !zonasResponse.ok) throw new Error("El servidor no respondió correctamente.");
    const [resStats, resRecords, resZonas] = await Promise.all([statsResponse.json(), recordsResponse.json(), zonasResponse.json()]);
    if (carga !== ultimaCarga) return;

    // Estadísticas
    statTotal.textContent = resStats.total || 0;
    statTelefonos.textContent = resStats.conTelefono || 0;
    statWhatsapp.textContent = resStats.conWhatsapp || 0;
    statCorreos.textContent = resStats.conCorreo || 0;

    // Registros
    tbodyLeads.innerHTML = "";
    if (resRecords.records && resRecords.records.length > 0) {
      state.leads = resRecords.records;
      resRecords.records.forEach((r) => renderFilaLead(r, false));
    } else {
      tbodyLeads.innerHTML = `<tr><td colspan="9" class="text-center text-muted">Aún no hay negocios en la base de datos. Inicia una búsqueda arriba.</td></tr>`;
    }
    state.pagina = resRecords.pagina;
    state.paginas = resRecords.paginas;
    actualizarFiltroZonas(resZonas.zonas);
    paginaAnterior.disabled = state.pagina <= 1;
    paginaSiguiente.disabled = state.pagina >= state.paginas;
    estadoPagina.textContent = `Página ${state.pagina} de ${state.paginas}`;
    contadorFilas.textContent = `${resRecords.filtrados} de ${resRecords.total} registros coinciden · ${resRecords.records.length} en esta página.`;
  } catch (err) {
    if (carga !== ultimaCarga) return;
    agregarLog(`No se pudieron cargar los registros: ${err.message}`, "error");
    tbodyLeads.innerHTML = `<tr><td colspan="9" class="text-center text-muted">No se pudieron cargar los registros. Revisa el servidor local.</td></tr>`;
  }
}

// Filtro en tabla en tiempo real
function actualizarFiltroZonas(zonas) {
  const seleccionado = filtroZona.value;
  filtroZona.replaceChildren(new Option("Todos los distritos / ciudades", ""));
  for (const zona of zonas) filtroZona.add(new Option(zona, zona));
  filtroZona.value = zonas.includes(seleccionado) ? seleccionado : "";
}

function aplicarFiltroTabla() {
  state.pagina = 1;
  cargarDatosIniciales();
}
let temporizadorFiltro;
let temporizadorRecarga;
filtroTabla.addEventListener("input", () => {
  clearTimeout(temporizadorFiltro);
  temporizadorFiltro = setTimeout(aplicarFiltroTabla, 250);
});
filtroZona.addEventListener("change", aplicarFiltroTabla);
filtroContacto.addEventListener("change", aplicarFiltroTabla);
paginaAnterior.addEventListener("click", () => { state.pagina--; cargarDatosIniciales(); });
paginaSiguiente.addEventListener("click", () => { state.pagina++; cargarDatosIniciales(); });

function actualizarResumenEjecucion(estadisticas = {}) {
  const completadas = estadisticas.busquedasCompletadas || 0;
  const total = estadisticas.busquedasTotales || 0;
  resumenEjecucion.textContent = `${completadas}/${total} búsquedas revisadas · ${estadisticas.negociosEncontrados || 0} fichas en zona · ${estadisticas.negociosGuardados || 0} nuevos · ${estadisticas.duplicados || 0} duplicados · ${estadisticas.fueraPeru || 0} fuera de Perú · ${estadisticas.fueraZona || 0} fuera de zona · ${estadisticas.sinCoordenadas || 0} por verificar · ${estadisticas.errores || 0} incidencias`;
}

async function cargarHistorial() {
  try {
    const response = await fetch("/api/runs");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const { runs } = await response.json();
    historialEjecuciones.replaceChildren();
    if (!runs.length) {
      historialEjecuciones.textContent = "Todavía no hay ejecuciones guardadas.";
      return;
    }
    const nombres = { running: "En curso", completed: "Completada", partial: "Con incidencias", stopped: "Detenida", error: "Error", interrupted: "Interrumpida" };
    for (const run of runs) {
      const item = document.createElement("div");
      item.className = "run-item";
      const detalle = document.createElement("div");
      const fecha = new Date(run.inicio).toLocaleString("es-PE");
      const total = run.estadisticas.busquedasTotales || 0;
      detalle.innerHTML = `<strong>#${run.id} · ${escaparHtml(nombres[run.estado] || run.estado)} · ${escaparHtml(fecha)}</strong>${run.estadisticas.busquedasCompletadas || 0}/${total} búsquedas · ${run.estadisticas.negociosGuardados || 0} nuevos · ${run.fallos.length} por reintentar`;
      item.appendChild(detalle);
      if (run.estadisticas.detalleBusquedas?.length) {
        const desglose = document.createElement("details");
        const titulo = document.createElement("summary");
        titulo.textContent = "Ver resultados por búsqueda";
        desglose.appendChild(titulo);
        for (const busqueda of run.estadisticas.detalleBusquedas) {
          const linea = document.createElement("div");
          linea.textContent = `${busqueda.termino}: ${busqueda.solicitados} solicitados · ${busqueda.vistos} vistos · ${busqueda.candidatos} en zona · ${busqueda.procesados} revisados · ${busqueda.nuevos} nuevos · ${busqueda.duplicados} duplicados · ${busqueda.fueraZona} fuera de zona · ${busqueda.incidencias} incidencias (${busqueda.motivo})`;
          desglose.appendChild(linea);
        }
        item.appendChild(desglose);
      }
      if (run.fallos.length) {
        const boton = document.createElement("button");
        boton.type = "button";
        boton.className = "btn btn-secondary btn-sm";
        boton.dataset.retry = String(run.id);
        boton.textContent = "Reintentar";
        boton.disabled = state.isScraping;
        item.appendChild(boton);
      }
      historialEjecuciones.appendChild(item);
    }
  } catch (err) {
    historialEjecuciones.textContent = `No se pudo cargar el historial: ${err.message}`;
  }
}

historialEjecuciones.addEventListener("click", async (event) => {
  const boton = event.target.closest("button[data-retry]");
  if (!boton || state.isScraping) return;
  boton.disabled = true;
  try {
    const response = await fetch(`/api/scrape/retry/${boton.dataset.retry}`, { method: "POST" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    agregarLog(data.mensaje, "info");
    setUiCorriendo(true);
    await cargarHistorial();
  } catch (err) {
    agregarLog(`No se pudo reintentar: ${err.message}`, "error");
    boton.disabled = false;
  }
});

function aplicarEstado(data) {
  setUiCorriendo(data.estado === "running");
  progressText.textContent = data.mensaje || "En espera";
  if (data.progreso) {
    progressBar.style.width = `${data.progreso.porcentaje}%`;
    progressPercent.textContent = `${data.progreso.porcentaje}%`;
  } else if (data.estado === "running") {
    progressBar.style.width = "0%";
    progressPercent.textContent = "0%";
  }
  if (data.estadisticas) {
    state.runStats = data.estadisticas;
    actualizarResumenEjecucion(data.estadisticas);
  }
}

// ─── SERVER-SENT EVENTS (SSE) PARA PROGRESO EN VIVO ─────────────────

function conectarEventos() {
  const sse = new EventSource("/api/scrape/events");
  let conexionPerdida = false;

  sse.addEventListener("open", async () => {
    if (conexionPerdida) agregarLog("Conexión recuperada. Actualizando resultados y progreso...", "success");
    conexionPerdida = false;
    try {
      const response = await fetch("/api/status");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      aplicarEstado(await response.json());
      await cargarDatosIniciales();
      await cargarHistorial();
    } catch (err) {
      agregarLog(`No se pudo recuperar el estado del servidor: ${err.message}`, "warn");
    }
  });

  sse.addEventListener("error", () => {
    if (!conexionPerdida) agregarLog("Se perdió la conexión de eventos. Intentando reconectar...", "warn");
    conexionPerdida = true;
  });

  sse.addEventListener("status", (e) => {
    const data = JSON.parse(e.data);
    aplicarEstado(data);
    if (data.estado === "error") agregarLog(data.mensaje, "error");
  });

  sse.addEventListener("progress", (e) => {
    const data = JSON.parse(e.data);
    progressBar.style.width = `${data.porcentaje}%`;
    progressPercent.textContent = `${data.porcentaje}%`;
    progressText.textContent = `[${data.indiceTermino}/${data.totalTerminos}] "${data.terminoActual}"`;
    if (data.estadisticas) {
      state.runStats = data.estadisticas;
      actualizarResumenEjecucion(data.estadisticas);
    }
  });

  sse.addEventListener("log", (e) => {
    const data = JSON.parse(e.data);
    agregarLog(data.texto, data.tipo || "info");
  });

  sse.addEventListener("lead", (e) => {
    clearTimeout(temporizadorRecarga);
    temporizadorRecarga = setTimeout(cargarDatosIniciales, 250);
    actualizarContadoresEnVivo();
  });

  sse.addEventListener("done", (e) => {
    const data = JSON.parse(e.data);
    const errores = data.estadisticas?.errores || 0;
    actualizarResumenEjecucion(data.estadisticas);
    agregarLog(`Extracción ${data.estado === "stopped" ? "detenida" : "finalizada"} en ${data.duracionSegundos}s. ${errores} incidencia${errores === 1 ? "" : "s"}.`, errores ? "warn" : "success");
    setUiCorriendo(false);
    cargarDatosIniciales();
    cargarHistorial();
  });

  // EventSource vuelve a conectarse por sí mismo.
}

function actualizarContadoresEnVivo() {
  fetch("/api/stats")
    .then((r) => r.json())
    .then((s) => {
      statTotal.textContent = s.total || 0;
      statTelefonos.textContent = s.conTelefono || 0;
      statWhatsapp.textContent = s.conWhatsapp || 0;
      statCorreos.textContent = s.conCorreo || 0;
    })
    .catch(() => {});
}

function setUiCorriendo(corriendo) {
  state.isScraping = corriendo;
  btnIniciar.disabled = corriendo;
  btnDetener.disabled = !corriendo;
  historialEjecuciones.querySelectorAll("button[data-retry]").forEach((boton) => { boton.disabled = corriendo; });
  if (corriendo) {
    btnIniciar.textContent = "⏳ Extrayendo...";
  } else {
    btnIniciar.textContent = "▶ Iniciar Extracción";
  }
}

// ─── ACCIONES DE CONTROL ───────────────────────────────────────────

btnIniciar.addEventListener("click", async () => {
  agregarChip("cat", inputCategoria.value);
  agregarChip("dist", inputDistrito.value);
  inputCategoria.value = "";
  inputDistrito.value = "";
  if (state.categorias.length === 0) {
    alert("Por favor ingresa al menos una categoría.");
    return;
  }
  if (state.distritos.length === 0) {
    alert("Por favor ingresa al menos un distrito.");
    return;
  }
  if (state.categorias.length * state.distritos.length > 100) {
    alert("Máximo 100 combinaciones por ejecución. Quita algunas categorías o distritos.");
    return;
  }
  const maxResultados = cantidadPorBusqueda();
  if (maxResultados === null) {
    alert("Ingresa una cantidad entera entre 1 y 1000 por búsqueda.");
    inputMaxPersonalizado.focus();
    return;
  }

  const payload = {
    categorias: state.categorias,
    distritos: state.distritos,
    maxResultados,
    modo: selectModo.value,
  };

  try {
    setUiCorriendo(true);
    progressBar.style.width = "5%";
    progressPercent.textContent = "5%";
    progressText.textContent = "Iniciando proceso...";
    agregarLog(`Iniciando extracción para ${state.categorias.length} categorías en ${state.distritos.length} distritos...`, "info");

    const res = await fetch("/api/scrape/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "No se pudo iniciar");
    }
  } catch (err) {
    agregarLog(`No se pudo iniciar la extracción: ${err.message}`, "error");
    alert(`Error: ${err.message}`);
    setUiCorriendo(false);
  }
});

btnDetener.addEventListener("click", async () => {
  if (!confirm("¿Deseas detener la extracción? Los datos ya guardados se mantendrán.")) return;
  try {
    btnDetener.disabled = true;
    agregarLog("Solicitando detención...", "warn");
    const response = await fetch("/api/scrape/stop", { method: "POST" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  } catch (err) {
    agregarLog(`No se pudo solicitar la detención: ${err.message}`, "error");
    btnDetener.disabled = false;
  }
});

btnDescargarExcel.addEventListener("click", async () => {
  btnDescargarExcel.disabled = true;
  const textoOriginal = btnDescargarExcel.textContent;
  btnDescargarExcel.textContent = "Preparando Excel...";
  try {
    const res = await fetch("/api/download/excel");
    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      throw new Error(error.error || `Error HTTP ${res.status}`);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "contactos_spider.xlsx";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    agregarLog(`Excel descargado: ${res.headers.get("X-Record-Count") || 0} registros.`, "success");
  } catch (err) {
    agregarLog(`No se pudo descargar el Excel: ${err.message}`, "error");
    alert(`No se pudo descargar el Excel: ${err.message}`);
  } finally {
    btnDescargarExcel.disabled = false;
    btnDescargarExcel.textContent = textoOriginal;
  }
});

// Limpiar base de datos / Iniciar sesión nueva
btnLimpiarBd.addEventListener("click", async () => {
  if (state.isScraping) {
    alert("No puedes reiniciar la base de datos mientras se está extrayendo información.");
    return;
  }
  const confirmacion = confirm(
    "¿Estás seguro de que deseas vaciar la base de datos e iniciar una nueva sesión?\n\nEsto borrará los prospectos anteriores para que comiences desde cero."
  );
  if (!confirmacion) return;

  try {
    const res = await fetch("/api/database/clear", { method: "POST" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Error al limpiar base de datos");

    agregarLog("Base de datos reiniciada con éxito. Listo para una nueva búsqueda.", "info");
    filtroZona.value = "";
    filtroTabla.value = "";
    filtroContacto.value = "todos";
    tbodyLeads.innerHTML = `<tr><td colspan="9" class="text-center text-muted">Base de datos vacía. Configura tus categorías e inicia la extracción.</td></tr>`;
    state.pagina = 1;
    cargarDatosIniciales();
    actualizarContadoresEnVivo();
    cargarHistorial();
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
});

// Apagar servidor local
btnApagarServidor.addEventListener("click", async () => {
  const confirmacion = confirm(
    "¿Deseas apagar el servidor local de Spider Maps Scraper?\n\nLa página dejará de responder hasta que vuelvas a ejecutar 'npm start' o 'iniciar.bat'."
  );
  if (!confirmacion) return;

  try {
    await fetch("/api/system/shutdown", { method: "POST" });
  } catch (_) {}

  document.body.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;background:#07090f;color:#f0f4ff;font-family:sans-serif;text-align:center;padding:20px;">
      <h1 style="color:#ef4444;font-size:28px;margin-bottom:12px;">Servidor Detenido</h1>
      <p style="color:#7b8eb5;max-width:480px;line-height:1.6;font-size:14px;">El servidor local ha sido apagado correctamente. Puedes cerrar esta pestaña en tu navegador con total seguridad.</p>
      <p style="margin-top:20px;font-size:12px;color:#475569;">Para volver a usarlo, ejecuta nuevamente <code>npm start</code> o <code>iniciar.bat</code>.</p>
    </div>
  `;
});

// ─── INICIALIZACIÓN ────────────────────────────────────────────────
renderChips("cat");
renderChips("dist");
cargarDatosIniciales();
cargarHistorial();
conectarEventos();
