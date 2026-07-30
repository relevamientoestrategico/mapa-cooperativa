/**
 * Generador de informes: informe.json + barrio.json → HTML autónomo.
 *
 * ARQUITECTURA (rediseño julio 2026):
 *
 *   1. El CSS es una PLANTILLA ÚNICA del sistema, definida como constante
 *      en este módulo. No se almacena en informe.json de cada barrio.
 *
 *   2. Los colores se leen de barrio.json (color, colorClaro). Si no
 *      están, se derivan automáticamente del color principal.
 *
 *   3. El HTML generado es un documento completamente autónomo
 *      (<!DOCTYPE html>, <html>, <head>, <body>), sin dependencias
 *      externas salvo Google Fonts.
 *
 *   4. Al guardar un informe, el panel llama a:
 *         generarInformeHtml(informe, barrio)
 *      donde `barrio` es el contenido de barrio.json. La función devuelve
 *      el HTML completo listo para escribir como .html en el repo.
 *
 * Regla de oro: la apariencia de los informes debe ser idéntica a la de
 * los barrios ya publicados. Este CSS es una extracción exacta del modelo
 * (27 de Noviembre), parametrizada con CSS custom properties.
 */

// ─── Utilidades de color ────────────────────────────────────

function hexToHsl(hex) {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
    else if (max === g) h = ((b - r) / d + 2);
    else h = ((r - g) / d + 4);
    h *= 60;
  }
  return [Math.round(h), Math.round(s * 100), Math.round(l * 100)];
}

function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = n => { const k = (n + h / 30) % 12; const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); return Math.round(c * 255).toString(16).padStart(2, '0'); };
  return '#' + f(0) + f(8) + f(4);
}

/** Genera dark, light y accent a partir del color principal del barrio. */
function derivarPaleta(color, colorClaro) {
  const [h, s, l] = hexToHsl(color);
  return {
    primary:      color,
    primaryDark:  hslToHex(h, Math.min(s + 15, 100), Math.max(l - 20, 10)),
    primaryLight: colorClaro || hslToHex(h, Math.min(s + 5, 60), 95),
    accent:       hslToHex(h, Math.min(s + 10, 80), Math.min(l + 15, 65)),
    border:       hslToHex(h, Math.min(s + 5, 50), 82),
  };
}

// ─── Plantilla CSS del sistema ──────────────────────────────
// Los colores usan CSS custom properties que se definen en :root
// al momento de generar, según los colores del barrio.

const PLANTILLA_CSS = `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Source Sans 3', sans-serif; background: var(--bg); color: var(--text); font-size: 15px; line-height: 1.65; }

    .header { background: linear-gradient(135deg, var(--primary-dark) 0%, var(--primary) 60%, var(--accent) 100%); color: white; padding: 0; position: relative; overflow: hidden; }
    .header::before { content: ''; position: absolute; top: -60px; right: -60px; width: 300px; height: 300px; border-radius: 50%; background: rgba(255,255,255,0.06); }
    .header::after { content: ''; position: absolute; bottom: -80px; left: 40%; width: 200px; height: 200px; border-radius: 50%; background: rgba(255,255,255,0.04); }
    .header-inner { position: relative; z-index: 1; display: flex; align-items: center; gap: 24px; padding: 28px 48px; }
    .logo-wrap img { width: 64px; filter: drop-shadow(0 2px 6px rgba(0,0,0,0.2)); }
    .header-text h1 { font-family: 'Playfair Display', serif; font-size: 26px; font-weight: 700; letter-spacing: 0.3px; margin-bottom: 4px; }
    .header-text .subtitulo { font-size: 13px; opacity: 0.82; font-weight: 300; }
    .header-text .fecha { font-size: 12px; opacity: 0.65; margin-top: 2px; font-weight: 300; }
    .header-badge { margin-left: auto; background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.3); border-radius: 8px; padding: 10px 18px; text-align: center; backdrop-filter: blur(4px); }
    .header-badge .zona-label { font-size: 10px; opacity: 0.75; text-transform: uppercase; letter-spacing: 1px; }
    .header-badge .zona-val { font-size: 15px; font-weight: 600; margin-top: 2px; }

    .nav-back { background: var(--white); border-bottom: 1px solid var(--border); padding: 10px 48px; }
    .nav-back a { color: var(--primary); text-decoration: none; font-size: 13px; font-weight: 600; display: inline-flex; align-items: center; gap: 6px; transition: gap 0.2s; }
    .nav-back a:hover { gap: 10px; }

    .contenido { max-width: 960px; margin: 0 auto; padding: 40px 24px 60px; }

    .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 32px; }
    .kpi-card { background: var(--white); border-radius: 10px; padding: 18px 16px; border-top: 3px solid var(--primary); box-shadow: 0 2px 8px rgba(0,0,0,0.06); text-align: center; }
    .kpi-card .kpi-icono { font-size: 22px; margin-bottom: 6px; }
    .kpi-card .kpi-val { font-size: 22px; font-weight: 700; color: var(--primary); line-height: 1.1; margin-bottom: 4px; }
    .kpi-card .kpi-lbl { font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.4px; font-weight: 600; }

    .seccion { background: var(--white); border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); margin-bottom: 24px; overflow: hidden; }
    .seccion-header { background: var(--primary); color: white; padding: 12px 20px; display: flex; align-items: center; gap: 10px; }
    .seccion-header .icono { font-size: 16px; }
    .seccion-header h2 { font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
    .seccion-body { padding: 20px; }
    .seccion-body p { margin-bottom: 12px; font-size: 14.5px; color: var(--text); }
    .seccion-body p:last-child { margin-bottom: 0; }

    .alerta { background: #fff8e1; border-left: 4px solid #f9a825; border-radius: 0 6px 6px 0; padding: 12px 16px; margin: 14px 0; font-size: 13.5px; color: #5d3f00; display: flex; gap: 10px; align-items: flex-start; }
    .alerta-roja { background: #fce8e6; border-left: 4px solid #c62828; border-radius: 0 6px 6px 0; padding: 12px 16px; margin: 14px 0; font-size: 13.5px; color: #5d0000; display: flex; gap: 10px; align-items: flex-start; }

    .tabla-datos { width: 100%; border-collapse: collapse; font-size: 13.5px; }
    .tabla-datos tr { border-bottom: 1px solid var(--border); }
    .tabla-datos tr:last-child { border-bottom: none; }
    .tabla-datos td { padding: 9px 12px; }
    .tabla-datos td:first-child { color: var(--text-muted); font-weight: 600; width: 30%; }
    .tabla-datos tr:hover td { background: var(--primary-light); }

    .svc-table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
    .svc-table th { background: var(--primary-light); color: var(--primary-dark); font-size: 11px; text-transform: uppercase; padding: 10px 12px; text-align: left; letter-spacing: 0.4px; font-weight: 700; }
    .svc-table td { padding: 9px 12px; border-bottom: 1px solid var(--border); }
    .svc-table tr:last-child td { border-bottom: none; }
    .svc-table tr:hover td { background: var(--primary-light); }

    .badge { display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; }
    .badge.si { background: #e6f4ea; color: #2e7d32; }
    .badge.no { background: #fce8e6; color: #c62828; }
    .badge.parcial { background: #fff8e1; color: #f57f17; }

    .conclusion { background: var(--primary-light); border-radius: 10px; padding: 20px 24px; border-left: 5px solid var(--accent); margin-bottom: 24px; }
    .conclusion h2 { font-size: 14px; font-weight: 700; color: var(--primary); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px; }
    .conclusion p { font-size: 14.5px; line-height: 1.75; color: var(--text); }

    .equipo-grid { display: flex; gap: 12px; flex-wrap: wrap; }
    .equipo-chip { background: var(--primary-light); border: 1px solid var(--border); color: var(--primary-dark); border-radius: 20px; padding: 6px 14px; font-size: 13px; font-weight: 600; }

    .galeria { background: white; border-radius: 10px; padding: 24px; margin-bottom: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
    .galeria h2 { font-size: 14px; font-weight: 700; color: var(--primary); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 16px; }
    .galeria-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; }
    .galeria-item { border-radius: 8px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1); transition: transform 0.2s, box-shadow 0.2s; }
    .galeria-item:hover { transform: translateY(-4px); box-shadow: 0 6px 20px rgba(0,0,0,0.18); }
    .galeria-item img { width: 100%; height: 240px; object-fit: cover; display: block; cursor: zoom-in; }
    .galeria-caption { padding: 10px 14px; font-size: 13px; color: var(--text-muted); background: var(--white); }

    #lightbox-overlay { display: none; position: fixed; z-index: 99999; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.92); justify-content: center; align-items: center; cursor: zoom-out; }
    #lightbox-overlay.active { display: flex; }
    #lightbox-overlay img { max-width: 92vw; max-height: 92vh; object-fit: contain; border-radius: 8px; box-shadow: 0 20px 60px rgba(0,0,0,0.5); }
    #lightbox-close-btn { position: fixed; top: 20px; right: 30px; color: white; font-size: 36px; font-weight: 300; cursor: pointer; z-index: 100000; background: rgba(0,0,0,0.4); width: 50px; height: 50px; border-radius: 50%; display: flex; align-items: center; justify-content: center; transition: background 0.2s; user-select: none; }
    #lightbox-close-btn:hover { background: rgba(0,0,0,0.7); }

    .footer { background: var(--primary-dark); color: rgba(255,255,255,0.7); text-align: center; padding: 18px 24px; font-size: 12px; }
    @media (max-width: 680px) { .kpi-grid { grid-template-columns: 1fr 1fr; } .header-inner { flex-wrap: wrap; padding: 20px; } .contenido { padding: 24px 16px 40px; } .nav-back { padding: 10px 16px; } }
`;

const LIGHTBOX_SCRIPT = `document.addEventListener('DOMContentLoaded', function() {
  var overlay = document.createElement('div'); overlay.id = 'lightbox-overlay';
  var closeBtn = document.createElement('span'); closeBtn.id = 'lightbox-close-btn'; closeBtn.innerHTML = '&times;';
  var imgEl = document.createElement('img'); imgEl.alt = 'Foto ampliada';
  overlay.appendChild(closeBtn); overlay.appendChild(imgEl); document.body.appendChild(overlay);
  var imgs = document.querySelectorAll('.galeria-item img');
  for (var i = 0; i < imgs.length; i++) { imgs[i].addEventListener('click', function(e) { e.stopPropagation(); imgEl.src = this.src; overlay.classList.add('active'); document.body.style.overflow = 'hidden'; }); }
  function cerrar() { overlay.classList.remove('active'); document.body.style.overflow = ''; }
  overlay.addEventListener('click', cerrar); closeBtn.addEventListener('click', cerrar);
  document.addEventListener('keydown', function(e) { if (e.key === 'Escape') cerrar(); });
});`;

const FUENTES_HREF = 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Source+Sans+3:wght@300;400;600&display=swap';
const FOOTER_DEFAULT = 'Cooperativa Eléctrica · Relevamiento Estratégico de Asentamientos · Concordia, Entre Ríos · 2026';
const LOGO_DEFAULT = 'logo_cooperativa_transparente.png';

// ─── Renderizado de bloques ─────────────────────────────────

/** Convierte texto editable (**negrita**, *itálica*) a HTML inline. */
export function textoAHtml(texto) {
  let h = String(texto ?? '');
  h = h.replace(/&(?![a-zA-Z#0-9]+;)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  h = h.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  return h;
}

function bloqueKpis(b) {
  const cards = b.items.map(it =>
    `    <div class="kpi-card"><div class="kpi-icono">${it.icono}</div><div class="kpi-val">${it.valor}</div><div class="kpi-lbl">${it.etiqueta}</div></div>`
  ).join('\n');
  return `  <div class="kpi-grid">\n${cards}\n  </div>`;
}

function itemDeSeccion(it) {
  switch (it.tipo) {
    case 'parrafo':
      return `      <p>${textoAHtml(it.texto)}</p>`;
    case 'alerta':
      return `      <div class="${it.estilo}">${it.html}</div>`;
    case 'tablaServicios': {
      const ths = (it.columnas || []).map(c => `<th>${c}</th>`).join('');
      const trs = (it.filas || []).map(f => `          <tr>${f.map(c => `<td>${c}</td>`).join('')}</tr>`).join('\n');
      return `      <table class="svc-table">\n        <thead><tr>${ths}</tr></thead>\n        <tbody>\n${trs}\n        </tbody>\n      </table>`;
    }
    case 'tablaDatos': {
      const style = it.estiloInline ? ` style="${it.estiloInline}"` : '';
      const trs = (it.filas || []).map(f => `        <tr><td>${f[0]}</td><td>${f[1]}</td></tr>`).join('\n');
      return `      <table class="tabla-datos"${style}>\n${trs}\n      </table>`;
    }
    case 'htmlPreservado':
      return '      ' + it.html;
    default:
      return '';
  }
}

function bloqueSeccion(b) {
  const contenido = (b.contenido || []).map(itemDeSeccion).join('\n');
  return `  <div class="seccion">
    <div class="seccion-header"><span class="icono">${b.icono || ''}</span><h2>${b.titulo}</h2></div>
    <div class="seccion-body">
${contenido}
    </div>
  </div>`;
}

function bloqueConclusion(b) {
  const ps = (b.parrafos || []).map(p => `    <p>${textoAHtml(p)}</p>`).join('\n');
  return `  <div class="conclusion">
    <h2>${b.titulo}</h2>
${ps}
  </div>`;
}

function bloqueEquipo(b) {
  const chips = (b.nombres || []).map(n => `        <div class="equipo-chip">${n}</div>`).join('\n');
  return `  <div class="seccion">
    <div class="seccion-header"><span class="icono">${b.icono || ''}</span><h2>${b.titulo}</h2></div>
    <div class="seccion-body">
      <div class="equipo-grid">
${chips}
      </div>
    </div>
  </div>`;
}

function bloqueGaleria(b) {
  const claseCaption = b.claseCaption || 'galeria-caption';
  const items = (b.imagenes || []).map(im => {
    const cap = im.caption ? `<div class="${claseCaption}">${im.caption}</div>` : '';
    return `      <div class="galeria-item"><img src="${im.src}" alt="${im.alt || ''}">${cap}</div>`;
  }).join('\n');
  const encabezado = b.icono
    ? `    <div class="galeria-header"><span class="icono">${b.icono}</span><h2>${b.titulo}</h2></div>`
    : `    <h2>${b.titulo}</h2>`;
  return `  <div class="galeria">
${encabezado}
    <div class="galeria-grid">
${items}
    </div>
  </div>`;
}

function renderBloque(b) {
  switch (b.tipo) {
    case 'kpis':           return bloqueKpis(b);
    case 'seccion':        return bloqueSeccion(b);
    case 'conclusion':     return bloqueConclusion(b);
    case 'equipo':         return bloqueEquipo(b);
    case 'galeria':        return bloqueGaleria(b);
    case 'htmlPreservado': return '  ' + b.html;
    default:               return '';
  }
}

// ─── Generador principal ────────────────────────────────────

/**
 * Genera el HTML completo y autónomo del informe.
 *
 * @param {object} informe  contenido de informe.json
 * @param {object} [barrio] contenido de barrio.json (para colores y zona).
 *                          Si no se pasa, se usan defaults genéricos.
 * @returns {string} documento HTML completo (<!DOCTYPE html> … </html>)
 */
export function generarInformeHtml(informe, barrio) {
  // Retrocompatibilidad: informes con formato preservado
  if (informe.formato === 'preservado') {
    return informe.htmlCompleto;
  }

  barrio = barrio || {};
  const pal = derivarPaleta(barrio.color || '#1e6fa8', barrio.colorClaro);

  const cssVars = `
    :root {
      --primary: ${pal.primary};
      --primary-dark: ${pal.primaryDark};
      --primary-light: ${pal.primaryLight};
      --accent: ${pal.accent};
      --border: ${pal.border};
      --text: #1a2433;
      --text-muted: #5a6a7a;
      --bg: #f7f9fb;
      --white: #ffffff;
    }`;

  const e = informe.encabezado || {};
  const bloques = (informe.bloques || []).map(renderBloque).join('\n\n');
  const fuentesHref = informe.fuentesHref || FUENTES_HREF;
  const footer = informe.footer || FOOTER_DEFAULT;
  const logoSrc = e.logoSrc || LOGO_DEFAULT;
  const title = informe.titleTag || `Relevamiento ${barrio.nombreVisible || ''} — Cooperativa Eléctrica`;

  // Si el informe no trae encabezado completo, lo construimos desde barrio.json
  const titulo    = e.titulo || `Relevamiento ${barrio.nombreVisible || ''}`;
  const subtitulo = e.subtitulo || 'Cooperativa Eléctrica · Concordia, Entre Ríos';
  const fecha     = e.fecha || (barrio.zona ? `Sector ${barrio.zona}` : '');
  const zonaEtiqueta = e.zonaEtiqueta || 'ZONA';
  const zonaValor    = e.zonaValor || barrio.zona || '';

  const nav = informe.navVolver
    ? `<div class="nav-back">\n  <a href="${informe.navVolver.href}">${informe.navVolver.texto}</a>\n</div>`
    : `<div class="nav-back">\n  <a href="Mapa Relevamiento Asentamientos.html">← Volver al mapa</a>\n</div>`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <link href="${fuentesHref}" rel="stylesheet">
  <style>${cssVars}${PLANTILLA_CSS}</style>
</head>
<body>

<div class="header">
  <div class="header-inner">
    <div class="logo-wrap"><img src="${logoSrc}" alt="Cooperativa Eléctrica"></div>
    <div class="header-text">
      <h1>${titulo}</h1>
      <div class="subtitulo">${subtitulo}</div>
      <div class="fecha">${fecha}</div>
    </div>
    <div class="header-badge">
      <div class="zona-label">${zonaEtiqueta}</div>
      <div class="zona-val">${zonaValor}</div>
    </div>
  </div>
</div>

${nav}

<div class="contenido">

${bloques}

</div>

<div class="footer">${footer}</div>

<script>
${LIGHTBOX_SCRIPT}
</script>
</body>
</html>
`;
}
