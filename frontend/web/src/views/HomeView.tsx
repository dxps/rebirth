import { apiRoutes, appInfo, type HealthResponse } from '@rebirth/shared'
import { Server, Smartphone } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:9908'

export function HomeView() {
	const [apiStatus, setApiStatus] = useState('Not checked yet')
	const healthUrl = `${apiBaseUrl}${apiRoutes.health}`

	async function checkApiHealth(): Promise<void> {
		try {
			const response = await fetch(healthUrl)
			const health = (await response.json()) as HealthResponse
			setApiStatus(`${health.appName} API is ${health.status}`)
		} catch {
			setApiStatus('API is unreachable')
		}
	}

	return (
		<section className="intro">
			<h1 className="striped-title">{appInfo.name}</h1>
			<p>{appInfo.description}</p>
			<div className="actions">
				<Button type="button" onClick={checkApiHealth}>
					<Server aria-hidden="true" />
					Check API health
				</Button>
				<div className="mobile-note">
					<Smartphone aria-hidden="true" />
					React Native ready
				</div>
			</div>
			<p className="status">
				<Server aria-hidden="true" />
				{apiStatus}
			</p>
			<p className="route">Service route: {healthUrl}</p>
		</section>
	)
}
