import { PermissionName } from '@rebirth/shared'
import { Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { authChangedEventName, getStoredAuth, hasStoredPermission } from '../auth'

interface DataExplorerEntity {
	attributes: DataExplorerEntityAttribute[]
	id: string
	listingAttributeName: string
	outlinks: DataExplorerEntityOutlink[]
	source: DataExplorerEntitySource
}

interface DataExplorerEntityAttribute {
	name: string
	value: string
}

interface DataExplorerEntityOutlink {
	name: string
	targetEntityId: string | null
}

type DataExplorerEntitySource =
	| { entityTemplateId: string; type: 'entity-template' }
	| { type: 'scratch' }

function getEntityListingAttributeValue(entity: DataExplorerEntity): string {
	return (
		entity.attributes.find(
			(attribute) => attribute.name === entity.listingAttributeName,
		)?.value ?? ''
	)
}

export function DataExplorerView() {
  const [storedAuth, setStoredAuth] = useState(getStoredAuth)
  const entities: DataExplorerEntity[] = []
  const isAuthenticated = storedAuth !== null
  const isAuthorized =
    hasStoredPermission(storedAuth, PermissionName.Admin) ||
    hasStoredPermission(storedAuth, PermissionName.Manager)

  useEffect(() => {
    function syncAuthState(): void {
      setStoredAuth(getStoredAuth())
    }

    window.addEventListener(authChangedEventName, syncAuthState)
    window.addEventListener('storage', syncAuthState)

    return () => {
      window.removeEventListener(authChangedEventName, syncAuthState)
      window.removeEventListener('storage', syncAuthState)
    }
  }, [])

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
              {entities.length === 0 ? (
                <tr>
                  <td className="data-table-empty-cell">
                    <span>There are no entries</span>
                  </td>
                </tr>
              ) : (
                entities.map((entity) => (
                  <tr key={entity.id} className="data-table-row" tabIndex={0}>
                    <td className="entity-listing-cell">
                      <span>{entity.listingAttributeName}</span>
                      <strong>{getEntityListingAttributeValue(entity)}</strong>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
