/**
 * Asistente para crear un barrio nuevo (Módulo 8).
 *
 * Un flujo guiado de 4 pasos:
 *   1. Identidad     — nombre, zona, color
 *   2. Contorno      — dibujar el polígono del barrio en el mapa
 *   3. Datos base    — indicadores del mapa (elec/edu/salud) + los 4 básicos
 *   4. Confirmación  — revisión + creación real
 *
 * Estado compartido: un solo objeto que crece pantalla por pantalla. Al
 * llegar al paso 4 tiene todo lo necesario para crear los archivos.
 *
 * Creación: escribimos primero todos los archivos del barrio, y al final
 * actualizamos data/barrios/index.json. Si algo falla antes del último
 * PUT, el barrio queda "invisible" (los archivos huérfanos no molestan
 * porque no están en el índice). El usuario reintenta y funciona.
 */

import { el, toast } from '../dom.js';
import { icons } from '../icons.js';
import { canEdit } from '../auth.js';
import { go } from '../router.js';
import { dirty } from '../dirty.js';
import { fetchIndex, fetchFileWithSha, putJsonFile, putTextFile, commitMessage } from '../github.js';
import { renderPasoIdentidad } from './asistente/paso-identidad.js';
import { renderPasoContorno } from './asistente/paso-contorno.js';
import { renderPasoDatos }    from './asistente/paso-datos.js';
import { renderPasoConfirmar } from './asistente/paso-confirmar.js';

// Paleta base de colores (misma que el editor de información general)
export const PALETA_COLORES = [
  { color: '#b34000', colorClaro: '#fbe9e7' },
  { color: '#a02000', colorClaro: '#ffebee' },
  { color: '#c04a00', colorClaro: '#fdeee6' },
  { color: '#8b6914', colorClaro: '#fdf3d7' },
  { color: '#2e7d32', colorClaro: '#e8f5e9' },
  { color: '#1565c0', colorClaro: '#e3f2fd' },
  { color: '#6a1b9a', colorClaro: '#f3e5f5' },
  { color: '#4527a0', colorClaro: '#ede7f6' },
  { color: '#00695c', colorClaro: '#e0f2f1' },
  { color: '#37474f', colorClaro: '#eceff1' }
];

// Zonas sugeridas (con posibilidad de escribir libre)
export const ZONAS_SUGERIDAS = [
  'Zona Norte', 'Zona Sur', 'Zona Este', 'Zona Oeste', 'Zona Centro'
];

const PASOS = [
  { id: 'identidad',   label: 'Identidad',       hint: 'Nombre, zona y color' },
  { id: 'contorno',    label: 'Ubicación',       hint: 'Dibujá el contorno' },
  { id: 'datos',       label: 'Datos base',      hint: 'Indicadores iniciales' },
  { id: 'confirmar',   label: 'Confirmación',    hint: 'Revisá y creá' }
];

/**
 * Entry point del asistente.
 */
export async function renderAsistenteNuevoBarrio(container) {
  container.innerHTML = '';

  if (!canEdit()) {
    container.appendChild(el('div.callout.warn', {}, [
      el('span', { text: 'Necesitás estar conectado con permisos para crear un barrio.' })
    ]));
    return;
  }

  // Trae el array de barrios actual para verificar slugs duplicados
  let barriosActuales;
  try {
    barriosActuales = await fetchIndex({ bustCache: true });
  } catch (e) {
    container.appendChild(el('div.callout.err', {}, [
      el('span', { text: `No se pudo cargar la lista de barrios: ${e.message}` })
    ]));
    return;
  }

  // Estado compartido — crece a lo largo del asistente
  const estado = {
    // Paso 1: identidad
    nombreVisible: '',
    slug: '',
    zona: '',
    color: PALETA_COLORES[0].color,
    colorClaro: PALETA_COLORES[0].colorClaro,

    // Paso 2: contorno (array de [lat, lng])
    contorno: null,

    // Paso 3: datos base
    datosMapa: {
      electricidad: 0,
      educacion: false,
      salud: false
    },
    indicadores: [
      { id: 'edad',      etiqueta: 'Edad promedio',           valor: '' },
      { id: 'origen',    etiqueta: 'Origen',                   valor: '' },
      { id: 'viviendas', etiqueta: 'Viviendas relevadas',     valor: '' },
      { id: 'material',  etiqueta: 'Material predominante',   valor: '' }
    ],

    // Paso actual (índice dentro de PASOS)
    pasoActual: 0,

    // Slugs ya usados (para validación temprana)
    slugsExistentes: barriosActuales.map(b => b.id)
  };

  // Shell del asistente
  const wrap = el('div.asistente-wrap');
  container.appendChild(wrap);

  wrap.appendChild(construirCabezal(estado));
  wrap.appendChild(construirPasosNav(estado));

  const cuerpo = el('div.asistente-cuerpo');
  wrap.appendChild(cuerpo);

  const pie = el('div.asistente-pie');
  wrap.appendChild(pie);

  // Renderizar el paso actual
  function pintarPaso() {
    cuerpo.innerHTML = '';
    pie.innerHTML = '';

    const paso = PASOS[estado.pasoActual];
    const controlador = {
      estado,
      irAlPaso(idx) {
        if (idx < 0 || idx >= PASOS.length) return;
        estado.pasoActual = idx;
        pintarPaso();
        actualizarNav();
      },
      siguiente() { controlador.irAlPaso(estado.pasoActual + 1); },
      anterior()  { controlador.irAlPaso(estado.pasoActual - 1); },
      cancelar()  { salirDelAsistente(); },
      finalizar()  { salirDelAsistenteTrasCrear(estado.slug); }
    };

    if (paso.id === 'identidad')  renderPasoIdentidad(cuerpo, pie, controlador);
    else if (paso.id === 'contorno')  renderPasoContorno(cuerpo, pie, controlador);
    else if (paso.id === 'datos')     renderPasoDatos(cuerpo, pie, controlador);
    else if (paso.id === 'confirmar') renderPasoConfirmar(cuerpo, pie, controlador);
  }

  function actualizarNav() {
    // Actualiza el visual de los pasos superiores
    const nav = wrap.querySelector('.asistente-pasos');
    if (!nav) return;
    nav.querySelectorAll('.asist-paso').forEach((el, i) => {
      el.classList.toggle('activo', i === estado.pasoActual);
      el.classList.toggle('completo', i < estado.pasoActual);
    });
  }

  pintarPaso();
}

function construirCabezal(estado) {
  return el('div.asistente-cabezal', {}, [
    el('div', {}, [
      el('h2', { text: 'Crear un barrio nuevo' }),
      el('p.sub', { text: 'Vamos a completar los datos básicos. Los detalles del informe y las fotos se agregan después.' })
    ]),
    el('button.btn.ghost.asist-cancelar', {
      onClick: () => salirDelAsistente()
    }, [
      el('span', { html: icons.close() }).firstChild,
      'Cancelar'
    ])
  ]);
}

function construirPasosNav(estado) {
  const nav = el('div.asistente-pasos');
  PASOS.forEach((p, i) => {
    const activo = i === estado.pasoActual;
    const completo = i < estado.pasoActual;
    const paso = el('div.asist-paso' + (activo ? '.activo' : '') + (completo ? '.completo' : ''), {}, [
      el('span.asist-paso-num', { text: String(i + 1) }),
      el('div', {}, [
        el('span.asist-paso-label', { text: p.label }),
        el('span.asist-paso-hint', { text: p.hint })
      ])
    ]);
    nav.appendChild(paso);
  });
  return nav;
}

function salirDelAsistente() {
  if (!dirty.confirmNavigate()) return;
  dirty.disable();
  go('barrios');
}

function salirDelAsistenteTrasCrear(slug) {
  dirty.disable();
  go(`barrio/${slug}`);
}
