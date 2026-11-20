# F4.7-3 · El torno: los dos equipos, explicados por la cabeza de Jano

Revisión del dueño sobre la presentación publicada (20-11-2026):

1. El Jano de partículas de la portada se ve pobre frente al índice que tiene encima.
2. La línea de estaciones es demasiado simple: mucho vacío a la izquierda.
3. En la página de un run el lienzo del enjambre salía vacío. **Arreglado** en
   `fix/swarm-canvas-colours`: PixiJS no entendía los colores OKLCH.
4. La portada tiene mucho margen de mejora. Referencia: una landing negra y monocroma con
   superficies de líneas onduladas, un icono central con un haz de luz, un CTA limpio, una fila de
   logos y secciones de tarjetas sobrias.

Y la idea central: **la página explica los dos equipos con la cabeza.** Una cabeza 3D sólida, de
verdad, gira sobre su eje vertical como una pieza en un torno mientras bajas: primero muestra la
cara que ataca, con cómo funciona el Red Team; al girar aparece la cara que defiende, con el Blue
Team. La interfaz de al lado cambia con ella.

## Decisiones

- **Modelo:** el escaneo real del busto de Jano bifronte del Museo Ruso de San Petersburgo
  (Scan The World, MyMiniFactory). Licencia **CC BY-NC-SA 4.0**: uso no comercial, con atribución
  y compartiendo igual. Vale para el proyecto abierto y su demo; **no** para una web comercial. Si
  Janus pasa a ser un producto de pago, este modelo se sustituye (TRELLIS en local, licencia MIT).
  El asset lleva su propia licencia en `assets/janus/scan/LICENCE.md`, aparte del MIT del código.
- **Caras:** la barbada es el **Red Team** (ámbar, sale primero); la joven, el **Blue Team** que
  arregla y mide lo que cuesta (aurora).

## Plan

### 1 · Portada nueva (referencia monocroma)

- Fondo negro con dos superficies de líneas onduladas en WebGL (miles de líneas finas que respiran
  despacio, como la referencia), con un brillo cálido a un lado y frío al otro.
- En el centro, la moneda de Jano como icono con un **haz de luz vertical** que la atraviesa.
- Título corto, subtítulo de una línea y un CTA blanco («See both faces»).
- Debajo, una fila de «logos» en texto: lo que Janus usa y contra lo que se ha probado (OWASP Juice
  Shop, Playwright, Semgrep, Docker, cosign, in-toto).
- Fuera el busto de partículas de la portada: el 3D se reserva para el torno.

### 2 · El torno (la sección principal)

- Columna izquierda fija (sticky) con la cabeza sólida: mármol, luz de estudio, fondo negro. El
  desplazamiento la gira 180° sobre su eje vertical; la luz de borde pasa de ámbar a aurora.
- Columna derecha con capítulos que entran y salen con el giro:
  - **Cara que ataca (Red Team):** qué hace (lee el código, mapea 106 endpoints, ataca por
    clases en un sandbox sin internet), cómo decide que algo es real (oráculo determinista, nunca
    un modelo), y una muestra viva: una tarjeta de hallazgo con su prueba escribiéndose.
  - **El giro:** a mitad, las dos caras de perfil a la vez, con «the same pull request».
  - **Cara que defiende (Blue Team):** el parche, los tres verificadores pasando a verde, y lo que
    cuesta a los compradores (el trade-off); muestra viva: los verificadores y el sello.
- En el móvil, la cabeza arriba fija y los capítulos debajo; con movimiento reducido, dos imágenes
  fijas de cada cara.

### 3 · Ajustes del resto

- Línea de estaciones: más rica (el raíl ocupa la columna con su propio fondo, mini-visuales en
  cada nodo y el testigo con estela) o integrada en el torno si sobra.
- Tarjetas con el estilo sobrio de la referencia (iconos en recuadro, títulos cortos).

## Pasos

1. El dueño descarga el escaneo (cuenta gratuita de MyMiniFactory) y lo deja en
   `assets/janus/scan/`.
2. Blender: limpiar, orientar las caras en ±X, reducir y exportar a GLB con Draco; render de
   respaldo de cada cara. Script en `assets/janus/scan.py`.
3. Portada nueva, torno, ajustes; capturas a 1440 y 390; un PR.
