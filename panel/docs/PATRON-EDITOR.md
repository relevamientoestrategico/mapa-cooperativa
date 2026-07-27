# El Patrón Editor — contrato del sistema

Toda pantalla de edición del panel sigue **exactamente** este patrón.
No se admite variación creativa por módulo: quien aprende un editor,
sabe usarlos todos. Definido y aprobado en el Módulo 3/4.

## El ciclo de vida (obligatorio)

```
abrir editor → detectar cambios → guardar → marcar pendiente → publicar
```

1. **Abrir**: esperar la verificación de sesión. Sin conexión → aviso
   con candado y botón "Conectar". Con conexión → cargar el archivo
   con `fetchFileWithSha` (el SHA sirve para detectar conflictos).
2. **Detectar cambios**: snapshot inicial del estado. Ante cualquier
   modificación se compara contra el snapshot:
   - pill amarilla "Cambios sin guardar" (`.dirty-pill`)
   - botón Guardar habilitado + animación `emphasize`
   - guardián `dirty.enable()`: confirmación al salir con cambios
3. **Guardar**: validación local mínima → botón en estado "Guardando…"
   → `putJsonFile` (o `putTextFile`) con el SHA original.
   Mensaje de commit: `commitMessage(nombreVisible, 'qué se hizo')`.
   El objeto se guarda con spread del original (`{ ...original, campo }`)
   para nunca pisar campos que este editor no administra.
4. **Marcar pendiente**: `marcarCambio(id, { tipo, mensaje })` — enciende
   la pill "Con cambios sin publicar" del hub y el punto naranja de la
   lista.
5. **Errores** (siempre los tres casos):
   - `e.code === 'conflict'` → aviso "Otra persona editó…"
   - `e.code === 'unauthorized'` → aviso + abrir asistente de conexión
   - resto → mensaje del error con opción de reintentar (el botón vuelve)
6. **Salir**: al guardar OK → toast "Cambios guardados. Publicá cuando
   estés listo." → `dirty.disable()` → volver al hub.

## Reglas de UI

- Volver siempre con `backLink` que respeta `dirty.confirmNavigate()`.
- Todo en lenguaje humano. Nunca: JSON, HTML, commit, SHA, token.
- Lo que no se puede editar todavía se MUESTRA como entidad con candado
  y el texto "Su editor llega en un próximo módulo" — nunca se oculta,
  nunca es un botón que al hacer clic muestra un cartel.
- Los elementos que el mapa público usa para su lógica (datos del mapa,
  indicadores base) se editan en valor pero no se eliminan; llevan una
  marca que lo explica.

## Checklist para un editor nuevo

- [ ] `waitForSessionReady()` + guard sin conexión
- [ ] `fetchFileWithSha` del archivo a editar
- [ ] snapshot inicial + `refreshDirty()` en cada input
- [ ] `dirty.enable()` / `dirty.disable()`
- [ ] spread del original al guardar
- [ ] `commitMessage()` con acción en participio
- [ ] `marcarCambio()` después del guardado exitoso
- [ ] manejo de los tres códigos de error
- [ ] toast estándar + volver al hub
- [ ] ruta en `app.js` + tarjeta en `hub.js` con `route: true`
