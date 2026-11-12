# A patched Juice Shop (ADR 0012): the pinned published image plus only the backend files the
# patch changed, recompiled. Built by DockerSandbox with the patched workspace as context.
#   --build-arg BASE_IMAGE  the pinned image of docker/sandboxes/juice-shop.yaml
#   --build-arg CHANGED     the patch's .ts paths, space-separated, checked by Janus
# The `compiled` stage is also where Juice Shop's own tests run, without network (F3.5, V2).

ARG BASE_IMAGE

# Tools: Juice Shop's dependencies, resolved as they were on the tag's date (no lockfile), and
# without install scripts, which would build the Angular frontend; sqlite3, its one native
# module, is then built alone for the tests. The only steps with network; Docker caches them, so
# later patches never reinstall.
FROM node:24@sha256:9d266751ca3d7fdbe651c878ffd5ad0a42fed49a18c283509267c97f025b7496 AS tools
WORKDIR /juice-shop
COPY package.json ./
RUN npm install --ignore-scripts --no-package-lock --no-audit --no-fund --before=2026-10-12T00:00:00Z
RUN npm rebuild sqlite3

# Compile: the patched source over the tools; tsc's type check is the build check. Only the
# compiled files of the changed sources are kept.
FROM tools AS compiled
COPY . .
ARG CHANGED
RUN npx tsc \
  && mkdir -p /out \
  && for source in $CHANGED; do \
       compiled="${source%.ts}.js"; \
       mkdir -p "/out/$(dirname "$compiled")"; \
       cp "build/$compiled" "/out/$compiled"; \
     done

# The published image, unmodified but for the patched files.
FROM ${BASE_IMAGE} AS runner
COPY --from=compiled --chown=65532:0 /out/ /juice-shop/build/

# Juice Shop's own tests (V2): the compiled tree plus the published frontend, which its startup
# checks for and which the tools never build. Run without network.
FROM compiled AS tests
COPY --from=runner /juice-shop/frontend/dist/ /juice-shop/frontend/dist/
