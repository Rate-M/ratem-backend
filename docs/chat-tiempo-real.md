# RM-70 — Socket.io, JWT y persistencia de mensajes

## Servidor y acceso

La API HTTP y Socket.io comparten servidor y puerto. Se inicia con `npm start`.
Se requieren `MONGODB_URI`, `JWT_SECRET` y `CLIENT_URL`, además de las variables
que ya utiliza el backend. Los navegadores deben usar el origen configurado
en `CLIENT_URL`. Conexiones nativas sin cabecera Origin también requieren JWT.

El cliente envía el token de login en `auth.token`. Se rechazan JWT inválidos,
expirados o sin expiración, y cuentas inexistentes, pendientes de verificación
o con solicitud de eliminación. La conexión se cierra al vencer el JWT;
para usar otro token se debe reconectar con las credenciales actualizadas.

El servidor asigna una sala privada por usuario. El cliente no puede elegir
salas ni remitentes. Solo puede enviar mensajes de texto a un match activo
del que sea participante. Cada envío y consulta de historial revalidan el
match y la disponibilidad de ambas cuentas.

## Contrato del cliente

Ejemplo con `socket.io-client`:

```js
const socket = io(API_URL, { auth: { token } });

socket.on('connect_error', (error) => {
  console.log(error.data); // { status, message }
});

socket.on('message:new', (message) => {
  // Insertar o actualizar por message.id; tratar text como texto, no HTML.
});

socket.timeout(5000).emit('message:send', {
  matchId,
  clientMessageId: crypto.randomUUID(),
  text: 'Hola',
}, (timeoutError, result) => {
  // result: { ok: true, message } o { ok: false, error: { status, message } }
  // Si hay timeout, reintentar usando EL MISMO clientMessageId.
});
```

`clientMessageId` es obligatorio: admite letras ASCII, números, guiones y
underscore, con máximo 64 caracteres. El texto debe tener entre 1 y 2000
caracteres; se eliminan espacios exteriores. Se rechazan campos adicionales,
como un remitente o destinatario proporcionado por el cliente.

El mensaje público contiene `id`, `matchId`, `senderId`, `recipientId`,
`clientMessageId`, `text` y `createdAt`.

Se guarda en MongoDB antes de publicar `message:new` al emisor y receptor
(incluidas sus otras pestañas) y confirmar el envío. Un índice único sobre
`match`, `sender` y `clientMessageId` evita documentos duplicados en reintentos.
Reusar el identificador con otro texto devuelve 409. Los reintentos pueden
volver a emitir el mismo mensaje: el frontend debe deduplicar por `id`.

Los intentos se limitan a 30 por minuto por usuario en el proceso del servidor,
incluso si abre varias conexiones. El paquete máximo es de 16 KiB.
No se registra el texto del mensaje ni el JWT en los errores del socket.

## Historial y recuperación

`GET /api/matches/:id/messages` requiere el Bearer token habitual y un match
activo del solicitante. Devuelve `{ messages, nextCursor }`, con hasta 50
mensajes, del más reciente al más antiguo. Para consultar los anteriores,
usar `?before=<nextCursor>`. La respuesta utiliza `Cache-Control: no-store`.

Un receptor desconectado puede recuperar lo guardado mediante el historial.
Al conectar, registrar primero `message:new`, cargar el historial y combinar
por `id` para manejar mensajes que lleguen durante la consulta. Esta versión
no incluye acuses de lectura, adjuntos, edición, rachas ni la vista de chat.
Los avisos de match de RM-67 mantienen su contrato HTTP.

## Persistencia, borrado y despliegue

El borrado de cuenta elimina los mensajes enviados y recibidos por la cuenta
antes de eliminar sus matches. Las pruebas de cascada conservan los mensajes
de parejas ajenas.

Los índices de Message deben existir antes de recibir tráfico. El adaptador
de Socket.io y el límite de intentos son de memoria local: el despliegue
actual corresponde a un solo proceso. Varios procesos requieren un adaptador
y control de consumo compartidos; no se incluyen en esta tarea.

## Validación

`tests/chat-socket.test.js` utiliza servidor y clientes Socket.io reales en
puertos locales temporales, con modelos de MongoDB simulados. Comprueba JWT,
cuentas no disponibles, autorización por match, entrega privada, fallos de
persistencia, deduplicación, límites, vencimiento de conexión e historial.

No valida índices ni persistencia contra MongoDB real, reinicios de procesos,
ni un despliegue con varios nodos.

## RM-72 — Concurrencia y reconexión

`tests/chat-concurrency-reconnection.test.js` agrega 13 casos con clientes y
servidor Socket.io reales en puertos temporales. Las conexiones se cierran
al finalizar cada caso. Las cuentas, matches y mensajes se simulan en memoria.

Se comprueban:
- Envíos simultáneos en ambos sentidos, con recepción de todos los mensajes.
- Reintentos simultáneos desde dos conexiones del mismo usuario.
- Uso del mismo `clientMessageId` por distintos participantes.
- Reconexión automática después de un corte de WebSocket y de polling.
- Historial de mensajes enviados mientras el receptor estaba desconectado.
- Desconexión después de persistir y antes de devolver el acuse, seguida de
  un reintento con el mismo identificador y sin duplicar el registro.
- Reconexiones repetidas sin duplicar la suscripción a la sala.
- Rechazo del JWT vencido al reconectar y acceso posterior con otro válido.
- Rechazo de una cuenta con solicitud de eliminación al reconectar.
- Bloqueo del envío e historial si el match terminó durante la desconexión.
- Conservación del límite de envíos después de reconectar.
- Aislamiento de mensajes e historiales entre dos parejas concurrentes.

La prueba de reintento permite volver a emitir el mismo evento; comprueba
que el registro y su identificador son únicos. La deduplicación visual
corresponde al frontend.

Estos casos validan la concurrencia del transporte en un proceso. La
unicidad y la persistencia de MongoDB siguen simuladas: falta comprobar
índices y reinicios con una base real. Tampoco son pruebas de carga de
producción, de redes móviles ni de un despliegue con varios nodos.

Referencias del protocolo utilizado:
- [Inicialización del servidor Socket.io](https://socket.io/docs/v4/server-initialization/).
- [Autenticación con middleware y auth.token](https://socket.io/docs/v4/middlewares/).

## Confirmaciones de lectura

El cliente emite `message:read` con `{ matchId, messageId }` y un callback
para el acuse. El mensaje debe pertenecer al match activo y haberse recibido
del otro participante. El servidor responde `{ ok: true, receipt }` o
`{ ok: false, error }`. Una confirmación avanzada también se emite como
`message:read` a las conexiones de ambos participantes.

El recibo contiene `matchId`, `readerId` y `messageId`. Cada participante
tiene un cursor en el orden de IDs que usa el historial. El servidor guarda
el mayor ID de forma atómica y devuelve el cursor vigente ante reintentos.
Los clientes deben aplicar el mismo máximo por lector si reciben eventos
fuera de orden.

`GET /api/matches/:id/messages` incluye `readThrough: { me, other }` para
recuperar ambos cursores al abrir o reconectar el chat. Cada cursor es
`null` hasta que se registra una lectura. Para mostrar «Leído», compara
solo mensajes propios contra el cursor `other` de ese match.
