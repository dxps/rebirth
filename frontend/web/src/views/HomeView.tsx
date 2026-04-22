import { appInfo } from '@rebirth/shared'

export function HomeView() {
	return (
		<section className="intro">
			<img className="home-logo" src="/logo1.png" alt="" />
			<h1 className="striped-title">{appInfo.name}</h1>
			<p>{appInfo.description}</p>
		</section>
	)
}
