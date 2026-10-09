# Aviso de privacidad de RateM

Versión: 1.0
Fecha de elaboración: 9 de octubre de 2026
Estado: borrador para revisión; pendiente de completar antes de publicar.

## 1. Responsable y contacto

RateM es una aplicación de citas destinada exclusivamente a personas
mayores de 18 años.

Responsable del tratamiento: [PENDIENTE: nombre o razón social].
Domicilio: [PENDIENTE].
Correo para asuntos de privacidad: [PENDIENTE].

## 2. Información utilizada

Para gestionar la cuenta y el perfil se utilizan:
- Correo electrónico y contraseña almacenada mediante hash.
- Nombre, biografía y fotografías de perfil.
- Estado de verificación de la cuenta.
- Registros de aceptación y revocación de consentimientos.
- Fecha de nacimiento para calcular la edad y comprobar la mayoría de edad declarada.
- Género, preferencias sobre quién deseas conocer y qué buscas.
- Intereses y signo zodiacal, si decides proporcionarlos.

Las funciones planeadas podrán utilizar, previa información y autorización:
- Ubicación del dispositivo.
- Selfie e imágenes de la credencial para votar (INE).
- Datos extraídos del documento y resultados de verificación.
- Información biométrica derivada de la comparación facial.

Los campos exactos de la INE y los datos biométricos utilizados deberán
definirse con el proveedor antes de habilitar la verificación. No se
solicitarán estos datos durante las pruebas actuales del sprint.

## 3. Finalidades

Los datos de cuenta y perfil permiten registrar usuarios, iniciar sesión,
confirmar el correo, recuperar el acceso y mostrar el perfil.

Los datos del perfil permiten describir tus intereses y preferencias.
La fecha de nacimiento se conserva internamente; las respuestas del
perfil muestran la edad calculada.

La verificación planeada busca comprobar identidad y mayoría de edad
mediante una API externa que compare la selfie con la identificación.

La ubicación se utilizará para filtrar personas cercanas y mostrar
lugares en un mapa. No implica autorización para publicar la ubicación
exacta de la persona.

No se incluyen finalidades publicitarias en esta versión.

## 4. Visibilidad del perfil

El nombre, la biografía y las fotos están destinados a mostrarse en las
funciones sociales de RateM.

En el prototipo actual, las fotos subidas son accesibles mediante su URL
sin iniciar sesión. Esta configuración debe revisarse antes del lanzamiento.

La INE, la selfie de verificación y sus resultados no estarán destinados
a formar parte del perfil visible para otras personas.

## 5. Consentimientos

La biometría y la ubicación tendrán autorizaciones separadas. La aceptación
de los términos no sustituye el consentimiento para estos tratamientos.

Antes de habilitar la biometría se deberá presentar su finalidad y obtener
el consentimiento expreso mediante un mecanismo autenticado.

Es posible solicitar la revocación mediante el contacto de privacidad.
El backend también cuenta con operaciones autenticadas de revocación.

Revocar ubicación deshabilitará las funciones que dependan de ella.
Las consecuencias de revocar biometría sobre la verificación están
pendientes de definición. La revocación no tiene efectos retroactivos.

## 6. Proveedores y comunicaciones de datos

Proveedor de verificación: [PENDIENTE].
Países de procesamiento y almacenamiento: [PENDIENTE].
Datos enviados y periodo de conservación del proveedor: [PENDIENTE].

Antes de activar la API externa se deberá determinar si el proveedor
actúa por cuenta de RateM o como tercero, y documentar las condiciones
aplicables a la comunicación de datos.

También se deberán identificar los proveedores de base de datos,
alojamiento, mapas y correo usados en la versión publicada.

## 7. Conservación y seguridad

Periodos de conservación de cuentas, fotos, ubicación, documentos,
resultados biométricos y respaldos: [PENDIENTE].

El prototipo guarda contraseñas mediante hash y utiliza tokens de sesión.
Estas medidas no constituyen una garantía de seguridad absoluta.

Antes de publicar se deberá definir la eliminación de datos y archivos,
el control de acceso y el tratamiento de respaldos. Eliminar un registro
de consentimiento no equivale a eliminar documentos o datos del proveedor.

## 8. Derechos y solicitudes

Puedes solicitar acceso, rectificación, cancelación u oposición al
tratamiento de tus datos, así como revocar consentimientos o limitar su uso.

Envía la solicitud al correo de privacidad, indicando el derecho que
deseas ejercer y los datos necesarios para identificar tu cuenta.
Se verificará tu identidad mediante un medio proporcional.

Las solicitudes se atenderán conforme a los plazos y excepciones legales.
El procedimiento y el contacto deben completarse antes de publicar.

## 9. Cambios al aviso

Las actualizaciones se publicarán en [PENDIENTE: URL del aviso].
Cada versión indicará su fecha y número.

Los nuevos tratamientos se informarán antes de comenzar y se solicitará
un nuevo consentimiento cuando corresponda.