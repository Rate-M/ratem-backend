# RM-67 — Match mutuo y notificación

## Flujo

`POST /api/swipes` conserva los campos `id`, `to`, `action` y `createdAt` y
agrega `match`: `null` para un like unilateral o un pase, y un objeto
`{ id, users, createdAt }` cuando hay likes recíprocos.

El emisor se obtiene del JWT. Ambos usuarios deben estar aprobados y sin
solicitud de eliminación. No se acepta evaluar el propio perfil.

El servicio guarda los participantes ordenados en `userA` y `userB` y utiliza
un upsert y un índice único compuesto para evitar parejas duplicadas.
Se debe asegurar que los índices de Mongoose estén creados en el despliegue.
Un reintento conserva el match y la lectura de los avisos. Un match con
estado `ended` no se reactiva; el endpoint para deshacerlo corresponde a RM-76.

Si falla la creación del match después de guardar el like, la petición falla.
Repetir el mismo like vuelve a intentar el match antes de responder el 409
habitual de evaluación duplicada. El cliente puede consultar la lista tras
ese reintento. Los likes recíprocos anteriores a este cambio no se procesan
retroactivamente sin un reintento.

## Lista de matches

`GET /api/matches` devuelve:

```json
{ "matches": [{ "id": "...", "users": ["...", "..."], "createdAt": "..." }], "nextCursor": null }
```

Solo devuelve matches activos del usuario autenticado. Oculta parejas cuyo
participante ya no exista, no esté aprobado o tenga una solicitud de eliminación.
Los identificadores permiten consultar el perfil público para mostrar nombre y fotos.
No devuelve correos, fechas de nacimiento ni otros campos privados.

## Avisos persistentes para ambos

El match representa también la notificación de cada participante. `readBy`
registra quién ya la leyó. Al crear una pareja, ambos tienen un aviso pendiente
en la misma escritura; no existe una segunda operación de notificación que
pueda fallar después de crear el match.

`GET /api/notifications` devuelve los avisos pendientes:

```json
{ "notifications": [{ "id": "...", "type": "match", "matchId": "...", "otherUserId": "...", "createdAt": "..." }], "nextCursor": null }
```

`PATCH /api/notifications/:id/read` marca como leído solo el aviso propio.
Devuelve 204 incluso si ya estaba leído, y 404 si el match no existe o el
solicitante no pertenece a él. Leer un aviso no afecta al del otro usuario
ni elimina el match de la lista.

Ambas listas requieren autenticación y verificación aprobada, usan
`Cache-Control: no-store` y tienen páginas de hasta 50 elementos. Para
continuar, enviar `?before=<nextCursor>`. No aceptan consultar otro emisor.

La entrega actual se realiza consultando HTTP desde la interfaz. No incluye
push, correo ni Socket.io; RM-70 incorporará la comunicación en tiempo real.
La vista y el aviso visual de T12.2 se implementan en el frontend.

## Eliminación de cuenta y pruebas

El proceso de RM-41 elimina los matches donde aparezca la cuenta y con ello
sus avisos para ambos participantes. Las pruebas de cascada incluyen esta
colección y conservan parejas ajenas.

`tests/mutual-match.test.js` comprueba likes recíprocos, pases, reintentos,
intercalación de peticiones simultáneas simuladas, colisión de índice y el
contrato HTTP de swipes. `tests/match-notifications.test.js` valida acceso,
privacidad, lectura independiente e idempotente y paginación.

Las pruebas simulan MongoDB. No prueban un índice desplegado ni concurrencia
real entre procesos contra MongoDB. Para validar el entorno integrado deben
usarse dos cuentas aprobadas con perfil y comprobar likes recíprocos, listas,
lectura independiente y ausencia de duplicados al enviar peticiones simultáneas.
