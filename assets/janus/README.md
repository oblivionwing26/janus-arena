# El Jano (F4.7, Parte 1)

El busto bifronte de la portada: la cara **vieja y barbada** mira a −X (el atacante, luz ámbar) y
la cara **joven** a +X (los compradores, luz aurora), con cuernos de carnero sobre las orejas, como
la cabeza romana de referencia del dueño. Detrás, un halo de fuego, como el ángel de referencia.

Todo sale de código: no hay escultura a mano ni modelos de terceros, así que no hay licencias que
seguir.

| Archivo         | Qué es                                                                                                                                                      |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `build_head.py` | La cabeza como función de distancia (elipsoides, cápsulas y esferas unidas con mezcla suave, rizos en espiral en la barba), convertida a malla con OpenVDB. |
| `stage.py`      | La escena: mármol, halo emisivo, peana, chispas, luz principal y una luz de borde por cara, cámara y brillo en el compositor.                               |
| `export.py`     | Exporta `janus.glb` y los dos renders de respaldo a `apps/web-console/public/models/`.                                                                      |

## Resultado

| Archivo                   | Tamaño | Notas                                                                                                                                                                                                           |
| ------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `janus.glb`               | 220 KB | 47 833 vértices, 95 654 triángulos, Draco nivel 7. Solo la cabeza: el halo, las chispas y la peana se pintan en la web. Origen en el centro de la cabeza; +Y arriba en glTF; caras en ±X; mide 2,1 × 2,6 × 1,6. |
| `janus-fallback.webp`     | 55 KB  | 1600 × 1000, vista de moneda (los dos perfiles). Para movimiento reducido o sin WebGL.                                                                                                                          |
| `janus-fallback-alt.webp` | 44 KB  | 1600 × 1000, la cara joven en 3/4.                                                                                                                                                                              |

En la web, la malla no se pinta como sólido: `export.py` muestrea 40 000 puntos de su superficie
(por área, semilla fija) y los guarda en `janus-points.bin` (360 KB: `uint32` N, posiciones `int16`
en ejes de three.js y normales `int8`). La portada los dibuja como partículas (referencia:
bricelab.dev) sin cargar el GLB ni el decodificador Draco.

## Regenerar

Con Blender 5.1 (trae `numpy` y `openvdb`), desde la raíz del repositorio, en la consola de Python
de Blender o con el MCP de Blender:

```python
for f in ('build_head.py', 'stage.py', 'export.py'):
    exec(open('assets/janus/' + f, encoding='utf-8').read(), {'__name__': '__main__'})
```

`build_head.py` tarda un par de segundos (rejilla de 0,012 a lo largo de 2,6 × 2,0 × 2,65). Los
rizos usan semillas fijas, así que la cabeza sale igual cada vez. El `.blend` no se guarda en el
repositorio porque estos scripts lo regeneran.
