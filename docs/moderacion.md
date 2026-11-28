# API de moderación

Las rutas usan el JWT de RateM. La autorización toma el rol actual de la cuenta en MongoDB. El primer `admin` se asigna mediante una operación autorizada en la base de datos. La API de la aplicación permite a un `admin` asignar y retirar `moderator` en cuentas con correo confirmado.

| Método y ruta | Acceso | Operación |
| --- | --- | --- |
| `POST /api/reports` | Cuenta con identidad aprobada | Reporta un `message`, `profile` o `photo`. Envía `type`, `targetId` y `reason`. Para fotos envía también `photo` con la ruta que figura en el perfil. |
| `GET /api/moderation/reports` | Soporte y Administración | Lista por prioridad y fecha de creación. Acepta `type`, `status` y `page`. Incluye conteos globales por estado. |
| `GET /api/moderation/reports/:id` | Soporte y Administración | Devuelve el detalle y el historial de decisiones. El contenido se consulta por la referencia exacta del reporte. |
| `PATCH /api/moderation/reports/:id` | Soporte y Administración | Envía `status` igual a `in_review` o `resolved` y, opcionalmente, `note`. Cada transición agrega actor y fecha al historial. |
| `PATCH /api/moderation/users/:id/role` | Administración | Envía `role` igual a `moderator` o `user`. Los cambios de rol se auditan en el registro de la cuenta. |

Para mensajes, `targetId` es el ID del mensaje y solo su destinatario puede reportarlo. Para perfiles y fotos, `targetId` es el ID de la cuenta reportada. El identificador de un reporte es su ID de MongoDB. Las prioridades usan los niveles 1, 2 y 3, con 2 como valor inicial. Un reporte resuelto conserva sus decisiones. Si el contenido original ya no está disponible, el detalle devuelve `content: null`.

## Operaciones de Soporte

Las rutas de `/api/moderation` conservan los permisos de Soporte y Administración. Las listas aceptan `page` y devuelven hasta 50 registros.

| Método y ruta | Operación |
| --- | --- |
| `GET /api/moderation/reports` | También acepta `q` para buscar por motivo, ID o nombre de perfil. Devuelve conteos por tipo, resoluciones de hoy y tiempo medio hasta la primera intervención en milisegundos. |
| `POST /api/places/proposals` | Cuentas con identidad aprobada pueden proponer un lugar con `name`, `category`, `address`, `latitude`, `longitude` y `hours` opcional. |
| `GET /api/moderation/places` | Consulta propuestas de la comunidad por `status` o `q`. |
| `PATCH /api/moderation/places/:id` | Decide una propuesta pendiente. Envía `status` igual a `approved` o `rejected`. El rechazo requiere `reason`. |
| `GET /api/places/community` | Devuelve propuestas aprobadas dentro de 5 km para cuentas con identidad aprobada. Recibe `lat`, `lng` y `category` opcional. |
| `GET /api/moderation/users` | Consulta cuentas por `q` (nombre, correo o ID), `status` o `verification`. |
| `PATCH /api/moderation/users/:id/status` | Envía `action` y `reason`. Acciones: `warn`, `watch`, `suspend` (requiere `days` de 1 a 30), `ban` y `restore`. Solo Administración puede aplicar o retirar un bloqueo permanente. La advertencia queda registrada como decisión interna. |
| `GET /api/moderation/verifications` | Lista el resultado de las sesiones por `status`, `user` o `q`. La respuesta contiene el estado y una nota de revisión, sin exponer enlaces de captura ni identificadores internos del proveedor. |
| `PATCH /api/moderation/verifications/:id/review` | Registra la revisión de Soporte mediante `note`. La decisión oficial de identidad la sigue tomando el proveedor con las reglas de RateM. |
| `GET /api/moderation/activity` | Combina las decisiones auditadas de reportes, lugares, cuentas y verificaciones. Acepta `category`, `actor` y `format=csv`. En CSV devuelve hasta 500 registros por página y `X-Next-Page` cuando hay más. |

Las propuestas de la comunidad se consultan por separado de Google Places. Su uso como destino de una invitación queda pendiente. El flujo de reseñas requiere primero guardar reseñas vinculadas a citas con asistencia confirmada.
