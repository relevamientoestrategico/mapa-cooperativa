# Arquitectura del Panel de Relevamientos — Módulo 2

Este documento explica cómo está organizado el panel para que cualquier
persona que retome el proyecto pueda entender la estructura sin leer
todo el código.

## Filosofía

- **Modular**: cada archivo tiene una única responsabilidad. Ningún
  archivo excede los ~300 renglones.
- **Sin frameworks**: JavaScript nativo con ES Modules. Cero dependencias
  de build. Funciona directo en GitHub Pages.
- **Solo lectura por defecto**: el panel se puede consultar sin
  conectarse. La clave de acceso solo es necesaria para modificar.
- **Preparado para crecer**: agregar una sección nueva (Estadísticas,
  Exportaciones, etc.) es un ítem más en el array `NAV` de `shell.js`.

## Mapa de archivos

```
panel/
├── index.html            → punto de entrada; solo carga estilos y app.js
├── css/
│   ├── tokens.css        → variables de diseño (colores, espacios, sombras)
│   ├── base.css          → reset + tipografía + accesibilidad
│   ├── layout.css        → sidebar + topbar + main + banner + mobile
│   ├── components.css    → botones, cards, pills, modal, toast, forms
│   └── screens.css       → estilos específicos de pantallas
├── js/
│   ├── app.js            → bootstrap: monta shell + rutas + verifica sesión
│   ├── config.js         → coordenadas del repo, storage keys, URLs
│   ├── icons.js          → íconos de línea SVG (una función por ícono)
│   ├── dom.js            → utilidades: $, el(), mount(), toast(), modal()
│   ├── router.js         → router hash minimalista (#/barrios, etc.)
│   ├── auth.js           → sesión + validación de clave + eventos
│   ├── github.js         → adaptador de lectura desde GitHub raw
│   ├── ui/
│   │   ├── shell.js           → sidebar + topbar + banners
│   │   ├── connect-wizard.js  → asistente de conexión (4 pasos)
│   │   └── session-panel.js   → modal al hacer clic en el chip conectado
│   └── views/
│       ├── barrios.js    → listado de barrios
│       └── hub.js        → hub de tareas de un barrio
└── docs/
    └── ARQUITECTURA.md   → este archivo
```

## Flujos principales

### 1. Arranque

1. `index.html` carga los CSS y `app.js`.
2. `app.js` invoca `mountShell()` (renderiza sidebar + topbar).
3. `app.js` inicia `checkSession()` en paralelo:
   - Si no hay clave guardada → estado `readonly`, banner amarillo.
   - Si hay clave y GitHub la acepta → `connected`, chip verde.
   - Si hay clave y GitHub la rechaza → `expired`, banner rojo.
4. Se registran las rutas y arranca el router.

### 2. Conexión

- El usuario hace clic en "Conectar" (banner o chip del topbar).
- Se abre el `connect-wizard.js` con 4 pasos guiados.
- Al terminar, `connectWithKey()` valida contra `/user` y `/repos/{repo}`
  de la API de GitHub. Si es válida:
  - Se guarda en `localStorage` con la clave `panel_rel__key_v1`.
  - El estado pasa a `connected`.
  - Todos los suscriptores de `onSessionChange` se refrescan (banner,
    chip, tarjetas del hub, botón "Nuevo barrio", etc.).

### 3. Navegación

- Rutas basadas en hash: `#/barrios`, `#/barrio/villa-adela`.
- El router es agnóstico de las vistas: cada vista se registra con
  `route('barrios', handler)`.
- La sidebar escucha `onRouteChange` para marcar el ítem activo.

### 4. Lectura de datos

- Todos los datos se leen desde `raw.githubusercontent.com`, que es
  público y no requiere clave.
- En modo `connected` se agrega un query string `?t=timestamp` para
  saltar la caché del CDN (para que los cambios recién publicados se
  vean sin espera).
- En Módulo 3 se agregará escritura vía `/repos/{owner}/{name}/contents/`.

## Convenciones

- **Nombres en español** en la UI y en variables cara al usuario. Todo
  lo que involucra la API de GitHub queda con nombres técnicos.
- **Sin la palabra "token"** en la interfaz. Internamente `key`; hacia
  el usuario "clave de acceso".
- **Sin frameworks** para mantener el panel a prueba del paso del tiempo.
  Un panel de administración debe seguir funcionando en 5 años, no
  depender de que la versión de X librería siga viva.

## Cómo agregar una sección nueva

1. En `js/ui/shell.js`, agregar el ítem al array `NAV` con `active: true`.
2. Crear `js/views/nombre.js` que exporte `renderNombre(container)`.
3. En `js/app.js`, registrar la ruta:
   `route('nombre', () => renderNombre(getContentContainer()));`
4. Listo. La sidebar la incluye, el router la resuelve, el resto de la
   UI queda intacta.

## Cómo agregar una tarjeta al hub del barrio

Editar el array `TAREAS` en `js/views/hub.js`. Cada tarea:
```
{ id, label, hint, icon }
```
El estado bloqueado/desbloqueado según la sesión ya está resuelto.
