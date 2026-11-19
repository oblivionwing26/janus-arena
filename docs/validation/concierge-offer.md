# Oferta de auditoría manual (concierge)

Es lo que ofreces en el bloque 7 del guion, **solo a quien mostró dolor real** en el bloque 3. Se
hace a mano con Janus, antes de construir ningún producto multi-cliente.

## Qué recibe el cliente

Para **un lanzamiento** (un pull request o una rama) de su aplicación:

1. **Un informe doble** (el mismo formato que `docs/reports/dual-*`):
   - **UX:** dónde se atascan usuarios sintéticos en los flujos que elijáis (registro, compra…), con
     tasas de «éxito sintético» e intervalos. Nunca «conversión».
   - **Seguridad:** hallazgos del análisis estático y del ataque en un entorno aislado, cada uno con
     una prueba reproducible; los que no se pueden reproducir quedan como «sospechosos», no como
     «confirmados».
   - **Coste de cada arreglo:** para cada fallo confirmado con arreglo, lo que cuesta a los usuarios
     sintéticos (éxito y latencia antes y después).
2. **Una conversación de 30 minutos** para repasar el informe.
3. **Un plazo:** 5 días laborables desde que el entorno está listo.

Una persona del cliente decide qué se arregla. Janus no hace merge de nada.

## Lo que no es

- No predice ingresos ni conversión: los usuarios son agentes sintéticos.
- No es una auditoría de seguridad completa ni sustituye a una prueba de penetración.
- No da garantías de cumplimiento normativo.
- No toca producción ni datos reales.

## Lo que necesito del cliente

- Una copia de la aplicación en un entorno de pruebas (o acceso al repositorio para construirla en
  aislamiento) con **datos sintéticos**.
- **Permiso por escrito** (texto abajo) y la prueba de que el entorno es suyo: un fichero con un
  código que le damos, servido en `/.well-known/janus-verify.txt`. Sin eso, no se ataca nada.
- Los flujos que más le importan (por ejemplo: «registrarse y pagar»).
- Una persona de contacto para dudas durante la semana.

## Honestidad sobre el trabajo real

Hoy Janus solo tiene definición de entorno aislado para ShopLab y Juice Shop. Preparar la de la
aplicación de un cliente se hace **a mano** (horas) y puede no ser posible si depende de servicios
externos. Es parte del aprendizaje de la auditoría y se cuenta en las notas: cuánto tiempo costó
y qué hizo falta. Es información de negocio tan valiosa como la respuesta del cliente.

## Precio: tres hipótesis para probar

No son precios de verdad: son **hipótesis** que no tienen datos detrás. Sirven para ver la reacción
(bloque 7, pregunta 20) y apuntar qué tramo acepta cada uno. Si nadie acepta ninguno, también es un
dato.

| Tramo                 | Qué incluye                                             | Hipótesis de precio |
| --------------------- | ------------------------------------------------------- | ------------------- |
| **1. Solo UX**        | Informe de UX de un lanzamiento y conversación          | 150–250 €           |
| **2. Doble**          | UX + seguridad con pruebas + coste de cada arreglo      | 400–600 €           |
| **3. Acompañamiento** | Una auditoría doble por cada lanzamiento durante un mes | 800–1.200 € al mes  |

Coste propio aproximado de cada auditoría (para saber si merece la pena): unos 1 € de API por las
sesiones de los usuarios sintéticos, más las horas de preparación del entorno y de revisión. Las
horas son la parte que no sabemos: apúntala en la primera auditoría.

## Texto de autorización (para que el cliente lo firme por correo o documento)

> [Cliente] autoriza a [tu nombre] a ejecutar, durante el periodo del [fecha] al [fecha], pruebas de
> usabilidad con usuarios sintéticos y pruebas de seguridad automáticas sobre **el entorno de pruebas
> [URL o descripción]**, del que [Cliente] es titular. Las pruebas se limitan a ese entorno, con
> datos sintéticos, a un ritmo moderado y sin afectar a producción. [Cliente] ha colocado el código de
> verificación indicado en `/.well-known/janus-verify.txt` de ese entorno. Los resultados se entregan
> solo a [Cliente] y no se mencionarán públicamente sin su permiso por escrito.
>
> Rutas excluidas: [lista]. Contacto durante las pruebas: [persona y teléfono].

Este texto es una base, **no asesoramiento legal**: que lo revise alguien con criterio antes de usarlo
con un cliente real.

## Reglas de seguridad (las mismas del proyecto)

- Nada se ejecuta contra un host sin permiso verificado ni fuera de su alcance.
- El entorno de pruebas queda aislado de internet.
- Ningún secreto que aparezca se guarda ni se copia al informe.
- Los hallazgos se entregan **en privado** y antes de cualquier mención pública.
