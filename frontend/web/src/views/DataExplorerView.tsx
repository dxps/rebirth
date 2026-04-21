import { PermissionName } from '@rebirth/shared'
import { useEffect, useState } from 'react'
import { authChangedEventName, getStoredAuth, hasStoredPermission } from '../auth'

export function DataExplorerView() {
  const [storedAuth, setStoredAuth] = useState(getStoredAuth)
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
    <section className="page-label">
      <h1>Data Explorer</h1>
    </section>
  );
}
