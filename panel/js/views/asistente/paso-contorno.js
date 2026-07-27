/**
 * Paso 2 del asistente: dibujar el contorno del barrio.
 *
 * Reutilizamos el motor del editor de mapa del Módulo 6 en modo
 * "dibujo desde cero": creamos un motor con geometría vacía y activamos
 * la herramienta de redibujado, que ya sabe manejar clic-por-clic +
 * doble clic para cerrar + hints dinámicos + deshacer/rehacer.
 *
 * Lo único diferente aquí es que el contorno resultante NO se guarda a
 * GitHub todavía — se guarda en el estado del asistente para usarse en
 * el paso 4 cuando se hace la creación real.
 */

import { el, toast } from '../../dom.js';
import { icons } from '../../icons.js';
import { crearMotorMapa } from '../../mapa-motor.js';

// Zoom inicial cuando no hay polígono todavía (centro de Concordia)
const CENTRO_INICIAL = { lat: -31.385, lng: -58.025, zoom: 13 };

export function renderPasoContorno(cuerpo, pie, ctrl) {
  const { estado } = ctrl;

  cuerpo.appendChild(el('div.asist-paso-titulo', {}, [
    el('h3', { text: 'Dibujá el contorno del barrio' }),
    el('p', { text: 'Hacé clic en el mapa para marcar cada punto del contorno. Doble clic para terminar.' })
  ]));

  // Capa de ayuda dinámica
  const ayuda = el('div.asist-ayuda-mapa', { id: 'asist-ayuda-mapa' }, [
    el('span', { text: 'Hacé clic para colocar el primer punto del contorno.' })
  ]);
  cuerpo.appendChild(ayuda);

  // Contenedor del mapa
  const mapaSlot = el('div.asist-mapa-slot', { id: 'asist-mapa-slot' });
  cuerpo.appendChild(mapaSlot);

  // Botones deshacer / rehacer / limpiar debajo del mapa
  const barraHerramientas = el('div.asist-mapa-toolbar', {}, [
    el('button.btn.ghost.asist-undo', {
      disabled: 'disabled',
      title: 'Deshacer el último punto'
    }, [el('span', { html: icons.undo() }).firstChild, 'Deshacer']),
    el('button.btn.ghost.asist-redo', {
      disabled: 'disabled',
      title: 'Rehacer'
    }, [el('span', { html: icons.redo() }).firstChild, 'Rehacer']),
    el('div.spacer'),
    el('button.btn.ghost.asist-limpiar', {
      disabled: 'disabled',
      title: 'Empezar el contorno de cero'
    }, [el('span', { html: icons.close() }).firstChild, 'Empezar de cero'])
  ]);
  cuerpo.appendChild(barraHerramientas);

  // ─── Instanciar el motor de mapa con geometría vacía ─────
  // Un barrio provisorio para pasar al motor (color, id ficticio)
  const barrioProv = {
    id: estado.slug,
    nombreVisible: estado.nombreVisible,
    color: estado.color
  };

  // Si ya hay un contorno guardado (usuario volvió al paso 2), lo cargamos
  const geometriaInicial = estado.contorno && estado.contorno.length >= 3
    ? construirFeatureCollection(estado.contorno)
    : { type: 'FeatureCollection', features: [] };

  const motor = crearMotorMapa(mapaSlot, {
    barrio: barrioProv,
    geometria: geometriaInicial,
    puntos: { type: 'FeatureCollection', features: [] },
    onCambio: refrescarUi,
    onHerramientaCambio: () => {}
  });

  // Si no hay contorno todavía, activamos la herramienta redibujar
  // automáticamente para que el usuario pueda arrancar directo.
  if (!estado.contorno || estado.contorno.length < 3) {
    motor.activarHerramienta('redibujar');
  }

  // ─── Conectar botones ─────────────────────────────────────
  const btnUndo    = barraHerramientas.querySelector('.asist-undo');
  const btnRedo    = barraHerramientas.querySelector('.asist-redo');
  const btnLimpiar = barraHerramientas.querySelector('.asist-limpiar');

  btnUndo.addEventListener('click', () => motor.deshacer());
  btnRedo.addEventListener('click', () => motor.rehacer());
  btnLimpiar.addEventListener('click', () => {
    if (!confirm('¿Empezar el contorno de cero? Se van a borrar todos los puntos que dibujaste.')) return;
    motor.descartarCambios();
    // Como el "original" era vacío, descartarCambios lo deja vacío.
    // Reactivamos la herramienta de redibujado.
    motor.activarHerramienta('redibujar');
  });

  // ─── Pie con botones ──────────────────────────────────────
  const btnAtras = el('button.btn.ghost', { onClick: () => ctrl.anterior() }, ['← Atrás']);
  const btnSiguiente = el('button.btn.primary', {
    disabled: 'disabled',
    onClick: () => {
      // Guardar el contorno actual en el estado
      const geoJson = motor.obtenerGeoJson();
      const anillo = extraerAnillo(geoJson);
      if (!anillo || anillo.length < 3) {
        toast('Necesitás al menos 3 puntos para formar un contorno.', 'err');
        return;
      }
      estado.contorno = anillo;
      ctrl.siguiente();
    }
  }, ['Siguiente: Datos base →']);

  pie.appendChild(btnAtras);
  pie.appendChild(el('div.spacer'));
  pie.appendChild(btnSiguiente);

  refrescarUi();

  function refrescarUi() {
    const puntosBorrador = motor.puntosBorrador?.();
    const cantidadEnPoligono = motor.cantidadPuntos();

    // Ayuda contextual
    const ayudaTx = ayuda.querySelector('span');
    if (puntosBorrador != null) {
      if (puntosBorrador === 0) {
        ayudaTx.textContent = 'Hacé clic para colocar el primer punto del contorno.';
      } else if (puntosBorrador < 3) {
        ayudaTx.textContent = `Llevás ${puntosBorrador} punto${puntosBorrador === 1 ? '' : 's'}. Necesitás al menos 3 para cerrar el contorno.`;
      } else {
        ayudaTx.textContent = `Llevás ${puntosBorrador} puntos. Doble clic para terminar el contorno.`;
      }
    } else if (cantidadEnPoligono >= 3) {
      ayudaTx.textContent = `Contorno con ${cantidadEnPoligono} puntos. Podés seguir editándolo o pasar al siguiente paso.`;
    } else {
      ayudaTx.textContent = 'Hacé clic para colocar el primer punto del contorno.';
    }

    btnUndo.disabled    = !motor.puedeDeshacer();
    btnRedo.disabled    = !motor.puedeRehacer();
    btnLimpiar.disabled = cantidadEnPoligono === 0 && puntosBorrador == null;
    btnSiguiente.disabled = !(cantidadEnPoligono >= 3);
  }
}

/* ═══ helpers puros ═══ */

function construirFeatureCollection(anilloLatLng) {
  const anilloLngLat = anilloLatLng.map(([lat, lng]) => [lng, lat]);
  // Cerrar el anillo si no está cerrado
  if (anilloLngLat.length && (
    anilloLngLat[0][0] !== anilloLngLat[anilloLngLat.length-1][0] ||
    anilloLngLat[0][1] !== anilloLngLat[anilloLngLat.length-1][1]
  )) {
    anilloLngLat.push([anilloLngLat[0][0], anilloLngLat[0][1]]);
  }
  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: {},
      geometry: { type: 'Polygon', coordinates: [anilloLngLat] }
    }]
  };
}

function extraerAnillo(geoJson) {
  const f = geoJson?.type === 'FeatureCollection' ? geoJson.features?.[0] : geoJson;
  const coords = f?.geometry?.coordinates?.[0];
  if (!coords) return null;
  // Convertir [lng, lat] → [lat, lng] y sacar el cierre
  const anillo = coords.map(([lng, lat]) => [lat, lng]);
  if (anillo.length >= 2) {
    const primero = anillo[0], ultimo = anillo[anillo.length - 1];
    if (Math.abs(primero[0] - ultimo[0]) < 1e-9 && Math.abs(primero[1] - ultimo[1]) < 1e-9) {
      anillo.pop();
    }
  }
  return anillo;
}
