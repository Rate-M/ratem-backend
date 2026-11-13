# RM-40 — Pruebas de perfil público

Archivo: `tests/public-profile.test.js`.

Se valida `GET /api/profiles/:id`, donde `id` es el identificador del usuario
propietario del perfil. Se comprueban autenticación, verificación aprobada,
consulta del propietario solicitado, identificadores inválidos, perfil
inexistente, errores de consulta y precedencia de `/me`.

La respuesta se comprueba con una lista explícita de campos públicos. No debe
exponer fecha de nacimiento, correo, contraseña, preferencias privadas,
metadatos ni estado de verificación. Se prueba el serializador con un objeto
simple y con la interfaz `toObject()` de Mongoose, sin modificar el original.

## Alcance pendiente

La implementación actual asigna valores fijos `averageRating: null`,
`reviewCount: 0` y `reviews: []`. La suite comprueba este contrato vacío,
pero no valida cálculo de promedio ni consulta de reseñas reales: todavía
no existe esa implementación en este checkout. RM-40 queda parcialmente
cubierta hasta incorporar y probar esos casos. Tampoco se valida la vista
frontend de RM-39 desde este repositorio.

Ejecutar: `npm test -- --runInBand`.
