# Remote Playwright server for agent browsers. It runs only on the internal janus-sbx network
# (ADR 0005); the orchestrator reaches it through browser-relay on 127.0.0.1.
# Keep the version in step with playwright-core in apps/orchestrator-api.
FROM mcr.microsoft.com/playwright:v1.64.1-noble

RUN npm install -g playwright@1.64.1

USER pwuser
EXPOSE 3000
CMD ["playwright", "run-server", "--port", "3000", "--host", "0.0.0.0"]
