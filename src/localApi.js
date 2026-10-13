function protegerApiLocal(req, res, next) {
  let host;
  try {
    const raw = req.headers.host || "";
    const parsed = new URL(`http://${raw}`);
    const puerto = Number(parsed.port || 80);
    if (!["localhost", "127.0.0.1"].includes(parsed.hostname) || puerto !== req.socket.localPort) {
      return res.status(403).json({ error: "Esta API solo acepta el panel local." });
    }
    host = parsed.host;
  } catch (_) {
    return res.status(403).json({ error: "Host local inválido." });
  }

  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    const origen = req.headers.origin;
    if (origen !== undefined && origen !== `http://${host}`) {
      return res.status(403).json({ error: "Origen no permitido para esta acción." });
    }
    const sitio = req.headers["sec-fetch-site"];
    if (sitio && !["same-origin", "none"].includes(sitio)) {
      return res.status(403).json({ error: "La acción debe iniciarse desde el panel local." });
    }
  }
  next();
}

module.exports = { protegerApiLocal };
