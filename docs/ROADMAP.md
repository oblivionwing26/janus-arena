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
| F3 · Red/Blue y gate                 | 95–135 | Ciclo completo con PR firmado y benchmark en Juice Shop               | G2: demo completa |
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

- [x] `apps/orchestrator-api` con NestJS + adaptador Fastify
- [x] Carpetas `src/domain`, `src/application`, `src/infrastructure`, `src/interface` (controladores HTTP, workers, módulos Nest)
- [x] dependency-cruiser con reglas: `domain` no importa nada salvo `shared-kernel`; `application` solo `domain` y `shared-kernel`; `infrastructure` no importa `interface`
- [x] Script `check:arch` conectado a Turborepo y al CI
- [x] Endpoint `GET /health`
- [x] Prueba de la regla: rama temporal que importa `@anthropic-ai/sdk` en `domain/` y comprobar que el CI falla. Se usó `@nestjs/common` en lugar del SDK: el SDK no está instalado y `typecheck` habría fallado antes de llegar a `check:arch`; con Nest solo falla `domain-only-shared-kernel`

Hecho cuando: la violación intencionada hace fallar el CI y la rama limpia pasa.

Nota F0.4: `check:arch` ejecuta `turbo run build` antes de dependency-cruiser, para que `@janus/shared-kernel` se resuelva aunque no exista `dist/`. Las tres reglas de capas se probaron en local con violaciones intencionadas (SDK, `@nestjs/common` y `node:fs` en `domain/`; `infrastructure` y `zod` en `application/`; `interface/` desde `infrastructure/`) y todas fallaron con su propio nombre de regla. `pnpm dev` con recarga en caliente queda pendiente: Node no ejecuta decoradores TS, así que hará falta `tsx` o `@nestjs/cli` (decidir en F0.10/F0.11).

### F0.5 · Base de datos y event store — M (5–7 h)

- [x] `docker-compose.yml` de desarrollo con Postgres y Redis (volúmenes con nombre, healthchecks)
- [x] Prisma: tablas `runs` y `events` (`runId` + `seq` únicos, índice por `runId`)
- [x] Migración SQL a mano con un trigger que rechaza `UPDATE` y `DELETE` en `events`
- [x] Puerto `EventStorePort` en `domain`: `append(events)`, `readRun(runId, fromSeq?)`, `subscribe(runId)`
- [x] Adaptadores `PostgresEventStore` e `InMemoryEventStore`
- [x] Suite de **tests de contrato** común que pasan ambos adaptadores (orden por `seq`, rechazo de `seq` duplicado, lectura parcial)

Hecho cuando: la misma suite de contrato pasa contra memoria y contra Postgres, y un `UPDATE` manual sobre `events` falla.

Nota F0.5: Postgres se publica en `127.0.0.1:55432` y Redis en `127.0.0.1:56379` para no chocar con instalaciones locales. La suite de contrato (13 casos, incluido `subscribe` con catch-up y en vivo) pasa contra `InMemoryEventStore` en `pnpm test` y contra `PostgresEventStore` en `pnpm test:integration`, que también se ejecuta en un job propio del CI. El trigger rechaza `UPDATE`, `DELETE` y también `TRUNCATE`; un `UPDATE` manual con `psql` sobre la base de desarrollo falla con `events is append-only: UPDATE is not allowed`. La migración se llama `20261105092712_init` (nombre de Prisma).

### F0.6 · LLM gateway con presupuesto — M (6–8 h)

- [x] Entidad `Budget` en dominio: límites de tokens y euros, estado, umbral de aviso 80 % y corte 100 %
- [x] Puerto `LLMGatewayPort.complete({ role, system, messages, tools?, budget })`
- [x] `config/models.yaml`: rol → modelo, y tabla de precios editable (sin precios fijos en el código)
- [x] `AnthropicGateway`: marca `cache_control` solo en el prefijo estable (system + persona + tools), calcula coste y emite `llm.call`
- [x] `RecordedLLMAdapter`: clave = hash de la petición normalizada; modo `record` guarda en `recordings/`, modo `replay` lee y falla si falta la grabación
- [x] Tests: presupuesto que corta en la llamada que lo supera; aviso al 80 %; grabación y reproducción idénticas

Hecho cuando: una llamada real grabada se reproduce en test sin red y sin clave de API.

Nota F0.6: la fixture `recordings/fixtures/navigator/<hash>.json` es una llamada real a `claude-haiku-5-5` (49 tokens de entrada, 4 de salida). `record-fixture.test.ts` la reproduce con `ANTHROPIC_API_KEY` vacía y `fetch` sustituido por uno que lanza error, y comprueba que el fichero no contiene credenciales. Para volver a grabarla: `pnpm --filter @janus/orchestrator-api llm:record-fixture` (necesita una API key asociada a un workspace en `.env`). Decisiones: la llamada que supera el presupuesto se cobra y después lanza `BudgetExhaustedError`; el aviso del 80 % es el evento nuevo `budget.threshold`; el límite de tokens suma los cuatro tipos. Quedan fuera: Message Batches, `fallbacks` ante rechazos (un rechazo es `LlmRefusalError`) y el HUD de FinOps (F0.11). `usdToEur` en `config/models.yaml` se actualiza a mano.

### F0.7 · App objetivo ShopLab — L (12–18 h, repo aparte `janus-shoplab`)

Sub-entrega A (5–7 h): tienda funcional

- [x] Next.js + Postgres: registro, login, catálogo, carrito, cupón, checkout con pago simulado, historial de pedidos, reseñas
- [x] Script de seed con 3 usuarios de prueba, cada uno con pedidos y un **valor canario** único (por ejemplo, una dirección inventada) para detectar fugas sin ambigüedad
- [x] Dockerfile y healthcheck

Sub-entrega B (4–6 h): fricción sembrada

- [x] 3 problemas de UX documentados en `UX_FLAWS.md`: gastos de envío que solo aparecen en el último paso, campo de cupón escondido tras un enlace ambiguo, formulario que borra los datos al fallar la validación

Sub-entrega C (3–5 h): tests propios. Las vulnerabilidades sembradas se sustituyen por OWASP Juice Shop como objetivo de seguridad ([ADR 0006](adr/0006-juice-shop-as-security-target.md))

- [x] ~~Vulnerabilidades sembradas en ShopLab~~: fuera de alcance, ver ADR 0006
- [x] Tests propios de ShopLab que pasan (los usarán luego los verificadores del Blue Team)

Hecho cuando: `docker compose up` levanta ShopLab con datos, y cada fallo sembrado se reproduce a mano siguiendo su ficha.

Nota F0.7: ShopLab vive en `oblivionwing26/janus-shoplab` (app en `127.0.0.1:3100`, Postgres en `127.0.0.1:55433`). Se verificó a mano desde un volumen vacío: compra completa con cupón, aislamiento de pedidos entre usuarios y las tres fichas de `UX_FLAWS.md`. Tests propios: 8 unitarios y 20 de integración (servicios y todas las rutas de la API). `UX_FLAWS.md` es verdad de referencia: ningún agente de Janus debe verla (ver F0.8 y F2.2).

### F0.8 · Sandbox de variantes — M (5–7 h)

- [x] Puerto `SandboxPort`: `up(variant) → { baseUrl }`, `down(variant)`, `logs(variant)`
- [x] Red Docker `janus-sbx` con `internal: true` (sin salida a internet)
- [x] Proxy del socket de Docker con lista blanca de operaciones; el orquestador habla con el proxy, nunca con el socket directamente
- [x] `DockerSandbox`: construye la imagen de una rama de ShopLab, la levanta en la red interna con su Postgres efímero y espera al healthcheck
- [x] El clonado del objetivo a `.workspaces/` excluye `UX_FLAWS.md` (verdad de referencia; ningún agente debe leerla)
- [x] Test de aislamiento: desde el contenedor, una petición a un host público debe fallar

Hecho cuando: `up('a')` devuelve una URL accesible por los navegadores de agentes y el test de salida a internet falla como debe.

Nota F0.8: `up({ id, target: 'shoplab', ref })` clona ShopLab en `.workspaces/<id>/` (sin `UX_FLAWS.md`), construye sus imágenes con el builder clásico a través del proxy (`127.0.0.1:23750`), levanta un Postgres efímero, ejecuta migrate + seed y espera al healthcheck; devuelve `http://janus-<id>-app:3100`, accesible solo dentro de `janus-sbx` (los navegadores de F0.9 irán en esa red). `pnpm test:sandbox` (solo local) pasa la suite de contrato contra `DockerSandbox` y el "Hecho cuando": un contenedor en `janus-sbx` recibe 200 de `/api/health` y su petición a `https://example.com` falla. Detalles del proxy y del incidente con buildx en el ADR 0005.

### F0.9 · Navegador y agente programado — M (4–6 h)

- [x] Puerto `BrowserPort`: `newSession()`, `goto`, `click`, `type`, `snapshot`, `close`
- [x] `PlaywrightRunner` con un `BrowserContext` por sesión, conectado a la red del sandbox
- [x] Agente programado (sin LLM) que recorre registro → compra y emite `agent.step` y `agent.action` con tiempos

Hecho cuando: el agente programado compra en ShopLab y sus eventos quedan en Postgres en orden.

Nota F0.9: el navegador es un servidor de Playwright (`docker/browser`) conectado solo a `janus-sbx`; el orquestador lo maneja a través de `browser-relay` (`127.0.0.1:53000`), un `socat` que solo reenvía ese puerto. `docker-compose.yml` declara ahora la red `janus-sbx` y `DockerSandbox` exige que exista. Cada contexto de Playwright aborta además las peticiones fuera del origen de la variante. `BrowserPort` elige elementos por rol y nombre o por etiqueta (nunca CSS) y añade `waitForUrl`. En `pnpm test:sandbox` el agente compra en una variante real y deja 22 eventos (`seq` 0–21, 6 `agent.step`) en Postgres. `run.started`/`run.completed` llegan con `StartRun` en F0.10.

### F0.10 · Ciclo de vida de una ejecución — M (5–7 h)

- [x] Caso de uso `StartRun`: crea el run, levanta el sandbox, encola sesiones, cierra con `run.completed` (éxito, error o presupuesto agotado)
- [x] BullMQ: cola `agent-sessions`, concurrencia por parámetro, reintentos solo para errores de infraestructura (marcados como tales, no cuentan como fricción)
- [x] API: `POST /runs`, `GET /runs`, `GET /runs/:id/events` (SSE en vivo; con `?replay=1` lee de la tabla)
- [x] Parada: `POST /runs/:id/stop` corta sesiones y baja el sandbox

Hecho cuando: un `curl` lanza un run, el stream SSE muestra los eventos y la parada deja cero contenedores vivos.

Nota F0.10: verificado a mano con el orquestador real (`pnpm --filter @janus/orchestrator-api start`, puerto por `PORT`). Un `curl -X POST /runs` con 2 sesiones transmitió en vivo por SSE 46 eventos (`run.started`, 32 `agent.action`, 12 `agent.step`, `run.completed` con `success`) y el stream se cerró solo; un segundo run de 3 sesiones, parado con `POST /runs/:id/stop` en cuanto su app arrancó, terminó con `run.completed` `stopped by user` y cero contenedores `janus.variant` vivos. El estado de un run se deriva de sus eventos (`GET /runs`), sin columnas nuevas. Sesiones y cierre van en un flow de BullMQ (cola `agent-sessions`, 3 intentos solo ante `InfrastructureError`); el worker corre en el proceso de la API. La parada usa `outcome: 'error'` con `reason: 'stopped by user'`, sin tocar el esquema v1.

### F0.11 · Consola mínima y replay — M (6–8 h)

- [x] `apps/web-console` con Next.js: lista de runs y vista de run
- [x] Vista de run: línea temporal de eventos agrupada por agente, filtro por tipo, panel de coste
- [x] Reproductor: play, pausa, velocidad (1×, 4×, 16×), saltar a un `seq`
- [x] Un único componente consume eventos tanto del SSE en vivo como del replay
- [x] Exportar un run a JSON y cargarlo sin backend (base del modo demo de G2)

Hecho cuando: el run de F0.10 se reproduce igual en vivo y desde el JSON exportado, sin backend.

Nota F0.11: `apps/web-console` (Next.js, `127.0.0.1:3012`) llega al orquestador por un rewrite `/api/orchestrator/*` → `ORCHESTRATOR_URL` (por defecto `http://127.0.0.1:3011`), sin CORS; el SSE atraviesa el rewrite sin quedarse en búfer. El stream se lee con `fetch` y un parser SSE propio, porque `EventSource` solo escucha nombres de evento conocidos y la consola debe conservar tipos futuros. `RunViewer` es el único componente que pinta eventos, de `LiveSource` o `RecordedSource`. Verificado en el navegador: un run de 2 sesiones se vio en vivo (46 eventos en tandas, 3 columnas por agente), se abrió con "Abrir sin backend", se paró el orquestador y el replay mostró exactamente la misma línea temporal; saltar a un `seq` y 16× funcionan. Pendiente para F0.12: `pnpm dev` con recarga del orquestador y el comando `pnpm run:replay`.

### F0.12 · Cierre de F0 — S (1–2 h)

- [x] Vídeo de 1 minuto del replay
- [x] Revisar ADRs y actualizar `Current step` a F1.1
- [x] Etiqueta `v0.1.0` (tras el merge)

Nota F0.12: el vídeo (grabación de un run de 2 sesiones en vivo, "Abrir sin backend", orquestador parado y replay a 16×) va como adjunto del release `v0.1.0`, no en el repo. Se cierran los pendientes de F0.4 y F0.11 sin dependencias nuevas: `pnpm dev` arranca la consola y el orquestador, que se recompila con `tsc --watch` y se reinicia con `node --watch` sobre `dist/` (puerto 3011), así que no hacen falta `tsx` ni `@nestjs/cli`; verificado editando un controlador y viendo cambiar el proceso que escucha en 3011. `pnpm run:replay <runId|file> [--json]` reproduce un run en texto desde Postgres o desde un fichero `janus-run` y nunca llama a un LLM; `--json` escribe la misma exportación que la consola. El parser de `janus-run` v1 pasa de la consola a `shared-kernel` para que consola y CLI lean lo mismo. Verificado: el run del vídeo reproducido desde la base de datos y desde su exportación da la misma salida línea a línea. Revisión de ADRs: sin cambios de decisión; el 0003 recoge cómo quedó implementado el replay.

## F1 · SynthLab MVP (70–105 h)

F1 sustituye el agente programado por personas con LLM y convierte sus sesiones en señales de fricción medidas por código. El paso crítico es F1.9: si el agente competente no sabe usar ShopLab, nada de lo que venga después significa algo.

### F1.1 · Observation builder — L (8–12 h)

Sub-entrega A: snapshot podado

- [x] Paquete `packages/observation-builder`
- [x] Partir del snapshot ARIA de Playwright y quedarse solo con elementos interactivos y visibles en viewport (o a un scroll de distancia)
- [x] Asignar refs cortas estables (`e1`, `e2`…) y guardar el mapa ref → locator
- [x] Incluir textos cercanos que dan contexto (precio, errores de validación, encabezados)

Sub-entrega B: diff y medición

- [x] Diff contra la observación anterior (añadido, eliminado, cambiado) con fallback a snapshot completo tras navegar
- [x] Contador de tokens por observación
- [x] Golden files: 6–8 páginas de ShopLab guardadas como fixtures con su salida esperada

Hecho cuando: los golden tests pasan y la observación media de ShopLab cabe en menos de 1.500 tokens.

Nota F1.1: el paquete es puro (regla `observation-builder-pure` en `check:arch`: solo `zod`). Recibe la captura que da `BrowserPort.snapshot()`, que ahora añade `tree` (`ariaSnapshotJSON` de Playwright en modo `ai` con cajas) y `viewport`. Se queda con los controles dentro de una ventana de una pantalla por arriba y otra por abajo, y con encabezados, avisos (`alert`/`status`, sin el anunciador de rutas de Next) y texto de `main`; cada fila de tabla va en una línea. Las refs (`e1`…) son propias y estables por sesión: la clave es rol + nombre exacto + posición entre iguales, que es también el locator para F1.2 (sin CSS). El diff marca `~`/`-`/`+` y vuelve a la observación completa al navegar o si el diff sale más largo. Tokens estimados a 3 caracteres por token (conservador; la medición real llega con `llm.call` en F1.9). Golden: 9 capturas reales de ShopLab (`pnpm --filter @janus/orchestrator-api observation:capture-fixtures`, local, datos sintéticos fijos) más un diff de formulario. Media: 173 tokens (de 89 en `/orders` a 384 en el catálogo). Pendiente: el snapshot de Playwright expone el valor de los campos de contraseña; antes de F1.4 el adaptador debe enmascararlo. Cuando `application/` use el paquete (F1.4) habrá que permitirlo en la regla de capas.

### F1.2 · Espacio de acciones — M (4–6 h)

- [x] Acciones: `click(ref)`, `type(ref, text)`, `select(ref, value)`, `scroll(dir)`, `back()`, `wait(ms)`, `done(outcome, reason)` con `outcome` = `success | abandon`
- [x] Esquemas zod y validación antes de ejecutar
- [x] Ejecutor que traduce refs a locators; un error (ref inexistente, elemento tapado) vuelve como observación, no como excepción
- [x] Cada acción emite `agent.action` con ref, selector resuelto, bounding box y duración

Hecho cuando: una lista fija de acciones reproduce la compra de F0.9 a través del ejecutor.

Nota F1.2: las acciones viven en `shared-kernel` (`parseAgentAction`, zod; `domain/` no puede importar zod) con límites: refs `e<n>`, texto ≤ 500, `wait` ≤ 10 s. `agent.action` sigue en v1 con `action` abierto (los eventos del agente programado siguen valiendo) y gana `errorCode` opcional. `ActionExecutor` (application) recibe el mapa ref → `{ role, name, nth }` de la última observación como datos, así que no importa `observation-builder`; antes de actuar localiza el elemento para el `boundingBox`. Ref inexistente, acción inválida, elemento tapado o deshabilitado y opción inexistente vuelven como `{ status: 'failed', error: { code, message } }` y quedan en el evento; solo lo de infraestructura (sesión cerrada) lanza. `BrowserPort` gana `select`, `locate`, `scroll`, `back` y `nth`; Playwright traduce "intercepts pointer events" y "not enabled" de su log a errores de dominio. Verificado en `pnpm test:sandbox`: 12 acciones fijas por refs (registro, producto con `select` de cantidad, carrito, pago con `scroll`, `done`) compran en una variante real observando cada paso con `ObservationBuilder`; los 12 `agent.action` quedan en Postgres en orden, los 10 con ref con selector y caja. Las refs se mantienen entre páginas (cabecera `e1`–`e3`, "Dirección de envío" `e9` en registro y pago). Para F1.4: el ejecutor no espera a que termine una navegación; el bucle debe esperar a que la página se asiente antes de observar. El agente programado de F0.9 sigue igual.

### F1.3 · Personas — M (4–6 h)

- [x] Entidad `Persona` en dominio: objetivo, alfabetización digital (1–5), `PatienceBudget` (pasos y segundos), dispositivo, idioma, sensibilidad a la confianza, sesgos (enum cerrado)
- [x] 8 personas en `personas/*.yaml` con una línea que justifica cada una
- [x] Persona `competent-baseline`: sin sesgos, paciencia alta, rol de modelo propio
- [x] Constructor de prompt: prefijo estable (reglas + persona + definición de acciones) separado de la parte variable

Hecho cuando: el prefijo de cada persona es idéntico byte a byte entre pasos (requisito para que la caché funcione).

Nota F1.3: `Persona` y `PatienceBudget` son dominio puro con sus invariantes (slug, alfabetización 1–5 entera, sesgos de un enum cerrado de 8, la baseline sin sesgos y con alfabetización 5). Las personas se leen por `PersonaCatalogPort` (YAML con zod estricto y fake en memoria, misma suite de contrato); el nombre del fichero debe ser el `id`. `personas/` tiene 8 personas `navigator` y `competent-baseline` (rol propio), sintéticas y genéricas, cada una con su `rationale`; ninguna se diseñó mirando `UX_FLAWS.md`. `NavigatorPrompt.forSession(persona, task)` construye una vez la parte estable (reglas en inglés + persona + tarea con datos sintéticos) y las 7 herramientas, una por acción, generadas desde los mismos esquemas zod de `shared-kernel` (`actionToolDefinitions`, orden fijo); cada paso solo añade un mensaje de usuario con el resultado anterior y la observación, nunca en la parte cacheada. Verificado: para las 9 personas, `system` + `tools` dan el mismo JSON byte a byte en los 7 pasos de una compra con las observaciones reales de F1.1, y al reconstruir el prompt; cambiar el orden de las claves del YAML no cambia el prefijo; cada persona tiene un prefijo distinto. El mínimo cacheable de Haiku 5.5 y Sonnet 5.5 es 512 tokens (por debajo no falla, simplemente no cachea); un test exige que el prefijo quede muy por encima. Golden del prefijo de `carmen-retired` en `navigator-prompt.golden.txt`. Para F1.4: el dispositivo `mobile` aún no cambia el viewport del navegador, y la confirmación real de la caché será `cacheReadInputTokens > 0` en `llm.call`.

### F1.4 · Bucle del agente navegador — L (8–12 h)

Sub-entrega A: bucle básico

- [x] Caso de uso `RunAgentSession`: observar → decidir (tool use con salida estructurada) → actuar → emitir eventos
- [x] Condiciones de parada: `done`, paciencia agotada (= abandono), presupuesto de sesión agotado, error de infraestructura

Sub-entrega B: memoria y anotaciones

- [x] Memoria de trabajo: últimas 5 acciones literales + resumen breve cada 8 pasos (resumen con el rol `navigator`)
- [x] Campo opcional `thought` corto en cada decisión, guardado como anotación (nunca usado para calcular fricción)
- [x] Grabar todas las llamadas con `RecordedLLMAdapter` en modo `record`

Hecho cuando: una persona completa una compra en ShopLab y la misma sesión se reproduce desde la grabación sin llamar a la API.

Nota F1.4: el bucle es `NavigatorSession` (application); `RunAgentSession` sigue siendo la entrada de la cola y elige entre el agente programado y una persona (`POST /runs` acepta `personas`, la sesión i juega la persona i mod n; una persona inexistente da 400). Cada paso es una petición nueva: prefijo estable cacheado + un mensaje con memoria (últimas 5 acciones literales + resumen cada 8 pasos, también con el rol de la persona), resultado anterior y la observación completa; el diff de F1.1 no se usa porque el modelo no ve la página anterior. Eventos nuevos: `agent.thought` (anotación, nunca evidencia) y `session.ended` (`success`, `abandon`, `patience_exhausted`, `budget_exhausted`). El adaptador de Playwright enmascara las contraseñas, da viewport de móvil a las personas `mobile` y añade `settle()`. `application/` puede importar `observation-builder` (enmienda al ADR 0001). Verificado: (1) la primera grabación real terminó en `patience_exhausted` por culpa del prompt: no decía si la persona tenía cuenta y Carmen intentó entrar en una que no existía; ahora la tarea lo dice (`hasAccount`). (2) `carmen-retired` con Haiku compró en ShopLab en 15 pasos (0,0026 €, 31.892 tokens leídos de caché) y la sesión quedó en `recordings/fixtures/sessions/carmen-retired/` (respuestas del LLM + cinta de llamadas al navegador); el test de replay la reproduce en `pnpm test` sin red ni clave con las mismas 15 acciones. Se graba a propósito: `JANUS_RECORD_SESSION=1 pnpm test:sandbox`. (3) Un run desde `POST /runs` con Carmen terminó en `success` y la consola muestra 17 llamadas, 50.148 tokens y 0,0029 € en el HUD, con los pensamientos y el fin de sesión en la línea temporal. Para F1.5: tras un envío de formulario `settle()` puede volver antes de la navegación y la persona ve el botón deshabilitado y usa `wait`; esas esperas no deben contar como fricción. Para F1.9: con el prompt ambiguo Carmen repitió la misma acción 34 veces sin probar otra cosa.

### F1.5 · Friction engine — L (10–14 h)

- [x] Paquete `packages/friction-engine`: funciones puras que reciben eventos y devuelven `friction.signal`
- [x] Detectores: rage click, dead click, retroceso, error de formulario, pasos extra contra el baseline, abandono, error técnico, rendimiento
- [x] Umbrales en configuración (por ejemplo, rage click = 3 clics en el mismo ref en menos de 1 s)
- [x] Tests con secuencias de eventos sintéticas por detector, incluido al menos un falso positivo típico que no debe dispararse
- [x] Cero dependencias de Playwright o LLM (lo vigila dependency-cruiser)

Hecho cuando: cada detector tiene casos positivos y negativos en verde.

Nota F1.5: `detectFriction(events, config)` es puro (regla `friction-engine-pure`: solo `zod` y `shared-kernel`) y devuelve borradores de `friction.signal` con detector, severidad, evidencia (ids de eventos), sesión, paso y URL; nunca lee `agent.thought` ni salida del LLM. Umbrales en `config/friction.yaml`, validados por el esquema del paquete; un test exige que coincidan con los valores por defecto. Rage click se mide por acciones consecutivas y tiempo (3 clics en el mismo ref en 4 acciones y 30 s), porque un agente LLM tarda segundos en cada decisión; para humanos bastaría 1 s. Las esperas (`wait`) no cuentan como pasos ni rompen ráfagas. Esquemas aditivos para lo que capturará F1.6: `agent.action.domMutations`, `agent.step.alerts`, eventos `page.error` y `page.vitals`, y `friction.signal` con `agentId`, `stepIndex` y `url`; la consola muestra los eventos nuevos. Verificado: 42 tests del motor, con casos positivos, negativos y el falso positivo típico de cada detector (tres botones distintos seguidos, clic en un campo, avance normal, aviso que ya estaba, baseline que no tuvo éxito, presupuesto agotado, favicon 404, valores justo en el umbral); la sesión real de Carmen (F1.4) no da ninguna señal y, cambiada a abandono, da solo `abandonment`. Para F1.6: emitir los datos de entrada, llamar al motor al terminar el run y registrar `friction.signal`; cuando `application/` lo use habrá que añadirlo a la regla de capas (enmienda del ADR 0001). Para F1.7: `extra-steps` compara con el baseline del run; con dos variantes tendrá que comparar dentro de cada variante.

### F1.6 · Instrumentación del runner — M (4–6 h)

- [x] Script inyectado que cuenta mutaciones del DOM tras cada acción (necesario para dead clicks)
- [x] Captura de consola, respuestas 4xx/5xx y timeouts
- [x] `web-vitals` inyectado: LCP, CLS e INP por paso
- [x] Captura de pantalla solo cuando salta una señal de fricción (para el heatmap y el informe)

Hecho cuando: los fallos sembrados de `UX_FLAWS.md` producen al menos una señal cada uno con el agente programado.

Nota F1.6: un script inyectado con `addInitScript` cuenta mutaciones del DOM por documento y lleva `web-vitals` 5.3 (leído de `node_modules`, porque el navegador no tiene internet); el adaptador recoge errores de consola, excepciones, respuestas 4xx/5xx y peticiones fallidas, sin contar lo que bloquea nuestro filtro de origen ni el eco "Failed to load resource". El ejecutor mide `domMutations` en cada clic; el bucle registra `agent.step.alerts`, `page.error` y `page.vitals`, y tras cada paso pasa el motor de fricción por la sesión: si aparece una señal nueva guarda una captura (`ArtifactStorePort`, ficheros en `.artifacts/<runId>/`) y registra `page.screenshot`. `FinishRun` registra los `friction.signal` del run antes de `run.completed`, con los umbrales de `config/friction.yaml`. El bucle recibe ahora un `Decider`: el LLM (F1.4) o un guion (`ScriptedDecider`, por rol y nombre, nunca por ref). `settle()` ahora espera a que la red quede en silencio 500 ms (máx. 5 s): `networkidle` de Playwright se alcanza una vez por documento y no esperaba a los envíos de formulario (el problema que Carmen sorteaba con `wait`). Verificado en `pnpm test:sandbox` sin gasto de API: UX-1 da `backtrack` (y `abandonment`), UX-2 da `extra-steps` contra un baseline programado (y `backtrack`), UX-3 da `form-error` (y `abandonment`); el baseline no da ninguna. La primera pasada destapó un falso positivo: el 400 de validación del registro salía como `technical-error`; ahora 400/401/403/409/422 se ignoran (configurable) porque son el formulario rechazando datos. Notas: una navegación de cliente de Next.js no cambia de documento, así que el contador sigue (dead-click compara URLs); UX-3 no da `form-error` alto porque el aviso no desaparece entre intentos. Para F1.7: los probes demuestran instrumentación + motor; que las personas LLM encuentren los fallos se mide en F1.9 y F1.11.

### F1.7 · Orquestación del enjambre — M (5–7 h)

- [x] Fichero de configuración de run: variantes, personas, semillas, pasos máximos, presupuesto, concurrencia
- [x] Diseño pareado: misma persona y semilla en A y en B
- [x] Baseline competente siempre incluido en cada variante
- [x] Sesiones con error de infraestructura se repiten y se excluyen de la estadística, con contador visible

Hecho cuando: un run 4 personas × 1 semilla × 2 variantes termina con eventos completos y coste dentro del presupuesto.

Nota F1.7: un run se declara en `runs/*.yaml` (variantes `id`+`ref`, personas, semillas, `maxSteps`, presupuesto, concurrencia) y se lanza con `pnpm run:start <fichero>`, que lo valida y lo manda a `POST /runs` (el cuerpo antiguo sigue valiendo para el agente programado). `sessionMatrix` empareja: cada persona y semilla juega cada variante, y cada variante recibe el baseline competente por semilla. La semilla fija los datos sintéticos de la sesión, así que un par A/B juega con datos idénticos (el LLM no admite semilla). Evento nuevo `session.started` (variante, tipo, persona, semilla, intento); cada intento tras un error de infraestructura es una sesión con su propio `agentId` (`…-s1-a2`), y solo cuentan las que tienen `session.ended`. `run.completed` lleva el recuento de sesiones (completas, fallidas, sin presupuesto, canceladas, excluidas por infraestructura) y la consola lo muestra. La concurrencia por run es un semáforo en `RunControl`; parar o cerrar un run baja todas sus variantes. `extra-steps` compara con el baseline de la misma variante. Verificado con `runs/ab-demo.yaml` (A/A sobre ShopLab `main`): 10 sesiones, las 10 con `session.started` y `session.ended`, 588 eventos; 123 llamadas, 344.639 tokens, 0,0806 € (Haiku 0,016 €, Sonnet 0,065 €) con presupuesto de 0,50 € y sin avisos; 8/10 compran (también los dos baselines, en 12 pasos), Lucía abandona en A y en B porque para añadir al carrito hay que iniciar sesión (su sesgo de no crear cuenta): `abandonment` y `backtrack` en ambas variantes, coherentes entre el par. `pnpm run:start` no recompila: recompilar reiniciaría la API de `pnpm dev` que va a recibir el run.

### F1.8 · Módulo estadístico — M (4–6 h)

- [x] Tasa de éxito con intervalo de Wilson
- [x] Diferencia A/B pareada con bootstrap (10.000 remuestreos, semilla fija)
- [x] Regla de salida: si el intervalo de la diferencia cruza 0 → "sin diferencia detectable"
- [x] Tests contra valores calculados a mano o con otra herramienta

Hecho cuando: los tests reproducen los valores de referencia con 3 decimales.

Nota F1.8: paquete puro `packages/stats` (regla `stats-pure`: solo `shared-kernel`). `wilsonInterval` usa z = 1,959964 (cuantil exacto); `pairedBootstrap` remuestrea pares con un generador propio con semilla (mulberry32, semilla por defecto 20261106) e intervalo de percentiles con interpolación lineal; `decide` aplica la regla de salida (si el intervalo de B − A contiene el 0, "sin diferencia detectable"). `abSummary(events)` saca de los eventos de un run el éxito sintético de las personas por variante (baseline aparte, como referencia) y la diferencia pareada por persona y semilla; quedan fuera las sesiones sin `session.ended` (infraestructura) o sin presupuesto, y sus pares. `pnpm run:replay` muestra la sección cuando el run tiene sesiones. Referencias: Wilson a mano y con `packages/stats/reference/reference.py`, una implementación independiente en Python solo con la biblioteca estándar del generador, Wilson y el mismo bootstrap; los tests fijan sus números a 3 decimales (y las primeras salidas del generador exactas), y el bootstrap se contrasta además con la distribución exacta de un caso pequeño. Con los eventos reales del run A/A de F1.7 (fixture con sus 22 eventos de sesión y de run): A y B 3/4 = 75,0 % [30,1 %, 95,4 %], baselines 1/1, B − A sobre 4 pares +0,0 pp [+0,0, +0,0] → sin diferencia detectable, también con `pnpm run:replay` contra Postgres. El script de Python no corre en CI (CI no tiene Python).

### F1.9 · Validar el baseline competente — S a M (3–6 h, variable)

- [x] Ejecutar el baseline competente 10 veces sobre las tareas de ShopLab
- [x] Si falla más del 20 %, analizar por qué (observación confusa, acción que falta, ref inestable) y volver a F1.1/F1.2
- [x] Medir tokens reales por paso y actualizar la tabla de FinOps del plan maestro

Hecho cuando: el baseline completa al menos el 80 % de las tareas. **No se pasa de aquí sin cumplirlo.**

Nota F1.9: el éxito ya no es la palabra del agente. Un oráculo determinista lee ShopLab como el comprador (los ids de `/orders` y `GET /api/orders/<id>`, validado con zod, con las cookies de la sesión y `fetchText`, solo lectura y mismo origen) y comprueba lo que pide la tarea (productos y cantidades en un mismo pedido, descuento, dirección); registra `task.verified` (`passed`, `failed` o `unverifiable`, que queda fuera de la estadística) y `abSummary` usa su veredicto cuando existe. Las tareas van en el fichero de run (`tasks`), sustituyen el objetivo de la persona y cada una es una sesión con identidad propia (`…-t2-s1-a1`, y cuenta sintética propia); `personas: []` permite un run solo de baseline. Verificado: el oráculo contra ShopLab real distingue un pedido de 2 cuadernos de uno de 1 aunque los dos "agentes" digan `success` (sandbox, sin gasto). Validación real con `runs/baseline-validation.yaml` (5 tareas × 2 semillas, Sonnet): **9/10 según el oráculo** (90 %); falla solo `use-coupon` con semilla 1: busca el cupón en carrito y pago 60 pasos sin probar "Otras opciones" (el fallo sembrado UX-2); con semilla 2 lo encuentra en 53 pasos. Coste 0,83 € (estimé ~0,35 €; aviso del 80 % del presupuesto de 1 €). Análisis: la observación y las refs no fallan (cuando llega a pagar, el pedido es correcto); el agente entra en bucles carrito↔pago (también en "taza + bolígrafos", 58 pasos: el pago no lista los artículos y vuelve a comprobarlos) aunque su memoria los muestra. Pendiente, sin bloquear: detectar el bucle A↔B en la memoria del agente (abarataría mucho) y agrupar esos `backtrack`, que salen uno por vaivén. Tokens reales por paso (~2.850 de entrada, ~75 % desde caché, frente a los 3.000–4.000 estimados) en `docs/finops.md`; el plan maestro no se ha tocado.

### F1.10 · Heatmap e informe — L (8–10 h)

- [x] Agregación de señales por ruta y por elemento (bounding box)
- [x] Esquema JSON del informe SynthLab: embudo por paso, señales top, tasas con intervalos, coste
- [x] Vista en consola: captura de la página con cajas superpuestas coloreadas por intensidad
- [x] Vista de embudo por variante

Hecho cuando: los 3 fallos sembrados aparecen entre las 5 zonas con más fricción del heatmap.

Nota F1.10: el informe lo calcula código a partir de los eventos del run, en el paquete puro `packages/synthlab-report` (regla `synthlab-report-pure`: solo shared-kernel, stats y zod), con esquema `janus-synthlab-report` v1 en shared-kernel. Se calcula al vuelo y no se guarda: `GET /runs/:id/report`, `pnpm run:report <runId|archivo> [--json]` y la página `/runs/<id>/report` de la consola (éxito sintético con intervalos, heatmap, embudo, coste y exportar JSON). Las capturas se sirven por `GET /runs/:id/artifacts/<clave>.png`, que solo acepta PNG con clave válida. Rutas y embudo por target en `config/funnels.yaml`. Una zona es ruta + elemento (`role=button[name="Crear cuenta"]`); la fricción de página entera (backtrack, abandono) va a la ruta sola. La ruta de una señal es la página de su primera evidencia: un backtrack A → B → A apunta a B, la página de la que se huye. Una señal de toda la sesión sin URL (extra-steps) va a la página donde la sesión pasó más pasos. Intensidad = suma, por sesión, de su peor severidad en la zona (1/2/3): en F1.9, 69 backtracks de un bucle pesan 4, no 69. Corregido al leer: `page.screenshot` registra la URL del inicio del paso, pero la imagen es de después de la acción; el informe asigna cada captura a la página del paso siguiente (los eventos no cambian). Limitación: las cajas son posiciones del viewport en el momento de la acción y se dibujan sobre la captura de la zona. **Hecho cuando, verificado con las sondas guionizadas de F1.6** (`pnpm test:sandbox`, sin gasto): top 5 = `/cart` (página: extra-steps de UX-2 + abandono) · `/register` (abandono de UX-3) · `/checkout` (backtrack de UX-1) · botón "Crear cuenta" en `/register` (form-error de UX-3). Queda como test de regresión sobre `fixtures/flaw-probes-f110.json`. Con agentes LLM no se cumple, y lo dejo dicho: el run `runs/heatmap-f110.yaml` (8 personas + baseline con la tarea del cupón, 0,22 €) solo saca UX-2 (zonas 1 y 2: el bucle carrito↔pago buscando el cupón, confirmado por sus pensamientos; nadie probó "Otras opciones"). UX-3 no se dispara porque todos rellenaron bien el registro a la primera, y UX-1 queda mezclado en ese bucle. El heatmap localiza la fricción que ocurre; que los agentes tropiecen con cada fallo es cuestión de personas y tareas (F1.11 y F2). Pendiente, sin bloquear: el oráculo de F1.9 da `unverifiable` cuando `/orders` redirige a `/login` (un comprador sin cuenta, como Lucía o Pablo), y eso debería contar como "sin pedido".

### F1.11 · Variante B manual y primer A/B — S a M (3–5 h)

- [x] En ShopLab, rama `variant/manual-b` que corrige a mano los gastos de envío ocultos y el campo de cupón
- [x] Run A/B pareado 8 personas × 2 semillas
- [x] Revisar si el informe lo detecta, y si dice "sin diferencia detectable", aceptarlo y documentar por qué

Hecho cuando: hay un informe A/B guardado y exportado a JSON.

Nota F1.11: la variante B es la rama `variant/manual-b` de janus-shoplab (subida a GitHub, no se mergea). Solo cambia el carrito: muestra la fila de envío y el total real (UX-1) y el formulario de cupón bajo "¿Tienes un cupón?" (UX-2); UX-3 queda igual como control. Antes de gastar, una sonda guionizada en sandbox (`variant-b.sandbox.test.ts`, sin gasto) confirma que el carrito de B enseña "Envío" y el cupón sin "Otras opciones", y que el oráculo ve el pedido con descuento. El informe gana `zonesByVariant` (campo opcional del esquema v1) en la CLI y la consola. Run `runs/ab-manual-b.yaml` (8 personas × 2 semillas × 2 variantes + baseline = 36 sesiones, 0,21 €; un primer intento cayó entero por infraestructura y sin gasto porque recompilé mientras corría, lo que reinició el API de `pnpm dev`). Resultado: personas a 11/16 = 69 % [44 %, 86 %], b 9/16 = 56 % [33 %, 77 %]; b − a en 16 pares = −0,13 [−0,31, 0,00] → **sin diferencia detectable**. Baseline 2/2 en ambas. Embudo idéntico hasta el pago (13/16) y 11 frente a 10 pedidos. Por qué, y lo acepto: (1) ningún objetivo de persona usa cupón, así que el arreglo de UX-2 no entra en juego; (2) los dos pares que empeoran en B no tocan lo que cambia B: Javier (semilla 1) ve en el carrito de B "el total: 24,89 € con envío de 4,99 €", compra y en su cierre dice que el envío estaba oculto y abandona (sin tareas, el éxito es la palabra del agente, y aquí es incoherente); Pablo (semilla 2) se pierde entre login y registro y agota la paciencia; (3) 16 pares dan intervalos anchos. Lo demás es de las personas, no de las variantes: Lucía abandona siempre ante el muro de login (su sesgo), Tomás agota sus 12 pasos siempre. Informe en `docs/reports/f1-11-ab.json` y run exportado en `recordings/fixtures/runs/ab-f111.json` (1,5 MB; `pnpm run:report` sobre la exportación da el mismo informe). Pendiente, sin bloquear: un A/B con tareas y oráculo (y el 307 → "sin pedido" del oráculo) mediría UX-1/UX-2 en serio; algunas personas cierran en inglés.

### F1.12 · Lienzo del enjambre (PixiJS) — L (8–12 h)

- [x] Mapa de la app: nodos = rutas visitadas, aristas = transiciones observadas
- [x] Cada agente es un punto que se mueve entre nodos; color según estado (navegando, fricción, éxito, abandono)
- [x] Pulso visual en cada `friction.signal`
- [x] Alimentado por el mismo flujo de eventos (vivo y replay); probar con 20 agentes sin bajar de 30 fps

Hecho cuando: el replay del A/B de F1.11 se ve en el lienzo a 4× de forma fluida.

Nota F1.12: dependencia nueva `pixi.js` 8.22.0 (MIT, fijada exacta, solo en la consola), aprobada; se carga con import dinámico en el navegador. El modelo es puro y testeado (`lib/swarm.ts`): nodos = rutas (`routeOf` de synthlab-report, ids numéricos plegados), aristas = transiciones con su número, cada agente en su última ruta con estado navegando / éxito / abandono; la disposición es determinista (columnas por distancia desde `/`, la columna más llena hace crecer el lienzo) y cada agente tiene un desplazamiento estable sacado de su id. Variante a = círculo, b = cuadrado, para leerlo sin color. Las señales de fricción se calculan al cerrar el run, así que un pulso sale cuando su paso ya está en pantalla y la señal se conoce: en un replay es su momento real; en vivo, cuando llega la señal. El agente queda en naranja un momento tras su pulso. `SwarmCanvas` va en `RunViewer`, el mismo componente para vivo y replay. Verificado a mano: replay sin backend del A/B de F1.11 (2.639 eventos, 37 agentes, todos dibujados en cada frame) a 4×: ~145 fps según el contador del lienzo, 13 rutas, 37 transiciones y 29 pulsos al llegar al seq 1983. El modelo recalcula todo el A/B por cada movimiento del cursor en milisegundos (test con la exportación de F1.11).

### F1.13 · Puerta G1 — S (3–4 h)

- [ ] Vídeo de 2 minutos del A/B en replay
- [x] ADRs nuevos: observation builder propio, baseline competente, diseño pareado
- [x] Borrador del artículo "Qué miden y qué no los usuarios sintéticos"
- [ ] Etiqueta `v0.2.0` y `Current step` a F2.1

Nota F1.13: ADRs 0007 (observation builder propio sobre el snapshot ARIA), 0008 (baseline competente como referencia, con la puerta del 80 % según el oráculo) y 0009 (diseño pareado, Wilson, bootstrap con semilla y regla de salida). Borrador del artículo en `docs/articles/que-miden-usuarios-sinteticos.md`, solo con cifras medidas en F1. `Current step` pasa a F2.1 en este PR. El vídeo (replay sin backend de `recordings/fixtures/runs/ab-f111.json` a 4× con el enjambre, y después el informe del run con heatmap, zonas por variante y veredicto) va como adjunto del release `v0.2.0`, no en el repo; la etiqueta se crea tras el merge.

## F2 · Variante B y auditoría estática (50–70 h)

F2 automatiza lo que en F1.11 hiciste a mano y añade la primera mitad de WarRoom: ver el código antes de atacar. Al cerrar, la Variante B nace, se mide y se audita sin intervención tuya.

### F2.1 · Puerto VCS y adaptador git local — S a M (4–6 h)

- [x] Puerto `VcsPort`: `clone(repoUrl)`, `branch(name)`, `applyPatch(diff)`, `commit(msg)`, `diffStats()`, `checkout(ref)`
- [x] `LocalGitAdapter` que trabaja en `.workspaces/<runId>/` (fuera del repo de Janus)
- [x] Convención de ramas: `janus/variant-<runId>` y `janus/fix-<findingId>`

Hecho cuando: un test de integración clona ShopLab, aplica un parche, hace commit y devuelve estadísticas del diff.

Nota F2.1: `VcsPort` (dominio) trabaja sobre un `VcsWorkspace` (`id`, `path`, `baseSha`) y añade dos operaciones a la lista: `head()` (rama y commit actuales) y `readFile()`, que necesitarán F2.2 y F2.3. `diffStats` mide contra el commit de partida, cambios confirmados o no, que es lo que hará falta para los límites del UI Engineer (5 ficheros, 200 líneas). El dominio impone las reglas antes de que git vea nada: `JanusBranch` solo admite `janus/variant-<ULID>` y `janus/fix-<ULID>`; URLs solo `https://` o `file://`; `patchPaths` rechaza parches con rutas absolutas, `..` o `.git/`. `LocalGitAdapter` usa el binario `git` (sin dependencias nuevas): clona en `.workspaces/<runId>/` con `core.autocrlf=false` (los parches aplican tal cual en Windows), aplica con `git apply --check` antes de `git apply` (todo o nada) y firma los commits como `Janus <janus@localhost>` con `-c`, sin tocar la configuración del usuario. Los ficheros de verdad oculta (`UX_FLAWS.md`) se marcan `skip-worktree` y se borran: ningún agente los lee, un parche que los toque se rechaza y ningún commit registra su borrado. Contrato compartido (`test-support/vcs-contract.ts`, 8 casos) que pasan `InMemoryVcs` (con un aplicador de diffs unificados propio) y `LocalGitAdapter` sobre un repo `file://` temporal, en `pnpm test`. Verificado: el test de integración clona ShopLab desde GitHub, crea `janus/variant-<runId>`, cambia una línea del carrito, hace commit y obtiene 1 fichero, +1/−1; y a mano, `git status` limpio en el workspace, sin `UX_FLAWS.md` en disco ni en el commit.

### F2.2 · Localizar el código de la fricción — M (6–8 h)

- [x] De cada zona de fricción top tomar: ruta, textos visibles, `aria-label`, selector resuelto
- [x] Buscar esos textos en el repo objetivo (ripgrep) y mapear ruta → fichero de página según las convenciones de Next.js
- [x] Ordenar ficheros candidatos por coincidencias y devolver un contexto compacto (fragmentos, no ficheros enteros)
- [x] Tope de tamaño del contexto y medición en tokens
- [x] El contexto nunca incluye `UX_FLAWS.md` (la búsqueda la excluye explícitamente)

Hecho cuando: para cada fallo de `UX_FLAWS.md`, el fichero real aparece entre los 3 primeros candidatos.

Nota F2.2: los eventos no guardaban los textos visibles, así que `agent.step` gana `texts` (opcional, hasta 40): encabezados, prosa (celdas sueltas) y nombres accesibles de los controles, calculados por el observation builder (`Observation.texts`). `LocateFrictionCode` (aplicación, sin LLM) va de una zona al código: `zoneHints` saca la ruta, el elemento (rol, nombre accesible y selector) y los textos y avisos de los pasos de sus sesiones en esa ruta, sin los textos que aparecen en la mitad o más de las rutas del run (cabecera y menú); `rankCandidates` puntúa la página de la ruta según las convenciones del app router de Next.js (+5, también segmentos dinámicos, catch-all y grupos), los componentes que importa directamente (+2), el nombre del elemento (+3) y cada texto o aviso de la zona (+1), con sus motivos; `buildContext` da fragmentos numerados (±3 líneas, unidos al solaparse, y los imports de la página) hasta 6.000 tokens estimados, y dice qué dejó fuera. La búsqueda es en Node sobre `VcsPort.listFiles` (nuevo, con su caso de contrato; nunca lista ficheros ocultos), no ripgrep: el repo es pequeño y así no hay otro binario del que depender. Solo se busca en código (`.ts/.tsx/.js/.jsx`), nunca en tests, documentos, `node_modules` ni código generado, y nada con `ux_flaws` en el nombre. `application/` puede usar `@janus/synthlab-report` (enmienda de ADR 0001). La fixture de las sondas (`flaw-probes-f110.json`) se ha regenerado en sandbox para que traiga `texts`; sus 3 fallos siguen en el top 5. Verificado con ShopLab real (`locate-friction-code.integration.test.ts`): UX-1 (zona `/checkout`) → `totals-table.tsx` 2.º (la página de pago es 1.ª; el carrito, que es donde se oculta el envío, no entra en el top 3); UX-2 (zona `/cart`) → `cart/page.tsx` 1.º; UX-3 (botón "Crear cuenta" en `/register`) → `register/page.tsx` 1.º (`json-form.tsx` queda 4.º, por detrás del layout, que también tiene un enlace "Crear cuenta"). Contextos de 958 a 2.355 tokens, sin rastro de `UX_FLAWS.md`.

### F2.3 · Agente UI Engineer — L (10–14 h)

Sub-entrega A: generación con límites

- [x] Rol `ui-engineer`; entrada = zona de fricción + evidencia (capturas, señales) + contexto de F2.2
- [x] Herramienta `edit_file` con lista blanca de rutas (solo componentes y páginas de frontend)
- [x] Límites duros: máximo 5 ficheros, 200 líneas cambiadas, sin tocar `package.json`, auth ni API

Sub-entrega B: verificación

- [x] Ejecutar lint, typecheck y tests de ShopLab en un contenedor efímero
- [x] Si fallan, un reintento con el error como contexto; si vuelve a fallar, se descarta y se emite `verification.result` negativo
- [x] Eventos `patch.proposed` (con diff) y `verification.result`

Hecho cuando: para 2 de los 3 fallos sembrados genera una Variante B que compila y pasa los tests.

Nota F2.3-A (sub-entrega A, su propio PR): `GenerateVariantPatch` hace un intento del UI Engineer sobre una zona: localiza el código (F2.2), deja editar al agente y convierte sus ediciones en un parche (generador de diffs unificados propio, probado contra `git apply`) que aplica con `VcsPort.applyPatch` en `janus/variant-<runId>`; graba `patch.proposed`. El agente (`UiEngineerAgent`, rol `ui-engineer`) solo tiene tres herramientas en lista cerrada (`read_file`, `edit_file` con reemplazo exacto de un texto que aparezca una sola vez, `done`) y como mucho 12 turnos; las ediciones viven en memoria hasta el final. Todas las reglas las aplica código: `EditPolicy` con la lista blanca de `docker/sandboxes/shoplab.yaml` (`uiEngineer.allow`: páginas, CSS y componentes; `deny`: `src/app/api/**`), y además siempre prohíbe manifiestos, lockfiles, ficheros `.env` y la verdad oculta; `src/lib` (negocio y auth) queda fuera por no estar permitido. Tras aplicar, `diffStats` contra la base debe dar como mucho 5 ficheros y 200 líneas cambiadas, o el parche se deshace. La parte estable del prompt (reglas, fricción medida, candidatos y contexto de F2.2) es el prefijo cacheado e idéntico en todos los turnos; la captura de la zona va como bloque de imagen (nuevo en el gateway) en el primer mensaje. Los pensamientos de las personas no se le pasan (opinión de un LLM, no evidencia). Tests sin API con un gateway guionizado: parche correcto en la rama y su evento; ediciones a `package.json`, `src/lib` y la API rechazadas, y nada de `UX_FLAWS.md` en ninguna petición; texto ambiguo devuelto como error; más de 5 ficheros rechazado y deshecho; tope de turnos. La verificación (lint, typecheck, tests en contenedor, un reintento) y el "Hecho cuando" son la sub-entrega B.

Nota F2.3-B: `BuildChecksPort` con `DockerBuildChecks`: construye la imagen `checks.target` de `docker/sandboxes/shoplab.yaml` (la `tools` de ShopLab) desde el workspace por el socket proxy, ejecuta `pnpm lint && pnpm typecheck && pnpm test` con `--network none` y borra la imagen; un fallo de las comprobaciones es un resultado (con el final de la salida), no una excepción. Contrato compartido con un fake (`ScriptedBuildChecks`) en `pnpm test`, y con Docker y ShopLab reales en `pnpm test:sandbox` (pasa tal como se clona; un parche con un error de tipos lo rompe). `ProposeVariant`: intento del UI Engineer → comprobaciones → `verification.result` (`build-checks`) → commit en `janus/variant-<runId>` si pasan; si no, deshace el parche y reintenta una vez con el diff anterior y la salida de las comprobaciones (recortada a 4.000 caracteres); un segundo fallo descarta. `pnpm run:ui-engineer <runId|file> --zone <rank> [--max-eur] [--record <dir>]` hace todo eso sobre una zona de un run grabado, en un run nuevo del event store (su coste sale en la consola). Las sondas de F1.6 guardan ahora sus capturas en `.artifacts/` al escribir la fixture, para que el agente reciba la de cada zona. **Hecho cuando, verificado con la API real** (Sonnet, 0,11 € en total): **3 de 3** variantes compilan y pasan lint, typecheck y tests al primer intento. UX-2 (zona `/cart`): quita el envoltorio "Otras opciones" y deja el formulario de cupón a la vista (+10 −13, 0,035 €). UX-3 (botón "Crear cuenta"): quita `resetOnError` del formulario de registro para que no borre los campos (+1 −1, 0,022 €). UX-1 (zona `/checkout`): añade al pago un resumen del pedido y un enlace "Modificar el carrito" (+22, 0,054 €); compila y pasa, pero ataca otra causa plausible de las vueltas atrás, no el envío oculto en el carrito, que es el fallo sembrado: la zona apunta al pago y el carrito no estaba entre sus candidatos (F2.2). Que un parche arregle la fricción lo medirá SynthLab en F2.4, no las comprobaciones. Las respuestas grabadas, las capturas y los diffs esperados están en `recordings/fixtures/ui-engineer/`; `ui-engineer.replay.integration.test.ts` reproduce los tres parches exactos sin llamar a la API.

### F2.4 · A/B automático — S a M (4–6 h)

- [x] Caso de uso `GenerateAndCompareVariant`: SynthLab A → localizar → UI Engineer → construir imagen B → SynthLab B (pareado) → informe
- [x] Reutiliza todo lo de F1 sin duplicar lógica

Hecho cuando: un único comando produce el informe A/B con una Variante B generada.

Nota F2.4: el diseño pareado compara A y B dentro de un mismo run, y B no existe hasta que SynthLab ha visto A; por eso `GenerateAndCompareVariant` encadena dos runs normales de F1: descubrimiento (solo A, con las personas, semillas y tareas del fichero de run; o uno ya hecho con `--from <runId>`), el UI Engineer sobre las N zonas más intensas (2 por defecto) con `ProposeVariant` en un único workspace y una única rama `janus/variant-<runId>` (los límites de 5 ficheros y 200 líneas cuentan para la variante entera), y un run pareado A = `main` / B = esa rama. Sin parche verificado no hay A/B. B se construye desde el clon local: una variante admite `repo` (`file://`), que el cuerpo de `POST /runs`, el dominio y el sandbox validan, y el sandbox solo acepta dentro de `.workspaces/` (`assertLocalRepo`); nada se sube a GitHub. Puerto nuevo `SynthLabPort.runAndWait` con `HttpSynthLab` (POST /runs al API de `pnpm dev` y espera a `run.completed` en el event store) y un adaptador en proceso para tests; el contrato lo pasan los dos, el HTTP contra la app levantada en un puerto local. `VcsWorkspace` gana `url` (`file://`) para no usar `node:url` en la capa de aplicación. `pnpm run:ab-auto <runs/x.yaml> [--zones] [--from] [--engineer-eur]` no recompila (como `run:start`) e imprime y guarda el informe en `docs/reports/ab-auto-<runId>.json`. **Hecho cuando, verificado con la API real** (`runs/ab-auto.yaml`: 8 personas × 1 semilla con la tarea del cupón; 0,59 € en total: descubrimiento 0,22 €, UI Engineer 0,09 €, A/B 0,28 €): el UI Engineer arregló las dos zonas más intensas del descubrimiento al primer intento (`/cart`: el formulario de cupón a la vista, +10 −13; `/checkout`: los botones de método de pago junto a su texto y algo de espacio, +19 −1 en la página y `globals.css`, una causa que el propio agente reconoce que supone), y el A/B pareado dice **B más alta**: personas a 1/6 = 17 % [3 %, 56 %], b 5/7 = 71 % [36 %, 92 %], b − a en 6 pares = +0,50 [+0,17, +0,83]; embudo a 6 → 1 pedido, b 7 → 5; la zona `/cart` baja de intensidad 18 a 7. Lectura honesta: la tarea es usar un cupón, así que el arreglo del cupón es justo lo que se mide; son 6 pares (Lucía y Pablo vuelven a quedar fuera por el 307 del oráculo, pendiente desde F1.10) y es éxito sintético de la tarea, no conversión.

### F2.5 · Adaptadores de análisis estático — M (8–10 h)

- [x] Puerto `StaticAnalysisPort.run(repoPath) → Finding[]`
- [x] Semgrep (imagen Docker oficial, salida JSON, reglas OWASP + `rules/` propias)
- [x] gitleaks con el valor del secreto eliminado antes de emitir el hallazgo
- [x] osv-scanner sobre el lockfile
- [x] dependency-cruiser con reglas de arquitectura definidas para ShopLab
- [x] Normalización a `Finding { kind: 'static', tool, rule, severity, file, line, snippet≤ 5 líneas }`

Hecho cuando: el XSS y el precio manipulable sembrados aparecen como hallazgos de Semgrep (con regla propia si hace falta).

Nota F2.5 (ADR 0010): ShopLab no tiene fallos de seguridad sembrados (ADR 0006), así que el "Hecho cuando" se verifica sobre OWASP Juice Shop v20.3.0, el objetivo de seguridad, con sus dos fallos públicos equivalentes. `StaticAnalysisPort.run(workspace) → StaticFinding[]` con cuatro adaptadores; cada herramienta corre desde una imagen fijada en un contenedor desechable (`docker create` + `docker cp` del workspace + `start --attach` + borrado; `DockerCli` solo deja copiar hacia un contenedor `janus-tool-*`, nunca hacia el host): Semgrep 1.180.0 y gitleaks v8.30.1 sin red; osv-scanner v2.6.0 con red, solo para consultar osv.dev con nombres y versiones; dependency-cruiser dentro del proceso con `config/arch/shoplab.depcruise.cjs` (ShopLab: 0 violaciones, con los alias `@/` resueltos). Semgrep usa reglas propias en `rules/semgrep/` (sumideros de XSS en Angular, DOM y React; cantidades o precios comprobados solo contra un tope superior), cada una con sus casos `semgrep --test`; los paquetes del registro necesitarían red y su licencia limita redistribuirlos. Los fragmentos salen del workspace (Semgrep OSS no los imprime) y nunca pasan de 5 líneas; gitleaks nunca emite el secreto (se descartan `Secret`/`Match` y el valor se sustituye por `[REDACTED]`). `RunStaticAnalysis` ejecuta las herramientas y registra cada hallazgo como `finding.created` `suspected`. `VcsPort.clone` admite `depth` (clon superficial). Las salidas JSON reales de cada herramienta sobre un repo de ejemplo sintético son fixtures de los normalizadores (`pnpm test`); las herramientas reales pasan el contrato en `pnpm test:sandbox`. **Hecho cuando:** sobre Juice Shop v20.3.0, Semgrep da 13 hallazgos, entre ellos el DOM XSS del buscador (`frontend/src/app/search-result/search-result.component.ts:146`, `bypassSecurityTrustHtml(queryParam)`) y la manipulación de precio con cantidades negativas (`routes/basketItems.ts:94` y `:95`, solo se compara con el tope); los otros 11 también son XSS conocidos de Juice Shop. Hallazgo para pasos posteriores: Juice Shop lleva su verdad oculta en el propio código (comentarios `vuln-code-snippet` en 12 ficheros y 160 soluciones en `data/static/codefixes/`); hay que quitarla antes de que un agente lea su código. Arreglado de paso: un byte nulo literal en `LocalGitAdapter.listFiles` (F2.2), ahora `'�'`.

### F2.6 · Mapa de superficie de ataque — L (10–14 h)

Sub-entrega A: rutas y handlers

- [x] Consultas tree-sitter (TypeScript) para encontrar route handlers de Next.js (`app/**/route.ts`, server actions)
- [x] Extraer método, ruta, parámetros y fichero

Sub-entrega B: comprobaciones

- [x] Detectar llamadas a la sesión o al middleware de auth en cada handler
- [x] Heurística de comprobación de propietario: consultas que filtran por el id del usuario de sesión
- [x] Salida JSON compacta: `{ route, method, auth: bool, ownerCheck: bool|unknown, params }`
- [x] Tests con fixtures de handlers correctos e incorrectos

Hecho cuando: `/api/orders/:id` aparece con `auth: true, ownerCheck: false`.

Nota F2.6-A (sub-entrega A, su propio PR): en lugar de tree-sitter, el parser del compilador de TypeScript (`typescript`, ya en el repo, ahora también dependencia del orquestador): sin dependencias nuevas, lee TS y JS y permite seguir imports entre ficheros. `AttackSurfacePort.map(workspace) → Endpoint[]` (`route`, `method`, `declaredAt`, `handler`, `params`) con `TypeScriptAttackSurface` y dos extractores, según `config/surface.yaml`: Next.js (los `route.ts` del app router y sus exports por método HTTP, segmentos `[id]` → `:id`, catch-all y grupos; server actions de ficheros `'use server'` como `action:<fichero>#<nombre>`) y Express, porque el objetivo de seguridad es Juice Shop (ADR 0006): `x.get|post|put|patch|delete|all('/ruta', ...)` y `x.route('/ruta').get(...)` en los ficheros que se configuran, siguiendo el handler a través de envoltorios (`asyncHandler(fn)`), factorías (`fn()` → la función que devuelve) e imports con nombre o de espacio de nombres; los `app.use(prefijo, ...)` se guardan para la comprobación de auth de F2.6-B. Los parámetros son los de la ruta más las claves del cuerpo y la query que lee el handler. Se omiten dependencias, builds, la app de navegador (`frontend/`), tests y `codefixes/`. `pnpm run:surface <target> [--ref] [--json]` clona en superficial a un workspace temporal, imprime el mapa y lo borra. Contrato con proyectos de ejemplo en `fixtures/surface/` (`pnpm test`). Verificado: ShopLab, 12 endpoints en sus 10 `route.ts`, con `GET /api/orders/:id`; Juice Shop v20.3.0, 113 endpoints con 112 handlers resueltos (`GET /rest/basket/:id` → `routes/basket.ts`); 26 de ellos son registros con solo un middleware de auth delante de las rutas que genera finale-rest, y F2.6-B los tratará como tales.

Nota F2.6-B: cada endpoint gana `auth` y `ownerCheck`. Reglas por objetivo en `config/surface.yaml` (`authCalls`, `authMiddleware`, `sessionCalls`, `sessionIds`, `ignoreCalls`). Auth: en Next.js, el handler llama a una función que exige sesión (`requireUser`); en Express, un middleware de auth en la ruta, un `app.use(prefijo, ...)` con auth declarado antes y que cubre la ruta (uno declarado después no cuenta, como en Express), o un handler que lee la sesión y decide con un `if` sobre ella. Las rutas que solo registran un middleware de auth delante de las que genera una librería (finale-rest en Juice Shop) quedan con `auth: true`, sin handler y `ownerCheck: 'unknown'`. `ownerCheck` (heurística): `true` si una llamada de acceso a datos (find…, get…, update…, query…) recibe algo del usuario de la sesión (una propiedad suya, un valor calculado a partir de ella siguiendo variables intermedias, o `req.body.UserId` que pone `appendUserId`); `false` si recibe un parámetro de la ruta y nada de la sesión; `'unknown'` en el resto. Las llamadas de `ignoreCalls` no cuentan (en Juice Shop, `challengeUtils.solveIf` lee el usuario solo para marcar retos). `ownerCheck: false` es una pista de IDOR, nunca un hallazgo confirmado. **Hecho cuando** (ShopLab no tiene fallos de seguridad sembrados, ADR 0006): en Juice Shop v20.3.0, `GET /rest/basket/:id` sale con `auth: true, ownerCheck: false` (el reto "View Basket"); el control de ShopLab, `GET /api/orders/:id`, sale con `auth: true, ownerCheck: true` (`findOrderForUser(db(), user.id, id)`). En Juice Shop, 5 endpoints quedan con `auth: true, ownerCheck: false`: tres IDOR conocidos (`/rest/basket/:id`, `PUT /api/BasketItems/:id`, el cupón aplicado a cualquier cesta) y dos falsos positivos explicables (`PUT /rest/order-history/:id/delivery-status`, protegido por rol de contabilidad, y las reseñas de producto, que no son de ningún usuario); ShopLab, ninguno. Tests con fixtures de handlers correctos e incorrectos para los dos frameworks (`pnpm test`) y el "Hecho cuando" contra los repos reales (`pnpm test:sandbox`).

### F2.7 · Auditoría diferencial — S (3–4 h)

- [x] Ejecutar F2.5 y F2.6 sobre A y sobre B
- [x] Informe solo de lo que **introduce** B (hallazgos nuevos, endpoints nuevos sin auth)
- [x] Regla de puerta: si B introduce un hallazgo alto o crítico, B queda bloqueada

Hecho cuando: una Variante B con un fallo inyectado a propósito queda bloqueada.

Nota F2.7: `AuditVariantDiff` clona A y B (B puede venir de un clon local `file://`) y ejecuta en los dos el análisis estático de F2.5 (Semgrep, gitleaks, dependency-cruiser; osv-scanner con `--osv`, porque necesita red y B casi nunca cambia el lockfile) y el mapa de superficie de F2.6. Solo cuenta lo que introduce B: los hallazgos se identifican por herramienta, regla, fichero y el código del fragmento (no por línea, para que el código que solo se mueve no parezca nuevo) y se cuentan como multiconjunto; en los endpoints, uno nuevo sin auth es medium (se informa, no bloquea), perder la auth es high y una pista de IDOR nueva (endpoint nuevo con sesión y sin comprobación de propietario, o un `ownerCheck` que pasa de `true` a `false`) es high; los cambios desde o hacia `'unknown'` no cuentan. Regla de puerta: B queda bloqueada si introduce algo high o critical, con un motivo por línea. Cada cosa introducida se registra como `finding.created` (`suspected`) y el veredicto como el evento nuevo `audit.completed` (base y variante con su sha, recuentos, `blocked`, motivos), con su esquema en shared-kernel y su línea en la consola. `pnpm run:audit-diff <target> --a <ref> --b <ref> [--b-repo <file://clon>] [--osv]` imprime lo introducido y el veredicto, sale con 1 si B queda bloqueada y borra sus clones. **Hecho cuando** (sandbox, con las herramientas reales sobre ShopLab): una B con un fallo inyectado a propósito (`GET /api/orders/[id]/invoice`, que exige sesión pero lee el pedido solo por su id) queda **bloqueada** por la pista de IDOR nueva (high); la B inocua del arreglo del cupón de F2.3 no introduce nada y pasa; y a mano, la variante que generó el A/B automático de F2.4 también pasa. Conectar la auditoría al A/B automático queda para cuando se decida dónde vive la puerta completa. El contrato de `VcsPort` sube a 20 s de límite: con turbo en paralelo, los clones reales a veces pasaban de 5 s.

### F2.8 · Consola: diff y hallazgos — M (5–7 h)

- [x] Vista del diff de la Variante B junto al A/B
- [x] Lista de hallazgos estáticos filtrable por herramienta y severidad
- [x] Vista del mapa de superficie como tabla
- [x] Etiqueta `v0.3.0` y `Current step` a F3.1

Nota F2.8: dos páginas nuevas en la consola, que leen los eventos del run (el mismo flujo `?replay=1` del replay) y los convierten en filas con funciones puras de `lib/` con sus tests. **`/runs/<id>/variant`** muestra los parches del UI Engineer con el diff coloreado por líneas y números de línea, sus `verification.result` y el resumen del agente, marcado como texto del agente y no como evidencia (`patch.proposed` gana el campo opcional `summary`; los runs anteriores no lo tienen). **`/runs/<id>/security`** muestra el veredicto de la auditoría diferencial con sus motivos, los hallazgos filtrables por herramienta y severidad (`finding.created` gana `tool`, `rule`, `file` y `line`, opcionales) y el mapa de superficie como tabla, con A y B en pestañas, filtros por sesión y propietario y las pistas de IDOR primero y resaltadas. Para eso la auditoría registra un evento nuevo, `surface.mapped`, por lado. El informe A/B enlaza el diff cuando B es una rama `janus/variant-<runId>`: `run.started` registra ahora las variantes (`key`, `ref`, `repo`), así que solo funciona en runs nuevos; está cubierto por tests. La página del run enlaza "Variante B" y "Seguridad" solo cuando tiene sus datos. **Hecho cuando**, comprobado en el navegador: el diff del run del UI Engineer `01M6VCWFPZ9D0E17ZSRQCN63NQ` (cupón, `build-checks` en verde) y la auditoría `01M6WD3T8R22GERT0HX1ZSPRK3` de ShopLab `main` contra una rama local con `GET /api/orders/[id]/invoice` inyectado: B bloqueada, 1 hallazgo `surface-map/new-idor-lead` (high), A con 12 endpoints y 0 pistas, B con 13 y la pista primero. Sin gasto de API. La etiqueta `v0.3.0` se crea tras el merge y cierra F2.

## F3 · Red Team, Blue Team y gate (95–135 h)

F3 cierra el ciclo completo. La regla que lo sostiene todo: el éxito de un ataque lo decide un **oráculo determinista** (por ejemplo, el valor canario del usuario A aparece en la respuesta del usuario B), nunca la opinión del LLM.

> **Replanificado al cerrar F2 (ADR 0006):** el objetivo de seguridad es OWASP Juice Shop v20.3.0, sin modificar, en el sandbox; ShopLab sigue siendo el objetivo de UX. Las cuatro vulnerabilidades de referencia son reales de Juice Shop: **IDOR** en `GET /rest/basket/:id`, **bypass de login** por inyección SQL en `/rest/user/login`, **DOM XSS** en la búsqueda y **cantidad negativa** en la cesta; la **carrera** de "Multiple Likes" queda como extra. Juice Shop expone su propia verdad (`/api/Challenges`, `/api/Hints`, `/snippets/**`): ningún agente la ve (queda fuera del alcance) y solo el orquestador la lee para validar oráculos y medir el benchmark. SynthLab necesita Juice Shop para que el Blue Team pueda medir el coste en UX (paso nuevo F3.5a).

### F3.1 · Alcance y verificación de propiedad — M (8–10 h)

- [x] Entidad `ScopePolicy` en dominio: hosts permitidos, rutas excluidas, tipos de prueba permitidos, límite de peticiones por segundo
- [x] Verificación de propiedad con token en `/.well-known/janus-verify.txt`, aplicada también al sandbox (así el flujo existe desde el principio)
- [x] `NetworkGuard` en los adaptadores HTTP y de navegador: toda petición fuera de alcance se bloquea y emite un evento
- [x] Sandbox de Juice Shop desde su imagen fijada por digest; el token de cada run se copia al contenedor y las rutas de su verdad (`/api/Challenges`, `/api/Hints`, `/snippets/**`) quedan excluidas
- [x] Tests: petición a host no verificado bloqueada; ruta excluida bloqueada

Hecho cuando: ningún módulo ofensivo arranca sin `ScopePolicy` verificada.

Nota F3.1: en dominio, `ScopePolicy` (orígenes exactos, rutas excluidas con `*` y `/**`, tipos de prueba, peticiones por segundo), `NetworkGuard` y `VerifiedScope`. El guard decide cada petición: origen fuera del alcance, ruta excluida (comparada como la enrutaría el objetivo: decodificada, sin `..` ni barras repetidas y sin distinguir mayúsculas, porque Express no las distingue y `/API/challenges` devuelve la verdad de Juice Shop), prueba no permitida, prueba ofensiva sin verificar y ritmo. `VerifiedScope` solo se crea con `VerifiedScope.verify()`, que exige el token del run en todos los orígenes; los módulos ofensivos de F3.2 en adelante lo pedirán en su firma, y el guard bloquea toda prueba ofensiva (`not-verified`) sin él. `VerifyOwnership` genera un token por run, lo coloca (`OwnershipTokenPort`; `DockerSandbox` lo copia con `docker cp`, y `DockerCli` solo permite copiar ese fichero a esa ruta del contenedor de la app), lo lee a través del guard sin seguir redirecciones y registra `scope.verified` sin el token. Cada petición bloqueada emite `scope.blocked` (método, origen y ruta; nunca query ni cuerpo), con su línea en la consola. El navegador de SynthLab usa un guard de solo navegación para el origen de la variante, en lugar de la comprobación de origen que tenía, y sus bloqueos llegan por la telemetría. Clientes HTTP: `FetchScopedHttp` para objetivos fuera del sandbox y `PlaywrightScopedHttp` para los de dentro, porque el orquestador no tiene ruta a `janus-sbx` (red interna) y las peticiones salen del servidor de Playwright que vive allí. `config/scopes.yaml` da a ShopLab solo `browse` y `http-probe`, y a Juice Shop las clases de F3.3 con su verdad excluida. `docker/sandboxes/juice-shop.yaml` es un tipo nuevo de definición: la imagen publicada, sin modificar y fijada por digest; como es distroless y no tiene healthcheck ni shell, está lista cuando escribe su línea "Server listening on port 3000". **Hecho cuando**, comprobado a mano con `pnpm run:scope juice-shop` (run `01M6WFDK1N2FSN2XE48E0YCJMQ`): antes de verificar, `GET /rest/basket/1` como `idor` queda bloqueado (`not-verified`); tras verificar, la misma petición llega (401 sin sesión), `/` responde 200, `/api/Challenges` y `/API/challenges` quedan bloqueados (`excluded-path`), `example.com` también (`out-of-scope-origin`) y `scanner` no está permitido; el sandbox se borra al terminar. `pnpm test:sandbox` repite esto contra la imagen real y pasa el contrato del navegador en ShopLab con el bloqueo nuevo. Sin gasto de API.

### F3.2 · Herramientas de ataque — M (8–10 h)

- [x] Cliente HTTP con sesiones por usuario de prueba (login como A y como B)
- [x] Harness de carrera: N peticiones idénticas lanzadas a la vez por código, con resultado agregado
- [x] Oráculos: `canaryLeak(userA, response)` (cesta de A vista por B), `authenticatedAs(token, user)` (sesión sin su contraseña), `scriptExecuted(page)` (marcador inyectado), `priceMismatch(order)` (total negativo o que no cuadra) y `duplicateEffect` (la carrera)

Hecho cuando: cada oráculo detecta su vulnerabilidad de Juice Shop ejecutando el exploit a mano desde un test, y su veredicto coincide con el reto "resuelto" del propio Juice Shop (leído solo por el orquestador).

Nota F3.2: Nuclei y ZAP salieron del paso (quedan como opcionales en F3.11): son dependencias pesadas y sus rastreadores no respetan el guard, así que leerían la verdad de Juice Shop. **Usuarios de prueba:** `TestUserPort` registra cuentas sintéticas por run (`janus-<rol>-<ulid>@janus.test`, contraseña aleatoria que no se registra en ningún evento) y las conecta; `asSession` envía cada petición del cliente con guard como ese usuario. **Carrera:** `race()` lanza N peticiones idénticas a la vez (2 a 50) y agrega estados, cuerpos distintos, bloqueos y fallos; cada petición pasa el guard como `race`, así que nunca supera el ritmo del alcance. Para que los flujos secuenciales no choquen con ese ritmo, las peticiones normales esperan hueco en la ventana (hasta 2 s) en lugar de fallar; las de carrera no esperan nunca. **Oráculos** (funciones puras en `domain/oracles`, con su caso positivo, negativo y falso positivo típico): `canaryLeak` (B recibe un registro de A con un canario de A; una cesta vacía de otro no es fuga), `authenticatedAs` (se abre la sesión de una cuenta cuyas credenciales no se presentaron; la evidencia nunca lleva la contraseña), `scriptExecuted` (un diálogo con el marcador único del run; el navegador ahora registra y cierra los diálogos en su telemetría), `priceMismatch` (total negativo, cantidad no positiva o total que no cuadra con precio × cantidad + envío − descuento) y `duplicateEffect` (el mismo actor más veces de las permitidas). La verdad de Juice Shop la lee `JuiceShopChallenges`, solo desde el orquestador y con su propio guard; ningún agente la recibe. **Hecho cuando**, en `pnpm test:sandbox` contra la imagen real (3 ejecuciones seguidas en verde): con el alcance verificado de F3.1, cada exploit hecho a mano da `exploitable` y Juice Shop marca su reto como resuelto (`basketAccessChallenge`, `loginAdminChallenge`, `localXssChallenge`, `negativeOrderChallenge`, `timingAttackChallenge`); cada control (B leyendo su cesta, un login correcto, una búsqueda normal, un pedido honrado, un solo like) da `no explotable` y deja el reto sin resolver. El XSS lleva la carga canónica de Juice Shop y otra con nuestro marcador, cada iframe cerrado (sin cerrar, el segundo era texto de reserva del primero y no se ejecutaba). Sin gasto de API.

### F3.3 · Motor Red Team — L (14–20 h)

> **Replanteado ([ADR 0011](adr/0011-attacks-generated-by-code.md)):** el proveedor rechaza un agente LLM que busca y explota vulnerabilidades (run `01M6WHCQ…`, categoría `cyber`, 0,013 €). En lugar de disimular el prompt, los ataques los **genera el código**: un motor determinista arma los intentos a partir del mapa de superficie, los hallazgos estáticos y lo que el navegador encuentra al recorrer la app. Los oráculos deciden el éxito, como en F3.2. El agente LLM queda en el código tras un interruptor apagado por defecto (`--engine agent`), solo para una cuenta autorizada. Los límites, los eventos y los hallazgos del agente se reutilizan tal cual.

Sub-entrega A (F3.3a): motor de IDOR y bypass de login, más el registro

- [x] Motor determinista; entrada = mapa de superficie + hallazgos estáticos + usuarios de prueba; sin LLM en los ataques
- [x] Generador por clase: candidatos deterministas → petición guardada → oráculo → conclusión
- [x] Límite de intentos por endpoint y por run
- [x] Cada intento emite `attack.attempt`; cada éxito confirmado por su oráculo, `finding.created` `dynamic` `suspected` con la evidencia (`attack.verdict`)
- [x] Banco de ataque compartido: el motor y el agente (apagado) producen los mismos eventos, veredictos y hallazgos

Sub-entrega B (F3.3b): motor de XSS y lógica de negocio

- [x] XSS verificado inyectando en los campos y parámetros que el navegador encuentra, con el marcador del run (`scriptExecuted`)
- [x] Cantidad negativa en la cesta y la carrera de likes con el harness de carrera (`priceMismatch`, `duplicateEffect`)

Hecho cuando: el motor encuentra al menos 3 de las 4 vulnerabilidades de referencia de Juice Shop (IDOR, bypass de login, XSS, cantidad negativa) en 3 ejecuciones seguidas, sin tocar la API; y el código no lleva datos concretos de Juice Shop (rutas, ids) fuera de sus adaptadores.

Nota F3.3b: el motor tiene una estrategia por clase y todas registran lo mismo a través del banco, que ahora tiene `record` (anotar un intento que no es una petición HTTP: una visita del navegador o el paso que lleva un flujo) y `conclude` (registrar el veredicto de un oráculo y, si es explotable, el hallazgo). **XSS:** un puerto propio, `BrowserAttackPort`, separado del `BrowserPort` de SynthLab para no tocar su contrato ni sus grabaciones. Su adaptador de Playwright (`PlaywrightBrowserAttack`) carga la portada, cierra los avisos de primera visita (en dos pasadas, porque un modal oculta el resto de la página al árbol de accesibilidad hasta que termina de cerrarse), revela la búsqueda, escribe una sonda inocua en cada campo de texto y pulsa Enter: un campo cuya sonda vuelve en la URL es un punto de inyección. Así encontró solo `/#/search?q={payload}`, sin que nadie le diera la ruta. Cada visita va en un contexto nuevo con un guard atado al origen del objetivo y registra y cierra los diálogos; las cargas son vectores clásicos de alert, uno con el texto convencional `xss` y otro con el marcador del run, que es lo único que mira `scriptExecuted`. Para una SPA la página está en el hash, así que los intentos y los límites cortan solo la query (`?`), no el `#`. **Lógica de negocio:** `BusinessLogicPort` con el adaptador `JuiceShopBusinessLogic` (lo único que sabe de Juice Shop): un pedido con cada cantidad fuera de rango (`-1, 0, -100`, solo si el mapa de superficie muestra una cantidad que el objetivo escribe), juzgado por `priceMismatch`; y un efecto de una vez por usuario (el like de una reseña) que el motor lanza con el harness de carrera de F3.2 tras una ventana de ritmo vacía, juzgado por `duplicateEffect`. La carrera sigue en la capa de aplicación. **Hecho cuando**, verificado: `pnpm test:sandbox` corre el motor contra la imagen real y confirma IDOR, bypass de login, XSS, pedido negativo y like en carrera, cada uno por su oráculo, con los cinco retos de Juice Shop (`basketAccessChallenge`, `loginAdminChallenge`, `localXssChallenge`, `negativeOrderChallenge`, `timingAttackChallenge`) pasando de sin resolver a resueltos y sin ninguna `llm.call`; el contrato del navegador pasa con el falso y con el real. A mano, 3 ejecuciones seguidas de `pnpm run:red-team juice-shop` confirmaron las cuatro clases y la carrera en 24 intentos cada una, a 0 €. Arreglado por el camino: el contrato "nunca sale del origen" falló de verdad, porque `visit` derivaba su guard de la URL que visitaba; ahora recibe el origen del objetivo.

Nota F3.3a: el intento con agente se paró en la primera llamada por el filtro del proveedor (0,013 €, [ADR 0011](adr/0011-attacks-generated-by-code.md)). El motor determinista arma los candidatos con funciones puras en `domain/attack`: para IDOR, los endpoints con sesión, sin comprobación de propietario (o desconocida) y con un id en la ruta, pidiendo como B su propio id y los vecinos (los ids son consecutivos, como en un IDOR real); para el bypass, los endpoints de login (POST con `email`/`password` en el cuerpo) con una lista fija y corta de cargas de inyección SQL. El banco (`AttackBench`) envía cada intento por el cliente con guard (F3.1), registra `attack.attempt` y lo juzga con su oráculo (`canaryLeak`, `authenticatedAs`), registrando `attack.verdict` y, solo si es explotable, `finding.created`. Nunca registra cuerpos, tokens ni contraseñas. El agente LLM queda tras `--engine agent`, apagado. **Hecho cuando** (F3.3a), verificado con `pnpm run:red-team juice-shop` (0 € de API): encuentra el IDOR de la cesta y el bypass de login, cada uno confirmado por su oráculo, en 3 ejecuciones seguidas.

### F3.4 · Artefactos PoC — S a M (5–7 h)

- [x] Cada hallazgo guarda un PoC reproducible: el intento registrado (método, ruta, cuerpo, como quién) más su oráculo. Como el motor es determinista ([ADR 0011](adr/0011-attacks-generated-by-code.md)), el intento ya es el PoC.
- [x] `PocRunner` determinista que lo reejecuta sin LLM y devuelve `exploitable: bool`
- [x] Regla en dominio: un `Finding` dinámico sin PoC no puede pasar a estado `confirmed`

Hecho cuando: los PoC de F3.3 pasan en un CI separado contra el sandbox de Juice Shop sin tocar la API de Anthropic.

Nota F3.4: un intento no se puede repetir tal cual en otro run, porque los usuarios y los ids cambian; el PoC guarda la **relación**, nunca los ids del run ni secretos (esquema `proofOfConceptSchema` en shared-kernel): el IDOR, la ruta y qué objeto de la víctima rellena el id; el bypass, la ruta y el cuerpo (la carga y una contraseña de relleno); el XSS, la plantilla relativa al origen y qué carga, que se construye con el marcador del run nuevo; los flujos, su único parámetro (la cantidad, el tamaño de la carrera). Las jugadas de ataque (`attack-moves.ts`: una petición, una visita XSS, un pedido con cantidad, una carrera) las comparten el motor y el `PocRunner`, así que no hay una segunda forma de atacar; cada jugada deja su PoC al confirmarse. Al terminar un run de Red Team, cada PoC se guarda en los artefactos (`poc/<findingId>.json`) y se repite en un banco con usuarios nuevos que registra intentos y veredictos pero nunca hallazgos; solo si el oráculo vuelve a decir explotable, `confirmFinding` (dominio) permite registrar el evento nuevo `finding.confirmed` (`findingId`, `pocRef`, evidencia; los eventos no cambian, así que la confirmación es otro evento). Si el objetivo ya no es explotable al repetirlo, el hallazgo se queda en sospecha, con el motivo. La consola marca el hallazgo como confirmado y muestra su línea en la línea de tiempo. `pnpm run:poc <runId|carpeta>` repite los PoC de un run (o de una carpeta) en un sandbox nuevo y sale con 1 si alguno ya no reproduce: es lo que necesita el primer verificador del Blue Team (F3.5). `pnpm test:poc` repite los PoC de `fixtures/poc/juice-shop/` (sacados de un run verificado); `.github/workflows/poc.yml` lo ejecuta aparte del CI, a mano o en los PR que tocan el código de ataque, el alcance o el sandbox. **Hecho cuando**, verificado en local: el run `01M6XY7CMV28T3236RFQABWD53` confirmó sus 5 hallazgos repitiendo cada PoC con usuarios nuevos; `pnpm run:poc` de ese run en un contenedor nuevo (run `01M6XY9XX2RDSQ2S7QDE56RTRY`) los reprodujo todos, el XSS con su propio marcador nuevo; y `pnpm test:poc` pasa. Sin gasto de API. Pendiente de ver en GitHub: el primer `poc.yml` correrá en este PR.

### F3.5a · SynthLab sobre Juice Shop — M (8–12 h)

- [x] Juice Shop como objetivo de SynthLab: rutas y embudo en `config/funnels.yaml`, usuarios de prueba sintéticos registrados por run
- [x] Tarea "comprar un producto" con oráculo determinista: el historial de pedidos del usuario de prueba
- [x] Personas reutilizadas; el baseline competente completa la tarea

Hecho cuando: un run de SynthLab sobre Juice Shop da tasa de éxito con intervalo y su informe, y el baseline pasa.

Nota F3.5a: **objetivo.** Juice Shop corre en el sandbox con `NODE_ENV=quiet` (sin avisos de retos resueltos, pistas ni bienvenida, que tapaban la página y delataban su verdad); las definiciones de imagen admiten `env`. Las rutas hash de la SPA (`/#/basket`) cuentan como página en friction-engine, synthlab-report y observation-builder. `config/funnels.yaml` tiene el embudo de Juice Shop (Inicio, Cesta, Dirección, Envío, Pago, Resumen, Pedido confirmado). **Oráculo:** `JuiceShopOrderReader` lee `/rest/order-history` con el token de la sesión del navegador (`fetchText` con `bearerFromCookie`) y la dirección de `/api/Addresss/:id`; los ids de pedido pueden ser texto. Cada sesión lleva su objetivo (`SessionJob.target`), que elige lector de pedidos y perfil. **Comprador:** `config/shoppers.yaml` da a cada objetivo sus datos sintéticos (dominio del email, dirección, tarjeta de prueba publicada 4111…, caducidad 12/2080 porque Juice Shop no ofrece años anteriores). En Juice Shop una cesta anónima se queda vacía sin decir nada, así que la cuenta se crea antes de la sesión (`ShopperAccountPort`, `account: preregistered`) y la persona inicia sesión ella misma; la tarea dice "Sign in to your account, then buy…". Con `savedCheckout` la cuenta tiene ya la dirección y la tarjeta, como la de un cliente que vuelve: rellenar los dos formularios supera la paciencia de todas las personas (run `01M77F0ACHHDXC5CDKCR5D1DQ8`: 0/8, todas cortadas por paciencia, Carmen a un clic del final). **Agente:** `type` admite `submit` (Enter, el buscador de Juice Shop no tiene botón) y hay acción `dismiss` (Esc) para los menús de Material que tapan la página. **Observación** (enmienda del ADR 0007): sin landmark `main` toda la página es contenido salvo el chrome; los controles sin nombre se nombran por su texto; lo `aria-hidden` no entra; y cuando la etiqueta de un control oculta lo que muestra, la línea añade `shows "…"`: Juice Shop etiqueta cada tarjeta de producto "Click for more information about the product", y sin el nombre el baseline abría cada ficha, lo olvidaba al cerrarla y daba vueltas (run `01M77G1SDJFVD28B2WGXE8RDY3`: personas 3/8, baseline 0/2). Las páginas golden de ShopLab y el replay de F1.4 no cambian por la observación; el fixture de Carmen se volvió a grabar por las herramientas nuevas, y el test de friction-engine conserva los eventos originales de F1.4 en `recordings/fixtures/friction/`. **Hecho cuando**, verificado con el run `01M77GTC1YE54BMYXSKA2C36CM` (`pnpm run:report <runId> --target=juice-shop`): personas 4/8 = 50 % [22 %, 78 %] (Wilson 95 %), baseline 2/2 en 23 y 21 pasos, cada éxito confirmado por el oráculo de pedidos; embudo Inicio 8 → Cesta 6 → Dirección 6 → Envío 5 → Pago 4 → Resumen 4 → Pedido 4; Tomás y Diego (12 y 15 pasos de paciencia) no llegan. El contrato real de cuentas y el guardado de dirección y tarjeta pasan en `pnpm test:sandbox`. Gasto del paso: 1,82 € (cinco smokes 0,83 €, tres runs completos 0,99 €). Pendiente: `run:report` necesita `--target`, porque `run.started` no guarda el objetivo; y las señales de rendimiento en Juice Shop (24 en la búsqueda) merecen revisar sus umbrales antes de usar V3.

### F3.5 · Agente Blue Team y verificadores — L (12–16 h)

Sub-entrega A: parche

- [x] Rol `blue-team`; rama `janus/fix-<findingId>` sobre Juice Shop; mismas herramientas con lista blanca que el UI Engineer, pero rutas de backend permitidas

Nota F3.5 (parte A): **variante parcheada** ([ADR 0012](adr/0012-patched-juice-shop-variant.md)): la imagen publicada y fijada por digest más solo los ficheros del backend que cambia el parche, recompilados. `docker/sandboxes/juice-shop.patch.Dockerfile` instala las dependencias una vez, con red, sin scripts (que compilarían el frontend) y con `--before` a la fecha del tag, porque Juice Shop no tiene lockfile; compila con `tsc` (su comprobación de tipos es la del build) y copia los `.js` de los `.ts` cambiados sobre la imagen. `docker/sandboxes/juice-shop.yaml` gana una sección `patch` (repo, tag, Dockerfile, verdad oculta y lista blanca del Blue Team: `routes/`, `lib/` y `models/`, sin `lib/startup/` ni `lib/challengeUtils.ts`). `VariantSpec.base` es el commit de partida del parche; el sandbox clona la rama de arreglo, calcula los fuentes cambiados (`patchedSources`, que no se fía de la rama: rechaza borrados, ficheros que no son `.ts` y rutas fuera de la lista) y pasa al agente los errores de `tsc` de un parche que no compila. **Verdad de Juice Shop:** su código la lleva dentro (160 soluciones en `data/static/codefixes/` y comentarios `// vuln-code-snippet` en las líneas vulnerables); el clon del agente oculta carpetas enteras y quita esos comentarios (`stripComments`, la línea solo si no queda código; dentro de una cadena se deja, porque quitarlo rompería el código) y lo guarda como commit base, así el parche se mide sin ello. **Agente:** el bucle del UI Engineer pasa a ser `EditingAgent`, compartido, con rol, herramientas y ficheros legibles por parámetro (las peticiones del UI Engineer no cambian; su replay sigue pasando). `GenerateFix` da al Blue Team el hallazgo como lo verificó el código (clase, endpoint, qué demuestra el PoC sin cargas, qué oráculo lo juzga), dónde está su manejador según el mapa de superficie y un extracto numerado; nunca tests ni frontend. `ProposeFix` hace commit en `janus/fix-<findingId>`, construye y arranca la variante parcheada (`verification.result` de `build-checks`) y, si no compila, deshace con un commit de reversión y reintenta una vez con los errores. `pnpm run:blue-team <poc.json | runId --finding <id>>` lo ejecuta todo y comprueba que la tienda sigue respondiendo. **De paso:** los almacenes de eventos aceptaban al escribir lo que rechazaban al leer (un id de agente en mayúsculas dejó ilegible el run `01M77K2JWGCYD6GK9X4H474E7S`, de 0,005 €, que el trigger append-only impide arreglar); ahora `append` valida con el mismo esquema, y eso destapó dos tests con ids que no eran ULID. **Hecho de A**, verificado con el run `01M77K7NZ0SPGZJG269NMER302` sobre el PoC del IDOR de la cesta: el Blue Team compara el dueño de la cesta con el usuario de la sesión (+5 líneas en `routes/basket.ts`, 403 si no coinciden), la variante compila a la primera, arranca y lista productos; ninguna de sus peticiones lleva marcas ni soluciones de Juice Shop. `pnpm test:sandbox` construye una variante real (la versión parcheada responde y el resto es la imagen), informa de los errores de tipos y rechaza un parche del frontend. Gasto: 0,03 €. Que el IDOR ya no se reproduce es V1, en la parte B.

Sub-entrega B: los tres verificadores (independientes del agente)

- [x] V1: el PoC original ya no es explotable
- [x] V2: tests de servidor de Juice Shop en verde (imagen de herramientas construida antes, con red) + test de regresión generado desde el PoC y añadido al parche
- [x] V3: SynthLab sobre Juice Shop (F3.5a) re-ejecutado; la tasa de éxito no baja más de la tolerancia fijada y la latencia p95 de los endpoints tocados sigue en presupuesto
- [x] Máximo 3 iteraciones; si no converge, el hallazgo queda `open` con el historial

Nota F3.5 (parte B1): **V1** (`PocReplayVerifier`) verifica la propiedad de la variante parcheada para el run y repite el PoC con `ReplayPocs` y usuarios nuevos; pasa solo si el oráculo dice "no explotable" (sin veredicto no hay prueba y falla). **V2** ([ADR 0013](adr/0013-v2-base-against-fix.md)): los propios tests de Juice Shop no pueden quedar en verde con un arreglo real, porque afirman sus vulnerabilidades (esperan un 200 al leer la cesta de otro usuario); así que V2 los ejecuta en la base y en el arreglo, cada fichero en su proceso, en la etapa `tests` del Dockerfile sin red (`DockerTargetTests`, con `sqlite3` recompilado y el frontend copiado de la imagen publicada), y decide por código (`judgeTests`): el test de regresión generado por código desde el PoC (`juiceShopRegressionTest`, al estilo de Juice Shop, con usuarios sintéticos nuevos) falla en la base y pasa en el arreglo, y ningún test que pasaba en la base falla en el arreglo salvo los de `config/vulnerability-tests.yaml`, que afirman esa misma vulnerabilidad. `--test-force-exit` terminaba los ficheros antes de registrar todos sus tests (las cuentas variaban entre ejecuciones); sin él los resultados son estables. **Bucle** (`RemediateFinding`): arreglo que compila, V1, V2 (se para en el primero que rechaza), deshace con un commit de reversión y reintenta con el motivo; máximo 3 iteraciones. El arreglo aceptado guarda su test de regresión en la rama. Evento nuevo `finding.remediated` (`fixed` con su parche y rama, u `open` con el motivo), con su línea en la consola. **Verificado** con `pnpm run:blue-team` sobre los dos PoC: el IDOR de la cesta queda corregido a la primera (run `01M77Z8HATZ690ZC555A0HQNW5`: 403 al repetir el PoC; 937 tests pasan y solo rompen los 3 que afirmaban el fallo; 0,033 €); la cantidad negativa en dos iteraciones (run `01M77ZMKY8AEHSMN3EFKFK7B71`): la primera rompía "POST placing an order charges the wallet when the balance is sufficient", V2 la rechazó y la segunda valida la cantidad solo al actualizar (940 tests pasan; 0,049 €). `pnpm test:sandbox` repite V2 sobre Juice Shop real con el arreglo del IDOR, sin LLM. Falta V3 (parte B2) para el "Hecho cuando" del paso.

Hecho cuando: el IDOR de la cesta y la cantidad negativa quedan corregidos con V1, V2 y V3 en verde.

Nota F3.5 (parte B2): **V3** (`SynthlabRerunVerifier`) lanza en el orquestador en marcha un run pareado de SynthLab con el fichero de compra del objetivo: A es la imagen original y B la variante parcheada (las variantes de un run admiten ahora `base`, y `run.started` guarda el objetivo, así que `run:report` y la consola ya no necesitan `--target`). Decide `judgeUx` con los umbrales acordados: se rechaza si la tasa de éxito de las personas en B es significativamente menor (el bootstrap pareado de B − A queda entero bajo 0) o cae más de 25 puntos (2 de 8 sesiones), o si el p95 de un endpoint que el arreglo toca supera max(p95 en A × 1,25, p95 en A + 50 ms). Los endpoints tocados salen del mapa de superficie: los que se declaran o se atienden en un fichero que cambia el arreglo; uno al que ningún comprador llega en las dos variantes se informa sin juzgarlo (si el arreglo rompe el camino, lo ve la tasa de éxito). Para medir la latencia, el navegador cronometra cada petición `fetch`/`xhr` (método, ruta sin query, estado, ms; nunca cabeceras ni cuerpos) y la sesión la registra por paso en el evento nuevo `page.requests`. V3 va el último en el bucle, porque es el caro. **Hecho cuando**, verificado con `pnpm run:blue-team` y `pnpm dev` en marcha: el IDOR de la cesta queda corregido a la primera (run `01M781JQAW1AXVR90RJ50BV1RZ`; V3 en el run `01M781YMZD2X6JQ89Y8K43HSTP`: éxito 4/8 en A y en B, p95 de `GET /rest/basket/:id` 83 → 86 ms con presupuesto 133 ms); la cantidad negativa en dos iteraciones, porque V2 volvió a rechazar el primer arreglo por romper el cobro con monedero (run `01M782Q7RM5RG63STZT959G7KQ`; V3 en `01M7838V45QPDBGQ5RP5NWGD8J`: 4/8 y 4/8, `POST /api/BasketItems` 24 → 20 ms; `PUT /api/BasketItems/:id` no se mide porque los compradores nunca cambian la cantidad). Gasto de la parte B2: 1,10 € (cada V3 son 20 sesiones, unos 0,50 €); F3.5 entero, 1,22 €.

### F3.6 · Informe de compromiso — M (6–8 h)

- [x] Caso de compromiso en Juice Shop (a confirmar al empezar el paso): proteger el login contra fuerza bruta, medido con una persona que a veces se equivoca de contraseña

Nota F3.6 (parte a): caso confirmado, la fuerza bruta contra el login de Juice Shop (`POST /rest/user/login` no limita intentos). **Hallazgo:** clase nueva `brute-force`, generada por código como las demás (ADR 0011): el motor toma los logins del mapa de superficie (la misma detección que el bypass, extraída a `loginForms`), envía 20 contraseñas erróneas a la cuenta de prueba de la víctima y después la buena, y lo registra como un solo intento. El oráculo `unthrottledGuessing` (puro) dice explotable si ningún intento recibe 429 o 423, van a menos de 1 s de media y la contraseña buena sigue entrando; así un bloqueo, un límite de peticiones y un retardo progresivo quedan cada uno como "no explotable", que es lo que V1 necesita. El PoC (`login-guessing`: ruta, campos y número de intentos; nunca contraseñas) se repite con usuarios nuevos y está en `fixtures/poc/juice-shop/brute-force-login.json`; V2 tiene su test de regresión generado. **Persona:** Inés (`ines-forgetful`, sesgo nuevo `forgets-password`) no recuerda qué contraseña usó y prueba primero cinco antiguas, fijas y sintéticas, en orden; cinco es el umbral habitual de un bloqueo. Para que pueda hacerlo, el resumen de sus últimas acciones dice ahora qué dato escribió, por su nombre y nunca su valor ("type your old passwords #2 into…"): sin eso repetía siempre la primera (27 intentos fallidos en el primer smoke). Cambia los mensajes de todos los navegantes, así que el fixture de Carmen se volvió a grabar. `runs/juice-shop-login.yaml`: Inés, Carmen y Rosa con dos semillas. **Verificado:** `pnpm run:red-team juice-shop --classes brute-force` (run `01M7853NTYZMW0QNB6SZVHY57D`, sin LLM) confirma el hallazgo, "20 wrong passwords were refused in 49 ms each on average, none throttled, and the right one still signed in", y su PoC se reproduce; `pnpm test:poc` repite los 6 PoC; en el run `01M785SV6GCDJA8EW2DRB8YPPH` Inés hace exactamente 5 logins fallidos, entra al sexto y compra (0,07 €). De paso, el test de replay del UI Engineer comparaba sus diffs sin normalizar los fines de línea y fallaba en una copia de Windows. Gasto de la parte a: 0,26 € (dos smokes y la regrabación).

- [x] Si V3 falla, pedir al Blue Team hasta 3 alternativas (por ejemplo, bloqueo de cuenta frente a retardo progresivo frente a CAPTCHA tras N fallos)
- [x] Medir cada una con V1 y V3
- [x] Tabla de compromiso: alternativa × explotable × tasa de éxito × p95, con recomendación justificada

Hecho cuando: el informe muestra al menos un parche seguro que empeora la conversión y una alternativa mejor.

Nota F3.6 (parte b): `ExploreTradeoffs` mide el arreglo libre del Blue Team y, si V3 lo rechaza, una alternativa por estrategia (bloqueo de cuenta, retardo progresivo, límite de intentos por cuenta; sin CAPTCHA), cada una con su `direction` en el brief. Cada alternativa se mide con V1 y, si cierra el ataque, con V3 (que ahora devuelve sus números, no solo el texto), y se deshace. `recommend` (dominio, puro) elige entre las que cierran el ataque la que conserva más compradores y, a igualdad, la de menor p95; la rama acaba con la recomendada. `pnpm run:tradeoff` escribe el informe en `docs/reports/tradeoff-<finding>.md` y sus filas en un `.json`, de modo que `--strategies a,b` añade alternativas a un informe ya medido. **Hecho cuando**, en [docs/reports/tradeoff-01M786YYJN2NDQHVQT1HGGNY93.md](reports/tradeoff-01M786YYJN2NDQHVQT1HGGNY93.md): el Blue Team eligió por su cuenta un límite de 10 intentos fallidos por cuenta cada 5 minutos (V1: frenado en el intento 11; V3: éxito 4/6 → 5/6, p95 del login 50 → 90 ms); como no había compromiso, se midió además el bloqueo de cuenta (5 fallos → 5 minutos bloqueada): cierra el ataque (frenado en el intento 6) pero deja fuera a Inés en sus dos sesiones (429 tras sus cinco contraseñas antiguas), éxito 4/6 → 3/6. Es el parche seguro que empeora la conversión, y el límite por cuenta la alternativa mejor y recomendada. V3 aceptó también el bloqueo, porque perder 1 de 6 sesiones queda dentro de la tolerancia de 25 puntos: la tabla lo enseña aunque el verificador no lo rechace. El retardo progresivo no se midió: el crédito de la API de Anthropic se acabó mientras el Blue Team lo escribía (run `01M7889HSW72AV01GWCTXFYT3C`, cerrado después con `run.completed` de error; el informe se completó desde los eventos grabados, sin LLM). Gasto de la parte b: 0,98 €; F3.6 entero, 1,24 €.

### F3.7 · Informe dual y firma — M (5–7 h)

- [x] Informe en JSON + Markdown: A/B, hallazgos estáticos y dinámicos, PoC, diffs, verificadores, compromisos, coste total
- [x] Hash del event log del run
- [x] Firma con cosign (`sign-blob`) y atestación in-toto con sujeto = SHA del commit + hash del informe + hash del event log + versiones de herramientas
- [x] Comando `janus verify <informe>` que comprueba firma y hashes

Hecho cuando: alterar un byte del informe hace fallar `janus verify`.

Nota F3.7: **informe:** `buildDualReport` (aplicación, puro) lo arma por código a partir de los event logs de los runs que se le dan por papel (`ux`, `audit`, `red-team`, `blue-team`, `v3`): el A/B como éxito sintético con su intervalo, los hallazgos con su estado tras la confirmación y su PoC, cada arreglo con sus verificadores y su diff, los informes de compromiso, el coste de cada run y el SHA-256 de cada event log (`eventLogHash`: JSON canónico, eventos por `seq`). Lo escribe `pnpm janus report` como `dual-report.json` (la fuente firmada) y `dual-report.md` (su lectura para el PR). **Firma** ([ADR 0014](adr/0014-report-signature.md)): con `node:crypto` y en los formatos de cosign, en vez del binario. Una clave ECDSA P-256 (`pnpm janus keygen`: privada en `.janus/keys/`, ignorada por git; pública en `keys/janus.pub`); `dual-report.json.sig` es lo que imprime `cosign sign-blob`, y `dual-report.intoto.json` una declaración in-toto v1 en un sobre DSSE, con sujetos = el informe, cada event log, el commit de Janus y el del objetivo, y las versiones de las herramientas como predicado. Sin Rekor: los informes son privados y Janus trabaja sin red. `pnpm janus verify <carpeta>` comprueba la firma, el sobre, que la declaración nombra ese informe y cada event log y, con la base de datos a mano, que cada event log sigue dando el mismo hash; sale con 1 si algo falla. **Hecho cuando**, verificado con el informe de Juice Shop en [docs/reports/dual-juice-shop](reports/dual-juice-shop/dual-report.md) (6 hallazgos confirmados, los 2 arreglos con V1, V2 y V3, el informe de compromiso, 6 event logs, 1,10 € de coste acumulado): `pnpm janus verify` lo acepta y, con un solo byte cambiado en una copia, falla con "the signature does not match the report" y "the attestation names another report". `pnpm test:sandbox` comprueba con el cosign real (imagen fijada por digest, sin red) que `verify-blob` y `verify-blob-attestation` aceptan lo que firma Janus y lo rechazan tras cambiar un byte. Sin gasto de API. En Windows el permiso `600` de la clave privada no se aplica: queda protegida por estar fuera del repositorio.

### F3.8 · Pull Request — S a M (4–6 h)

- [x] GitHub App propia con permisos mínimos (contenido y pull requests, solo del repo de ShopLab)
- [x] Adaptador `GitHubVcsAdapter` (Octokit): push de rama y PR con el informe dual en el cuerpo y adjuntos
- [x] Sin merge automático, sin aprobar su propio PR

Hecho cuando: aparece en GitHub un PR de ShopLab con el informe y la firma verificable.

Nota F3.8 ([ADR 0015](adr/0015-github-app-without-octokit.md)):

- **Sin Octokit:**
  - el adaptador es `GitHubPullRequests`, detrás del puerto nuevo `PullRequestPort`, con `fetch` y `node:crypto`;
  - la GitHub App `janus-arena-oblivionwing26` está instalada solo en `janus-shoplab`, con _Contents_ y _Pull requests_ en escritura y _Metadata_ en lectura;
  - su JWT (RS256) compra un token de instalación limitado a ese repositorio y a esos dos permisos;
  - el push lleva el token en una cabecera que viaja por el entorno (`GIT_CONFIG_COUNT`), nunca en la URL ni en los argumentos, y ningún error lo muestra.
- **Puerto:** `open` sube la rama y abre el PR hacia la rama por defecto. Si ya hay uno abierto para la rama, lo devuelve sin duplicarlo. Solo acepta ramas `janus/…`. La suite de contrato, que pasan el fake y el adaptador contra un GitHub guionizado, comprueba que el puerto no tiene nada llamado merge, approve ni review. El PR se abre con `maintainer_can_modify: false`.
- **Comando:** `pnpm janus pr --workspace <clon> --branch <janus/…> --report <carpeta>`:
  - rechaza un informe que no verifica;
  - añade a la rama `janus-report/` con los cuatro ficheros firmados y `janus.pub`, en un commit de Janus;
  - abre el PR con el Markdown del informe como cuerpo y un pie que dice que Janus nunca hace merge ni aprueba.
- **Informe:** el informe dual de ShopLab está en [docs/reports/dual-shoplab](reports/dual-shoplab/dual-report.md). Lo forman el A/B `01M6VD0MWENHQCSKST7EHK0WG1` (B − A: +50 puntos, intervalo [17, 83]) y la auditoría `01M6WCBACRGREB2TRVXS34PZAW` del commit `115ab86`. 0,28 € de coste acumulado.
- **Hecho cuando:** el PR [oblivionwing26/janus-shoplab#4](https://github.com/oblivionwing26/janus-shoplab/pull/4) va de `janus/variant-01M6VCWFPZ9D0E17ZSRQCN63NQ` a `main`, abierto por `janus-arena-oblivionwing26[bot]` y sin merge. En un clon nuevo de la rama desde GitHub, `pnpm janus verify janus-report` da OK, y el cosign real (`verify-blob` con el `janus.pub` de la rama) dice "Verified OK".
- **Gasto:** sin gasto de API.

### F3.9 · Pipeline del gate — M (6–8 h)

- [ ] Caso de uso `RunJanusGate`: SynthLab A → Variante B → auditoría diferencial → Red Team → Blue Team → informe → PR
- [ ] Cada etapa idempotente y reanudable leyendo el event log (si se cae en el Blue Team, no repite SynthLab)
- [ ] Presupuesto global repartido por etapas

Hecho cuando: matar el proceso a mitad y relanzarlo termina el gate sin repetir etapas completadas.

### F3.10 · Grafo de ataque (React Flow) — M a L (8–10 h)

- [x] Nodos = endpoints del mapa de superficie; aristas = intentos de ataque
- [x] Estados por color: probado, explotado, parcheado, verificado
- [x] Panel lateral con PoC, diff y verificadores del nodo seleccionado
- [x] Alimentado por eventos (vivo y replay)

Hecho cuando: el replay del gate completo se entiende sin explicación verbal.

Nota F3.10 ([ADR 0017](adr/0017-attack-graph-from-events.md)):

- **Eventos:** el grafo no se podía dibujar solo con lo que había, así que se añaron campos opcionales (los runs antiguos siguen siendo válidos y se reproducen).
  - `attack.attempt` lleva su `endpoint` (`GET /rest/basket/:id`).
  - `finding.created` lleva `endpoint` y `attemptId`.
  - El Red Team registra su mapa de superficie como `surface.mapped` (lado `variant`, sin nombres de parámetros: un run no registra campos de credenciales ni por su nombre).
- **Grafo:** `buildAttackGraph` (consola, función pura de eventos a grafo) da un nodo por endpoint del mapa y una arista por atacante, endpoint y clase, con su número de intentos. Cada nodo tiene un estado:

  | Estado     | Cuándo                                                     |
  | ---------- | ---------------------------------------------------------- |
  | sin probar | ningún intento                                             |
  | probado    | algún intento, ninguno explotable                          |
  | explotado  | un oráculo lo confirmó (o el Blue Team no pudo arreglarlo) |
  | parcheado  | el Blue Team propuso un parche, sin veredicto final        |
  | verificado | el hallazgo quedó `fixed` con los tres verificadores       |
  - Las repeticiones de PoC de un run del Blue Team (V1) no se dibujan como ataques: son de los verificadores del parche.
  - Un run antiguo, sin los campos nuevos, se dibuja igual: el endpoint de cada intento sale del mapa de superficie, si lo hay, y el de cada hallazgo, de su título.
  - Disposición determinista: atacantes a la izquierda y, a su lado, los endpoints tocados antes que los sin probar.

- **Componente:** `AttackGraphView` con React Flow (`@xyflow/react` 12.12.0, MIT, aprobada). El panel lateral muestra, del endpoint elegido:
  - sus intentos con el veredicto del oráculo;
  - la PoC, que sirve el endpoint nuevo `GET /runs/:id/pocs/:findingId` (valida el esquema; una PoC no lleva contraseñas, tokens ni respuestas);
  - el diff del parche con sus verificadores.
- **Vivo y replay:** `RunViewer` dibuja el grafo (`view="attack"`) sobre los eventos visibles del mismo reproductor. La página `/runs/<id>/attack` usa `GateEventSource`, que une el run del gate y los runs que lanzaron sus etapas en un solo flujo. Un run que no es un gate es solo sus eventos.
  - Renumera los seq por orden de emisión, porque los de cada run chocan.
  - Sondea mientras el gate no ha terminado; un gate terminado se reproduce desde el principio.
  - `RunLinks` enlaza el grafo desde cualquier run con intentos o etapas.
- **Hecho cuando**, con el gate de Juice Shop `01M79YYR766FTNCYF5STGZ3ANY` (0,82 €), el primero con un arreglo completo dentro del gate:
  - **En vivo:** al llegar el Red Team, con el mapa real salen 99 endpoints sin probar, 3 probados y 5 explotados.
  - **En replay:** el IDOR de `GET /rest/basket/:id` pasa de explotado a parcheado, al proponerse el parche, y a verificado, al cerrarse V3. El panel enseña sus 4 intentos, la PoC, el diff y los verificadores.
  - **Informe:** `janus verify` da OK sobre `docs/reports/gate-01M79YYR…`: build-checks, poc-replay (403), regression-tests (937 pasan, 3 afirmaban el fallo) y synthlab-rerun (éxito A 4/8, B 2/8: el límite de 25 puntos se cumple justo).
  - También se abre bien el gate antiguo `01M795H2…`, sin los campos nuevos, con un nodo por ruta concreta.
- **Gasto:** 0,82 €.

### F3.11 · Benchmark público — S a M (4–6 h)

- [x] Ejecutar Red Team con alcance limitado a las clases implementadas
- [x] Medir recall frente a todos los retos de Juice Shop de esas clases (no solo las 4 de referencia) en 3 ejecuciones; anotar coste y tiempo
- [ ] Opcional: subconjunto de la suite Argus (no hecho)
- [ ] Opcional (movido desde F3.2): Nuclei y ZAP baseline en contenedor dentro del sandbox, solo si sus rastreadores pueden excluir la verdad de Juice Shop (`/api/Challenges`, `/snippets/**`) y se aprueban las dependencias (no hecho)

Hecho cuando: hay una tabla de resultados reproducible con el comando exacto para obtenerla.

Nota F3.11 ([ADR 0018](adr/0018-benchmark-scoring.md)):

- **Comando:** `pnpm run:benchmark juice-shop --runs 3` escribe [docs/reports/benchmark-juice-shop.md](reports/benchmark-juice-shop.md) y su `.json`. Sin LLM: el motor es determinista (ADR 0011), así que cuesta 0 € y cada ronda dura unos 20 segundos.
- **Qué mide:** el recall es sobre los **60 retos** que Juice Shop v20.3.0 archiva en las seis categorías donde actúa alguna clase del Red Team (`config/benchmarks.yaml`), según el propio recuento de Juice Shop tras cada ronda. El denominador incluye retos que ninguna clase intenta; los 5 retos de referencia, para los que se hizo el motor, se dan aparte.
- **Cómo se evita inflarlo:**
  - Cada ronda usa una imagen nueva.
  - Antes va una ronda de control, que levanta Juice Shop y verifica la propiedad pero no ataca; lo que ya tuviera resuelto no cuenta para nadie.
  - Lo resuelto fuera de esas categorías se lista aparte.
  - Se da el intervalo de Wilson al 95 % de cada ronda.
- **Resultado:** **6 de 60 (10,0 %; intervalo [4,7 %, 20,1 %])** en las tres rondas, idéntico y sin retos resueltos en solo alguna de ellas, y los **5 de 5** retos de referencia. Por categoría: Improper Input Validation 2 de 12, Broken Anti Automation 1 de 4, Broken Access Control 1 de 12, Injection 1 de 14, XSS 1 de 9 y Broken Authentication 0 de 9.
- **Un efecto secundario, declarado:** el sexto, _Repetitive Registration_, no es un ataque del motor. El mapa de superficie muestra `POST /api/Users` sin parámetro de repetición de contraseña, así que el generador de bypass de login lo sondea como si fuera un login y registra cuentas sin repetir la contraseña; Juice Shop lo da por resuelto con exactamente eso (`passwordRepeat` distinto de `password`). Sigue contado, porque una petición de Janus lo resolvió, pero el informe da también el recall sin él: **5 de 60 (8,3 %)**. Queda como defecto del motor por corregir (no es de este paso).
- **Cada ronda es un run:** el informe enlaza el run de cada ronda y el del control, así que se pueden abrir en la consola (`/runs/<id>/attack` es su grafo de ataque).
- **Hecho cuando:** un solo comando regenera la tabla; el informe empieza con ese comando, la imagen con su digest y el commit de Janus.
- **Gasto:** 0 €. Nuclei, ZAP y Argus no se hicieron: los dos primeros rastrearían `/api/Challenges` y `/snippets/**`, que son la verdad de Juice Shop, y ninguno de los tres es una dependencia aprobada.

### F3.12 · Puerta G2: demo completa — L (8–12 h)

- [x] Consola en modo demo desplegada (por ejemplo en Vercel) cargando runs exportados en JSON, sin backend ni claves
- [x] Vídeo de 3 minutos del ciclo completo
- [x] README del repo con arquitectura, cómo ejecutar y enlace a la demo
- [x] Artículo 1 publicado en inglés
- [x] Repo público, etiqueta `v1.0.0`, `Current step` a F4.1 (la etiqueta se crea sobre el merge de este PR)

Nota F3.12 (lo que ya está hecho y lo que falta; el paso sigue abierto hasta que se publique):

- **Hecho, verificado:**
  - **Auditoría previa a hacer público el repo:** gitleaks (imagen fijada, sin red) sobre todas las ramas y el historial, con los valores redactados.
    - 23 avisos, todos de la regla genérica y todos sintéticos: la contraseña sintética de Carmen en las grabaciones de sus sesiones, una clave falsa de pago para el test de gitleaks y contraseñas de prueba.
    - Ninguna clave real: los `sk-ant-`, `ghs_` y `BEGIN PRIVATE KEY` que aparecen en el historial son patrones de aserciones de tests o valores de test, no hay `ghp_` ni claves de AWS, y nunca se añadió un `.env`, un `.pem` ni una clave privada.
    - Los correos de los ficheros rastreados son de dominios sintéticos o el administrador público de Juice Shop; no hay datos personales ni rutas locales.
  - **`LICENSE` (MIT) y `SECURITY.md`:** el segundo explica el uso responsable (el alcance verificado, el guard, el sandbox sin internet) y cómo informar de un fallo.
  - **Modo demo de la consola** ([ADR 0019](adr/0019-demo-is-the-console-on-recorded-runs.md)):
    - `NEXT_PUBLIC_DEMO=1` hace que la consola lea sus datos de `/demo`. Toda lectura pasa por una capa, `lib/backend.ts`, y el informe se calcula en el navegador con la misma función pura que usa el orquestador (un test comprueba que dan lo mismo).
    - `pnpm demo:export` escribe los runs de `config/demo.yaml` (tres historias, 11 runs, 5,3 MB) y no escribe nada si algún fichero lleva una credencial o un correo fuera de los dominios sintéticos.
    - `pnpm demo:build` lo compila. **Verificado a mano**, con la API parada: la portada con las tres historias, el grafo de ataque del gate de Juice Shop (replay hasta el arreglo verificado y la PoC en el panel) y el informe del A/B de ShopLab calculado en el navegador (B − A = +0,50 [0,17; 0,83]). El navegador no hizo ninguna petición al orquestador.
  - **README** en inglés y **artículo 1** en inglés ([what-synthetic-users-measure.md](articles/what-synthetic-users-measure.md)), adaptado del borrador de G1: cada cifra se contrastó con las notas de F1 y con los informes. Se añadió el A/B con tarea y oráculo (1/6 → 5/7).
  - **Guion del vídeo** y **guía de despliegue** en [docs/demo](demo/VIDEO.md).
- **Desplegada:** la demo está en <https://janus-arena.vercel.app> (comprobado: la portada con las tres historias, `/demo/index.json` con 3 historias y 11 runs, una página de run y el grafo de ataque responden 200, y `/api/orchestrator` da 404: no hay backend). La URL ya está en el README.
- **Vídeo:** subido a <https://youtu.be/rH7XLE4Ujks> (3 min 15 s), enlazado desde el README.
- **Repos públicos:** `janus-arena` (licencia MIT) y `janus-shoplab`.
- **CI en `main`:** al hacerse público salió a la luz que fallaba el paso de formato (seis informes generados en `docs/reports/`, que ahora `.prettierignore` excluye: se generan por código y los firmados se verifican byte a byte) y las pruebas de integración, que clonan `janus-shoplab` y no podían mientras era privado.
- **Artículo:** publicado en dev.to el 13 de noviembre (<https://dev.to/oblivionwing26/janus-arena-development-1ce>), con el texto de `docs/articles/what-synthetic-users-measure.md`; enlazado desde el README.
- **El CI no estaba verde y se corrigió:** además del formato, fallaban los tests y las pruebas de integración con el mismo error, que solo se veía en Linux. Todos los tests pasaban, pero el proceso salía con 1 por un `write EPIPE` sin manejar en `child.stdin` del ayudante de git (`git grep` y `git status` salen sin leer su entrada y cierran la tubería; en Windows el mismo fallo es `EOF`). Se ignoran ambos códigos, porque el código de salida de git dice cómo fue, y un test lo reproduce. Se reprodujo en un contenedor Linux con `pnpm test` y con `pnpm test:integration` contra Postgres y Redis (también con una base nueva y vacía y con `CI=true`) y, tras el arreglo, los dos terminan con 0. El log de un job no se puede leer sin iniciar sesión, pero las anotaciones del job sí son públicas: de ahí salió el `EPIPE`.
- **Falta:** la etiqueta `v1.0.0` tras el merge de este PR con CI en verde.
- **Gasto:** 0 €.

## F4 · Fusión y validación (40–60 h)

F4 añade la demo más vistosa (Launch Day) y responde a la pregunta de negocio. Los pasos F4.3 y F4.4 son independientes y pueden hacerse en cualquier orden o en paralelo con los demás.

### F4.1 · Modo Launch Day — L (12–16 h)

- [x] Configuración de run con mezcla de roles (`saboteurs` y `clientIps` en el fichero de run; el run de 18 legítimos + 2 saboteadores por variante es de F4.1c)
- [x] Cuentas canario para los legítimos, con datos distinguibles, para medir contaminación entre sesiones
- [x] Saboteadores reutilizan el Red Team con cadencia lenta y objetivos de saturación de endpoints (su guardia, sus eventos y su estilo de oráculo, no su banco; ADR 0020)
- [x] Etiqueta de rol solo en el event log, invisible para ShopLab
- [x] Tres curvas por ejecución: éxito de legítimos, éxito de ataques, falsos positivos de las defensas; antes y después de parchear (variante A sin defensa frente a B con ella; varios runs se juntan en F4.1c)
- [x] Lienzo PixiJS con los saboteadores marcados (solo en la vista, a posteriori)

Hecho cuando: un run muestra que una defensa reduce ataques y su coste en legítimos bloqueados.

### F4.2 · Defensas configurables en ShopLab — S a M (4–6 h)

Se queda en ShopLab: son defensas legítimas, no código inseguro, así que no contradicen el ADR 0006.

- [x] Rate limiting por IP y por cuenta, con interruptor por variable de entorno
- [x] Verificación escalonada en checkout activable
- [x] Escenario de IP compartida entre legítimos para provocar falsos positivos (`clientIps: shared` en el fichero de run; su efecto se mide en F4.1c)

Hecho cuando: las tres curvas cambian de forma medible al activar cada defensa.

Nota F4.2 (primera parte, en el repo `janus-shoplab`, PR `step/f4-2-defenses`): F4.1 y F4.2 se hacen juntos, porque el "hecho cuando" de cada uno necesita al otro. Orden: F4.2 (esta parte), F4.1a (roles, saboteadores y canarios), F4.1b (curvas y lienzo) y F4.1c (la ejecución real, que cierra los dos).

- **Defensas, todas apagadas por defecto** (sin ninguna variable, ShopLab se comporta como antes, y `UX_FLAWS.md` no cambia):
  - `SHOPLAB_RATE_LIMIT_IP=<n>/<s>`: límite por cliente en toda la API. Pasado el límite, `429` con `Retry-After`.
  - `SHOPLAB_RATE_LIMIT_ACCOUNT=<n>/<s>`: límite de intentos de inicio de sesión por cuenta. `429` incluso con la contraseña correcta.
  - `SHOPLAB_STEP_UP_CHECKOUT=new-accounts|all`: el checkout pide un código de cuatro cifras que enseña la página. Sin él, `403`. `new-accounts` solo lo pide a cuentas más jóvenes que `SHOPLAB_STEP_UP_ACCOUNT_AGE_SECONDS`. Es el coste en UX de esta defensa.
  - `SHOPLAB_TRUST_FORWARDED_FOR=1`: el cliente sale de `X-Forwarded-For`. Sin ella, todas las peticiones cuentan como un solo cliente.
  - Todas las peticiones cuentan, también las rechazadas, así que quien insiste sigue bloqueado hasta que para una ventana.
- **Verificado:** 21 tests unitarios y 29 de integración con base de datos real (9 nuevos). Y una sonda sobre la imagen de producción: con las tres activas, 20 peticiones de un cliente pasan y la 21 da `429` con `Retry-After: 29` (otro cliente pasa); tres contraseñas erróneas bloquean la cuenta aunque la cuarta sea la buena y venga de otro cliente; una cuenta nueva ve el código en `/checkout`, el pedido sin código o con uno falso da `403` y con el de la página, `201`. Con ninguna variable, 50 peticiones de un cliente y 10 intentos de inicio de sesión no se bloquean.
- **Falta de F4.2:** el escenario de IP compartida entre legítimos. No es de ShopLab sino del fichero de run (`clientIps: shared`) y va en F4.1a. Y el "hecho cuando" se verifica en F4.1c, con las curvas.
- **Gasto:** 0 €.

Nota F4.1a, primera parte (cimientos, [ADR 0020](adr/0020-shoplab-may-be-loaded-not-exploited.md); la segunda parte son los saboteadores y los canarios). El plan de cuatro PR pasa a cinco, porque ShopLab no podía recibir abuso sin demostrar su propiedad y eso tocaba el sandbox, la configuración y el repo de ShopLab:

- **Alcance de ShopLab:** gana `brute-force` y un tipo de prueba nuevo, `saturation`; sigue sin permitir ninguna clase de explotación (un test lo comprueba). Enmienda el ADR 0006.
- **Propiedad:** ShopLab sirve su token en `/.well-known/janus-verify.txt` desde el fichero que dice `SHOPLAB_VERIFY_FILE` (repo `janus-shoplab`, rama `step/f4-1a-verify-route`); su imagen crea `/app/.well-known`, y su definición de sandbox declara `verification`. El guardia de `docker cp` no cambia.
- **Ajustes por variante:** cada variante puede llevar un `env`, solo con las claves que la definición del sandbox lista en `variantEnv` (para ShopLab, sus defensas), con valores simples. Queda en `run.started`. Es lo que permite correr A sin defensas y B con ellas.
- **Una dirección por sesión:** `session.started` gana `role` y `client`, y el fichero de run gana `clientIps` (`distinct` o `shared`) y `saboteurs`. La matriz da a cada hueco su dirección y la misma a los dos lados de un par. El navegador la manda como `X-Forwarded-For`.
- **Esquemas:** `saturation` en los tipos de prueba y `unthrottled-requests` en los oráculos (la implementación del oráculo es de la segunda parte).
- **Verificado:** tests unitarios de la configuración, la matriz de direcciones, la regla del entorno (rechaza una clave fuera de la lista y no deja a un objetivo de imagen tomar ninguna), la definición de ShopLab y el ciclo de vida de un run (el `env` llega al sandbox y queda en `run.started`; la dirección llega al navegador y a `session.started`). Y un test de sandbox sobre la imagen real de ShopLab (`pnpm test:sandbox`, sin gasto): sin verificar la propiedad, `saturation` se bloquea; verificada, pasa; `idor` se bloquea aun verificada; con la defensa por IP encendida (`6/60`), un cliente recibe 6 respuestas 200 y luego `429`, y otro cliente sigue pasando. Antes de crear la carpeta del token, el test falló con el guardia de `docker cp` (`/tmp` no acaba en `.well-known`), y se corrigió en la imagen de ShopLab.
- **Falta de F4.1a:** nada; la segunda parte está debajo.

Nota F4.1a, segunda parte (saboteadores y canarios; sin gasto de API, no hay LLM en nada de esto):

- **Un saboteador es una sesión más de la cola**, de tipo `saboteur`, con su dirección (`10.99.0.k`, la misma en las dos variantes de un par) y su ritmo (`requestsPerSecond`). La matriz los pone primero, para que arranquen a la vez que los compradores, y no cambia nada de los demás huecos. Son acotados (40 peticiones o un intento de adivinar), así que no hace falta pararlos al acabar el run: `FinishRun` los espera como a cualquier sesión.
- **Dos tareas, por turnos** (`saturation` el primero, `brute-force` el segundo, y así): la saturación manda 40 peticiones a ritmo constante a `POST /api/auth/logout` (una ruta anónima que el límite por cliente cuenta); la adivinación crea una cuenta propia, prueba 8 contraseñas erróneas y luego la buena. Nunca toca la cuenta de un comprador.
- **Mismas reglas que el Red Team:** propiedad verificada una vez por variante (`SaboteurScopes` guarda la promesa y no la guarda si falla), toda petición pasa por el guardia, un `attack.attempt` por petición y un `attack.verdict` al final. Sin `finding.created`: ShopLab no tiene fallos que encontrar, se mide lo que una defensa hace al abuso. La sesión escribe `session.started` con `role: saboteur` y `client`.
- **Oráculo `unthrottled-requests`** (puro): explotable si hubo al menos 10 peticiones, todas contestadas y ninguna rechazada (`429`) ni con la tienda caída (`503`). El de adivinación es el de F3.6 (`unthrottled-guessing`).
- **Canarios:** cada comprador legítimo de un run con direcciones escribe en su dirección de envío un código propio (`CNR-XXXXXX`, función del run y de la sesión). Al verificar la tarea, si algún pedido que lee lleva el canario de otra sesión, `task.verified` añade el check `orders hold only its own canary` con `passed: false`. No cambia el estado de la tarea: la contaminación se lee aparte del éxito. Sin direcciones en el run, nada cambia.
- **Cableado:** `AppAdapters.saboteurs` (http, tokens, política por objetivo) y `RunAgentSession` despacha el tipo `saboteur`; sin esa dependencia el hueco falla como error de plataforma y se reintenta.
- **Verificado:** tests unitarios del oráculo, de la matriz, del saboteador (contra una ShopLab falsa con las defensas, con ritmo, direcciones, eventos, propiedad una sola vez y parada), del despacho y de los canarios (en un run completo en memoria). Y un test de sandbox sobre la imagen real de ShopLab (`SHOPLAB_REF=step/f4-1a-verify-route pnpm test:sandbox`): sin defensas, la saturación y la adivinación son explotables; con `20/60` por cliente y `3/60` por cuenta, ninguna lo es.
- **Falta de F4.1:** el run real (F4.1c).

Nota F4.1b (curvas y lienzo; sin gasto de API, sin dependencias nuevas):

- **`launchDayCurves(events)`** (`packages/synthlab-report`, pura): por variante, tres tasas con intervalo de Wilson. Éxito de los compradores (personas; la baseline es referencia), éxito de los ataques (veredictos de saboteadores explotables, con el desglose por tarea y cuántas peticiones atendió la tienda antes del primer rechazo) y compradores bloqueados por una defensa (un `429` en cualquier sitio o un `403` en `/api/checkout`, contado una vez por comprador). Aparte, la contaminación (checks de canario en rojo). Solo cuentan las sesiones que terminaron bien, como en las estadísticas. `CANARY_CHECK` pasa a `shared-kernel`.
- **Página `/runs/<id>/launch-day`:** gráfico SVG a mano (un intervalo por variante y curva, con el color y la etiqueta de cada una) y dos tablas, por variante y por saboteador. Se enlaza desde el run solo si tiene datos de Launch Day, y funciona en la demo estática.
- **Lienzo:** los saboteadores no navegan, así que van en una banda propia al pie, como rombos (hueco mientras la tienda no los ha rechazado, relleno cuando sí), con variante, dirección y peticiones atendidas y rechazadas. Solo en la vista y a posteriori: salen de los mismos eventos, sin cambios de esquema.
- **Verificado:** tests con valores calculados a mano (A sin defensa, B defendida; un 404 o un 403 fuera de checkout no cuentan como bloqueo; un comprador rechazado dos veces cuenta una; contaminación aparte del éxito; sesiones sin terminar fuera; run sin saboteadores o sin compradores), del modelo del lienzo y de los datos del gráfico. Y a mano, con un run sintético en el modo demo: la página da 100 % / 75 % de éxito de compradores, 100 % / 0 % de ataques y 0 % / 50 % de bloqueados, y el lienzo dibuja los cuatro saboteadores con los contadores de cada uno.
- **Aviso:** el gráfico no usa todavía el rediseño de F4.7; está hecho con los estilos actuales.

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

### F4.7 · Capa de front de la consola — XL (sin estimar; solo planificado, no se desarrolla todavía)

La consola se construyó para depurar, no para enseñar: hoy se ve muy poco cuidada (listas planas, estilos sueltos, etiquetas en español mezcladas con el banner de la demo en inglés, sin sistema de diseño). Este paso es una capa de front grande y propia, que se estima y se aprueba cuando se decida empezar. Hasta entonces no se toca la consola con fines visuales, y F4.1b solo añade lo que necesita (la página de curvas y las marcas del lienzo) con los estilos actuales.

Alcance previsto, a refinar en su plan:

- [ ] Sistema de diseño: tokens (color, tipografía, espaciado), modo claro y oscuro, componentes base reutilizables
- [ ] Rediseño de las pantallas: lista de runs, línea de tiempo, replay, informe SynthLab, informe dual, grafo de ataque, FinOps, Launch Day
- [ ] Lienzo del enjambre y gráficas (curvas, embudo, mapa de calor) con un estilo común y legible
- [ ] Idioma único y coherente en toda la interfaz, y modo demo pulido para quien llega desde el enlace público
- [ ] Responsive, accesibilidad (contraste, teclado, lectores de pantalla) y rendimiento con runs largos
- [ ] Capturas y vídeo nuevos para el README y los artículos

Restricciones: sin cambios en los esquemas de eventos ni en el replay (es solo la vista); cualquier dependencia nueva se pregunta antes; el modo demo sigue siendo estático y sin backend.

Hecho cuando: una persona que no conoce el proyecto entiende en la demo pública qué hace Janus y qué encontró, sin explicación aparte.

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
