/**
 * Bootstrap del panel. Orquesta la puesta en marcha:
 *  1. Monta el shell (sidebar + topbar + área de contenido).
 *  2. Arranca la verificación de sesión (modo lectura por defecto).
 *  3. Registra las rutas y arranca el router.
 */

import { mountShell, getContentContainer } from './ui/shell.js';
import { checkSession } from './auth.js';
import { route, start } from './router.js';
import { renderBarrios } from './views/barrios.js';
import { renderHub }     from './views/hub.js';

async function boot() {
  mountShell();

  // Verificación de sesión en paralelo (no bloquea el render inicial).
  // Si no hay clave guardada, resuelve inmediato en 'readonly'.
  checkSession();

  route('barrios',       ()       => renderBarrios(getContentContainer()));
  route('barrio/:id',    (params) => renderHub(getContentContainer(), params));

  start();
}

boot().catch(err => {
  console.error('Fallo al iniciar el panel:', err);
  const app = document.getElementById('app');
  app.innerHTML = `
    <div style="max-width:520px;margin:80px auto;padding:24px;text-align:center;font-family:Inter,system-ui,sans-serif;">
      <h1 style="font-size:20px;margin-bottom:8px">No se pudo iniciar el panel</h1>
      <p style="color:#5B6472;font-size:14px">Recargá la página. Si el problema persiste, avisá a soporte.</p>
    </div>`;
});
