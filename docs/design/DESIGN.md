# DESIGN.md · Las reglas de gusto de Janus

Lo que el dueño ha decidido sobre el aspecto de Janus. Cada corrección suya se vuelve una regla aquí;
quien diseñe una parte nueva de la consola lo lee antes. El plan por partes está en
[f4.7-vision.md](f4.7-vision.md).

## Dirección

- **Un mundo oscuro y épico, de cristal sobre imagen.** Paneles translúcidos con desenfoque y borde
  fino flotando sobre una imagen dramática o sobre humo (referencia: un tablero de cristal sobre un
  paisaje; un ángel de piedra con un halo de fuego). No hay tema claro por ahora: es una decisión,
  no un olvido.
- **Jano como mito.** El logo es un Jano bifronte de estilo grecorromano (dos perfiles barbados que
  comparten cráneo), acuñado como una moneda. La imagen principal será un Jano épico en 3D, hecho
  en Blender (Parte 1); hasta entonces el ángel de referencia es provisional y no se publica.
- **El grafo de ataque como abanico.** Objetivo en un orbe, categorías como cajas, y la categoría
  elegida se abre en abanico hacia sus retos o endpoints sobre un arco (referencia: un mapa de
  normativa con curvas finas y un panel de detalle a la derecha).

## Tipografía

| Papel    | Fuente                         | Uso                                                                         |
| -------- | ------------------------------ | --------------------------------------------------------------------------- |
| Títulos  | **Cinzel** (capitales romanas) | Marca, títulos y cifras grandes de portada. Nunca en párrafos ni en tablas. |
| Interfaz | Instrument Sans                | Todo lo que se lee o se pulsa.                                              |
| Datos    | JetBrains Mono                 | IDs, rutas, eventos, etiquetas en versalitas.                               |

Anemoia (de pago) y A Gothique Time (licencia de prueba personal) se descartaron porque no tienen
licencia web.

## Color (OKLCH, en `apps/web-console/src/app/tokens.css`)

| Token                 | Papel                                            |
| --------------------- | ------------------------------------------------ |
| `--void`, `--ash`     | Fondo de página y superficies (humo cálido).     |
| `--marble`, `--stone` | Texto y texto secundario.                        |
| `--ember`             | La cara del atacante: seguridad, intentos.       |
| `--blood`             | Explotado, confirmado, peligro.                  |
| `--aurora`            | La cara de los compradores: UX, parcheado, foco. |
| `--gold`              | Seleccionado, verificado, el sello.              |

Todo color de texto llega a 4,5:1 sobre `--void` y `--ash`; lo comprueba `src/lib/palette.test.ts`.
Los nombres antiguos (`--bg`, `--accent`, `--ok`…) siguen existiendo como alias hasta que se rehaga
cada página.

## Reglas

1. Cristal solo donde separa un panel de lo que hay detrás; no se apila cristal sobre cristal.
2. El estado se codifica con forma y color a la vez (chip con punto), nunca solo con color.
3. Un solo momento espectacular por página; lo demás, quieto.
4. Las entradas usan _ease-out_ (`--ease-out`); lo que se usa a menudo no se anima.
5. Todo respeta `prefers-reduced-motion`.
6. Ninguna cifra inventada: todo número que se ve sale de los eventos o de un informe del repositorio.
