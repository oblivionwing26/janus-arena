# F4.4 · Validación SaaS: el kit

Objetivo: saber, con datos y antes de construir nada multi-cliente, si alguien pagaría por lo que
hace Janus (detectar regresiones de UX y de seguridad en el mismo PR, y medir lo que cuesta cada
arreglo de seguridad). La respuesta decide si Janus sigue como producto o queda como portfolio.

Casi no hay código: son conversaciones. El kit solo evita que se contaminen los datos.

## Qué hay aquí

| Fichero                                                                                 | Para qué                                                         |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| [`candidates.md`](candidates.md) y [`candidates-template.csv`](candidates-template.csv) | Quién encaja, dónde buscarlo y la hoja de 20 candidatos          |
| [`interview-script.md`](interview-script.md)                                            | El guion de 25–30 minutos                                        |
| [`notes-template.csv`](notes-template.csv)                                              | La hoja de notas de las 10 conversaciones                        |
| [`concierge-offer.md`](concierge-offer.md)                                              | La oferta de auditoría manual, con el precio como hipótesis      |
| [`decision.md`](decision.md)                                                            | La regla de decisión (se fija antes) y la plantilla de resultado |

## Orden de trabajo

1. **Fija la regla** en `decision.md` (fecha y firma) **antes de la primera conversación**. No se
   cambia después.
2. **Rellena los 20 candidatos** (hoja privada, ver abajo).
3. **Haz 10 conversaciones** con el guion y apunta las notas **el mismo día**.
4. **Ofrece la auditoría manual** a quien muestre dolor real (`concierge-offer.md`).
5. **Decide** con `decision.md`, solo con lo que hay en la hoja de notas.

## Reglas

- **Datos fuera del repositorio.** Las hojas reales (nombres, empresas, correos, citas) viven en una
  hoja privada, no aquí. En el repo solo hay plantillas y, al final, un resumen **sin nombres**.
- **No se vende en la conversación.** Se pregunta por lo que hacen hoy. Janus se nombra casi al final.
- **«Me interesa» no es «pago».** Solo cuenta un compromiso concreto (una fecha, una prueba pagada,
  un pago). El resto se apunta, pero no cuenta para la regla.
- **Nada ofensivo sin permiso.** Una auditoría solo se hace sobre una aplicación de la que el cliente
  da permiso por escrito y prueba que es suya (ver `concierge-offer.md`). Sin permiso, no se toca.
- **Honestidad.** Janus no predice ingresos ni conversión. Los informes hablan de «éxito sintético»
  con intervalos. No se promete otra cosa a nadie.
- **Sin contacto masivo en frío.** Mensajes personales, uno a uno, a gente a la que tiene sentido
  escribir.

## Cuándo se cierra

El «Hecho cuando» del ROADMAP: la decisión está escrita, con los datos que la justifican.
