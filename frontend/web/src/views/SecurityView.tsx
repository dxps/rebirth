import { apiRoutes, type AccessLevel, type AccessLevelsResponse } from '@rebirth/shared'
import { useEffect, useState } from 'react'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:9908'

export function SecurityView() {
	const [accessLevels, setAccessLevels] = useState<AccessLevel[]>([])
	const [error, setError] = useState<string | null>(null)
	const [isLoading, setIsLoading] = useState(true)

	useEffect(() => {
		let isMounted = true

		async function loadAccessLevels(): Promise<void> {
			try {
				const response = await fetch(`${apiBaseUrl}${apiRoutes.accessLevels}`)

				if (!response.ok) {
					throw new Error('Unable to load access levels')
				}

				const data = (await response.json()) as AccessLevelsResponse

				if (isMounted) {
					setAccessLevels(data.accessLevels)
					setError(null)
				}
			} catch {
				if (isMounted) {
					setError('Access levels are unavailable')
				}
			} finally {
				if (isMounted) {
					setIsLoading(false)
				}
			}
		}

		void loadAccessLevels()

		return () => {
			isMounted = false
		}
	}, [])

	return (
		<section className="security-view">
			<div className="section-heading">
				<p>Access Levels</p>
			</div>

			<div className="data-table-wrap">
				<table className="data-table">
					<thead>
							<tr>
							<th>name</th>
							<th>description</th>
						</tr>
					</thead>
					<tbody>
						{isLoading ? (
							<tr>
								<td colSpan={2}>Loading access levels</td>
							</tr>
						) : error ? (
							<tr>
								<td colSpan={2}>{error}</td>
							</tr>
						) : accessLevels.length === 0 ? (
							<tr>
								<td colSpan={2}>No access levels found</td>
							</tr>
						) : (
							accessLevels.map((accessLevel) => (
								<tr key={accessLevel.id}>
									<td>{accessLevel.name}</td>
									<td>{accessLevel.description}</td>
								</tr>
							))
						)}
					</tbody>
				</table>
			</div>
		</section>
	)
}
