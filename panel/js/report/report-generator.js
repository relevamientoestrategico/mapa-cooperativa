/**
 * Generador de informes HTML.
 *
 * Toma barrio.json (identidad) + informe.json (contenido tipado) y produce
 * el archivo HTML público, exactamente con la misma apariencia visual que
 * los informes originales. El HTML deja de ser la fuente de verdad: es un
 * artefacto que se regenera en cada Guardar.
 *
 * Soporta dos plantillas visuales (detectadas por informe.plantilla):
 *   'estandar'   → la plantilla compartida por 8 de los 9 barrios actuales
 *   'villaBusti' → la plantilla propia de Villa Busti (con "card" en vez de
 *                  "sección", header de una franja y KPIs de electricidad
 *                  bicolor). Se preserva tal cual para no alterar su diseño.
 *
 * Convención de negrita: igual que WhatsApp, *palabra* se convierte en
 * <strong>palabra</strong>. Así el usuario puede resaltar texto sin
 * escribir HTML ni aprender sintaxis nueva.
 */

import { paletaDesdeColor } from './color-utils.js';

/* ─── Helpers de texto ──────────────────────────────────────────── */

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Convierte *negrita* (estilo WhatsApp) en <strong>, tras escapar HTML. */
function textoEnriquecido(str) {
  return escapeHtml(str).replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>');
}

const BADGE_LABELS = { si: 'si', no: 'no', parcial: 'parcial' };
function badgeClase(estado) {
  return BADGE_LABELS[estado] || 'parcial';
}

/* ─── Render de bloques dentro de una sección (plantilla estándar) ─ */

function renderBloqueEstandar(b) {
  switch (b.tipo) {
    case 'parrafo':
      return `<p>${textoEnriquecido(b.texto)}</p>`;
    case 'alerta': {
      const claseVariante = b.variante === 'roja' ? 'alerta-roja'
                            : b.variante === 'verde' ? 'alerta-verde'
                            : 'alerta';
      const icono = b.icono ? `<span class="alerta-icono">${b.icono}</span>` : '';
      return `<div class="${claseVariante}">${icono}<span>${textoEnriquecido(b.texto)}</span></div>`;
    }
    case 'infoBox':
      return `<div class="info-box">${b.icono ? b.icono + ' ' : ''}${textoEnriquecido(b.texto)}</div>`;
    case 'tablaServicios':
      return `<table class="svc-table">
        <thead><tr><th>Servicio</th><th>Estado</th><th>Detalle</th></tr></thead>
        <tbody>
          ${b.filas.map(f => `<tr><td>${escapeHtml(f.servicio)}</td><td><span class="badge ${badgeClase(f.estado)}">${escapeHtml(f.estadoLabel || f.estado)}</span></td><td>${escapeHtml(f.detalle)}</td></tr>`).join('\n          ')}
        </tbody>
      </table>`;
    case 'tablaDatos':
      return `<table class="tabla-datos">
        ${b.filas.map(f => `<tr><td>${escapeHtml(f.etiqueta)}</td><td>${textoEnriquecido(f.valor)}</td></tr>`).join('\n        ')}
      </table>`;
    default:
      return '';
  }
}

/* ─── Plantilla ESTÁNDAR ────────────────────────────────────────── */

function generarEstandar(barrio, informe) {
  const pal = paletaDesdeColor(barrio.color, barrio.colorClaro);
  const enc = informe.encabezado || {};
  const kpis = informe.kpis || [];
  const secciones = informe.secciones || [];
  const equipo = enc.equipo || [];
  const galeria = informe.galeria || { titulo: '', imagenes: [] };

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(enc.tituloInforme || `Relevamiento ${barrio.nombreVisible}`)} — Cooperativa Eléctrica</title>
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Source+Sans+3:wght@300;400;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --primary: ${pal.primary};
      --primary-dark: ${pal.primaryDark};
      --primary-light: ${pal.primaryLight};
      --accent: ${pal.accent};
      --text: #1a2433;
      --text-muted: #5a6a7a;
      --border: #f0d8d0;
      --bg: #f7f9fb;
      --white: #ffffff;
      --danger: #c62828;
      --warning: #e65100;
      --success: #2e7d32;
    }
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

    .kpi-grid { display: grid; grid-template-columns: repeat(${Math.max(kpis.length, 1)}, 1fr); gap: 16px; margin-bottom: 32px; }
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

    .alerta { background: #fff3e0; border-left: 4px solid var(--warning); border-radius: 0 6px 6px 0; padding: 12px 16px; margin: 14px 0; font-size: 13.5px; color: #5d2f00; display: flex; gap: 10px; align-items: flex-start; }
    .alerta .alerta-icono { font-size: 16px; flex-shrink: 0; margin-top: 1px; }
    .alerta-roja { background: #fce8e6; border-left: 4px solid #c62828; border-radius: 0 6px 6px 0; padding: 12px 16px; margin: 14px 0; font-size: 13.5px; color: #5d0000; display: flex; gap: 10px; align-items: flex-start; }
    .alerta-verde { background: #e6f4ea; border-left: 4px solid var(--success); border-radius: 0 6px 6px 0; padding: 12px 16px; margin: 14px 0; font-size: 13.5px; color: #1b4d20; display: flex; gap: 10px; align-items: flex-start; }
    .info-box { background: #e3f2fd; border-left: 4px solid #1976d2; border-radius: 0 6px 6px 0; padding: 12px 16px; margin: 14px 0; font-size: 13.5px; color: #0d2d4a; }

    .tabla-datos { width: 100%; border-collapse: collapse; font-size: 13.5px; }
    .tabla-datos tr { border-bottom: 1px solid var(--border); }
    .tabla-datos tr:last-child { border-bottom: none; }
    .tabla-datos td { padding: 9px 12px; }
    .tabla-datos td:first-child { color: var(--text-muted); font-weight: 600; width: 30%; }
    .tabla-datos tr:hover td { background: var(--primary-light); }

    .svc-table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
    .svc-table th { background: var(--primary-light); color: var(--primary); font-size: 11px; text-transform: uppercase; padding: 10px 12px; text-align: left; letter-spacing: 0.4px; font-weight: 700; }
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
    .equipo-chip { background: var(--primary-light); border: 1px solid #e0b0a0; color: var(--primary-dark); border-radius: 20px; padding: 6px 14px; font-size: 13px; font-weight: 600; }

    .galeria { background: white; border-radius: 10px; padding: 24px; margin-bottom: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
    .galeria h2 { font-size: 14px; font-weight: 700; color: var(--primary); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 16px; }
    .galeria-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; }
    .galeria-item { border-radius: 8px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1); transition: transform 0.2s, box-shadow 0.2s; }
    .galeria-item:hover { transform: translateY(-4px); box-shadow: 0 6px 20px rgba(0,0,0,0.18); }
    .galeria-item img { width: 100%; height: 240px; object-fit: cover; display: block; cursor: zoom-in; }

    #lightbox-overlay { display: none; position: fixed; z-index: 99999; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.92); justify-content: center; align-items: center; cursor: zoom-out; }
    #lightbox-overlay.active { display: flex; }
    #lightbox-overlay img { max-width: 92vw; max-height: 92vh; object-fit: contain; border-radius: 8px; box-shadow: 0 20px 60px rgba(0,0,0,0.5); }
    #lightbox-close-btn { position: fixed; top: 20px; right: 30px; color: white; font-size: 36px; font-weight: 300; cursor: pointer; line-height: 1; z-index: 100000; background: rgba(0,0,0,0.4); width: 50px; height: 50px; border-radius: 50%; display: flex; align-items: center; justify-content: center; transition: background 0.2s; user-select: none; }
    #lightbox-close-btn:hover { background: rgba(0,0,0,0.7); }

    .footer { background: var(--primary-dark); color: rgba(255,255,255,0.7); text-align: center; padding: 18px 24px; font-size: 12px; }
    @media (max-width: 680px) { .kpi-grid { grid-template-columns: 1fr 1fr; } .header-inner { flex-wrap: wrap; padding: 20px; } .contenido { padding: 24px 16px 40px; } .nav-back { padding: 10px 16px; } }
  </style>
</head>
<body>

<div class="header">
  <div class="header-inner">
    <div class="logo-wrap"><img src="logo_cooperativa_transparente.png" alt="Cooperativa Eléctrica"></div>
    <div class="header-text">
      <h1>${escapeHtml(enc.tituloInforme || `Relevamiento ${barrio.nombreVisible}`)}</h1>
      <div class="subtitulo">${escapeHtml(enc.subtitulo || 'Cooperativa Eléctrica · Concordia, Entre Ríos')}</div>
      ${enc.fechaRelevamiento ? `<div class="fecha">Relevamiento realizado: ${escapeHtml(enc.fechaRelevamiento)}</div>` : ''}
    </div>
    ${barrio.zona ? `<div class="header-badge"><div class="zona-label">Zona</div><div class="zona-val">${escapeHtml(barrio.zona)}</div></div>` : ''}
  </div>
</div>

<div class="nav-back">
  <a href="Mapa Relevamiento Asentamientos.html">← Volver al mapa</a>
</div>

<div class="contenido">

  ${kpis.length ? `<div class="kpi-grid">
    ${kpis.map(k => `<div class="kpi-card"><div class="kpi-icono">${k.icono || ''}</div><div class="kpi-val">${escapeHtml(k.valor)}</div><div class="kpi-lbl">${escapeHtml(k.etiqueta)}</div></div>`).join('\n    ')}
  </div>` : ''}

  ${secciones.map(s => `<div class="seccion">
    <div class="seccion-header"><span class="icono">${s.icono || ''}</span><h2>${escapeHtml(s.titulo)}</h2></div>
    <div class="seccion-body">
      ${(s.bloques || []).map(renderBloqueEstandar).join('\n      ')}
    </div>
  </div>`).join('\n\n  ')}

  ${informe.conclusion ? `<div class="conclusion">
    <h2>Conclusión</h2>
    <p>${textoEnriquecido(informe.conclusion)}</p>
  </div>` : ''}

  ${equipo.length ? `<div class="seccion">
    <div class="seccion-header"><span class="icono">👥</span><h2>Equipo de Trabajo</h2></div>
    <div class="seccion-body">
      <div class="equipo-grid">
        ${equipo.map(nombre => `<div class="equipo-chip">${escapeHtml(nombre)}</div>`).join('\n        ')}
      </div>
    </div>
  </div>` : ''}

  ${(galeria.imagenes || []).length ? `<div class="galeria">
    <h2>📷 ${escapeHtml(galeria.titulo || `Registro Fotográfico — ${barrio.nombreVisible}`)}</h2>
    <div class="galeria-grid">
      ${galeria.imagenes.map(img => `<div class="galeria-item"><img src="${escapeHtml(img.archivo)}" alt="Foto del relevamiento"></div>`).join('\n      ')}
    </div>
  </div>` : ''}

</div>

<div class="footer">Cooperativa Eléctrica · Relevamiento Estratégico de Asentamientos · Concordia, Entre Ríos · 2026</div>

${LIGHTBOX_SCRIPT}
</body>
</html>
`;
}

/* ─── Plantilla VILLA BUSTI (propia, se preserva tal cual) ────────── */

function generarVillaBusti(barrio, informe) {
  const pal = paletaDesdeColor(barrio.color, barrio.colorClaro);
  const enc = informe.encabezado || {};
  const kpis = informe.kpis || [];
  const kpisElec = informe.kpisElectricidad;
  const secciones = informe.secciones || [];
  const equipo = enc.equipo || [];
  const galeria = informe.galeria || { titulo: '', imagenes: [] };

  const renderBloque = (b) => {
    switch (b.tipo) {
      case 'parrafo': return `<p>${textoEnriquecido(b.texto)}</p>`;
      case 'alerta': {
        const clase = b.variante === 'roja' ? 'alerta-roja' : b.variante === 'verde' ? 'alerta-verde' : 'alerta';
        return `<div class="${clase}">${b.icono ? b.icono + ' ' : ''}${textoEnriquecido(b.texto)}</div>`;
      }
      case 'infoBox':
        return `<div class="alerta">${b.icono ? b.icono + ' ' : ''}${textoEnriquecido(b.texto)}</div>`;
      case 'tablaServicios':
        return `<table class="svc-table">
          <thead><tr><th>Servicio</th><th>Estado</th><th>Detalle</th></tr></thead>
          <tbody>
            ${b.filas.map(f => `<tr><td>${escapeHtml(f.servicio)}</td><td><span class="badge ${badgeClase(f.estado)}">${escapeHtml(f.estadoLabel || f.estado)}</span></td><td>${escapeHtml(f.detalle)}</td></tr>`).join('\n            ')}
          </tbody>
        </table>`;
      case 'tablaDatos':
        return b.filas.map(f => `<p><strong>${escapeHtml(f.etiqueta)}:</strong> ${textoEnriquecido(f.valor)}</p>`).join('\n        ');
      default: return '';
    }
  };

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(enc.tituloInforme || `Informe — ${barrio.nombreVisible}`)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', sans-serif; background: #f4f6f9; color: #333; }

    .header { background: linear-gradient(135deg, ${pal.primary}, ${pal.accent}); color: white; padding: 30px 40px; }
    .header a.back { font-size: 13px; opacity: 0.8; margin-bottom: 10px; display: inline-block; text-decoration: none; color: white; }
    .header a.back:hover { opacity: 1; }
    .header h1 { font-size: 28px; font-weight: 700; }
    .header p { font-size: 14px; opacity: 0.85; margin-top: 6px; }
    .header .equipo { margin-top: 12px; font-size: 13px; opacity: 0.75; }

    .content { max-width: 860px; margin: 30px auto; padding: 0 20px 60px; }

    .kpi-grid { display: grid; grid-template-columns: repeat(${Math.max(kpis.length, 1)}, 1fr); gap: 14px; margin-bottom: 20px; }
    .kpi { background: white; border-radius: 12px; padding: 18px; text-align: center; box-shadow: 0 2px 8px rgba(0,0,0,0.07); border-top: 4px solid ${pal.primary}; }
    .kpi .val { font-size: 30px; font-weight: 700; color: ${pal.primary}; }
    .kpi .lbl { font-size: 11px; color: #888; margin-top: 4px; text-transform: uppercase; font-weight: 600; }

    .kpi-elec-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 20px; }
    .kpi-legal { background: white; border-radius: 12px; padding: 18px; text-align: center; box-shadow: 0 2px 8px rgba(0,0,0,0.07); border-top: 4px solid #2e7d32; }
    .kpi-legal .val { font-size: 34px; font-weight: 700; color: #2e7d32; }
    .kpi-legal .lbl { font-size: 11px; color: #888; margin-top: 4px; text-transform: uppercase; font-weight: 600; }
    .kpi-ilegal { background: white; border-radius: 12px; padding: 18px; text-align: center; box-shadow: 0 2px 8px rgba(0,0,0,0.07); border-top: 4px solid #c62828; }
    .kpi-ilegal .val { font-size: 34px; font-weight: 700; color: #c62828; }
    .kpi-ilegal .lbl { font-size: 11px; color: #888; margin-top: 4px; text-transform: uppercase; font-weight: 600; }

    .card { background: white; border-radius: 12px; padding: 24px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.07); }
    .card h2 { font-size: 16px; font-weight: 700; color: ${pal.primary}; border-bottom: 2px solid ${pal.primaryLight}; padding-bottom: 10px; margin-bottom: 16px; text-transform: uppercase; letter-spacing: 0.5px; }
    .card p { font-size: 14px; line-height: 1.75; color: #444; margin-bottom: 10px; }
    .card p:last-child { margin-bottom: 0; }

    .svc-table { width: 100%; border-collapse: collapse; }
    .svc-table th { background: ${pal.primaryLight}; color: ${pal.primary}; font-size: 12px; text-transform: uppercase; padding: 10px 14px; text-align: left; }
    .svc-table td { padding: 10px 14px; font-size: 14px; border-bottom: 1px solid #f0f0f0; }
    .svc-table tr:last-child td { border-bottom: none; }

    .badge { display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; }
    .badge.si { background: #e6f4ea; color: #2e7d32; }
    .badge.no { background: #fce8e6; color: #c62828; }
    .badge.parcial { background: #fff8e1; color: #f57f17; }

    .alerta { background: #fff8e1; border-left: 4px solid #f9a825; padding: 14px 18px; border-radius: 0 8px 8px 0; font-size: 14px; color: #555; margin-bottom: 10px; }
    .alerta-roja { background: #fce8e6; border-left: 4px solid #c62828; padding: 14px 18px; border-radius: 0 8px 8px 0; font-size: 14px; color: #555; margin-bottom: 10px; }
    .alerta-verde { background: #e6f4ea; border-left: 4px solid #2e7d32; padding: 14px 18px; border-radius: 0 8px 8px 0; font-size: 14px; color: #555; margin-bottom: 10px; }

    .conclusion { background: ${pal.primaryLight}; border-radius: 12px; padding: 20px 24px; border-left: 5px solid ${pal.primary}; }
    .conclusion p { font-size: 14px; line-height: 1.75; color: #444; }

    .galeria { background: white; border-radius: 12px; padding: 30px; margin-top: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.07); }
    .galeria h2 { font-size: 18px; font-weight: 700; color: #333; margin-bottom: 20px; text-align: center; text-transform: uppercase; letter-spacing: 0.5px; }
    .galeria-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; }
    .galeria-item { border-radius: 8px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1); transition: transform 0.2s, box-shadow 0.2s; }
    .galeria-item:hover { transform: translateY(-4px); box-shadow: 0 6px 20px rgba(0,0,0,0.18); }
    .galeria-item img { width: 100%; height: 220px; object-fit: cover; display: block; cursor: zoom-in; }

    #lightbox-overlay { display: none; position: fixed; z-index: 99999; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.92); justify-content: center; align-items: center; cursor: zoom-out; }
    #lightbox-overlay.active { display: flex; }
    #lightbox-overlay img { max-width: 92vw; max-height: 92vh; object-fit: contain; border-radius: 8px; }
    #lightbox-close-btn { position: fixed; top: 20px; right: 30px; color: white; font-size: 36px; cursor: pointer; background: rgba(0,0,0,0.4); width: 50px; height: 50px; border-radius: 50%; display: flex; align-items: center; justify-content: center; z-index: 100000; }
    #lightbox-close-btn:hover { background: rgba(0,0,0,0.7); }

    @media (max-width: 600px) { .kpi-grid { grid-template-columns: repeat(2,1fr); } .kpi-elec-grid { grid-template-columns: 1fr 1fr; } }
  </style>
</head>
<body>

<div class="header">
  <a class="back" href="Mapa Relevamiento Asentamientos.html">← Volver al mapa</a>
  <h1>${escapeHtml(enc.tituloInforme || `Informe de Relevamiento — ${barrio.nombreVisible}`)}</h1>
  ${enc.subtitulo ? `<p>${escapeHtml(enc.subtitulo)}</p>` : ''}
  ${equipo.length ? `<div class="equipo">Equipo: ${equipo.map(escapeHtml).join(' · ')}</div>` : ''}
</div>

<div class="content">

  ${kpis.length ? `<div class="kpi-grid">
    ${kpis.map(k => `<div class="kpi"><div class="val">${escapeHtml(k.valor)}</div><div class="lbl">${escapeHtml(k.etiqueta)}</div></div>`).join('\n    ')}
  </div>` : ''}

  ${kpisElec ? `<div class="kpi-elec-grid">
    <div class="kpi-legal"><div class="val">${escapeHtml(kpisElec.legal.valor)}</div><div class="lbl">${kpisElec.legal.icono || ''} ${escapeHtml(kpisElec.legal.etiqueta)}</div></div>
    <div class="kpi-ilegal"><div class="val">${escapeHtml(kpisElec.ilegal.valor)}</div><div class="lbl">${kpisElec.ilegal.icono || ''} ${escapeHtml(kpisElec.ilegal.etiqueta)}</div></div>
  </div>` : ''}

  ${secciones.map(s => `<div class="card">
    <h2>${s.icono ? s.icono + ' ' : ''}${escapeHtml(s.titulo)}</h2>
    ${(s.bloques || []).map(renderBloque).join('\n    ')}
  </div>`).join('\n\n  ')}

  ${informe.conclusion ? `<div class="conclusion">
    <h2 style="color:${pal.primary};margin-bottom:10px">Conclusión</h2>
    <p>${textoEnriquecido(informe.conclusion)}</p>
  </div>` : ''}

  ${(galeria.imagenes || []).length ? `<div class="galeria">
    <h2>${escapeHtml(galeria.titulo || `Registro fotográfico — ${barrio.nombreVisible}`)}</h2>
    <div class="galeria-grid">
      ${galeria.imagenes.map(img => `<div class="galeria-item"><img src="${escapeHtml(img.archivo)}" alt="${escapeHtml(barrio.nombreVisible)}"></div>`).join('\n      ')}
    </div>
  </div>` : ''}

</div>

${LIGHTBOX_SCRIPT}
</body>
</html>
`;
}

/* ─── Script de lightbox, compartido por ambas plantillas ─────────── */

const LIGHTBOX_SCRIPT = `<script>
document.addEventListener('DOMContentLoaded', function() {
  var overlay = document.createElement('div'); overlay.id = 'lightbox-overlay';
  var closeBtn = document.createElement('span'); closeBtn.id = 'lightbox-close-btn'; closeBtn.innerHTML = '&times;';
  var imgEl = document.createElement('img'); imgEl.alt = 'Foto ampliada';
  overlay.appendChild(closeBtn); overlay.appendChild(imgEl); document.body.appendChild(overlay);
  var imgs = document.querySelectorAll('.galeria-item img');
  for (var i = 0; i < imgs.length; i++) { imgs[i].addEventListener('click', function(e) { e.stopPropagation(); imgEl.src = this.src; overlay.classList.add('active'); document.body.style.overflow = 'hidden'; }); }
  function cerrar() { overlay.classList.remove('active'); document.body.style.overflow = ''; }
  overlay.addEventListener('click', cerrar); closeBtn.addEventListener('click', cerrar);
  document.addEventListener('keydown', function(e) { if (e.key === 'Escape') cerrar(); });
});
</script>`;

/* ─── Punto de entrada público ─────────────────────────────────────── */

/**
 * Genera el HTML completo del informe a partir de los datos administrados.
 * @param {object} barrio   contenido de barrio.json (identidad)
 * @param {object} informe  contenido de informe.json (contenido tipado)
 */
export function generarInformeHTML(barrio, informe) {
  if (informe.plantilla === 'villaBusti') return generarVillaBusti(barrio, informe);
  return generarEstandar(barrio, informe);
}
