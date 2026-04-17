import { apiRoutes, appInfo, createHealthResponse, jsonHeaders, type AccessLevelsResponse } from "@rebirth/shared";
import { listAccessLevels } from "./db/access-levels";
import { runMigrations } from "./db/migrate";
import { loadEnvFiles } from "./env";

loadEnvFiles();

const port = Number.parseInt(Bun.env.PORT ?? "9908", 10);

await runMigrations();

const server = Bun.serve({
  port,
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === apiRoutes.health) {
      return Response.json(createHealthResponse("ok"), {
        headers: jsonHeaders
      });
    }

    if (request.method === "GET" && url.pathname === apiRoutes.accessLevels) {
      try {
        const response: AccessLevelsResponse = {
          data: await listAccessLevels()
        };

        return Response.json(response, {
          headers: jsonHeaders
        });
      } catch (error) {
        console.error(error);

        return Response.json(
          {
            error: "Unable to load access levels"
          },
          {
            headers: jsonHeaders,
            status: 500
          }
        );
      }
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
