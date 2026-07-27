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
import { renderInfoEditor } from './views/info-editor.js';
import { renderIndicadoresEditor } from './views/indicadores-editor.js';
import { renderInformeEditor } from './views/informe-editor.js';
import { renderGaleriaEditor } from './views/galeria-editor.js';
import { renderMapaEditor } from './views/mapa-editor.js';
import { renderHistorialBarrio, renderHistorialGlobal } from './views/historial.js';
import { renderAsistenteNuevoBarrio } from './views/asistente-nuevo-barrio.js';
import { renderAyuda } from './views/ayuda.js';

async function boot() {
  mountShell();

  // Verificación de sesión en paralelo (no bloquea el render inicial).
  // Si no hay clave guardada, resuelve inmediato en 'readonly'.
  checkSession();

  route('barrios',            ()       => renderBarrios(getContentContainer()));
  route('barrio/:id',         (params) => renderHub(getContentContainer(), params));
  route('barrio/:id/info',         (params) => renderInfoEditor(getContentContainer(), params));
  route('barrio/:id/indicadores',  (params) => renderIndicadoresEditor(getContentContainer(), params));
  route('barrio/:id/informe',      (params) => renderInformeEditor(getContentContainer(), params));
  route('barrio/:id/imagenes',     (params) => renderGaleriaEditor(getContentContainer(), params));
  route('barrio/:id/mapa',         (params) => renderMapaEditor(getContentContainer(), params));
  route('barrio/:id/historial',    (params) => renderHistorialBarrio(getContentContainer(), params));
  route('historial',               ()       => renderHistorialGlobal(getContentContainer()));
  route('nuevo-barrio',             ()       => renderAsistenteNuevoBarrio(getContentContainer()));
  route('ayuda',                    ()       => renderAyuda(getContentContainer()));

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
