# Verificación de identidad — RM-32

El usuario inicia con `verificationStatus: pending`. Los estados admitidos
son `pending` (pendiente), `approved` (aprobada) y `rejected` (rechazada).
Confirmar el correo no equivale a aprobar la identidad.

`GET /api/auth/verification-status` requiere un JWT válido y devuelve
`{ "verificationStatus": "pending" }`, `approved` o `rejected`, según el
estado actual del usuario en la base de datos. Está disponible en los tres
estados, no requiere un perfil y no permite consultar usuarios ajenos.
La respuesta usa `Cache-Control: no-store`. Un usuario eliminado recibe 401.
Este endpoint permite actualizar el indicador de RM-33 sin iniciar sesión otra vez.

Las rutas `POST`, `GET` y `PATCH /api/profiles/me` requieren un JWT válido
y una verificación `approved`. El estado se consulta en la base de datos en
cada petición, por lo que un cambio se aplica incluso a tokens ya emitidos.
El bloqueo ocurre antes de procesar archivos o ejecutar el controlador.

Un estado distinto de `approved` responde HTTP 403 con el código
`IDENTITY_VERIFICATION_REQUIRED` y el campo `verificationStatus`.
Si el usuario del token ya no existe, responde HTTP 401.
Los errores de base de datos se propagan al manejador de errores.

Registro, inicio de sesión, recuperación de contraseña, confirmación de
correo y salud conservan sus reglas actuales. Las rutas de consentimientos
requieren autenticación, pero siguen disponibles sin identidad aprobada.

No se expone una ruta para que el usuario apruebe su propia identidad.

## RM-35 — Mayoría de edad del documento

El webhook de T04.2 autentica la notificación de Didit. El adaptador extrae
`dateOfBirth` de `decision.id_verifications[].date_of_birth` y el servicio
aplica `applyVerificationRules` antes de persistir el veredicto.

Un resultado `approved` solo se conserva si la fecha del documento, en formato
`YYYY-MM-DD`, corresponde a una persona de al menos 18 años cumplidos.
Una fecha ausente, inválida, futura o de un menor produce `rejected`.
Los veredictos rechazados, expirados o sin decisión conservan su comportamiento.
El cálculo compara año, mes y día en UTC, sin aproximar por días transcurridos.
No usa la fecha declarada en el perfil como alternativa.

El servicio guarda el estado de la sesión y del usuario; no persiste la fecha
documental, imágenes ni el resultado completo del proveedor. Las rutas
protegidas aplican el nuevo estado en la siguiente petición.

Las pruebas locales usan resultados simulados. La comprobación con una
notificación real requiere las credenciales y configuración de Didit.
RM-37 cubrirá específicamente las fechas límite de 17 y 18 años.
