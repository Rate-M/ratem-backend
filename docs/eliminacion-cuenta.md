# RM-41 — Solicitud y borrado de cuenta

## Solicitud

`POST /api/users/me/deletion-requests` requiere un JWT válido y este cuerpo:

```json
{ "password": "contraseña actual", "confirmDeletion": true }
```

No requiere identidad aprobada. No admite un identificador de otro usuario.
Verifica la contraseña, limita intentos y registra `deletionRequestedAt` en
la cuenta. Devuelve HTTP 202 con `status: pending`: confirma recepción,
no que el borrado haya concluido.

Desde ese momento se rechazan el login y los JWT anteriores, se oculta el
perfil público y se invalidan los enlaces de confirmación y recuperación.
El middleware consulta la cuenta actual en cada petición autenticada.
No hay cancelación de la solicitud en esta versión.

## Proceso operativo

El comando siguiente procesa las cuentas marcadas en la base de datos
configurada por `MONGODB_URI`. Es destructivo; se debe ejecutar solo en el
entorno previsto, desde la raíz del proyecto:

```bash
npm run deletions:process
```

Borra, en este orden, fotos locales, perfil, consentimientos, sesiones locales
de verificación y usuario. La cuenta conserva la marca hasta terminar.
Si falla una operación, la cuenta sigue bloqueada y una ejecución posterior
reintenta. Los archivos ausentes no impiden reintentar. No usa rutas de fotos
fuera de `/uploads/profiles/` ni elimina archivos ajenos indicados por el cliente.

El comando recorre las solicitudes, continúa tras errores individuales e
informa cantidades completadas y pendientes. Devuelve código de salida 1
si hubo fallos. No registra contraseñas ni los datos de los usuarios.
Debe programarse mediante el mecanismo de tareas del despliegue y monitorear
su salida; la API por sí sola registra la solicitud, no ejecuta el comando.

## Alcance y pendientes de despliegue

El borrado implementado cubre los modelos y archivos locales actuales.
No elimina datos de Didit, copias de respaldo, logs externos ni archivos ya
copiados por terceros. Deben definirse el procedimiento con el proveedor,
la política de respaldos, posibles obligaciones de conservación, contacto
operativo y programación del proceso antes de ofrecer un borrado integral.
No se declara cumplimiento legal únicamente por disponer de este endpoint.

Las operaciones de disco y MongoDB no constituyen una transacción conjunta.
El reintento permite recuperar fallos parciales; no garantiza aislamiento
frente a operaciones que ya estaban en curso al solicitar la eliminación.
Antes de usarlo con carga concurrente en producción debe coordinarse el
proceso con las escrituras en curso.

## Verificación

`tests/account-deletion.test.js` valida confirmación, contraseña, alcance del
usuario, bloqueo de JWT, rechazo de login, eliminación ordenada, cuentas sin
perfil, rutas inválidas y reintentos ante fallos de archivos o base de datos.
`tests/public-profile.test.js` comprueba que se oculta el perfil de una cuenta
pendiente. Las dependencias de borrado se simulan: las pruebas no eliminan
datos reales ni verifican el despliegue del comando.

## RM-43 — Pruebas de borrado en cascada

`tests/deletion-cascade.test.js` agrega escenarios con varias cuentas,
consentimientos vigentes y revocados y sesiones pendientes, aprobadas y
rechazadas. Comprueba el estado restante después del proceso, además de
las llamadas a los modelos.

Valida conservación de otras cuentas, exclusión de cuentas activas,
reintento tras fallos en cada etapa, repetición sobre una cuenta ya borrada,
archivos ausentes e interrupción tras borrar solo una foto.

Los archivos son reales y se crean en una carpeta temporal exclusiva que se
elimina al terminar. Se utiliza la función real `deletePhotos`; las colecciones
se simulan en memoria. Esto no sustituye una prueba con MongoDB ni valida
escrituras concurrentes, Didit, respaldos o la interfaz de RM-42.

Ejecutar toda la suite: `npm test -- --runInBand`.

## Mensajes de chat — RM-70

El proceso también elimina mensajes donde la cuenta sea remitente o receptor,
antes de borrar sus matches. Se conservan los mensajes de parejas ajenas.
Las pruebas de cascada cubren fallos y reintentos en esta etapa adicional.
