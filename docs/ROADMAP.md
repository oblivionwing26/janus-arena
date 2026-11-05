# Janus Arena — Plan de desarrollo paso a paso

## Cómo usar este plan

Este plan se mide en **horas de trabajo, no en fechas**: haces el siguiente paso pendiente, sea una semana de 3 horas o de 20. Complementa al [plan maestro](https://claude.ai/artifact/1JpQoMmYHYU7qBF6tCVnPd), que explica el porqué de cada decisión.

- **Un paso = una rama = un PR.** Nombre de rama: `step/f0-3-shared-kernel`. No empieces un paso sin cerrar el anterior, salvo los marcados como independientes.
- **Tamaños.** S = hasta 4 h (cabe en una semana corta), M = 4–10 h, L = más de 10 h. Los pasos L están partidos en sub-entregas que dejan el repo en verde.
- **Semanas cortas (≤3 h):** elige un paso S o una sub-entrega de un M. Si no queda ninguno, dedica la semana a tests, ADRs o al artículo; nunca a empezar un L.
- **Semanas largas (15–20 h):** cierra un L entero o dos M. Evita encadenar pasos de fases distintas.
- **Criterio de hecho.** Cada paso termina con un "Hecho cuando" verificable. Si no se cumple, el paso no está hecho aunque el código exista.
- **CLAUDE.md** lleva una línea "Current step" que actualizas al cerrar cada paso; así Claude Code sabe siempre dónde estás.
- Exporta este documento como Markdown a `docs/ROADMAP.md` cuando cambie, para que Claude Code lo lea dentro del repo.

Total estimado hasta la demo completa (G2): **260–375 h**. A 10 h/semana de media son unas 26–38 semanas; a 15 h/semana, unas 17–25.

## Resumen de fases

Cuatro fases llevan a la demo completa y una quinta valida si hay negocio; cada fase termina en algo que puedes enseñar.

| Fase                                 | Horas  | Entregable al cerrar                                                  | Puerta            |
| ------------------------------------ | ------ | --------------------------------------------------------------------- | ----------------- |
| F0 · Cimientos                       | 55–80  | Ejecución con agente programado (sin LLM) reproducida en la consola   | —                 |
| F1 · SynthLab MVP                    | 70–105 | A/B pareado entre dos variantes hechas a mano, con heatmap y replay   | G1: A/B grabado   |
| F2 · Variante B y auditoría estática | 50–70  | El UI Engineer genera la Variante B y la auditoría estática la revisa | —                 |
| F3 · Red/Blue y gate                 | 85–120 | Ciclo completo con PR firmado y benchmark en Juice Shop               | G2: demo completa |
| F4 · Fusión y validación             | 40–60  | Modo Launch Day, artículos y decisión SaaS                            | Puerta SaaS       |

El orden importa más que las horas: F1 no empieza sin el event log y el replay de F0, porque todo lo demás se construye y se depura sobre ellos.

## F0 · Cimientos (55–80 h)

F0 deja un esqueleto que ya graba y reproduce ejecuciones, con las reglas de arquitectura vigiladas por CI desde el primer día. Ningún LLM real se usa en esta fase.

### F0.1 · Repositorio y herramientas — S (3–5 h)

- [x] Crear el repo `janus-arena` en GitHub (privado hasta G2) y `pnpm init` con `pnpm-workspace.yaml` (`apps/*`, `packages/*`)
- [x] Turborepo: `turbo.json` con tareas `build`, `dev`, `lint`, `typecheck`, `test`, `check:arch`
- [x] `tsconfig.base.json` con `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`
- [x] ESLint (flat config) + Prettier compartidos; Vitest como único runner de tests
- [x] `.nvmrc` con la versión LTS activa de Node, `.editorconfig`, `.gitignore` (incluye `.workspaces/`, `.env*`, `recordings/`)
- [x] GitHub Actions: instalar, lint, typecheck, test y `check:arch` en cada PR
- [x] Protección de `main`: regla creada en GitHub (solo merge por PR con CI en verde). No se aplica en repos privados con plan gratuito; pasa a efectiva al hacer público el repo (G2) o con GitHub Pro

Hecho cuando: un PR vacío pasa el CI completo en menos de 3 minutos.

### F0.2 · CLAUDE.md, visión y ADRs — S (2–3 h)

- [x] Copiar el CLAUDE.md nuevo a la raíz
- [x] `docs/VISION.md`: el producto en una página, sin marketing (puedes partir de las secciones SynthLab, WarRoom y Fusión del plan maestro)
- [x] `docs/ROADMAP.md`: export de este documento
- [x] ADRs en `docs/adr/`: 0001 arquitectura hexagonal, 0002 NestJS con Fastify, 0003 event log append-only como fuente de verdad, 0004 modelos por rol, 0005 sandbox sin salida a internet
- [x] Plantilla `docs/adr/0000-template.md` (contexto, decisión, alternativas, consecuencias)

Hecho cuando: Claude Code, preguntado "¿en qué paso estamos y qué reglas aplican?", responde correctamente leyendo solo el repo.

### F0.3 · shared-kernel: eventos v1 — S (3–4 h)

- [x] Paquete `packages/shared-kernel` con zod
- [x] Sobre de evento: `id` (ULID), `runId`, `seq`, `ts`, `schemaVersion`, `actor` (`agentId`, `role`), `type`, `payload`, `cost?`
- [x] Esquemas v1: `run.started`, `run.completed`, `agent.step`, `agent.action`, `friction.signal`, `llm.call`, `finding.created`, `patch.proposed`, `verification.result`
- [x] `parseEvent()` que valida y devuelve un tipo discriminado; los tipos desconocidos se conservan como `UnknownEvent` (el replay no debe romperse con eventos futuros)
- [x] Tests: cada esquema acepta un ejemplo válido y rechaza uno inválido

Hecho cuando: `pnpm test --filter shared-kernel` en verde y los tipos se importan desde las dos apps.

Nota F0.3: el comando real es `pnpm test --filter @janus/shared-kernel` (turbo exige el nombre completo del paquete). Las apps aún no existen, así que en este paso se verificó con `pnpm build` (genera los `.d.ts`) y con un test que importa el paquete por su nombre `@janus/shared-kernel` y usa `parseEvent` y los tipos. La importación desde las apps se comprobará en F0.4 (`orchestrator-api`) y F0.11 (`web-console`).

### F0.4 · Esqueleto hexagonal del orquestador — M (4–6 h)

- [ ] `apps/orchestrator-api` con NestJS + adaptador Fastify
- [ ] Carpetas `src/domain`, `src/application`, `src/infrastructure`, `src/interface` (controladores HTTP, workers, módulos Nest)
- [ ] dependency-cruiser con reglas: `domain` no importa nada salvo `shared-kernel`; `application` solo `domain` y `shared-kernel`; `infrastructure` no importa `interface`
- [ ] Script `check:arch` conectado a Turborepo y al CI
- [ ] Endpoint `GET /health`
- [ ] Prueba de la regla: rama temporal que importa `@anthropic-ai/sdk` en `domain/` y comprobar que el CI falla

Hecho cuando: la violación intencionada hace fallar el CI y la rama limpia pasa.

### F0.5 · Base de datos y event store — M (5–7 h)

- [ ] `docker-compose.yml` de desarrollo con Postgres y Redis (volúmenes con nombre, healthchecks)
- [ ] Prisma: tablas `runs` y `events` (`runId` + `seq` únicos, índice por `runId`)
- [ ] Migración SQL a mano con un trigger que rechaza `UPDATE` y `DELETE` en `events`
- [ ] Puerto `EventStorePort` en `domain`: `append(events)`, `readRun(runId, fromSeq?)`, `subscribe(runId)`
- [ ] Adaptadores `PostgresEventStore` e `InMemoryEventStore`
- [ ] Suite de **tests de contrato** común que pasan ambos adaptadores (orden por `seq`, rechazo de `seq` duplicado, lectura parcial)

Hecho cuando: la misma suite de contrato pasa contra memoria y contra Postgres, y un `UPDATE` manual sobre `events` falla.

### F0.6 · LLM gateway con presupuesto — M (6–8 h)

- [ ] Entidad `Budget` en dominio: límites de tokens y euros, estado, umbral de aviso 80 % y corte 100 %
- [ ] Puerto `LLMGatewayPort.complete({ role, system, messages, tools?, budget })`
- [ ] `config/models.yaml`: rol → modelo, y tabla de precios editable (sin precios fijos en el código)
- [ ] `AnthropicGateway`: marca `cache_control` solo en el prefijo estable (system + persona + tools), calcula coste y emite `llm.call`
- [ ] `RecordedLLMAdapter`: clave = hash de la petición normalizada; modo `record` guarda en `recordings/`, modo `replay` lee y falla si falta la grabación
- [ ] Tests: presupuesto que corta en la llamada que lo supera; aviso al 80 %; grabación y reproducción idénticas

Hecho cuando: una llamada real grabada se reproduce en test sin red y sin clave de API.

### F0.7 · App objetivo ShopLab — L (12–18 h, repo aparte `janus-shoplab`)

Sub-entrega A (5–7 h): tienda funcional

- [ ] Next.js + Postgres: registro, login, catálogo, carrito, cupón, checkout con pago simulado, historial de pedidos, reseñas
- [ ] Script de seed con 3 usuarios de prueba, cada uno con pedidos y un **valor canario** único (por ejemplo, una dirección inventada) para detectar fugas sin ambigüedad
- [ ] Dockerfile y healthcheck

Sub-entrega B (4–6 h): fricción sembrada

- [ ] 3 problemas de UX documentados en `UX_FLAWS.md`: gastos de envío que solo aparecen en el último paso, campo de cupón escondido tras un enlace ambiguo, formulario que borra los datos al fallar la validación

Sub-entrega C (3–5 h): vulnerabilidades sembradas

- [ ] 4 vulnerabilidades documentadas en `SEEDED_VULNS.md`: IDOR en `/api/orders/:id`, XSS almacenado en reseñas, cupón canjeable dos veces con peticiones simultáneas, precio manipulable en el cuerpo del checkout
- [ ] Tests propios de ShopLab que pasan (los usarán luego los verificadores del Blue Team)

Hecho cuando: `docker compose up` levanta ShopLab con datos, y cada fallo sembrado se reproduce a mano siguiendo su ficha.

### F0.8 · Sandbox de variantes — M (5–7 h)

- [ ] Puerto `SandboxPort`: `up(variant) → { baseUrl }`, `down(variant)`, `logs(variant)`
- [ ] Red Docker `janus-sbx` con `internal: true` (sin salida a internet)
- [ ] Proxy del socket de Docker con lista blanca de operaciones; el orquestador habla con el proxy, nunca con el socket directamente
- [ ] `DockerSandbox`: construye la imagen de una rama de ShopLab, la levanta en la red interna con su Postgres efímero y espera al healthcheck
- [ ] Test de aislamiento: desde el contenedor, una petición a un host público debe fallar

Hecho cuando: `up('a')` devuelve una URL accesible por los navegadores de agentes y el test de salida a internet falla como debe.

### F0.9 · Navegador y agente programado — M (4–6 h)

- [ ] Puerto `BrowserPort`: `newSession()`, `goto`, `click`, `type`, `snapshot`, `close`
- [ ] `PlaywrightRunner` con un `BrowserContext` por sesión, conectado a la red del sandbox
- [ ] Agente programado (sin LLM) que recorre registro → compra y emite `agent.step` y `agent.action` con tiempos

Hecho cuando: el agente programado compra en ShopLab y sus eventos quedan en Postgres en orden.

### F0.10 · Ciclo de vida de una ejecución — M (5–7 h)

- [ ] Caso de uso `StartRun`: crea el run, levanta el sandbox, encola sesiones, cierra con `run.completed` (éxito, error o presupuesto agotado)
- [ ] BullMQ: cola `agent-sessions`, concurrencia por parámetro, reintentos solo para errores de infraestructura (marcados como tales, no cuentan como fricción)
- [ ] API: `POST /runs`, `GET /runs`, `GET /runs/:id/events` (SSE en vivo; con `?replay=1` lee de la tabla)
- [ ] Parada: `POST /runs/:id/stop` corta sesiones y baja el sandbox

Hecho cuando: un `curl` lanza un run, el stream SSE muestra los eventos y la parada deja cero contenedores vivos.

### F0.11 · Consola mínima y replay — M (6–8 h)

- [ ] `apps/web-console` con Next.js: lista de runs y vista de run
- [ ] Vista de run: línea temporal de eventos agrupada por agente, filtro por tipo, panel de coste
- [ ] Reproductor: play, pausa, velocidad (1×, 4×, 16×), saltar a un `seq`
- [ ] Un único componente consume eventos tanto del SSE en vivo como del replay
- [ ] Exportar un run a JSON y cargarlo sin backend (base del modo demo de G2)

Hecho cuando: el run de F0.10 se reproduce igual en vivo y desde el JSON exportado, sin backend.

### F0.12 · Cierre de F0 — S (1–2 h)

- [ ] Vídeo de 1 minuto del replay
- [ ] Revisar ADRs y actualizar `Current step` a F1.1
- [ ] Etiqueta `v0.1.0`

## F1 · SynthLab MVP (70–105 h)

F1 sustituye el agente programado por personas con LLM y convierte sus sesiones en señales de fricción medidas por código. El paso crítico es F1.9: si el agente competente no sabe usar ShopLab, nada de lo que venga después significa algo.

### F1.1 · Observation builder — L (8–12 h)

Sub-entrega A: snapshot podado

- [ ] Paquete `packages/observation-builder`
- [ ] Partir del snapshot ARIA de Playwright y quedarse solo con elementos interactivos y visibles en viewport (o a un scroll de distancia)
- [ ] Asignar refs cortas estables (`e1`, `e2`…) y guardar el mapa ref → locator
- [ ] Incluir textos cercanos que dan contexto (precio, errores de validación, encabezados)

Sub-entrega B: diff y medición

- [ ] Diff contra la observación anterior (añadido, eliminado, cambiado) con fallback a snapshot completo tras navegar
- [ ] Contador de tokens por observación
- [ ] Golden files: 6–8 páginas de ShopLab guardadas como fixtures con su salida esperada

Hecho cuando: los golden tests pasan y la observación media de ShopLab cabe en menos de 1.500 tokens.

### F1.2 · Espacio de acciones — M (4–6 h)

- [ ] Acciones: `click(ref)`, `type(ref, text)`, `select(ref, value)`, `scroll(dir)`, `back()`, `wait(ms)`, `done(outcome, reason)` con `outcome` = `success | abandon`
- [ ] Esquemas zod y validación antes de ejecutar
- [ ] Ejecutor que traduce refs a locators; un error (ref inexistente, elemento tapado) vuelve como observación, no como excepción
- [ ] Cada acción emite `agent.action` con ref, selector resuelto, bounding box y duración

Hecho cuando: una lista fija de acciones reproduce la compra de F0.9 a través del ejecutor.

### F1.3 · Personas — M (4–6 h)

- [ ] Entidad `Persona` en dominio: objetivo, alfabetización digital (1–5), `PatienceBudget` (pasos y segundos), dispositivo, idioma, sensibilidad a la confianza, sesgos (enum cerrado)
- [ ] 8 personas en `personas/*.yaml` con una línea que justifica cada una
- [ ] Persona `competent-baseline`: sin sesgos, paciencia alta, rol de modelo propio
- [ ] Constructor de prompt: prefijo estable (reglas + persona + definición de acciones) separado de la parte variable

Hecho cuando: el prefijo de cada persona es idéntico byte a byte entre pasos (requisito para que la caché funcione).

### F1.4 · Bucle del agente navegador — L (8–12 h)

Sub-entrega A: bucle básico

- [ ] Caso de uso `RunAgentSession`: observar → decidir (tool use con salida estructurada) → actuar → emitir eventos
- [ ] Condiciones de parada: `done`, paciencia agotada (= abandono), presupuesto de sesión agotado, error de infraestructura

Sub-entrega B: memoria y anotaciones

- [ ] Memoria de trabajo: últimas 5 acciones literales + resumen breve cada 8 pasos (resumen con el rol `navigator`)
- [ ] Campo opcional `thought` corto en cada decisión, guardado como anotación (nunca usado para calcular fricción)
- [ ] Grabar todas las llamadas con `RecordedLLMAdapter` en modo `record`

Hecho cuando: una persona completa una compra en ShopLab y la misma sesión se reproduce desde la grabación sin llamar a la API.

### F1.5 · Friction engine — L (10–14 h)

- [ ] Paquete `packages/friction-engine`: funciones puras que reciben eventos y devuelven `friction.signal`
- [ ] Detectores: rage click, dead click, retroceso, error de formulario, pasos extra contra el baseline, abandono, error técnico, rendimiento
- [ ] Umbrales en configuración (por ejemplo, rage click = 3 clics en el mismo ref en menos de 1 s)
- [ ] Tests con secuencias de eventos sintéticas por detector, incluido al menos un falso positivo típico que no debe dispararse
- [ ] Cero dependencias de Playwright o LLM (lo vigila dependency-cruiser)

Hecho cuando: cada detector tiene casos positivos y negativos en verde.

### F1.6 · Instrumentación del runner — M (4–6 h)

- [ ] Script inyectado que cuenta mutaciones del DOM tras cada acción (necesario para dead clicks)
- [ ] Captura de consola, respuestas 4xx/5xx y timeouts
- [ ] `web-vitals` inyectado: LCP, CLS e INP por paso
- [ ] Captura de pantalla solo cuando salta una señal de fricción (para el heatmap y el informe)

Hecho cuando: los fallos sembrados de `UX_FLAWS.md` producen al menos una señal cada uno con el agente programado.

### F1.7 · Orquestación del enjambre — M (5–7 h)

- [ ] Fichero de configuración de run: variantes, personas, semillas, pasos máximos, presupuesto, concurrencia
- [ ] Diseño pareado: misma persona y semilla en A y en B
- [ ] Baseline competente siempre incluido en cada variante
- [ ] Sesiones con error de infraestructura se repiten y se excluyen de la estadística, con contador visible

Hecho cuando: un run 4 personas × 1 semilla × 2 variantes termina con eventos completos y coste dentro del presupuesto.

### F1.8 · Módulo estadístico — M (4–6 h)

- [ ] Tasa de éxito con intervalo de Wilson
- [ ] Diferencia A/B pareada con bootstrap (10.000 remuestreos, semilla fija)
- [ ] Regla de salida: si el intervalo de la diferencia cruza 0 → "sin diferencia detectable"
- [ ] Tests contra valores calculados a mano o con otra herramienta

Hecho cuando: los tests reproducen los valores de referencia con 3 decimales.

### F1.9 · Validar el baseline competente — S a M (3–6 h, variable)

- [ ] Ejecutar el baseline competente 10 veces sobre las tareas de ShopLab
- [ ] Si falla más del 20 %, analizar por qué (observación confusa, acción que falta, ref inestable) y volver a F1.1/F1.2
- [ ] Medir tokens reales por paso y actualizar la tabla de FinOps del plan maestro

Hecho cuando: el baseline completa al menos el 80 % de las tareas. **No se pasa de aquí sin cumplirlo.**

### F1.10 · Heatmap e informe — L (8–10 h)

- [ ] Agregación de señales por ruta y por elemento (bounding box)
- [ ] Esquema JSON del informe SynthLab: embudo por paso, señales top, tasas con intervalos, coste
- [ ] Vista en consola: captura de la página con cajas superpuestas coloreadas por intensidad
- [ ] Vista de embudo por variante

Hecho cuando: los 3 fallos sembrados aparecen entre las 5 zonas con más fricción del heatmap.

### F1.11 · Variante B manual y primer A/B — S a M (3–5 h)

- [ ] En ShopLab, rama `variant/manual-b` que corrige a mano los gastos de envío ocultos y el campo de cupón
- [ ] Run A/B pareado 8 personas × 2 semillas
- [ ] Revisar si el informe lo detecta, y si dice "sin diferencia detectable", aceptarlo y documentar por qué

Hecho cuando: hay un informe A/B guardado y exportado a JSON.

### F1.12 · Lienzo del enjambre (PixiJS) — L (8–12 h)

- [ ] Mapa de la app: nodos = rutas visitadas, aristas = transiciones observadas
- [ ] Cada agente es un punto que se mueve entre nodos; color según estado (navegando, fricción, éxito, abandono)
- [ ] Pulso visual en cada `friction.signal`
- [ ] Alimentado por el mismo flujo de eventos (vivo y replay); probar con 20 agentes sin bajar de 30 fps

Hecho cuando: el replay del A/B de F1.11 se ve en el lienzo a 4× de forma fluida.

### F1.13 · Puerta G1 — S (3–4 h)

- [ ] Vídeo de 2 minutos del A/B en replay
- [ ] ADRs nuevos: observation builder propio, baseline competente, diseño pareado
- [ ] Borrador del artículo "Qué miden y qué no los usuarios sintéticos"
- [ ] Etiqueta `v0.2.0` y `Current step` a F2.1

## F2 · Variante B y auditoría estática (50–70 h)

F2 automatiza lo que en F1.11 hiciste a mano y añade la primera mitad de WarRoom: ver el código antes de atacar. Al cerrar, la Variante B nace, se mide y se audita sin intervención tuya.

### F2.1 · Puerto VCS y adaptador git local — S a M (4–6 h)

- [ ] Puerto `VcsPort`: `clone(repoUrl)`, `branch(name)`, `applyPatch(diff)`, `commit(msg)`, `diffStats()`, `checkout(ref)`
- [ ] `LocalGitAdapter` que trabaja en `.workspaces/<runId>/` (fuera del repo de Janus)
- [ ] Convención de ramas: `janus/variant-<runId>` y `janus/fix-<findingId>`

Hecho cuando: un test de integración clona ShopLab, aplica un parche, hace commit y devuelve estadísticas del diff.

### F2.2 · Localizar el código de la fricción — M (6–8 h)

- [ ] De cada zona de fricción top tomar: ruta, textos visibles, `aria-label`, selector resuelto
- [ ] Buscar esos textos en el repo objetivo (ripgrep) y mapear ruta → fichero de página según las convenciones de Next.js
- [ ] Ordenar ficheros candidatos por coincidencias y devolver un contexto compacto (fragmentos, no ficheros enteros)
- [ ] Tope de tamaño del contexto y medición en tokens

Hecho cuando: para cada fallo de `UX_FLAWS.md`, el fichero real aparece entre los 3 primeros candidatos.

### F2.3 · Agente UI Engineer — L (10–14 h)

Sub-entrega A: generación con límites

- [ ] Rol `ui-engineer`; entrada = zona de fricción + evidencia (capturas, señales) + contexto de F2.2
- [ ] Herramienta `edit_file` con lista blanca de rutas (solo componentes y páginas de frontend)
- [ ] Límites duros: máximo 5 ficheros, 200 líneas cambiadas, sin tocar `package.json`, auth ni API

Sub-entrega B: verificación

- [ ] Ejecutar lint, typecheck y tests de ShopLab en un contenedor efímero
- [ ] Si fallan, un reintento con el error como contexto; si vuelve a fallar, se descarta y se emite `verification.result` negativo
- [ ] Eventos `patch.proposed` (con diff) y `verification.result`

Hecho cuando: para 2 de los 3 fallos sembrados genera una Variante B que compila y pasa los tests.

### F2.4 · A/B automático — S a M (4–6 h)

- [ ] Caso de uso `GenerateAndCompareVariant`: SynthLab A → localizar → UI Engineer → construir imagen B → SynthLab B (pareado) → informe
- [ ] Reutiliza todo lo de F1 sin duplicar lógica

Hecho cuando: un único comando produce el informe A/B con una Variante B generada.

### F2.5 · Adaptadores de análisis estático — M (8–10 h)

- [ ] Puerto `StaticAnalysisPort.run(repoPath) → Finding[]`
- [ ] Semgrep (imagen Docker oficial, salida JSON, reglas OWASP + `rules/` propias)
- [ ] gitleaks con el valor del secreto eliminado antes de emitir el hallazgo
- [ ] osv-scanner sobre el lockfile
- [ ] dependency-cruiser con reglas de arquitectura definidas para ShopLab
- [ ] Normalización a `Finding { kind: 'static', tool, rule, severity, file, line, snippet≤ 5 líneas }`

Hecho cuando: el XSS y el precio manipulable sembrados aparecen como hallazgos de Semgrep (con regla propia si hace falta).

### F2.6 · Mapa de superficie de ataque — L (10–14 h)

Sub-entrega A: rutas y handlers

- [ ] Consultas tree-sitter (TypeScript) para encontrar route handlers de Next.js (`app/**/route.ts`, server actions)
- [ ] Extraer método, ruta, parámetros y fichero

Sub-entrega B: comprobaciones

- [ ] Detectar llamadas a la sesión o al middleware de auth en cada handler
- [ ] Heurística de comprobación de propietario: consultas que filtran por el id del usuario de sesión
- [ ] Salida JSON compacta: `{ route, method, auth: bool, ownerCheck: bool|unknown, params }`
- [ ] Tests con fixtures de handlers correctos e incorrectos

Hecho cuando: `/api/orders/:id` aparece con `auth: true, ownerCheck: false`.

### F2.7 · Auditoría diferencial — S (3–4 h)

- [ ] Ejecutar F2.5 y F2.6 sobre A y sobre B
- [ ] Informe solo de lo que **introduce** B (hallazgos nuevos, endpoints nuevos sin auth)
- [ ] Regla de puerta: si B introduce un hallazgo alto o crítico, B queda bloqueada

Hecho cuando: una Variante B con un fallo inyectado a propósito queda bloqueada.

### F2.8 · Consola: diff y hallazgos — M (5–7 h)

- [ ] Vista del diff de la Variante B junto al A/B
- [ ] Lista de hallazgos estáticos filtrable por herramienta y severidad
- [ ] Vista del mapa de superficie como tabla
- [ ] Etiqueta `v0.3.0` y `Current step` a F3.1

## F3 · Red Team, Blue Team y gate (85–120 h)

F3 cierra el ciclo completo. La regla que lo sostiene todo: el éxito de un ataque lo decide un **oráculo determinista** (por ejemplo, el valor canario del usuario A aparece en la respuesta del usuario B), nunca la opinión del LLM.

### F3.1 · Alcance y verificación de propiedad — M (5–7 h)

- [ ] Entidad `ScopePolicy` en dominio: hosts permitidos, rutas excluidas, tipos de prueba permitidos, límite de peticiones por segundo
- [ ] Verificación de propiedad con token en `/.well-known/janus-verify.txt`, aplicada también al sandbox (así el flujo existe desde el principio)
- [ ] `NetworkGuard` en los adaptadores HTTP y de navegador: toda petición fuera de alcance se bloquea y emite un evento
- [ ] Tests: petición a host no verificado bloqueada; ruta excluida bloqueada

Hecho cuando: ningún módulo ofensivo arranca sin `ScopePolicy` verificada.

### F3.2 · Herramientas de ataque — M (8–10 h)

- [ ] Cliente HTTP con sesiones por usuario de prueba (login como A y como B)
- [ ] Harness de carrera: N peticiones idénticas lanzadas a la vez por código, con resultado agregado
- [ ] Adaptador Nuclei (plantillas web) y ZAP baseline en contenedor, ambos dentro de la red del sandbox
- [ ] Oráculos: `canaryLeak(userA, response)`, `scriptExecuted(page)` (marcador inyectado), `doubleRedeem(coupon)`, `priceMismatch(order)`

Hecho cuando: cada oráculo detecta su vulnerabilidad sembrada ejecutando el exploit a mano desde un test.

### F3.3 · Agente Red Team — L (14–20 h)

Sub-entrega A: IDOR y bypass de auth

- [ ] Rol `red-team`; entrada = mapa de superficie + hallazgos estáticos + usuarios de prueba
- [ ] Playbook por clase: hipótesis → petición → oráculo → conclusión
- [ ] Límite de intentos por endpoint y presupuesto propio

Sub-entrega B: XSS y lógica de negocio

- [ ] XSS almacenado verificado abriendo la página con otro usuario y comprobando el marcador
- [ ] Manipulación de precio y cupón doble con el harness de carrera

Sub-entrega C: registro

- [ ] Cada intento emite eventos; cada éxito, `finding.created` con la evidencia del oráculo

Hecho cuando: encuentra al menos 3 de las 4 vulnerabilidades sembradas en 3 ejecuciones seguidas.

### F3.4 · Artefactos PoC — S a M (4–6 h)

- [ ] Cada hallazgo guarda un script reproducible (TypeScript, usa el cliente y el oráculo)
- [ ] `PocRunner` determinista que lo ejecuta sin LLM y devuelve `exploitable: bool`
- [ ] Regla en dominio: un `Finding` dinámico sin PoC no puede pasar a estado `confirmed`

Hecho cuando: los PoC de F3.3 pasan en un CI separado contra ShopLab sin tocar la API de Anthropic.

### F3.5 · Agente Blue Team y verificadores — L (12–16 h)

Sub-entrega A: parche

- [ ] Rol `blue-team`; rama `janus/fix-<findingId>`; mismas herramientas con lista blanca que el UI Engineer, pero rutas de backend permitidas

Sub-entrega B: los tres verificadores (independientes del agente)

- [ ] V1: el PoC original ya no es explotable
- [ ] V2: tests de ShopLab en verde + test de regresión generado desde el PoC y añadido al parche
- [ ] V3: SynthLab re-ejecutado; la tasa de éxito no baja más de la tolerancia fijada y la latencia p95 de los endpoints tocados sigue en presupuesto
- [ ] Máximo 3 iteraciones; si no converge, el hallazgo queda `open` con el historial

Hecho cuando: IDOR y precio manipulable quedan corregidos con V1, V2 y V3 en verde.

### F3.6 · Informe de compromiso — M (6–8 h)

- [ ] Si V3 falla, pedir al Blue Team hasta 3 alternativas (por ejemplo, rate limiting frente a CAPTCHA frente a verificación escalonada)
- [ ] Medir cada una con V1 y V3
- [ ] Tabla de compromiso: alternativa × explotable × tasa de éxito × p95, con recomendación justificada
- [ ] Añadir a ShopLab un caso diseñado para producir este compromiso (el cupón doble se presta)

Hecho cuando: el informe muestra al menos un parche seguro que empeora la conversión y una alternativa mejor.

### F3.7 · Informe dual y firma — M (5–7 h)

- [ ] Informe en JSON + Markdown: A/B, hallazgos estáticos y dinámicos, PoC, diffs, verificadores, compromisos, coste total
- [ ] Hash del event log del run
- [ ] Firma con cosign (`sign-blob`) y atestación in-toto con sujeto = SHA del commit + hash del informe + hash del event log + versiones de herramientas
- [ ] Comando `janus verify <informe>` que comprueba firma y hashes

Hecho cuando: alterar un byte del informe hace fallar `janus verify`.

### F3.8 · Pull Request — S a M (4–6 h)

- [ ] GitHub App propia con permisos mínimos (contenido y pull requests, solo del repo de ShopLab)
- [ ] Adaptador `GitHubVcsAdapter` (Octokit): push de rama y PR con el informe dual en el cuerpo y adjuntos
- [ ] Sin merge automático, sin aprobar su propio PR

Hecho cuando: aparece en GitHub un PR de ShopLab con el informe y la firma verificable.

### F3.9 · Pipeline del gate — M (6–8 h)

- [ ] Caso de uso `RunJanusGate`: SynthLab A → Variante B → auditoría diferencial → Red Team → Blue Team → informe → PR
- [ ] Cada etapa idempotente y reanudable leyendo el event log (si se cae en el Blue Team, no repite SynthLab)
- [ ] Presupuesto global repartido por etapas

Hecho cuando: matar el proceso a mitad y relanzarlo termina el gate sin repetir etapas completadas.

### F3.10 · Grafo de ataque (React Flow) — M a L (8–10 h)

- [ ] Nodos = endpoints del mapa de superficie; aristas = intentos de ataque
- [ ] Estados por color: probado, explotado, parcheado, verificado
- [ ] Panel lateral con PoC, diff y verificadores del nodo seleccionado
- [ ] Alimentado por eventos (vivo y replay)

Hecho cuando: el replay del gate completo se entiende sin explicación verbal.

### F3.11 · Benchmark público — M (6–10 h)

- [ ] OWASP Juice Shop en el sandbox con su `ScopePolicy`
- [ ] Ejecutar Red Team con alcance limitado a las clases implementadas
- [ ] Medir recall frente a los retos conocidos de esas clases; anotar coste y tiempo
- [ ] Opcional: subconjunto de la suite Argus

Hecho cuando: hay una tabla de resultados reproducible con el comando exacto para obtenerla.

### F3.12 · Puerta G2: demo completa — L (8–12 h)

- [ ] Consola en modo demo desplegada (por ejemplo en Vercel) cargando runs exportados en JSON, sin backend ni claves
- [ ] Vídeo de 3 minutos del ciclo completo
- [ ] README del repo con arquitectura, cómo ejecutar y enlace a la demo
- [ ] Artículo 1 publicado en inglés
- [ ] Repo público, etiqueta `v1.0.0`, `Current step` a F4.1

## F4 · Fusión y validación (40–60 h)

F4 añade la demo más vistosa (Launch Day) y responde a la pregunta de negocio. Los pasos F4.3 y F4.4 son independientes y pueden hacerse en cualquier orden o en paralelo con los demás.

### F4.1 · Modo Launch Day — L (12–16 h)

- [ ] Configuración de run con mezcla de roles (empezar con 18 legítimos + 2 saboteadores)
- [ ] Cuentas canario para los legítimos, con datos distinguibles, para medir contaminación entre sesiones
- [ ] Saboteadores reutilizan el Red Team con cadencia lenta y objetivos de saturación de endpoints
- [ ] Etiqueta de rol solo en el event log, invisible para ShopLab
- [ ] Tres curvas por ejecución: éxito de legítimos, éxito de ataques, falsos positivos de las defensas; antes y después de parchear
- [ ] Lienzo PixiJS con los saboteadores marcados (solo en la vista, a posteriori)

Hecho cuando: un run muestra que una defensa reduce ataques y su coste en legítimos bloqueados.

### F4.2 · Defensas configurables en ShopLab — S a M (4–6 h)

- [ ] Rate limiting por IP y por cuenta, con interruptor por variable de entorno
- [ ] Verificación escalonada en checkout activable
- [ ] Escenario de IP compartida entre legítimos para provocar falsos positivos

Hecho cuando: las tres curvas cambian de forma medible al activar cada defensa.

### F4.3 · Clon de Timbra (solo con permiso escrito) — M a L (8–12 h)

- [ ] Permiso por escrito de la clienta guardado fuera del repo
- [ ] Clon en sandbox con datos sintéticos generados (cero datos reales)
- [ ] Primero SynthLab y auditoría estática; módulos ofensivos solo después, contra el clon
- [ ] Hallazgos entregados a la clienta en privado antes de cualquier mención pública

Hecho cuando: la clienta recibe un informe útil y decide qué se puede mostrar en público.

### F4.4 · Validación SaaS — M a L (10–15 h, casi sin código)

- [ ] Lista de 20 candidatos (fundadores de SaaS pequeños, agencias que lanzan a menudo)
- [ ] Guion centrado en lo que hacen hoy antes de un release, no en tu producto
- [ ] 10 conversaciones con notas en una hoja: dolor, herramientas actuales, presupuesto, disposición a un piloto
- [ ] Oferta de auditoría manual (concierge) con precio a validar
- [ ] Decisión escrita: seguir si al menos 3 pagan un piloto y 1 repite; si no, Janus queda como portfolio

Hecho cuando: la decisión está escrita con los datos que la justifican.

### F4.5 · Artículos y open source — M a L (8–12 h)

- [ ] Artículo 2: "El coste en UX de un parche de seguridad" con el informe de compromiso de F3.6
- [ ] Artículo 3: resultados del benchmark sin maquillar
- [ ] Publicar `friction-engine` en npm con licencia, README, ejemplos y tests

Hecho cuando: los tres artículos están publicados y el paquete se instala desde npm.

### F4.6 · Calibración (opcional, semilla de TFM) — sin estimar

- [ ] Conseguir datos agregados de un embudo real (por ejemplo, la analítica de Timbra si se añade y la clienta lo autoriza)
- [ ] Comparar el ranking de abandonos sintético con el real y calcular la correlación
- [ ] Documentar el método como posible tema de TFM

## Rutina de trabajo con Claude Code

La rutina convierte semanas irregulares en progreso constante: cada sesión empieza y termina en un estado limpio, así que da igual si la siguiente llega mañana o en diez días.

### Al empezar un paso

1. `git checkout -b step/<id>-<nombre>`
2. Pedir a Claude Code en modo plan: "Lee CLAUDE.md y el paso `<id>` de docs/ROADMAP.md. Propón un plan con los ficheros que vas a crear o tocar y los tests que demostrarán el 'Hecho cuando'."
3. Revisar el plan antes de aceptar: ¿toca algo fuera del paso? ¿añade dependencias? ¿rompe una regla "never"?
4. Para código de dominio, tests primero; para adaptadores, la suite de contrato primero.

### Al terminar una sesión (aunque el paso no esté acabado)

- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm check:arch` en verde
- [ ] Commit con Conventional Commits, aunque sea `wip:` en la rama del paso
- [ ] Nota de 2 líneas en la descripción del PR borrador: qué quedó hecho y qué es lo siguiente

### Al cerrar un paso

- [ ] Verificar el "Hecho cuando" a mano, no solo con los tests
- [ ] ADR si se tomó una decisión de arquitectura
- [ ] Actualizar `Current step` en CLAUDE.md y marcar el paso en este documento
- [ ] Merge del PR con CI en verde

### Cada semana (10 minutos, aunque no hayas programado)

- [ ] Horas reales frente a estimadas del paso en curso
- [ ] Coste de API de la semana (HUD de FinOps a partir de F0.6)
- [ ] Si un paso supera el doble de su estimación, partirlo o recortar su alcance

### Al cerrar una fase

- [ ] Vídeo corto y etiqueta de versión
- [ ] Reestimar las fases siguientes con lo aprendido
- [ ] Revisar la tabla de riesgos del plan maestro y aplicar los recortes si toca

### Prompts útiles para Claude Code

- "Revisa este diff como un revisor senior: violaciones de la arquitectura hexagonal, lógica de LLM fuera del gateway, tests que faltan."
- "Escribe la suite de contrato de `<Puerto>` para que la pasen el adaptador real y el falso."
- "Antes de implementar, enumera los casos límite de `<detector>` y escribe un test por cada uno."
- "Comprueba que este cambio no rompe el replay: carga un run exportado anterior y reprodúcelo."

## Fuera de alcance hasta después de G2

Todo esto es tentador y queda fuera a propósito; si Claude Code lo propone antes de tiempo, la respuesta es no.

- Memoria episódica con pgvector (solo tiene sentido para escenarios de usuario recurrente)
- Ingestión de reseñas reales para construir personas
- Enjambres de más de 20 agentes simultáneos
- Multi-tenant, cuentas de cliente, facturación
- Soporte de frameworks distintos de Next.js en el mapa de superficie
- Prompt injection contra chatbots del objetivo (ShopLab no tiene chat hasta que se decida añadirlo)
- Navegación por visión como modo principal (solo fallback)
- Uso de Opus fuera de síntesis puntual de arquitectura
