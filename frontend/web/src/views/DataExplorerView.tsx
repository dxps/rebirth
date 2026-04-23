import {
	apiRoutes,
	PermissionName,
	type EntitiesResponse,
	type Entity,
} from '@rebirth/shared'
import { Plus, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { authChangedEventName, getStoredAuth, hasStoredPermission } from '../auth'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:9908'

function getEntityListingAttribute(entity: Entity) {
	return (
		entity.attributes.find(
			(attribute) => attribute.id === entity.listingAttributeId,
		) ?? null
	)
}

export function DataExplorerView() {
  const [storedAuth, setStoredAuth] = useState(getStoredAuth)
  const [entities, setEntities] = useState<Entity[]>([])
  const [entitiesError, setEntitiesError] = useState<string | null>(null)
  const [isLoadingEntities, setIsLoadingEntities] = useState(true)
  const isMountedRef = useRef(false)
  const loadRequestId = useRef(0)
  const isAuthenticated = storedAuth !== null
  const isAuthorized =
    hasStoredPermission(storedAuth, PermissionName.Admin) ||
    hasStoredPermission(storedAuth, PermissionName.Manager)

  const loadEntities = useCallback(async (): Promise<void> => {
    const requestId = loadRequestId.current + 1
    loadRequestId.current = requestId

    setIsLoadingEntities(true)

    try {
      const response = await fetch(`${apiBaseUrl}${apiRoutes.entities}`)

      if (!response.ok) {
        throw new Error('Unable to load entities')
      }

      const data = (await response.json()) as EntitiesResponse

      if (isMountedRef.current && requestId === loadRequestId.current) {
        setEntities(data.data)
        setEntitiesError(null)
      }
    } catch {
      if (isMountedRef.current && requestId === loadRequestId.current) {
        setEntitiesError('Data is unavailable')
      }
    } finally {
      if (isMountedRef.current && requestId === loadRequestId.current) {
        setIsLoadingEntities(false)
      }
    }
  }, [])

  useEffect(() => {
    isMountedRef.current = true

    function syncAuthState(): void {
      setStoredAuth(getStoredAuth())
    }

    window.addEventListener(authChangedEventName, syncAuthState)
    window.addEventListener('storage', syncAuthState)

    return () => {
      isMountedRef.current = false
      window.removeEventListener(authChangedEventName, syncAuthState)
      window.removeEventListener('storage', syncAuthState)
    }
  }, [])

  useEffect(() => {
    if (isAuthorized) {
      void loadEntities()
    }
  }, [isAuthorized, loadEntities])

  if (!isAuthorized) {
    return (
      <section className="page-label">
        <p>
          {isAuthenticated
            ? 'You are not authorized to access this section.'
            : 'You must be authenticated to access this section.'}
        </p>
      </section>
    )
  }

  return (
    <section className="types-mgmt-view data-explorer-view">
      <div className="types-mgmt-section">
        <div className="section-heading">
          <p>Entities</p>
        </div>

        {entitiesError ? (
          <div className="access-level-unavailable" role="status">
            <p>{entitiesError}</p>
            <button
              aria-label="Refresh entities"
              className="access-level-refresh-button"
              data-tooltip="Try again"
              type="button"
              onClick={() => void loadEntities()}
            >
              <RefreshCw aria-hidden="true" />
            </button>
          </div>
        ) : (
          <div className="data-table-wrap templates-table-wrap">
            <table className="data-table entities-table">
              <thead>
                <tr>
                  <th className="data-table-action-heading">
                    <button
                      aria-label="Create entity"
                      className="section-action-button"
                      data-tooltip="Add an entity"
                      disabled
                      type="button"
                    >
                      <Plus aria-hidden="true" />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {isLoadingEntities ? (
                  <tr>
                    <td>Loading entities</td>
                  </tr>
                ) : entities.length === 0 ? (
                  <tr>
                    <td className="data-table-empty-cell">
                      <span>There are no entries</span>
                    </td>
                  </tr>
                ) : (
                  entities.map((entity) => {
                    const listingAttribute = getEntityListingAttribute(entity)

                    return (
                      <tr
                        key={entity.id}
                        className="data-table-row"
                        tabIndex={0}
                      >
                        <td className="entity-listing-cell">
                          <span>{listingAttribute?.name ?? ''}</span>
                          <strong>{listingAttribute?.value ?? ''}</strong>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}
