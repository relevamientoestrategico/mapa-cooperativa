/**
 * Vista compartida del historial.
 *
 * Renderiza una lista de entradas con filtros (fecha, autor, tipo).
 * Se usa tanto en la vista "por barrio" como en la "global".
 *
 * Filosofía de UX heredada del panel:
 *   - Lenguaje humano en toda la UI (nada de "commit", "sha", "diff").
 *   - Filtros como chips simples, con contador de resultados visible.
 *   - Vacío = mensaje amable, no error.
 *   - Cargando = spinner claro, no bloquea la pantalla.
 *   - Detalle expandible por clic (opcional), sin abrir modales.
 */

import { el, toast, asociarLabel } from '../dom.js';
import { icons } from '../icons.js';
import { fetchCommits, fetchArchivosDeCommit, parseCommit, filtrarEntradas, formatearFecha } from '../historial-motor.js';

const TIPOS_FILTRO = [
  { id: 'informe',    label: 'Informe',    emoji: '📝' },
  { id: 'mapa',       label: 'Mapa',       emoji: '🗺️' },
  { id: 'imagenes',   label: 'Imágenes',   emoji: '📷' },
  { id: 'informacion', label: 'Info general', emoji: 'ℹ️' }
];

const RANGOS_FECHA = [
  { id: 'todos',       label: 'Todo el tiempo', dias: null },
  { id: 'semana',      label: 'Última semana',  dias: 7 },
  { id: 'mes',         label: 'Último mes',     dias: 30 },
  { id: 'trimestre',   label: 'Últimos 3 meses', dias: 90 }
];

/**
 * Monta la vista de historial dentro de un contenedor.
 * @param {HTMLElement} contenedor
 * @param {object} opts
 *   - modo: 'barrio' | 'global'
 *   - barrio?: { id, nombreVisible }  (obligatorio si modo === 'barrio')
 *   - onSalir: () => void  callback cuando el usuario clickea "Volver"
 */
export async function montarHistorial(contenedor, { modo, barrio, onSalir }) {
  contenedor.innerHTML = '';

  const wrap = el('div.historial-wrap');
  contenedor.appendChild(wrap);

  // Encabezado
  const cabezal = el('div.hist-cabezal', {}, [
    el('div.hist-cabezal-izq', {}, [
      el('button.btn.ghost.hist-volver', { onClick: () => onSalir && onSalir() }, [
        el('span', { html: icons.chevronLeft() }).firstChild,
        el('span', { text: 'Volver' })
      ]),
      el('div', {}, [
        el('h2.hist-titulo', { text: modo === 'barrio' ? `Historial — ${barrio.nombreVisible}` : 'Historial de todos los barrios' }),
        el('p.hist-sub', { text: 'Últimos cambios realizados. Se actualiza cada vez que abrís esta pantalla.' })
      ])
    ])
  ]);
  wrap.appendChild(cabezal);

  // Estado de la vista
  const state = {
    entradas: [],
    filtros: { rango: 'mes', autor: '', tipo: null },
    cargando: true,
    hayMasPaginas: false,
    proximaPagina: 1
  };

  // Panel de filtros
  const panelFiltros = el('div.hist-filtros');
  wrap.appendChild(panelFiltros);

  // Lista + estado de carga
  const listaCont = el('div.hist-lista');
  wrap.appendChild(listaCont);

  // Pie con "Cargar más"
  const pie = el('div.hist-pie');
  wrap.appendChild(pie);

  await cargarPagina(1);
  pintarTodo();

  async function cargarPagina(pagina) {
    state.cargando = true;
    pintarLista();
    try {
      const path = modo === 'barrio' ? `data/barrios/${barrio.id}` : undefined;
      const { commits, hayMas } = await fetchCommits({ path, perPage: 30, page: pagina });

      // Traer el detalle de cada commit en paralelo (para el resumen legible)
      const detalles = await Promise.all(commits.map(c => fetchArchivosDeCommit(c.sha)));
      const nuevasEntradas = commits.map((c, i) => parseCommit(c, detalles[i]));

      state.entradas = state.entradas.concat(nuevasEntradas);
      state.hayMasPaginas = hayMas;
      state.proximaPagina = pagina + 1;
    } catch (e) {
      console.error(e);
      if (e.code === 'unauthorized') {
        toast('Necesitás estar conectado con permisos para ver el historial.', 'err');
      } else {
        toast(e.message || 'No se pudo cargar el historial.', 'err');
      }
    } finally {
      state.cargando = false;
    }
  }

  function pintarTodo() {
    pintarFiltros();
    pintarLista();
    pintarPie();
  }

  function pintarFiltros() {
    panelFiltros.innerHTML = '';

    // Chips de rango de fecha
    const grupoFecha = el('div.hist-filtro-grupo', {}, [
      el('span.hist-filtro-label', { text: 'Cuándo:' })
    ]);
    grupoFecha.setAttribute('role', 'group');
    grupoFecha.setAttribute('aria-label', 'Filtrar por fecha');
    RANGOS_FECHA.forEach(r => {
      const activo = state.filtros.rango === r.id;
      const chip = el('button.hist-chip' + (activo ? '.activo' : ''), {
        'aria-pressed': String(activo),
        onClick: () => { state.filtros.rango = r.id; pintarTodo(); }
      }, [r.label]);
      grupoFecha.appendChild(chip);
    });
    panelFiltros.appendChild(grupoFecha);

    // Chips de tipo
    const grupoTipo = el('div.hist-filtro-grupo', {}, [
      el('span.hist-filtro-label', { text: 'Qué:' })
    ]);
    grupoTipo.setAttribute('role', 'group');
    grupoTipo.setAttribute('aria-label', 'Filtrar por tipo de cambio');
    const chipTodos = el('button.hist-chip' + (state.filtros.tipo == null ? '.activo' : ''), {
      'aria-pressed': String(state.filtros.tipo == null),
      onClick: () => { state.filtros.tipo = null; pintarTodo(); }
    }, ['Todo']);
    grupoTipo.appendChild(chipTodos);
    TIPOS_FILTRO.forEach(t => {
      const activo = state.filtros.tipo === t.id;
      const chip = el('button.hist-chip' + (activo ? '.activo' : ''), {
        'aria-pressed': String(activo),
        onClick: () => { state.filtros.tipo = t.id; pintarTodo(); }
      }, [`${t.emoji}  ${t.label}`]);
      grupoTipo.appendChild(chip);
    });
    panelFiltros.appendChild(grupoTipo);

    // Input de autor
    const inputAutor = el('input.hist-filtro-autor', {
      placeholder: 'Nombre o usuario',
      value: state.filtros.autor,
      onInput: (e) => { state.filtros.autor = e.target.value; pintarLista(); pintarContador(); }
    });
    const labelAutor = el('label.hist-filtro-label', { text: 'Quién:' });
    asociarLabel(labelAutor, inputAutor);
    const grupoAutor = el('div.hist-filtro-grupo', {}, [
      labelAutor,
      inputAutor
    ]);
    panelFiltros.appendChild(grupoAutor);

    // Contador de resultados
    const contadorEl = el('div.hist-contador', { id: 'hist-contador' });
    panelFiltros.appendChild(contadorEl);
    pintarContador();
  }

  function calcularEntradasFiltradas() {
    // Aplicar filtros de UI + descartar entradas técnicas irrelevantes
    const desde = rangoDesde(state.filtros.rango);
    return filtrarEntradas(state.entradas.filter(e => e.esRelevante), {
      desde,
      autor: state.filtros.autor.trim() || undefined,
      tipo: state.filtros.tipo || undefined
    });
  }

  function pintarContador() {
    const cont = panelFiltros.querySelector('#hist-contador');
    if (!cont) return;
    const n = calcularEntradasFiltradas().length;
    cont.textContent = `${n} ${n === 1 ? 'cambio' : 'cambios'} en el período`;
  }

  function pintarLista() {
    listaCont.innerHTML = '';
    if (state.cargando && !state.entradas.length) {
      listaCont.appendChild(el('div.hist-cargando', {}, [
        el('span.spinner'),
        el('span', { text: 'Cargando el historial…' })
      ]));
      return;
    }
    const filtradas = calcularEntradasFiltradas();
    if (!filtradas.length) {
      listaCont.appendChild(el('div.hist-vacio', {}, [
        el('p', { text: 'No hay cambios que coincidan con los filtros elegidos.' }),
        el('p.mut', { text: 'Probá ampliar el rango de fechas o quitar algún filtro.' })
      ]));
      return;
    }
    // Agrupar por día
    const grupos = agruparPorDia(filtradas);
    grupos.forEach(g => {
      listaCont.appendChild(el('h3.hist-dia', { text: encabezadoDia(g.fecha) }));
      g.entradas.forEach(e => listaCont.appendChild(renderEntrada(e)));
    });
  }

  function renderEntrada(entrada) {
    const li = el('div.hist-entrada');

    const cabezal = el('div.hist-entrada-cabezal', {}, [
      el('span.hist-hora', { text: horaCorta(entrada.fecha) }),
      el('span.hist-autor', { text: entrada.autor.nombre })
    ]);
    li.appendChild(cabezal);

    const resumenLinea = el('div.hist-resumen', {}, [
      el('span.hist-resumen-tx', { text: entrada.resumen })
    ]);
    if (entrada.barrio?.nombreVisible && modo === 'global') {
      resumenLinea.appendChild(el('span.hist-barrio-chip', { text: entrada.barrio.nombreVisible }));
    }
    li.appendChild(resumenLinea);

    return li;
  }

  function pintarPie() {
    pie.innerHTML = '';
    if (!state.hayMasPaginas) return;
    const btn = el('button.btn.ghost', {
      onClick: async () => {
        btn.disabled = true;
        btn.textContent = 'Cargando…';
        await cargarPagina(state.proximaPagina);
        pintarTodo();
      }
    }, ['Cargar más entradas']);
    pie.appendChild(btn);
  }
}

/* ═══ helpers puros ═══ */

function rangoDesde(rangoId) {
  const r = RANGOS_FECHA.find(x => x.id === rangoId);
  if (!r || r.dias == null) return null;
  return new Date(Date.now() - r.dias * 86400000);
}

function agruparPorDia(entradas) {
  const grupos = new Map();
  for (const e of entradas) {
    const clave = `${e.fecha.getFullYear()}-${e.fecha.getMonth()}-${e.fecha.getDate()}`;
    if (!grupos.has(clave)) grupos.set(clave, { fecha: e.fecha, entradas: [] });
    grupos.get(clave).entradas.push(e);
  }
  return Array.from(grupos.values());
}

function encabezadoDia(fecha) {
  const ahora = new Date();
  const hoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  const ayer = new Date(hoy.getTime() - 86400000);
  const fdia = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  if (fdia.getTime() === hoy.getTime()) return 'Hoy';
  if (fdia.getTime() === ayer.getTime()) return 'Ayer';
  const diasSemana = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const diffDias = Math.floor((hoy - fdia) / 86400000);
  if (diffDias < 7) return diasSemana[fecha.getDay()].charAt(0).toUpperCase() + diasSemana[fecha.getDay()].slice(1);
  return `${fecha.getDate()} de ${meses[fecha.getMonth()]}`;
}

function horaCorta(fecha) {
  return fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
}
