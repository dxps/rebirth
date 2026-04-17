import {
  apiRoutes,
  appInfo,
  createHealthResponse,
  isAccessLevelId,
  isCreateAccessLevelInput,
  isUpdateAccessLevelInput,
  jsonHeaders,
  type AccessLevelResponse,
  type AccessLevelsResponse
} from "@rebirth/shared";
import { createAccessLevel, deleteAccessLevel, listAccessLevels, updateAccessLevel } from "./db/access-levels";
import { runMigrations } from "./db/migrate";
import { loadEnvFiles } from "./env";

loadEnvFiles();

const port = Number.parseInt(Bun.env.PORT ?? "9908", 10);

await runMigrations();

const server = Bun.serve({
  port,
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: jsonHeaders,
        status: 204
      });
    }

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

    if (request.method === "POST" && url.pathname === apiRoutes.accessLevels) {
      try {
        const input = await request.json();

        if (!isCreateAccessLevelInput(input)) {
          return Response.json(
            {
              error: "Invalid access level"
            },
            {
              headers: jsonHeaders,
              status: 400
            }
          );
        }

        const createdAccessLevel = await createAccessLevel({
          description: input.description.trim(),
          name: input.name.trim()
        });

        if (!createdAccessLevel) {
          throw new Error("Access level was not created.");
        }

        const response: AccessLevelResponse = {
          data: createdAccessLevel
        };

        return Response.json(response, {
          headers: jsonHeaders,
          status: 201
        });
      } catch (error) {
        console.error(error);

        return Response.json(
          {
            error: "Unable to create access level"
          },
          {
            headers: jsonHeaders,
            status: 500
          }
        );
      }
    }

    const accessLevelMatch = /^\/access-levels\/(\d+)$/.exec(url.pathname);

    if (request.method === "PATCH" && accessLevelMatch) {
      try {
        const id = Number.parseInt(accessLevelMatch[1] ?? "", 10);
        const input = await request.json();

        if (!isAccessLevelId(id) || !isUpdateAccessLevelInput(input)) {
          return Response.json(
            {
              error: "Invalid access level update"
            },
            {
              headers: jsonHeaders,
              status: 400
            }
          );
        }

        const updatedAccessLevel = await updateAccessLevel(id, {
          description: input.description?.trim(),
          name: input.name?.trim()
        });

        if (!updatedAccessLevel) {
          return Response.json(
            {
              error: "Access level not found"
            },
            {
              headers: jsonHeaders,
              status: 404
            }
          );
        }

        const response: AccessLevelResponse = {
          data: updatedAccessLevel
        };

        return Response.json(response, {
          headers: jsonHeaders
        });
      } catch (error) {
        console.error(error);

        return Response.json(
          {
            error: "Unable to update access level"
          },
          {
            headers: jsonHeaders,
            status: 500
          }
        );
      }
    }

    if (request.method === "DELETE" && accessLevelMatch) {
      try {
        const id = Number.parseInt(accessLevelMatch[1] ?? "", 10);

        if (!isAccessLevelId(id)) {
          return Response.json(
            {
              error: "Invalid access level id"
            },
            {
              headers: jsonHeaders,
              status: 400
            }
          );
        }

        const deletedAccessLevel = await deleteAccessLevel(id);

        if (!deletedAccessLevel) {
          return Response.json(
            {
              error: "Access level not found"
            },
            {
              headers: jsonHeaders,
              status: 404
            }
          );
        }

        const response: AccessLevelResponse = {
          data: deletedAccessLevel
        };

        return Response.json(response, {
          headers: jsonHeaders
        });
      } catch (error) {
        console.error(error);

        return Response.json(
          {
            error: "Unable to delete access level"
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
