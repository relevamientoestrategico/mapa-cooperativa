/**
 * Vista de Ayuda (Módulo 10).
 *
 * Documentación del panel, servida dentro del propio sistema. Pensada
 * para que una persona nueva del equipo aprenda a usar el panel en
 * alrededor de una hora, sin conocimientos técnicos.
 *
 * Estructura: un índice lateral fijo + secciones de contenido. Todo en
 * lenguaje humano, coherente con la filosofía del resto del panel. Al
 * final hay una sección técnica, claramente separada, para quien
 * mantenga el sistema en el futuro.
 *
 * El contenido vive como datos (SECCIONES) y se renderiza a HTML, para
 * que agregar o editar temas sea sencillo y no haya que tocar la
 * lógica de render.
 */

import { el } from '../dom.js';
import { icons } from '../icons.js';

/* ─────────────────────────────────────────────────────────────────────
   Contenido de la guía. Cada sección tiene un id (para el ancla del
   índice), un título, y una lista de bloques. Los bloques pueden ser:
     { p: 'texto' }                 → párrafo
     { sub: 'texto' }               → subtítulo dentro de la sección
     { lista: ['a', 'b'] }          → lista con viñetas
     { pasos: ['a', 'b'] }          → lista numerada de pasos
     { nota: 'texto' }              → recuadro destacado (consejo)
     { aviso: 'texto' }             → recuadro de advertencia
   ───────────────────────────────────────────────────────────────────── */

const SECCIONES = [
  {
    id: 'que-es',
    titulo: 'Qué es este panel',
    bloques: [
      { p: 'Este panel es la herramienta para mantener actualizado el mapa público de relevamientos de barrios de la Cooperativa Eléctrica. Todo lo que se edita acá —la información de cada barrio, sus indicadores, el informe, las fotos y el mapa— es lo que después ve cualquier persona en el mapa público.' },
      { p: 'No hace falta saber de programación ni de mapas. El panel está pensado para que cualquier integrante del equipo pueda cargar y corregir información con confianza.' },
      { nota: 'Regla de oro: nada de lo que hagas se rompe por explorar. Podés mirar todo sin miedo. Los cambios recién se hacen públicos cuando vos lo decidís (más sobre esto en "El ciclo de trabajo").' }
    ]
  },
  {
    id: 'primeros-pasos',
    titulo: 'Primeros pasos',
    bloques: [
      { sub: 'Modo lectura y modo edición' },
      { p: 'Al entrar, el panel está en modo lectura: podés ver todos los barrios y su información, pero no modificarla. Para editar, necesitás conectarte con una clave de acceso.' },
      { sub: 'Conectarse' },
      { pasos: [
        'Hacé clic en el botón "Conectar" (arriba a la derecha).',
        'Pegá la clave de acceso que te compartió el responsable del panel.',
        'Listo: ahora los botones de edición se habilitan y aparece tu nombre arriba.'
      ] },
      { nota: 'La clave es personal y queda guardada solo en tu dispositivo. Si usás otra computadora o el celular, vas a tener que conectarte de nuevo ahí.' },
      { aviso: 'Si en algún momento ves el mensaje "Tu clave de acceso ya no es válida", simplemente volvé a conectarte. Tus cambios sin guardar no se pierden por eso.' }
    ]
  },
  {
    id: 'ciclo',
    titulo: 'El ciclo de trabajo: Guardar ≠ Publicar',
    bloques: [
      { p: 'Este es el concepto más importante del panel. Hay dos acciones distintas, y entender la diferencia te evita sorpresas.' },
      { sub: 'Guardar' },
      { p: 'Cuando guardás, tus cambios quedan registrados de forma segura, pero todavía NO se ven en el mapa público. Es como guardar un borrador: podés seguir trabajando, cerrar el panel y volver más tarde, sin apuro.' },
      { sub: 'Publicar' },
      { p: 'Cuando publicás, todos los cambios guardados de ese barrio pasan a ser visibles en el mapa público. Es el momento en que el trabajo "sale al aire".' },
      { nota: 'En la práctica: editás una pantalla y Guardás. Editás otra y Guardás. Cuando el barrio está como querés, vas al hub del barrio y hacés clic en "Publicar cambios". Recién ahí lo ve el público.' },
      { aviso: 'Hay una única excepción: el editor de mapa (límites y puntos). Ahí, por razones técnicas, Guardar publica los cambios de inmediato. El panel te lo avisa con un recuadro amarillo cuando estás en esa pantalla.' }
    ]
  },
  {
    id: 'pantallas',
    titulo: 'Cada pantalla, una por una',
    bloques: [
      { p: 'Desde la lista de barrios, al entrar a un barrio llegás a su "hub": una pantalla con botones para cada cosa que podés editar. Estas son las opciones:' },
      { sub: 'Editar información general' },
      { p: 'El nombre del barrio, la zona de la ciudad a la que pertenece, y el color con el que se marca en el mapa.' },
      { sub: 'Editar indicadores' },
      { p: 'Los datos que aparecen en la ficha del barrio cuando alguien lo toca en el mapa: cobertura eléctrica, si tiene escuela y centro de salud, y datos libres como edad promedio, cantidad de viviendas, etc.' },
      { sub: 'Editar informe' },
      { p: 'El texto completo del relevamiento: secciones, párrafos, conclusiones y galerías de fotos. Es el documento largo que se abre al pedir "ver informe" desde el mapa.' },
      { sub: 'Administrar imágenes' },
      { p: 'Las fotos del barrio. Podés subir nuevas, reordenarlas y eliminarlas. El panel las optimiza solo para que pesen poco y carguen rápido.' },
      { sub: 'Editar mapa' },
      { p: 'Los límites del barrio (el contorno en el mapa) y los puntos de interés (escuelas, comedores, centros de salud, etc.). Recordá: acá Guardar publica de inmediato.' },
      { sub: 'Ver historial' },
      { p: 'El registro de quién cambió qué y cuándo. Útil para saber qué se tocó últimamente o quién hizo una modificación. No modifica nada: es solo para consultar.' },
      { sub: 'Vista previa' },
      { p: 'Abre el mapa público en una pestaña nueva, para ver cómo quedó el barrio tal como lo ve la gente.' }
    ]
  },
  {
    id: 'nuevo-barrio',
    titulo: 'Crear un barrio nuevo',
    bloques: [
      { p: 'Desde la lista de barrios, el botón "Nuevo barrio" abre un asistente que te guía en cuatro pasos:' },
      { pasos: [
        'Identidad: el nombre del barrio, su zona y el color en el mapa.',
        'Ubicación: dibujás el contorno del barrio haciendo clic en el mapa (un clic por cada punto, doble clic para cerrar).',
        'Datos base: cobertura eléctrica, escuela, salud y algunos indicadores. Todo esto es opcional y se puede completar después.',
        'Confirmación: revisás que todo esté bien y creás el barrio.'
      ] },
      { nota: 'El barrio nuevo se crea como borrador. No aparece en el mapa público hasta que lo publiques desde su hub. Así podés crearlo, completarlo con calma, y publicarlo cuando esté listo.' }
    ]
  },
  {
    id: 'preguntas',
    titulo: 'Preguntas frecuentes',
    bloques: [
      { sub: '¿Por qué no veo mis cambios en el mapa público?' },
      { p: 'Casi siempre es porque guardaste pero todavía no publicaste. Andá al hub del barrio y hacé clic en "Publicar cambios". Si ya publicaste, tené en cuenta que el mapa público puede tardar uno o dos minutos en actualizarse.' },
      { sub: '¿Qué hago si aparece un error de conexión al guardar?' },
      { p: 'Revisá tu conexión a internet y volvé a intentar. Tranquilo: cuando aparece ese mensaje, tus cambios NO se perdieron, siguen en pantalla listos para guardarse de nuevo.' },
      { sub: '¿Puedo deshacer algo que ya publiqué?' },
      { p: 'No hay un botón de "deshacer publicación". Pero podés volver a editar el barrio, corregir lo que haga falta y publicar de nuevo. Si necesitás recuperar una versión anterior, consultá el historial para ver qué cambió, o pedile ayuda al responsable técnico.' },
      { sub: '¿Qué pasa si dos personas editan el mismo barrio a la vez?' },
      { p: 'Si alguien más guardó cambios mientras vos editabas, el panel te avisa con un mensaje y te pide refrescar la página antes de guardar, para no pisar el trabajo del otro. Tus cambios siguen en pantalla.' },
      { sub: '¿Se puede romper algo?' },
      { p: 'Es muy difícil. Antes de publicar, todo son borradores. Y cada acción importante te pide confirmación. Explorá con tranquilidad.' }
    ]
  },
  {
    id: 'tecnica',
    titulo: 'Sección técnica (para mantenimiento)',
    esTecnica: true,
    bloques: [
      { aviso: 'Esta sección es para quien mantiene el sistema. El equipo que solo carga contenido no necesita leerla.' },
      { sub: 'Arquitectura general' },
      { p: 'El panel es una aplicación web sin servidor propio (no hay backend). Corre enteramente en el navegador y lee y escribe los datos directamente en el repositorio de GitHub mediante la API de Contents. La autenticación usa un token de acceso personal de grano fino (fine-grained PAT) con permiso de escritura sobre el repositorio.' },
      { sub: 'Dónde viven los datos' },
      { lista: [
        'El repositorio es relevamientoestrategico/mapa-cooperativa, rama main.',
        'Los datos de cada barrio están en data/barrios/{slug}/: barrio.json (información e indicadores), geometria.geojson (contorno), puntos.geojson (puntos de interés), informe.json (informe estructurado) y adjuntos/galeria/ (fotos).',
        'El archivo data/barrios/index.json es la lista maestra de barrios: un barrio existe para el público solo si figura ahí.'
      ] },
      { sub: 'Guardar vs Publicar, por dentro' },
      { p: 'La mayoría de los editores guardan en archivos borrador y marcan el barrio como pendiente; publicar cambia el campo "estado" del barrio a "publicado" y hace visibles los datos. La excepción es el editor de mapa: los archivos geometria.geojson y puntos.geojson son la fuente de verdad pública directa, así que guardarlos equivale a publicar.' },
      { sub: 'Cómo agregar una persona al equipo' },
      { p: 'Se le genera un token de acceso personal de grano fino en GitHub, con permiso de lectura y escritura de contenido limitado al repositorio del mapa, y se le comparte esa clave. La persona la pega en el panel al conectarse. Para revocar el acceso, se elimina o expira el token desde GitHub.' },
      { sub: 'Notas de mantenimiento' },
      { lista: [
        'Toda la interfaz usa lenguaje humano a propósito: al agregar funciones nuevas, evitá términos técnicos (contorno en vez de polígono, punto en vez de vértice, etc.).',
        'El principio Guardar ≠ Publicar debe mantenerse en cualquier editor nuevo, salvo que haya una razón técnica explícita para romperlo (como en el mapa).',
        'Los mensajes de error de guardado pasan por manejarErrorGuardado() en dom.js, que unifica el texto para el usuario.'
      ] }
    ]
  }
];

/**
 * Renderiza la vista de Ayuda dentro del contenedor dado.
 */
export function renderAyuda(container) {
  container.innerHTML = '';

  const wrap = el('div.ayuda-wrap');

  // Encabezado
  wrap.appendChild(el('div.ayuda-cabezal', {}, [
    el('h1', { text: 'Guía del panel' }),
    el('p.ayuda-sub', { text: 'Todo lo que necesitás para usar el panel de relevamientos. Si es tu primera vez, leelo de arriba a abajo: en una hora estás listo.' })
  ]));

  // Cuerpo: índice lateral + contenido
  const cuerpo = el('div.ayuda-cuerpo');

  // Índice de navegación
  const indice = el('nav.ayuda-indice', { 'aria-label': 'Índice de la guía' });
  const indiceLista = el('ul');
  SECCIONES.forEach(sec => {
    const li = el('li', {}, [
      el('a', {
        href: `#/ayuda`,
        'data-target': sec.id,
        text: sec.titulo,
        onClick: (e) => {
          e.preventDefault();
          const destino = contenido.querySelector(`#ayuda-${sec.id}`);
          if (destino) destino.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      })
    ]);
    if (sec.esTecnica) li.classList.add('ayuda-indice-tecnica');
    indiceLista.appendChild(li);
  });
  indice.appendChild(indiceLista);

  // Contenido de las secciones
  const contenido = el('div.ayuda-contenido');
  SECCIONES.forEach(sec => {
    contenido.appendChild(renderSeccion(sec));
  });

  cuerpo.appendChild(indice);
  cuerpo.appendChild(contenido);
  wrap.appendChild(cuerpo);

  container.appendChild(wrap);
}

function renderSeccion(sec) {
  const secEl = el('section.ayuda-seccion' + (sec.esTecnica ? '.ayuda-seccion-tecnica' : ''), {
    id: `ayuda-${sec.id}`
  });
  secEl.appendChild(el('h2', { text: sec.titulo }));
  sec.bloques.forEach(b => secEl.appendChild(renderBloque(b)));
  return secEl;
}

function renderBloque(b) {
  if (b.sub)   return el('h3.ayuda-sub', { text: b.sub });
  if (b.p)     return el('p.ayuda-p', { text: b.p });
  if (b.nota)  return el('div.ayuda-nota', {}, [
    el('span.ayuda-nota-icono', { text: '💡' }),
    el('span', { text: b.nota })
  ]);
  if (b.aviso) return el('div.ayuda-aviso', {}, [
    el('span.ayuda-aviso-icono', { text: '⚠️' }),
    el('span', { text: b.aviso })
  ]);
  if (b.lista) {
    const ul = el('ul.ayuda-lista');
    b.lista.forEach(item => ul.appendChild(el('li', { text: item })));
    return ul;
  }
  if (b.pasos) {
    const ol = el('ol.ayuda-pasos');
    b.pasos.forEach(item => ol.appendChild(el('li', { text: item })));
    return ol;
  }
  return el('span');
}
