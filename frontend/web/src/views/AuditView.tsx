import { apiRoutes, type AuditEventsResponse } from '@rebirth/shared'
import { RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import {
	authChangedEventName,
	getStoredAuth,
	type StoredAuth,
} from '../auth'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:9908'

function getAuthHeaders(): Record<string, string> {
	const storedAuth = getStoredAuth()

	return storedAuth
		? {
				Authorization: `Bearer ${storedAuth.sessionKey}`,
			}
		: {}
}

function hasAuditAccess(auth: StoredAuth | null): boolean {
	return Boolean(
		auth?.user.username === 'admin' ||
		auth?.user.accessLevels.some(
			(accessLevel) => accessLevel.name.toLowerCase() === 'audit',
		),
	)
}

function formatAuditContent(content: string): string {
	try {
		return JSON.stringify(JSON.parse(content), null, 2)
	} catch {
		return content
	}
}

function formatAuditCreatedAt(createdAt: Date | string): string {
	const date = createdAt instanceof Date ? createdAt : new Date(createdAt)

	if (Number.isNaN(date.getTime())) {
		return String(createdAt)
	}

	return date.toLocaleString()
}

export function AuditView() {
	const [storedAuth, setStoredAuth] = useState<StoredAuth | null>(getStoredAuth)
	const [auditEvents, setAuditEvents] = useState<AuditEventsResponse['data']>(
		[],
	)
	const [error, setError] = useState<string | null>(null)
	const [isLoading, setIsLoading] = useState(true)
	const loadRequestId = useRef(0)
	const isAuthorized = hasAuditAccess(storedAuth)

	const loadAuditEvents = useCallback(async (): Promise<void> => {
		const requestId = loadRequestId.current + 1
		loadRequestId.current = requestId
		setIsLoading(true)

		try {
			const response = await fetch(`${apiBaseUrl}${apiRoutes.auditEvents}`, {
				headers: getAuthHeaders(),
			})

			if (!response.ok) {
				throw new Error('Unable to load audit events')
			}

			const data = (await response.json()) as AuditEventsResponse

			if (requestId === loadRequestId.current) {
				setAuditEvents(data.data)
				setError(null)
			}
		} catch {
			if (requestId === loadRequestId.current) {
				setError('Audit entries are unavailable')
			}
		} finally {
			if (requestId === loadRequestId.current) {
				setIsLoading(false)
			}
		}
	}, [])

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

	useEffect(() => {
		if (isAuthorized) {
			void loadAuditEvents()
		} else {
			setIsLoading(false)
		}
	}, [isAuthorized, loadAuditEvents])

	if (!isAuthorized) {
		return (
			<section className="types-mgmt-view audit-view">
				<div className="access-level-unavailable" role="status">
					<p>
						{storedAuth
							? 'You are not authorized to access this section.'
							: 'You must be authenticated to access this section.'}
					</p>
				</div>
			</section>
		)
	}

	return (
		<section className="types-mgmt-view audit-view">
			<div className="types-mgmt-section">
				<div className="section-heading">
					<p>Audit</p>
					<button
						aria-label="Refresh audit entries"
						className="section-action-button"
						data-tooltip="Refresh"
						type="button"
						onClick={() => void loadAuditEvents()}
					>
						<RefreshCw aria-hidden="true" />
					</button>
				</div>
				{error ? (
					<div className="access-level-unavailable" role="status">
						<p>{error}</p>
						<button
							aria-label="Refresh audit entries"
							className="access-level-refresh-button"
							data-tooltip="Try again"
							type="button"
							onClick={() => void loadAuditEvents()}
						>
							<RefreshCw aria-hidden="true" />
						</button>
					</div>
				) : (
					<div className="data-table-wrap">
						<table className="data-table audit-table">
							<thead>
								<tr>
									<th>id</th>
									<th>name</th>
									<th>created at</th>
									<th>content</th>
								</tr>
							</thead>
							<tbody>
								{isLoading ? (
									<tr>
										<td colSpan={4}>Loading audit entries</td>
									</tr>
								) : auditEvents.length === 0 ? (
									<tr>
										<td className="data-table-empty-cell" colSpan={4}>
											<span>There are no entries</span>
										</td>
									</tr>
								) : (
									auditEvents.map((event) => (
										<tr key={event.id}>
											<td>{event.id}</td>
											<td>{event.name}</td>
											<td>{formatAuditCreatedAt(event.createdAt)}</td>
											<td>
												<pre>{formatAuditContent(event.content)}</pre>
											</td>
										</tr>
									))
								)}
							</tbody>
						</table>
					</div>
				)}
			</div>
		</section>
	)
}
