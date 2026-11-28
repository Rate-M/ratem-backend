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
