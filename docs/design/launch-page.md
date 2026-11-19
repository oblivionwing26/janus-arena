# «Introducing Janus»: la presentación, fase a fase

La portada de Janus deja de ser una lista de runs y pasa a ser una **presentación de lanzamiento**,
como las de los modelos nuevos de Anthropic u OpenAI: alguien de fuera la lee de arriba abajo y
entiende qué es Janus, para qué sirve y por qué vale algo. La lista de runs se va a `/runs`.

Patrón tomado de esas páginas: título grande con fecha e índice; un primer párrafo con logros
concretos; cada afirmación con su gráfica y una nota que dice de dónde sale; secciones por
capacidad; límites; disponibilidad y precio.

Estilo, del dueño (ver [DESIGN.md](DESIGN.md)): mundo oscuro y épico, cristal sobre imagen
(referencia 1: tablero translúcido sobre un paisaje), el grafo de ataque en abanico (referencia 2),
Jano bifronte en partículas (bricelab.dev), títulos en Cinzel.

**Reglas que valen para todas las fases.**

1. **Ninguna cifra inventada.** Cada número vive en `src/lib/launch-data.ts` con la ruta del
   informe del repositorio del que sale; un test comprueba que el informe existe y contiene ese
   número. Cada sección enseña su fuente en una nota al pie.
2. **Una idea visual fuerte por sección**, al servicio de entender algo. Si un efecto no ayuda a
   entender, se quita.
3. **Todo funciona quieto.** Con `prefers-reduced-motion` o sin WebGL, cada sección se ve completa
   y se entiende; la animación es un extra.
4. **Accesible:** cada gráfica tiene su tabla o su texto equivalente; foco visible; contraste AA.
5. **Assets propios:** renders de Blender hechos con scripts en `assets/`, iconos SVG propios, sin
   imágenes de terceros.

Dependencias: `three` y `@react-three/fiber` (ya); `gsap` (ScrollTrigger) y `lenis` cuando una
fase las necesite (aprobadas en el plan de F4.7).

---

## Fase 1 · Portada: «El amanecer de Jano»

**Ambición.** La primera pantalla es un amanecer: un horizonte curvo partido en dos (ámbar a la
izquierda, aurora a la derecha) y en el punto donde se juntan, el Jano de partículas. Encima, la
fecha y «Introducing Janus» en Cinzel, que se revela letra a letra tras una máscara. Debajo, el
índice con líneas de puntos (como el de Anthropic), que se ilumina con la sección en la que estás y
sigue visible como barra lateral al bajar.

**Plan.** Horizonte en un shader de fondo (arco con bloom, dos colores); revelado del título con
CSS; índice con scrollspy (`IntersectionObserver`); barra superior de cristal con la marca y
enlaces a la demo y a GitHub.

**Hecho cuando.** En 5 segundos se sabe qué es (subtítulo) y hay un índice para navegar.

## Fase 2 · El problema: «Cerrar el agujero, perder al cliente»

**Ambición.** Un párrafo de entrada con los logros (cifras que cuentan hasta su valor) y, al lado,
**una simulación que se entiende sin leer**: una tienda en miniatura por la que fluyen compradores
(puntos aurora) y atacantes (puntos ámbar). Un interruptor «añadir límite de peticiones»: los
atacantes se estrellan contra un escudo… y algunos compradores rebotan también. Las proporciones son
las del run real de Launch Day (límite estricto: ataques 100 % → 0 %, compradores bloqueados
0 % → 18 %).

**Plan.** Canvas 2D con partículas por carriles (entrada → catálogo → cesta → pago); estados A y B
con transición; contador en vivo de ataques que pasan y compradores bloqueados; nota con el run.

**Hecho cuando.** Alguien que no sabe nada entiende «el parche cuesta usuarios» pulsando una vez.

## Fase 3 · Cómo funciona: «Un pull request, ocho estaciones»

**Ambición.** Una escena fijada al desplazarse: un raíl curvo con siete estaciones (PR → SynthLab
→ variante B → A/B → Red Team → Blue Team con V1·V2·V3 → informe firmado → una persona fusiona).
Un testigo luminoso (el PR) recorre el raíl; en cada estación se despliega una tarjeta de cristal
con el artefacto real de esa etapa (una persona, un mapa de fricción, una prueba de concepto, los
tres verificadores, la firma).

**Plan.** SVG del raíl con `stroke-dashoffset` ligado al desplazamiento; tarjetas con contenido de
los informes; versión estática como lista numerada.

**Estado: hecha.** Sin GSAP: un contenedor fijado (`position: sticky`) y el progreso del
desplazamiento bastan. Ocho estaciones (SynthLab, variante B, A/B, auditoría diferencial, Red Team,
Blue Team, informe firmado, una persona fusiona), cada una con su artefacto real: las personas de
`personas/*.yaml`, los dos parches grabados de ShopLab, el A/B +83 [50, 100], el resultado de la
auditoría, los seis hallazgos y los cuatro verificadores del gate de Juice Shop. `pipeline-data.test.ts`
comprueba cada cita contra su archivo.

## Fase 4 · Las dos caras

**Ambición.** Pantalla partida: a la izquierda la cara UX (personas con su nombre y su rasgo,
fricción, el A/B +50 puntos con su intervalo dibujándose), a la derecha la cara de seguridad
(clases de ataque, oráculos, «nada lo da por bueno sin prueba»). El ratón desplaza la costura y la
cabeza de Jano gira hacia el lado en el que estás.

**Estado: hecha.** «One shop, two faces»: las nueve páginas del embudo de compra de Juice Shop dos
veces, una sobre otra. La cara de los compradores (sesiones que llegaron, pasos, personas, señales
de fricción) y la del atacante (las llamadas a la API que hizo el propio navegador de los
compradores desde esa página, cruzadas con el árbol de ataques). Una costura con la moneda de Jano
sigue al ratón; en el móvil, un interruptor. El resumen se genera de los runs grabados y un test lo
mantiene igual a ellos; nunca muestra rutas que el alcance excluye.

## Fase 5 · El árbol de ataques

**Ambición.** La referencia 2 hecha con los datos del gate de Juice Shop: un orbe central con texto
en órbita, cajas por clase de ataque con su número, el abanico de curvas hacia los endpoints con
chips de gravedad, y un panel lateral de cristal con el hallazgo: la prueba de concepto escribiéndose
como en un terminal y los tres verificadores pasando de rojo a ámbar a verde.

## Fase 6 · Lo que cuesta un parche

**Ambición.** La gráfica estrella, como la de «precisión frente a coste» de los lanzamientos de
modelos: eje X compradores bloqueados, eje Y ataques que pasan; una flecha por defensa de A a B con
sus intervalos de Wilson al pasar el ratón. Al lado, las alternativas al bloqueo de cuenta en
tarjetas con su diff y su veredicto.

**Estado: hechas las fases 5 y 6.** El árbol se construye de los runs grabados del Red Team y del
Blue Team (106 endpoints distintos en el mapa, 32 peticiones, 6 confirmados, 6 frenados por el
alcance); la gráfica de coste usa las cinco defensas de Launch Day con sus intervalos, y las
alternativas al bloqueo de cuenta citan el informe de trade-off. Los tests reconstruyen cada fila
de los informes desde los datos.

## Fase 7 · Benchmark sin maquillaje

**Ambición.** Tabla al estilo de las de los modelos, con barras e intervalos por categoría del
benchmark de Juice Shop (6 de 60), y la explicación de por qué es bajo a propósito.

**Estado: hecha.** El recall total con su intervalo, el control y las tres rondas como rejillas de 60
puntos, la tabla por categoría, un mosaico con los 60 retos por categoría y dificultad (los
resueltos en ámbar; el efecto secundario, discontinuo en oro), y por qué la cifra es baja a
propósito. Los datos salen del informe con un parser puro; un test los mantiene iguales.

## Fase 8 · Por qué fiarse: el sello

**Ambición.** El informe firmado se verifica **en el navegador** con WebCrypto (ECDSA P-256 y la
clave pública del repositorio). Un sello holográfico se forma si cuadra; un botón «cambia una
cifra» lo rompe y señala el fallo. Mismo veredicto que `pnpm janus verify`.

## Fase 9 · Dentro de la consola

**Ambición.** La referencia 1: el tablero de cristal sobre un paisaje propio (render de Blender: un
templo en ruinas al amanecer), con los runs grabados reales como tarjetas que se pueden arrastrar
entre columnas, y enlaces a la demo.

## Fase 10 · Lo que no afirmamos

**Ambición.** Tarjetas con la afirmación tachada y la que sí hacemos: «aumento de conversión» →
«éxito sintético con intervalo»; «auto-merge» → «una persona revisa»; «ataques con IA» → «ataques
generados por código, oráculo determinista».

## Fase 11 · Disponibilidad

**Ambición.** Tarjetas finales: código abierto (MIT), paquetes npm (comando copiable), demo en
vivo, vídeo, artículos, y lo que cuesta un gate (0,28–0,82 €) en una tabla de precio como la de
los modelos.

## Orden

1 → 2 → 3 → 5 → 6 → 4 → 7 → 8 → 9 → 10 → 11, un commit por fase; un PR al final que lo junta todo
(o varios si crece demasiado).
