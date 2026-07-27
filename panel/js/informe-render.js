/**
 * Generador de informes: informe.json → HTML completo.
 *
 * Es la ÚNICA pieza que sabe convertir los datos del informe en el HTML
 * público. La usa el panel (al guardar un informe) y también los scripts
 * de verificación (en node). No depende del DOM.
 *
 * Regla de oro: la apariencia del HTML generado debe ser idéntica a la
 * de los informes originales. Verificado con comparación de píxeles.
 */

/** Convierte texto editable (**negrita**, *itálica*) a HTML inline. */
export function textoAHtml(texto) {
  let h = String(texto ?? '');
  // escape mínimo: los textos provienen de contenido ya existente;
  // escapamos < y > para evitar inyección accidental de tags
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
      const ths = it.columnas.map(c => `<th>${c}</th>`).join('');
      const trs = it.filas.map(f => `          <tr>${f.map(c => `<td>${c}</td>`).join('')}</tr>`).join('\n');
      return `      <table class="svc-table">\n        <thead><tr>${ths}</tr></thead>\n        <tbody>\n${trs}\n        </tbody>\n      </table>`;
    }
    case 'tablaDatos': {
      const style = it.estiloInline ? ` style="${it.estiloInline}"` : '';
      const trs = it.filas.map(f => `        <tr><td>${f[0]}</td><td>${f[1]}</td></tr>`).join('\n');
      return `      <table class="tabla-datos"${style}>\n${trs}\n      </table>`;
    }
    case 'htmlPreservado':
      return '      ' + it.html;
    default:
      return '';
  }
}

function bloqueSeccion(b) {
  const contenido = b.contenido.map(itemDeSeccion).join('\n');
  return `  <div class="seccion">
    <div class="seccion-header"><span class="icono">${b.icono}</span><h2>${b.titulo}</h2></div>
    <div class="seccion-body">
${contenido}
    </div>
  </div>`;
}

function bloqueConclusion(b) {
  const ps = b.parrafos.map(p => `    <p>${textoAHtml(p)}</p>`).join('\n');
  return `  <div class="conclusion">
    <h2>${b.titulo}</h2>
${ps}
  </div>`;
}

function bloqueEquipo(b) {
  const chips = b.nombres.map(n => `        <div class="equipo-chip">${n}</div>`).join('\n');
  return `  <div class="seccion">
    <div class="seccion-header"><span class="icono">${b.icono}</span><h2>${b.titulo}</h2></div>
    <div class="seccion-body">
      <div class="equipo-grid">
${chips}
      </div>
    </div>
  </div>`;
}

function bloqueGaleria(b) {
  const claseCaption = b.claseCaption || 'galeria-caption';
  const items = b.imagenes.map(im => {
    const cap = im.caption ? `<div class="${claseCaption}">${im.caption}</div>` : '';
    return `      <div class="galeria-item"><img src="${im.src}" alt="${im.alt || ''}">${cap}</div>`;
  }).join('\n');
  // Algunas galerías usan un encabezado con banda de color e ícono aparte
  // (.galeria-header), en vez del <h2> simple. Se preserva si el bloque
  // trae el campo `icono` (viene de una migración con ese formato).
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

/**
 * Genera el HTML completo del informe.
 * @param {object} informe  contenido de informe.json
 * @returns {string} documento HTML completo
 */
export function generarInformeHtml(informe) {
  if (informe.formato === 'preservado') {
    return informe.htmlCompleto;
  }

  const e = informe.encabezado || {};
  const bloques = (informe.bloques || []).map(renderBloque).join('\n\n');
  const nav = informe.navVolver
    ? `<div class="nav-back">\n  <a href="${informe.navVolver.href}">${informe.navVolver.texto}</a>\n</div>`
    : '';
  const script = informe.lightbox ? `<script>\n${LIGHTBOX_SCRIPT}\n</script>` : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${informe.titleTag}</title>
  <link href="${informe.fuentesHref}" rel="stylesheet">
  <style>${informe.estilos}</style>
</head>
<body>

<div class="header">
  <div class="header-inner">
    <div class="logo-wrap"><img src="${e.logoSrc || 'logo_cooperativa_transparente.png'}" alt="Cooperativa Eléctrica"></div>
    <div class="header-text">
      <h1>${e.titulo}</h1>
      <div class="subtitulo">${e.subtitulo}</div>
      <div class="fecha">${e.fecha}</div>
    </div>
    <div class="header-badge">
      <div class="zona-label">${e.zonaEtiqueta}</div>
      <div class="zona-val">${e.zonaValor}</div>
    </div>
  </div>
</div>

${nav}

<div class="contenido">

${bloques}

</div>

<div class="footer">${informe.footer}</div>

${script}
</body>
</html>
`;
}
