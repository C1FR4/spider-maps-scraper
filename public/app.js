// ─── ESTADO GLOBAL DE LA APP ──────────────────────────────────────
const state = {
  categorias: ["veterinaria"],
  distritos: ["Miraflores"],
  isScraping: false,
  leads: [],
};

// ─── ELEMENTOS DEL DOM ─────────────────────────────────────────────
const chipsCategorias = document.getElementById("chipsCategorias");
const inputCategoria = document.getElementById("inputCategoria");
const chipsDistritos = document.getElementById("chipsDistritos");
const inputDistrito = document.getElementById("inputDistrito");
const selectMax = document.getElementById("selectMax");
const selectModo = document.getElementById("selectModo");
const btnIniciar = document.getElementById("btnIniciar");
const btnDetener = document.getElementById("btnDetener");
const btnDescargarExcel = document.getElementById("btnDescargarExcel");
const btnLimpiarBd = document.getElementById("btnLimpiarBd");
const btnApagarServidor = document.getElementById("btnApagarServidor");
const progressBar = document.getElementById("progressBar");
const progressText = document.getElementById("progressText");
const progressPercent = document.getElementById("progressPercent");
const consoleLogs = document.getElementById("consoleLogs");
const btnLimpiarLogs = document.getElementById("btnLimpiarLogs");
const tbodyLeads = document.getElementById("tbodyLeads");
const filtroTabla = document.getElementById("filtroTabla");

const statTotal = document.getElementById("statTotal");
const statTelefonos = document.getElementById("statTelefonos");
const statWhatsapp = document.getElementById("statWhatsapp");
const statCorreos = document.getElementById("statCorreos");

// ─── MANEJO DE CHIPS (CATEGORÍAS Y DISTRITOS) ───────────────────────

function renderChips(tipo) {
  const lista = tipo === "cat" ? state.categorias : state.distritos;
  const contenedor = tipo === "cat" ? chipsCategorias : chipsDistritos;

  contenedor.innerHTML = "";
  lista.forEach((item, index) => {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.innerHTML = `
      ${item}
      <span class="chip-remove" data-tipo="${tipo}" data-index="${index}">×</span>
    `;
    contenedor.appendChild(chip);
  });
}

function agregarChip(tipo, valor) {
  const v = valor.trim().toLowerCase();
  if (!v) return;
  const lista = tipo === "cat" ? state.categorias : state.distritos;
  if (!lista.map((x) => x.toLowerCase()).includes(v)) {
    lista.push(valor.trim());
    renderChips(tipo);
  }
}

inputCategoria.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === ",") {
    e.preventDefault();
    agregarChip("cat", inputCategoria.value);
    inputCategoria.value = "";
  }
});

inputDistrito.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === ",") {
    e.preventDefault();
    agregarChip("dist", inputDistrito.value);
    inputDistrito.value = "";
  }
});

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
  const telMaps = r.telefono_maps || r["Teléfono Maps"] || "";
  const telWeb = r.telefono_web || r["Teléfono Web"] || "";
  const telefonos = [telMaps, telWeb].filter((x) => x && x !== "—").join(" | ") || "—";
  const whatsapp = r.whatsapp || r.WhatsApp || "—";
  const correo = r.correo || r.Correo || "—";
  const ig = r.instagram || r.Instagram || "";
  const fb = r.facebook || r.Facebook || "";
  const tt = r.tiktok || r.TikTok || "";
  const web = r.web || r.Web || "";
  const urlMaps = r.url_maps || r.URLMaps || "";
  const estado = r.estado || r.Estado || "OK";

  // Badges sociales
  let redesHtml = "";
  if (ig && ig !== "—") redesHtml += `<a href="https://${ig}" target="_blank" class="social-pill">IG</a> `;
  if (fb && fb !== "—") redesHtml += `<a href="https://${fb}" target="_blank" class="social-pill">FB</a> `;
  if (tt && tt !== "—") redesHtml += `<a href="https://${tt}" target="_blank" class="social-pill">TT</a> `;
  if (!redesHtml) redesHtml = '<span class="text-muted">—</span>';

  // WhatsApp clickeable
  let waHtml = "—";
  if (whatsapp && whatsapp !== "—") {
    const waFirst = whatsapp.split(" | ")[0];
    const waHref = waFirst.startsWith("http") ? waFirst : `https://${waFirst}`;
    waHtml = `<a href="${waHref}" target="_blank" class="link-out">💬 ${whatsapp.split(" | ")[0]}</a>`;
  }

  // Links Web / Maps
  let linksHtml = "";
  if (web && web !== "—") {
    linksHtml += `<a href="${web}" target="_blank" class="link-out" title="${web}">🌐 Web</a> `;
  }
  if (urlMaps && urlMaps !== "—") {
    linksHtml += `<a href="${urlMaps}" target="_blank" class="link-out" title="Ver en Maps">📍 Maps</a>`;
  }
  if (!linksHtml) linksHtml = "—";

  // Badge estado
  let badgeClass = "badge-ok";
  if (estado === "Sin web") badgeClass = "badge-noweb";
  else if (estado !== "OK") badgeClass = "badge-error";

  tr.innerHTML = `
    <td><strong>${nombre}</strong></td>
    <td><span class="badge-tag">${categoria}</span></td>
    <td>${telefonos}</td>
    <td>${waHtml}</td>
    <td>${correo !== "—" ? `<span class="text-warning">${correo}</span>` : '<span class="text-muted">—</span>'}</td>
    <td><div class="social-icons">${redesHtml}</div></td>
    <td>${linksHtml}</td>
    <td><span class="badge-tag ${badgeClass}">${estado}</span></td>
  `;

  if (prepend && tbodyLeads.firstChild) {
    tbodyLeads.insertBefore(tr, tbodyLeads.firstChild);
  } else {
    tbodyLeads.appendChild(tr);
  }
}

async function cargarDatosIniciales() {
  try {
    const [resStats, resRecords] = await Promise.all([
      fetch("/api/stats").then((r) => r.json()),
      fetch("/api/records?limit=60").then((r) => r.json()),
    ]);

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
      tbodyLeads.innerHTML = `<tr><td colspan="8" class="text-center text-muted">Aún no hay negocios en la base de datos. Inicia una búsqueda arriba.</td></tr>`;
    }
  } catch (err) {
    console.error("Error cargando datos iniciales:", err);
  }
}

// Filtro en tabla en tiempo real
filtroTabla.addEventListener("input", () => {
  const q = filtroTabla.value.toLowerCase();
  const filas = tbodyLeads.querySelectorAll("tr");
  filas.forEach((tr) => {
    tr.style.display = tr.textContent.toLowerCase().includes(q) ? "" : "none";
  });
});

// ─── SERVER-SENT EVENTS (SSE) PARA PROGRESO EN VIVO ─────────────────

function conectarEventos() {
  const sse = new EventSource("/api/scrape/events");

  sse.addEventListener("status", (e) => {
    const data = JSON.parse(e.data);
    if (data.estado === "running") {
      setUiCorriendo(true);
      progressText.textContent = data.mensaje || "Ejecutando...";
    } else if (data.estado === "completed" || data.estado === "idle") {
      setUiCorriendo(false);
      progressText.textContent = data.mensaje || "Completado";
    }
  });

  sse.addEventListener("progress", (e) => {
    const data = JSON.parse(e.data);
    progressBar.style.width = `${data.porcentaje}%`;
    progressPercent.textContent = `${data.porcentaje}%`;
    progressText.textContent = `[${data.indiceTermino}/${data.totalTerminos}] "${data.terminoActual}"`;
  });

  sse.addEventListener("log", (e) => {
    const data = JSON.parse(e.data);
    agregarLog(data.texto, data.tipo || "info");
  });

  sse.addEventListener("lead", (e) => {
    const lead = JSON.parse(e.data);
    // Eliminar fila vacía si era la primera
    if (tbodyLeads.children.length === 1 && tbodyLeads.children[0].children.length === 1) {
      tbodyLeads.innerHTML = "";
    }
    renderFilaLead(lead, true);
    actualizarContadoresEnVivo();
  });

  sse.addEventListener("done", (e) => {
    const data = JSON.parse(e.data);
    progressBar.style.width = "100%";
    progressPercent.textContent = "100%";
    agregarLog(`🎉 Extracción finalizada con éxito en ${data.duracionSegundos}s.`, "success");
    setUiCorriendo(false);
    cargarDatosIniciales();
  });

  sse.onerror = () => {
    setTimeout(conectarEventos, 5000);
  };
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
  if (corriendo) {
    btnIniciar.textContent = "⏳ Extrayendo...";
  } else {
    btnIniciar.textContent = "▶ Iniciar Extracción";
  }
}

// ─── ACCIONES DE CONTROL ───────────────────────────────────────────

btnIniciar.addEventListener("click", async () => {
  if (state.categorias.length === 0) {
    alert("Por favor ingresa al menos una categoría.");
    return;
  }
  if (state.distritos.length === 0) {
    alert("Por favor ingresa al menos un distrito.");
    return;
  }

  const payload = {
    categorias: state.categorias,
    distritos: state.distritos,
    maxResultados: parseInt(selectMax.value, 10),
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
    alert(`Error: ${err.message}`);
    setUiCorriendo(false);
  }
});

btnDetener.addEventListener("click", async () => {
  if (!confirm("¿Deseas detener la extracción? Los datos ya guardados se mantendrán.")) return;
  try {
    btnDetener.disabled = true;
    agregarLog("Solicitando detención...", "warn");
    await fetch("/api/scrape/stop", { method: "POST" });
  } catch (err) {
    console.error(err);
  }
});

btnDescargarExcel.addEventListener("click", () => {
  window.location.href = "/api/download/excel";
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
    tbodyLeads.innerHTML = `<tr><td colspan="8" class="text-center text-muted">Base de datos vacía. Configura tus categorías e inicia la extracción.</td></tr>`;
    actualizarContadoresEnVivo();
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
conectarEventos();
