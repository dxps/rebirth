import {
  apiRoutes,
  appInfo,
  createHealthResponse,
  isAccessLevelId,
  isAttributeTemplateId,
  isCreateAccessLevelInput,
  isCreateAttributeTemplateInput,
  isUpdateAccessLevelInput,
  isUpdateAttributeTemplateInput,
  jsonHeaders,
  type AccessLevelResponse,
  type AccessLevelsResponse,
  type AttributeTemplateResponse,
  type AttributeTemplatesResponse,
  type ApiErrorResponse
} from "@rebirth/shared";
import { createAccessLevel, deleteAccessLevel, listAccessLevels, updateAccessLevel } from "./db/access-levels";
import { createAttributeTemplate, deleteAttributeTemplate, listAttributeTemplates, updateAttributeTemplate } from "./db/attribute-templates";
import { runMigrations } from "./db/migrate";
import { loadEnvFiles } from "./env";

loadEnvFiles();

const port = Number.parseInt(Bun.env.PORT ?? "9908", 10);
const uniqueConflictErrorCode = "23505";
const attributeTemplateUniqueConstraint = "attribute_templates_name_description_unique";
const uniqueConflictResponse: ApiErrorResponse = {
  error: {
    code: "unique_conflict",
    message: "An entry with the same name already exists"
  }
};
const attributeTemplateUniqueConflictResponse: ApiErrorResponse = {
  error: {
    code: "unique_conflict",
    details: "An entry with the same name and description already exists.",
    message: "Name and description not unique"
  }
};

function getErrorProperty(error: unknown, property: string): unknown {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }

  return (error as Record<string, unknown>)[property];
}

function isPostgresErrorWithCode(
  error: unknown,
  code: string,
  seen = new Set<unknown>()
): boolean {
  if (typeof error !== "object" || error === null || seen.has(error)) {
    return false;
  }

  seen.add(error);

  if (getErrorProperty(error, "code") === code) {
    return true;
  }

  for (const property of ["cause", "error", "originalError"]) {
    if (isPostgresErrorWithCode(getErrorProperty(error, property), code, seen)) {
      return true;
    }
  }

  return false;
}

function isPostgresErrorWithConstraint(
  error: unknown,
  constraint: string,
  seen = new Set<unknown>()
): boolean {
  if (typeof error !== "object" || error === null || seen.has(error)) {
    return false;
  }

  seen.add(error);

  if (getErrorProperty(error, "constraint_name") === constraint || getErrorProperty(error, "constraint") === constraint) {
    return true;
  }

  for (const property of ["cause", "error", "originalError"]) {
    if (isPostgresErrorWithConstraint(getErrorProperty(error, property), constraint, seen)) {
      return true;
    }
  }

  return false;
}

function normalizeDefaultValue(value: string | null | undefined): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  const trimmedValue = value.trim();

  return trimmedValue.length > 0 ? trimmedValue : null;
}

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
        if (isPostgresErrorWithCode(error, uniqueConflictErrorCode)) {
          return Response.json(uniqueConflictResponse, {
            headers: jsonHeaders,
            status: 409
          });
        }

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

    if (request.method === "GET" && url.pathname === apiRoutes.attributeTemplates) {
      try {
        const response: AttributeTemplatesResponse = {
          data: await listAttributeTemplates()
        };

        return Response.json(response, {
          headers: jsonHeaders
        });
      } catch (error) {
        console.error(error);

        return Response.json(
          {
            error: "Unable to load attribute templates"
          },
          {
            headers: jsonHeaders,
            status: 500
          }
        );
      }
    }

    if (request.method === "POST" && url.pathname === apiRoutes.attributeTemplates) {
      try {
        const input = await request.json();

        if (!isCreateAttributeTemplateInput(input)) {
          return Response.json(
            {
              error: "Invalid attribute template"
            },
            {
              headers: jsonHeaders,
              status: 400
            }
          );
        }

        const createdAttributeTemplate = await createAttributeTemplate({
          defaultValue: normalizeDefaultValue(input.defaultValue) ?? null,
          description: input.description.trim(),
          isRequired: input.isRequired,
          name: input.name.trim(),
          valueType: input.valueType
        });

        if (!createdAttributeTemplate) {
          throw new Error("Attribute template was not created.");
        }

        const response: AttributeTemplateResponse = {
          data: createdAttributeTemplate
        };

        return Response.json(response, {
          headers: jsonHeaders,
          status: 201
        });
      } catch (error) {
        if (isPostgresErrorWithConstraint(error, attributeTemplateUniqueConstraint)) {
          return Response.json(attributeTemplateUniqueConflictResponse, {
            headers: jsonHeaders,
            status: 409
          });
        }

        if (isPostgresErrorWithCode(error, uniqueConflictErrorCode)) {
          return Response.json(uniqueConflictResponse, {
            headers: jsonHeaders,
            status: 409
          });
        }

        console.error(error);

        return Response.json(
          {
            error: "Unable to create attribute template"
          },
          {
            headers: jsonHeaders,
            status: 500
          }
        );
      }
    }

    const accessLevelMatch = /^\/access-levels\/(\d+)$/.exec(url.pathname);
    const attributeTemplateMatch = /^\/attribute-templates\/([0-9a-f-]+)$/i.exec(url.pathname);

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
        if (isPostgresErrorWithCode(error, uniqueConflictErrorCode)) {
          return Response.json(uniqueConflictResponse, {
            headers: jsonHeaders,
            status: 409
          });
        }

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

    if (request.method === "PATCH" && attributeTemplateMatch) {
      try {
        const id = attributeTemplateMatch[1] ?? "";
        const input = await request.json();

        if (!isAttributeTemplateId(id) || !isUpdateAttributeTemplateInput(input)) {
          return Response.json(
            {
              error: "Invalid attribute template update"
            },
            {
              headers: jsonHeaders,
              status: 400
            }
          );
        }

        const updatedAttributeTemplate = await updateAttributeTemplate(id, {
          defaultValue: normalizeDefaultValue(input.defaultValue),
          description: input.description?.trim(),
          isRequired: input.isRequired,
          name: input.name?.trim(),
          valueType: input.valueType
        });

        if (!updatedAttributeTemplate) {
          return Response.json(
            {
              error: "Attribute template not found"
            },
            {
              headers: jsonHeaders,
              status: 404
            }
          );
        }

        const response: AttributeTemplateResponse = {
          data: updatedAttributeTemplate
        };

        return Response.json(response, {
          headers: jsonHeaders
        });
      } catch (error) {
        if (isPostgresErrorWithConstraint(error, attributeTemplateUniqueConstraint)) {
          return Response.json(attributeTemplateUniqueConflictResponse, {
            headers: jsonHeaders,
            status: 409
          });
        }

        if (isPostgresErrorWithCode(error, uniqueConflictErrorCode)) {
          return Response.json(uniqueConflictResponse, {
            headers: jsonHeaders,
            status: 409
          });
        }

        console.error(error);

        return Response.json(
          {
            error: "Unable to update attribute template"
          },
          {
            headers: jsonHeaders,
            status: 500
          }
        );
      }
    }

    if (request.method === "DELETE" && attributeTemplateMatch) {
      try {
        const id = attributeTemplateMatch[1] ?? "";

        if (!isAttributeTemplateId(id)) {
          return Response.json(
            {
              error: "Invalid attribute template id"
            },
            {
              headers: jsonHeaders,
              status: 400
            }
          );
        }

        const deletedAttributeTemplate = await deleteAttributeTemplate(id);

        if (!deletedAttributeTemplate) {
          return Response.json(
            {
              error: "Attribute template not found"
            },
            {
              headers: jsonHeaders,
              status: 404
            }
          );
        }

        const response: AttributeTemplateResponse = {
          data: deletedAttributeTemplate
        };

        return Response.json(response, {
          headers: jsonHeaders
        });
      } catch (error) {
        console.error(error);

        return Response.json(
          {
            error: "Unable to delete attribute template"
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
