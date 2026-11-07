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

> **Pendiente de replanificar (ADR 0006):** los pasos de F3 que citan "vulnerabilidades sembradas" de ShopLab (F3.1, F3.3, F3.4, F3.6 y F4.2) se reescribirán contra OWASP Juice Shop al reestimar las fases tras cerrar F2. ShopLab sigue siendo el objetivo de UX y de los re-checks de SynthLab.

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
