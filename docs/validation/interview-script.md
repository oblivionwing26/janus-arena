# Guion de la conversación (25–30 minutos)

Una idea manda sobre todas: **preguntas por lo que hicieron, no por lo que harían.** Lo que alguien
dice que pagaría vale poco; lo que ya hace, gasta y sufre vale mucho.

## Reglas durante la llamada

- Habla el 20 % del tiempo. Después de cada respuesta, espera tres segundos antes de seguir.
- Pide **ejemplos concretos** («¿cuándo fue la última vez?»), no opiniones generales.
- No defiendas ni expliques Janus. Si preguntan, responde en una frase y vuelve a preguntar.
- No ofrezcas nada hasta el bloque 6. No corrijas lo que cuenten.
- Apunta las **frases textuales** que describan el dolor: valen más que tu resumen.
- Pide permiso para tomar notas. No grabes sin un sí explícito.

## 1. Apertura (1–2 min)

> Gracias por el rato. No vendo nada: estoy aprendiendo cómo lanzan los equipos pequeños antes de
> construir nada. Me interesa lo que hacéis de verdad, también lo que os incomoda. ¿Te parece bien
> que tome notas? No voy a citarte con nombre.

## 2. Contexto (3 min)

1. ¿Qué hacéis y cuántos sois en el equipo?
2. ¿Con qué frecuencia publicáis cambios? ¿Quién da el visto bueno?
3. ¿Quién prueba que lo que se publica funciona?

Apunta: tamaño, lanzamientos al mes, quién prueba.

## 3. El último lanzamiento (8–10 min)

Es el bloque que más importa.

4. Cuéntame el **último lanzamiento** que hicisteis, desde que el cambio está listo hasta que está en
   producción.
5. ¿Qué comprobasteis antes de publicar? ¿Cómo?
6. ¿Salió algo mal después? ¿Qué fue, quién lo descubrió y cuánto tardasteis en saberlo?
7. ¿Qué os costó ese error (clientes, horas, dinero, ánimo)? ¿Cómo lo medisteis, si lo medisteis?
8. Y antes de ese, ¿pasó algo parecido?

Apunta: qué hacen antes de publicar, el problema concreto, el coste.

## 4. Herramientas y gasto (5 min)

9. ¿Qué herramientas usáis hoy para comprobar el producto antes de publicar? (pruebas automáticas,
   QA manual, escáneres, analítica de errores…)
10. ¿Cuánto os cuestan, en dinero y en horas al mes?
11. ¿Qué os falta o qué os molesta de lo que usáis?
12. ¿Alguna vez habéis pagado por algo para resolver esto? ¿Qué y cuánto? ¿Por qué lo dejasteis, si
    lo dejasteis?

Apunta: herramientas, presupuesto actual, huecos.

## 5. Seguridad (4 min)

13. Antes de un lanzamiento, ¿alguien mira la seguridad de lo que cambia? ¿Quién y cómo?
14. ¿Habéis arreglado alguna vez un fallo de seguridad? ¿Qué pasó con la experiencia de los usuarios
    después (más pasos, bloqueos, quejas)?
15. ¿Quién decide si un arreglo de seguridad es aceptable cuando molesta a los usuarios?

Apunta: si seguridad y UX se miran juntas o por separado, y quién decide.

## 6. La idea (5 min), solo ahora

Cuéntalo en dos frases, sin demostración:

> Una herramienta que, en cada pull request, hace pasar usuarios sintéticos por el flujo (registro,
> pago…) para ver dónde se atascan, ataca una copia en un entorno aislado para buscar fallos de
> seguridad y, cuando se arregla uno, mide qué le cuesta al usuario. Te entrega un informe en el PR
> y una persona decide. No predice ingresos.

16. ¿Qué parte de eso os resolvería algo que os pasó (el caso del bloque 3)? ¿Cuál no os serviría?
17. ¿Qué os haría desconfiar de un informe así?
18. ¿Cómo lo usaríais en vuestro proceso? ¿Quién lo vería y cuándo?

Apunta lo que **objeten**: es tan útil como lo que celebren.

## 7. Compromiso (3 min)

Es la pregunta que separa el interés del pago. Hazla con calma y sin presionar:

19. Si te hiciera una **auditoría manual** de vuestro próximo lanzamiento (sobre un entorno vuestro,
    con vuestro permiso por escrito), ¿lo probaríais? ¿Cuándo sería el próximo?
20. Pensando en lo que gastáis hoy, ¿cuál de estas cifras os parecería razonable pagar por una
    auditoría así: [muestra los tres tramos de `concierge-offer.md`]? No hay respuesta correcta.
21. ¿Quién tendría que aprobar el gasto?
22. ¿Conoces a **una** persona a la que le interese esto y a la que merezca la pena hablar?

Cierra agradeciendo. **Apunta el compromiso real**: `ninguno`, `fecha` (un día concreto), `prueba`
(aceptan una prueba y la fecha) o `pago` (aceptan pagar y cómo).

## Después de la llamada (el mismo día)

1. Rellena una fila de [`notes-template.csv`](notes-template.csv).
2. Copia las 2–3 frases textuales que mejor muestren el dolor.
3. Escribe una línea: «Lo que me sorprendió».
4. Si hay compromiso, manda el mismo día un correo con lo acordado.

## Señales a vigilar

| Señal                                      | Qué significa         |
| ------------------------------------------ | --------------------- |
| Cuenta un fallo reciente con coste claro   | Dolor real            |
| Ya paga o pagó por algo parecido           | Presupuesto real      |
| «Suena interesante» sin ejemplos           | Cortesía: no cuenta   |
| Cambia de tema cuando preguntas por dinero | Probablemente no paga |
| Dice «cuando lo tengas, me lo enseñas»     | No es un compromiso   |
| Pide ver más antes de decir el precio      | Apunta qué quiere ver |
