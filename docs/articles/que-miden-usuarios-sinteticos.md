# Qué miden y qué no los usuarios sintéticos

_Borrador, puerta G1 de Janus Arena (noviembre de 2026). Todas las cifras salen de runs reales
contra ShopLab, una tienda de demostración con tres fallos de usabilidad sembrados a propósito.
Los eventos, informes y exportaciones están en el repositorio._

Un "usuario sintético" aquí es un agente de lenguaje que juega a ser una persona (Carmen,
jubilada; Javier, que quiere saber el coste total antes de pagar; Lucía, que no quiere crear
otra cuenta) y navega una web paso a paso con un navegador real. Es tentador presentar esto como
una forma barata de predecir lo que harán tus clientes. No lo es. Este texto cuenta lo que sí
hemos podido medir, lo que no, y por qué la diferencia importa.

## La regla de partida: el código mide, el modelo actúa

El modelo solo decide la siguiente acción en el navegador. Todo lo demás lo calcula código
determinista a partir de un registro de eventos que no se puede modificar:

- la fricción (clics muertos, vueltas atrás, errores de formulario, abandonos, pasos de más
  frente a un agente de referencia) la detectan funciones puras;
- el éxito de una tarea lo decide un oráculo que lee la tienda como el comprador (sus pedidos),
  no lo que el agente diga;
- las tasas llevan intervalo de confianza y las comparaciones entre variantes, una regla de
  salida explícita.

Esa separación no es un detalle de implementación: es lo que permite decir algo honesto.

## Lo que sí miden

**Dónde se concentra la fricción, cuando alguien tropieza con ella.** Agrupamos las señales por
página y elemento, y cada sesión cuenta una vez por zona. Cuando reprodujimos a propósito los
tres fallos sembrados (envío oculto hasta el pago, cupón escondido tras "Otras opciones",
registro que borra todos los campos al fallar), los tres quedaron entre las cinco zonas con más
fricción, y el del registro señalado en el botón exacto. Con ocho personas y la tarea de usar un
cupón, las dos zonas más calientes fueron el carrito y el pago: el bucle de quien busca un campo
que no ve. Los propios pensamientos de los agentes lo confirman ("No veo el cupón en el pago;
voy al carrito a buscar dónde introducirlo").

**El éxito sintético de una tarea, con su incertidumbre.** Con un oráculo, "comprar dos
cuadernos" se comprueba en el pedido, no en la frase final del agente. Antes de fiarnos de
ninguna persona validamos a un agente competente sin sesgos: completó 9 de 10 tareas según el
oráculo. Si la maquinaria no sabe comprar, ningún fallo de persona significa nada.

**Qué cuesta medirlo.** Unos 2.850 tokens de entrada por paso, tres cuartas partes desde caché;
una sesión de persona sale por 0,002–0,004 €. La mayor parte del gasto es el agente de
referencia, y sobre todo sus bucles.

## Lo que no miden

**Ingresos ni conversión.** Un agente no tiene cartera, prisa real ni alternativas. Hablamos de
"éxito sintético de la tarea", nunca de mejora de conversión.

**Los fallos con los que nadie tropieza.** El registro que borra los campos solo duele si te
equivocas al rellenarlo. En nuestros runs, todos los agentes lo rellenaron bien a la primera: el
fallo existe y el heatmap no lo ve. Un usuario sintético mide el camino que recorre, no la web
entera.

**Lo que queda fuera de sus objetivos.** En el primer A/B real, la variante B arreglaba el envío
oculto y el cupón escondido. Ninguna persona quería usar un cupón, así que ese arreglo no podía
notarse. El resultado fue "sin diferencia detectable" (B − A = −0,13 sobre 16 pares, intervalo
[−0,31, 0,00]), y es la respuesta correcta para esa pregunta, no un fallo del método.

**Lo que el agente dice de sí mismo.** Javier, en la variante B, leyó en el carrito "el total:
24,89 € con envío de 4,99 €", compró, y al cerrar afirmó que el envío había estado oculto hasta
después de confirmar y dio la sesión por abandonada. Sin oráculo, esa frase habría contado como
un fallo de B. La autoevaluación de un modelo es un dato a contrastar, no una prueba.

## Límites que conviene decir en voz alta

- **Muestras pequeñas.** Con 16 pares los intervalos son anchos; solo efectos grandes se ven.
  Mejor decir "no detectable" que inventar una diferencia.
- **Rasgos que pesan más que la variante.** Lucía abandona siempre ante el muro de inicio de
  sesión y Tomás agota siempre sus 12 pasos, en A y en B. Eso es información sobre la tienda
  (o sobre la persona), pero no sobre el cambio que se evalúa.
- **Bucles del agente.** Un agente puede ir y venir entre carrito y pago decenas de veces.
  Contamos cada sesión una vez por zona para que un bucle no parezca una multitud, pero el coste
  sí lo paga.
- **Lo que el agente ve.** Solo percibe lo que le enseñamos de la página (el árbol de
  accesibilidad podado). Un problema puramente visual (contraste, tamaño, una imagen confusa) no
  entra.

## Para qué sirve, entonces

Para lo que hace bien una prueba automatizada: detectar regresiones y localizar dónde duele,
barato y repetible, antes de que lleguen a personas reales. Un informe que dice "el carrito y el
pago concentran la fricción de quien busca el cupón" es útil para el equipo que revisa el cambio.
Un informe que prometiera "+8 % de conversión" no lo sería, porque no sería verdad.

Lo que viene: tareas con oráculo en los A/B (para que el éxito nunca sea la palabra del agente),
más pares cuando el presupuesto lo permita, y la otra mitad de Janus: medir también el coste en
usabilidad de cada arreglo de seguridad.
