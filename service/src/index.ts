import {
  apiRoutes,
  appInfo,
  createHealthResponse,
  isAccessLevelId,
  isAttributeTemplateId,
  isCreateAccessLevelInput,
  isCreateAttributeTemplateInput,
  isCreateEntityInput,
  isCreateEntityTemplateInput,
  isCreateUserInput,
  isEntityId,
  isEntityTemplateId,
  isLoginInput,
  isUpdateEmailInput,
  isUserId,
  isUpdateAccessLevelInput,
  isUpdateAttributeTemplateInput,
  isUpdateEntityInput,
  isUpdateEntityTemplateInput,
  isUpdatePasswordInput,
  isUpdateUserInput,
  jsonHeaders,
  PermissionName,
  type AccessLevelResponse,
  type AccessLevelsResponse,
  type AttributeTemplateResponse,
  type AttributeTemplatesResponse,
  type EntityTemplateResponse,
  type EntityTemplatesResponse,
  type Entity,
  type EntityResponse,
  type EntitiesResponse,
  type ApiErrorResponse,
  type LoginResponse,
  type PermissionsResponse,
  type User,
  type UserResponse,
  type UsersResponse
} from "@rebirth/shared";
import { createAccessLevel, deleteAccessLevel, listAccessLevels, updateAccessLevel } from "./db/access-levels";
import { createAttributeTemplate, deleteAttributeTemplate, listAttributeTemplates, updateAttributeTemplate } from "./db/attribute-templates";
import { createEntity, deleteEntity, EntityValidationError, getEntity, listEntities, updateEntity } from "./db/entities";
import { createEntityTemplate, deleteEntityTemplate, listEntityTemplates, updateEntityTemplate } from "./db/entity-templates";
import { listPermissions } from "./db/permissions";
import { authenticateUser, countUsers, createUser, createUserSession, deleteUser, getUserBySessionKey, listUsers, revokeUserSession, updateUser, updateUserEmail, updateUserPassword } from "./db/users";
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
const publicAccessLevelId = 1;
const maskedAttributeValue = "******";

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

function getErrorMessage(error: unknown): string | undefined {
  if (error instanceof Error) {
    return error.message;
  }

  const message = getErrorProperty(error, "message");
  return typeof message === "string" ? message : undefined;
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

function hasPermission(user: User, permission: PermissionName): boolean {
  return user.permissions.some((userPermission) => userPermission.name === permission);
}

function canManageData(user: User): boolean {
  return hasPermission(user, PermissionName.Admin) || hasPermission(user, PermissionName.Editor);
}

function canViewData(user: User): boolean {
  return canManageData(user) || hasPermission(user, PermissionName.Viewer);
}

function canManageSecurity(user: User): boolean {
  return hasPermission(user, PermissionName.Admin);
}

function maskRestrictedEntityValues(entity: Entity): Entity {
  return {
    ...entity,
    attributes: entity.attributes.map((attribute) => ({
      ...attribute,
      value: attribute.accessLevelId === publicAccessLevelId ? attribute.value : maskedAttributeValue
    }))
  };
}

function getVisibleEntity(user: User, entity: Entity): Entity {
  return canManageData(user) ? entity : maskRestrictedEntityValues(entity);
}

async function getAuthenticatedUser(request: Request): Promise<User | undefined> {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return undefined;
  }

  const sessionKey = authorization.slice("Bearer ".length).trim();

  if (!sessionKey) {
    return undefined;
  }

  return await getUserBySessionKey(sessionKey);
}

function getRequestSessionKey(request: Request): string | undefined {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return undefined;
  }

  const sessionKey = authorization.slice("Bearer ".length).trim();

  return sessionKey.length > 0 ? sessionKey : undefined;
}

function authenticationRequiredResponse(): Response {
  return Response.json(
    {
      error: "Authentication required"
    },
    {
      headers: {
        ...jsonHeaders,
        "WWW-Authenticate": "Bearer realm=\"Rebirth\""
      },
      status: 401
    }
  );
}

function authorizationRequiredResponse(): Response {
  return Response.json(
    {
      error: "Insufficient permissions"
    },
    {
      headers: jsonHeaders,
      status: 403
    }
  );
}

async function requireAuthenticatedUser(request: Request): Promise<Response | User> {
  const user = await getAuthenticatedUser(request);

  if (!user) {
    return authenticationRequiredResponse();
  }

  return user;
}

async function requireDataManager(request: Request): Promise<Response | User> {
  const user = await requireAuthenticatedUser(request);

  if (user instanceof Response) {
    return user;
  }

  if (!canManageData(user)) {
    return authorizationRequiredResponse();
  }

  return user;
}

async function requireDataViewer(request: Request): Promise<Response | User> {
  const user = await requireAuthenticatedUser(request);

  if (user instanceof Response) {
    return user;
  }

  if (!canViewData(user)) {
    return authorizationRequiredResponse();
  }

  return user;
}

async function requireSecurityManager(request: Request): Promise<Response | User> {
  const user = await requireAuthenticatedUser(request);

  if (user instanceof Response) {
    return user;
  }

  if (!canManageSecurity(user)) {
    return authorizationRequiredResponse();
  }

  return user;
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

    if (request.method === "GET" && url.pathname === apiRoutes.authMe) {
      const authenticatedUser = await requireAuthenticatedUser(request);

      if (authenticatedUser instanceof Response) {
        return authenticatedUser;
      }

      const response: UserResponse = {
        data: authenticatedUser
      };

      return Response.json(response, {
        headers: jsonHeaders
      });
    }

    if (request.method === "POST" && url.pathname === apiRoutes.authLogin) {
      try {
        const input = await request.json();

        if (!isLoginInput(input)) {
          return Response.json(
            {
              error: "Invalid login"
            },
            {
              headers: jsonHeaders,
              status: 400
            }
          );
        }

        const authenticatedUser = await authenticateUser(
          input.identifier,
          input.password
        );

        if (!authenticatedUser) {
          return Response.json(
            {
              error: "Invalid username or password"
            },
            {
              headers: jsonHeaders,
              status: 401
            }
          );
        }

        const sessionKey = await createUserSession(authenticatedUser.id);
        const response: LoginResponse = {
          data: {
            sessionKey,
            user: authenticatedUser
          }
        };

        return Response.json(response, {
          headers: jsonHeaders
        });
      } catch (error) {
        console.error(error);

        return Response.json(
          {
            error: "Unable to login"
          },
          {
            headers: jsonHeaders,
            status: 500
          }
        );
      }
    }

    if (request.method === "POST" && url.pathname === apiRoutes.authLogout) {
      const sessionKey = getRequestSessionKey(request);

      if (!sessionKey) {
        return authenticationRequiredResponse();
      }

      try {
        await revokeUserSession(sessionKey);

        return new Response(null, {
          headers: jsonHeaders,
          status: 204
        });
      } catch (error) {
        console.error(error);

        return Response.json(
          {
            error: "Unable to logout"
          },
          {
            headers: jsonHeaders,
            status: 500
          }
        );
      }
    }

    if (request.method === "PUT" && url.pathname === apiRoutes.userPassword) {
      const authenticatedUser = await requireAuthenticatedUser(request);

      if (authenticatedUser instanceof Response) {
        return authenticatedUser;
      }

      try {
        const input = await request.json();

        if (!isUpdatePasswordInput(input)) {
          return Response.json(
            {
              error: "Invalid password update"
            },
            {
              headers: jsonHeaders,
              status: 400
            }
          );
        }

        const updatedUser = await updateUserPassword(
          authenticatedUser.id,
          input.currentPassword,
          input.newPassword
        );

        if (updatedUser === "invalid_current_password") {
          return Response.json(
            {
              error: "Current password is incorrect"
            },
            {
              headers: jsonHeaders,
              status: 401
            }
          );
        }

        if (!updatedUser) {
          return Response.json(
            {
              error: "User not found"
            },
            {
              headers: jsonHeaders,
              status: 404
            }
          );
        }

        const response: UserResponse = {
          data: updatedUser
        };

        return Response.json(response, {
          headers: jsonHeaders
        });
      } catch (error) {
        console.error(error);

        return Response.json(
          {
            error: "Unable to update password"
          },
          {
            headers: jsonHeaders,
            status: 500
          }
        );
      }
    }

    if (request.method === "PUT" && url.pathname === apiRoutes.userEmail) {
      const authenticatedUser = await requireAuthenticatedUser(request);

      if (authenticatedUser instanceof Response) {
        return authenticatedUser;
      }

      try {
        const input = await request.json();

        if (!isUpdateEmailInput(input)) {
          return Response.json(
            {
              error: "Invalid email update"
            },
            {
              headers: jsonHeaders,
              status: 400
            }
          );
        }

        const updatedUser = await updateUserEmail(
          authenticatedUser.id,
          input.email,
          input.firstName,
          input.lastName
        );

        if (!updatedUser) {
          return Response.json(
            {
              error: "User not found"
            },
            {
              headers: jsonHeaders,
              status: 404
            }
          );
        }

        const response: UserResponse = {
          data: updatedUser
        };

        return Response.json(response, {
          headers: jsonHeaders
        });
      } catch (error) {
        if (error instanceof EntityValidationError) {
          return Response.json(
            {
              error: getErrorMessage(error) ?? "Invalid entity"
            },
            {
              headers: jsonHeaders,
              status: 400
            }
          );
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
            error: "Unable to update email"
          },
          {
            headers: jsonHeaders,
            status: 500
          }
        );
      }
    }

    if (request.method === "GET" && url.pathname === apiRoutes.permissions) {
      try {
        const response: PermissionsResponse = {
          data: await listPermissions()
        };

        return Response.json(response, {
          headers: jsonHeaders
        });
      } catch (error) {
        if (error instanceof EntityValidationError) {
          return Response.json(
            {
              error: getErrorMessage(error) ?? "Invalid entity update"
            },
            {
              headers: jsonHeaders,
              status: 400
            }
          );
        }

        console.error(error);

        return Response.json(
          {
            error: "Unable to load permissions"
          },
          {
            headers: jsonHeaders,
            status: 500
          }
        );
      }
    }

    if (request.method === "GET" && url.pathname === apiRoutes.users) {
      const authenticatedUser = await requireSecurityManager(request);

      if (authenticatedUser instanceof Response) {
        return authenticatedUser;
      }

      try {
        const response: UsersResponse = {
          data: await listUsers()
        };

        return Response.json(response, {
          headers: jsonHeaders
        });
      } catch (error) {
        console.error(error);

        return Response.json(
          {
            error: "Unable to load users"
          },
          {
            headers: jsonHeaders,
            status: 500
          }
        );
      }
    }

    if (request.method === "POST" && url.pathname === apiRoutes.users) {
      try {
        const existingUserCount = await countUsers();

        if (existingUserCount > 0) {
          const authenticatedUser = await requireSecurityManager(request);

          if (authenticatedUser instanceof Response) {
            return authenticatedUser;
          }
        }

        const input = await request.json();

        if (!isCreateUserInput(input)) {
          return Response.json(
            {
              error: "Invalid user"
            },
            {
              headers: jsonHeaders,
              status: 400
            }
          );
        }

        const createdUser = await createUser({
          email: input.email.trim(),
          firstName: input.firstName.trim(),
          lastName: input.lastName.trim(),
          password: input.password,
          permissionIds: input.permissionIds,
          username: input.username.trim()
        });

        if (!createdUser) {
          throw new Error("User was not created.");
        }

        const response: UserResponse = {
          data: createdUser
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
            error: "Unable to create user"
          },
          {
            headers: jsonHeaders,
            status: 500
          }
        );
      }
    }

    if (request.method === "GET" && url.pathname === apiRoutes.accessLevels) {
      const authenticatedUser = await requireDataViewer(request);

      if (authenticatedUser instanceof Response) {
        return authenticatedUser;
      }

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
      const authenticatedUser = await requireSecurityManager(request);

      if (authenticatedUser instanceof Response) {
        return authenticatedUser;
      }

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
      const authenticatedUser = await requireDataViewer(request);

      if (authenticatedUser instanceof Response) {
        return authenticatedUser;
      }

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
      const authenticatedUser = await requireDataManager(request);

      if (authenticatedUser instanceof Response) {
        return authenticatedUser;
      }

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
          accessLevelId: input.accessLevelId,
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

    if (request.method === "GET" && url.pathname === apiRoutes.entityTemplates) {
      const authenticatedUser = await requireDataViewer(request);

      if (authenticatedUser instanceof Response) {
        return authenticatedUser;
      }

      try {
        const response: EntityTemplatesResponse = {
          data: await listEntityTemplates()
        };

        return Response.json(response, {
          headers: jsonHeaders
        });
      } catch (error) {
        console.error(error);

        return Response.json(
          {
            error: "Unable to load entity templates"
          },
          {
            headers: jsonHeaders,
            status: 500
          }
        );
      }
    }

    if (request.method === "POST" && url.pathname === apiRoutes.entityTemplates) {
      const authenticatedUser = await requireDataManager(request);

      if (authenticatedUser instanceof Response) {
        return authenticatedUser;
      }

      try {
        const input = await request.json();

        if (!isCreateEntityTemplateInput(input)) {
          return Response.json(
            {
              error: "Invalid entity template"
            },
            {
              headers: jsonHeaders,
              status: 400
            }
          );
        }

        const createdEntityTemplate = await createEntityTemplate({
          attributes: input.attributes,
          description: input.description.trim(),
          links: input.links,
          listingAttributeId: input.listingAttributeId,
          name: input.name.trim()
        });

        if (!createdEntityTemplate) {
          throw new Error("Entity template was not created.");
        }

        const response: EntityTemplateResponse = {
          data: createdEntityTemplate
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
            error: "Unable to create entity template"
          },
          {
            headers: jsonHeaders,
            status: 500
          }
        );
      }
    }

    if (request.method === "GET" && url.pathname === apiRoutes.entities) {
      const authenticatedUser = await requireDataViewer(request);

      if (authenticatedUser instanceof Response) {
        return authenticatedUser;
      }

      try {
        const response: EntitiesResponse = {
          data: (await listEntities()).map((entity) => getVisibleEntity(authenticatedUser, entity))
        };

        return Response.json(response, {
          headers: jsonHeaders
        });
      } catch (error) {
        console.error(error);

        return Response.json(
          {
            error: "Unable to load entities"
          },
          {
            headers: jsonHeaders,
            status: 500
          }
        );
      }
    }

    if (request.method === "POST" && url.pathname === apiRoutes.entities) {
      const authenticatedUser = await requireDataManager(request);

      if (authenticatedUser instanceof Response) {
        return authenticatedUser;
      }

      try {
        const input = await request.json();

        if (!isCreateEntityInput(input)) {
          return Response.json(
            {
              error: "Invalid entity"
            },
            {
              headers: jsonHeaders,
              status: 400
            }
          );
        }

        const createdEntity = await createEntity(input);

        if (!createdEntity) {
          return Response.json(
            {
              error: "Entity template not found"
            },
            {
              headers: jsonHeaders,
              status: 404
            }
          );
        }

        const response: EntityResponse = {
          data: createdEntity
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
            error: "Unable to create entity"
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
    const entityMatch = /^\/entities\/([0-9a-f-]+)$/i.exec(url.pathname);
    const entityTemplateMatch = /^\/entity-templates\/([0-9a-f-]+)$/i.exec(url.pathname);
    const userMatch = /^\/users\/([0-9a-f-]+)$/i.exec(url.pathname);

    if (request.method === "GET" && entityMatch) {
      const authenticatedUser = await requireDataViewer(request);

      if (authenticatedUser instanceof Response) {
        return authenticatedUser;
      }

      try {
        const id = entityMatch[1] ?? "";

        if (!isEntityId(id)) {
          return Response.json(
            {
              error: "Invalid entity id"
            },
            {
              headers: jsonHeaders,
              status: 400
            }
          );
        }

        const entity = await getEntity(id);

        if (!entity) {
          return Response.json(
            {
              error: "Entity not found"
            },
            {
              headers: jsonHeaders,
              status: 404
            }
          );
        }

        const response: EntityResponse = {
          data: getVisibleEntity(authenticatedUser, entity)
        };

        return Response.json(response, {
          headers: jsonHeaders
        });
      } catch (error) {
        console.error(error);

        return Response.json(
          {
            error: "Unable to load entity"
          },
          {
            headers: jsonHeaders,
            status: 500
          }
        );
      }
    }

    if (request.method === "PUT" && entityMatch) {
      const authenticatedUser = await requireDataManager(request);

      if (authenticatedUser instanceof Response) {
        return authenticatedUser;
      }

      try {
        const id = entityMatch[1] ?? "";
        const input = await request.json();

        if (!isEntityId(id) || !isUpdateEntityInput(input)) {
          return Response.json(
            {
              error: "Invalid entity update"
            },
            {
              headers: jsonHeaders,
              status: 400
            }
          );
        }

        const updatedEntity = await updateEntity(id, {
          attributes: input.attributes,
          entityTemplateId: input.entityTemplateId,
          links: input.links,
          listingAttributeId: input.listingAttributeId
        });

        if (!updatedEntity) {
          return Response.json(
            {
              error: "Entity not found"
            },
            {
              headers: jsonHeaders,
              status: 404
            }
          );
        }

        const response: EntityResponse = {
          data: updatedEntity
        };

        return Response.json(response, {
          headers: jsonHeaders
        });
      } catch (error) {
        console.error(error);

        return Response.json(
          {
            error: "Unable to update entity"
          },
          {
            headers: jsonHeaders,
            status: 500
          }
        );
      }
    }

    if (request.method === "DELETE" && entityMatch) {
      const authenticatedUser = await requireDataManager(request);

      if (authenticatedUser instanceof Response) {
        return authenticatedUser;
      }

      try {
        const id = entityMatch[1] ?? "";

        if (!isEntityId(id)) {
          return Response.json(
            {
              error: "Invalid entity id"
            },
            {
              headers: jsonHeaders,
              status: 400
            }
          );
        }

        const deletedEntity = await deleteEntity(id);

        if (!deletedEntity) {
          return Response.json(
            {
              error: "Entity not found"
            },
            {
              headers: jsonHeaders,
              status: 404
            }
          );
        }

        const response: EntityResponse = {
          data: deletedEntity
        };

        return Response.json(response, {
          headers: jsonHeaders
        });
      } catch (error) {
        if (error instanceof EntityValidationError) {
          return Response.json(
            {
              error: getErrorMessage(error) ?? "Invalid entity delete"
            },
            {
              headers: jsonHeaders,
              status: 409
            }
          );
        }

        console.error(error);

        return Response.json(
          {
            error: "Unable to delete entity"
          },
          {
            headers: jsonHeaders,
            status: 500
          }
        );
      }
    }

    if (request.method === "PATCH" && accessLevelMatch) {
      const authenticatedUser = await requireSecurityManager(request);

      if (authenticatedUser instanceof Response) {
        return authenticatedUser;
      }

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
      const authenticatedUser = await requireSecurityManager(request);

      if (authenticatedUser instanceof Response) {
        return authenticatedUser;
      }

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
      const authenticatedUser = await requireDataManager(request);

      if (authenticatedUser instanceof Response) {
        return authenticatedUser;
      }

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
          accessLevelId: input.accessLevelId,
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
      const authenticatedUser = await requireDataManager(request);

      if (authenticatedUser instanceof Response) {
        return authenticatedUser;
      }

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

    if (request.method === "PATCH" && entityTemplateMatch) {
      const authenticatedUser = await requireDataManager(request);

      if (authenticatedUser instanceof Response) {
        return authenticatedUser;
      }

      try {
        const id = entityTemplateMatch[1] ?? "";
        const input = await request.json();

        if (!isEntityTemplateId(id) || !isUpdateEntityTemplateInput(input)) {
          return Response.json(
            {
              error: "Invalid entity template update"
            },
            {
              headers: jsonHeaders,
              status: 400
            }
          );
        }

        const updatedEntityTemplate = await updateEntityTemplate(id, {
          attributes: input.attributes,
          description: input.description?.trim(),
          links: input.links,
          listingAttributeId: input.listingAttributeId,
          name: input.name?.trim()
        });

        if (!updatedEntityTemplate) {
          return Response.json(
            {
              error: "Entity template not found"
            },
            {
              headers: jsonHeaders,
              status: 404
            }
          );
        }

        const response: EntityTemplateResponse = {
          data: updatedEntityTemplate
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
            error: "Unable to update entity template"
          },
          {
            headers: jsonHeaders,
            status: 500
          }
        );
      }
    }

    if (request.method === "DELETE" && entityTemplateMatch) {
      const authenticatedUser = await requireDataManager(request);

      if (authenticatedUser instanceof Response) {
        return authenticatedUser;
      }

      try {
        const id = entityTemplateMatch[1] ?? "";

        if (!isEntityTemplateId(id)) {
          return Response.json(
            {
              error: "Invalid entity template id"
            },
            {
              headers: jsonHeaders,
              status: 400
            }
          );
        }

        const deletedEntityTemplate = await deleteEntityTemplate(id);

        if (!deletedEntityTemplate) {
          return Response.json(
            {
              error: "Entity template not found"
            },
            {
              headers: jsonHeaders,
              status: 404
            }
          );
        }

        const response: EntityTemplateResponse = {
          data: deletedEntityTemplate
        };

        return Response.json(response, {
          headers: jsonHeaders
        });
      } catch (error) {
        console.error(error);

        return Response.json(
          {
            error: "Unable to delete entity template"
          },
          {
            headers: jsonHeaders,
            status: 500
          }
        );
      }
    }

    if (request.method === "PATCH" && userMatch) {
      const authenticatedUser = await requireSecurityManager(request);

      if (authenticatedUser instanceof Response) {
        return authenticatedUser;
      }

      try {
        const id = userMatch[1] ?? "";
        const input = await request.json();

        if (!isUserId(id) || !isUpdateUserInput(input)) {
          return Response.json(
            {
              error: "Invalid user update"
            },
            {
              headers: jsonHeaders,
              status: 400
            }
          );
        }

        const updatedUser = await updateUser(id, {
          email: input.email?.trim(),
          firstName: input.firstName?.trim(),
          lastName: input.lastName?.trim(),
          password: input.password,
          permissionIds: input.permissionIds,
          username: input.username?.trim()
        });

        if (!updatedUser) {
          return Response.json(
            {
              error: "User not found"
            },
            {
              headers: jsonHeaders,
              status: 404
            }
          );
        }

        const response: UserResponse = {
          data: updatedUser
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
            error: "Unable to update user"
          },
          {
            headers: jsonHeaders,
            status: 500
          }
        );
      }
    }

    if (request.method === "DELETE" && userMatch) {
      const authenticatedUser = await requireSecurityManager(request);

      if (authenticatedUser instanceof Response) {
        return authenticatedUser;
      }

      try {
        const id = userMatch[1] ?? "";

        if (!isUserId(id)) {
          return Response.json(
            {
              error: "Invalid user id"
            },
            {
              headers: jsonHeaders,
              status: 400
            }
          );
        }

        const deletedUser = await deleteUser(id);

        if (!deletedUser) {
          return Response.json(
            {
              error: "User not found"
            },
            {
              headers: jsonHeaders,
              status: 404
            }
          );
        }

        const response: UserResponse = {
          data: deletedUser
        };

        return Response.json(response, {
          headers: jsonHeaders
        });
      } catch (error) {
        console.error(error);

        return Response.json(
          {
            error: "Unable to delete user"
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
