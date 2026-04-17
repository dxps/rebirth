import { apiRoutes, appInfo, createHealthResponse, jsonHeaders } from "@rebirth/shared";
import { runMigrations } from "./db/migrate";
import { loadEnvFiles } from "./env";

loadEnvFiles();

const port = Number.parseInt(Bun.env.PORT ?? "9908", 10);

await runMigrations();

const server = Bun.serve({
  port,
  fetch(request) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === apiRoutes.health) {
      return Response.json(createHealthResponse("ok"), {
        headers: jsonHeaders
      });
    }

    return Response.json(
      {
        error: "Not Found",
        path: url.pathname
      },
      {
        headers: jsonHeaders,
        status: 404
      }
    );
  }
});

console.log(`${appInfo.name} API listening on http://localhost:${server.port}`);
