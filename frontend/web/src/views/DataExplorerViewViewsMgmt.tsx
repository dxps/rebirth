import {
	ListFilter,
	Pencil,
	Save,
	Trash2,
	X,
} from 'lucide-react'
import {
	useState,
	type MouseEvent as ReactMouseEvent,
	type SyntheticEvent,
} from 'react'
import { DraggableModal as BaseDraggableModal } from '../components/ui/draggable-modal'

const dataExplorerViewsStorageKeyPrefix = 'rebirth.data-explorer.views'

interface ModalPosition {
	x: number
	y: number
}

export interface DataExplorerSavedView {
	description: string
	id: string
	name: string
	searchText: string
}

interface DataExplorerViewDraft {
	description: string
	id: string | null
	name: string
	searchText: string
}

interface DataExplorerViewsToolbarProps {
	onClearView: () => void
	onManageViews: (event: ReactMouseEvent<HTMLButtonElement>) => void
	onSearchTermChange: (searchTerm: string) => void
	onSelectView: (view: DataExplorerSavedView) => void
	savedViews: DataExplorerSavedView[]
	searchTerm: string
	selectedViewId: string
}

interface DataExplorerViewsModalProps {
	currentSearchTerm: string
	initialPosition: ModalPosition
	onApplyView: (view: DataExplorerSavedView) => void
	onClose: () => void
	onSaveViews: (views: DataExplorerSavedView[]) => void
	savedViews: DataExplorerSavedView[]
	zIndex: number
}

function getDataExplorerViewsStorageKey(userId?: string): string {
	return `${dataExplorerViewsStorageKeyPrefix}.${userId ?? 'anonymous'}`
}

export function readDataExplorerSavedViews(
	userId?: string,
): DataExplorerSavedView[] {
	const rawViews = window.localStorage.getItem(
		getDataExplorerViewsStorageKey(userId),
	)

	if (!rawViews) {
		return []
	}

	try {
		const parsedViews = JSON.parse(rawViews) as unknown

		if (!Array.isArray(parsedViews)) {
			return []
		}

		return parsedViews
			.filter(
				(view): view is DataExplorerSavedView =>
					view !== null &&
					typeof view === 'object' &&
					typeof (view as DataExplorerSavedView).id === 'string' &&
					typeof (view as DataExplorerSavedView).name === 'string' &&
					typeof (view as DataExplorerSavedView).description ===
						'string' &&
					typeof (view as DataExplorerSavedView).searchText ===
						'string',
			)
			.map((view) => ({
				description: view.description,
				id: view.id,
				name: view.name,
				searchText: view.searchText,
			}))
	} catch {
		window.localStorage.removeItem(getDataExplorerViewsStorageKey(userId))
		return []
	}
}

export function writeDataExplorerSavedViews(
	userId: string | undefined,
	views: DataExplorerSavedView[],
): void {
	window.localStorage.setItem(
		getDataExplorerViewsStorageKey(userId),
		JSON.stringify(views),
	)
}

function getEmptyViewDraft(searchText = ''): DataExplorerViewDraft {
	return {
		description: '',
		id: null,
		name: '',
		searchText,
	}
}

export function DataExplorerViewsToolbar({
	onClearView,
	onManageViews,
	onSearchTermChange,
	onSelectView,
	savedViews,
	searchTerm,
	selectedViewId,
}: DataExplorerViewsToolbarProps) {
	const selectedView = savedViews.find((view) => view.id === selectedViewId)

	return (
		<div className="entity-search-controls">
			<button
				aria-label="Manage data explorer views"
				className="entity-views-manage-button"
				data-tooltip="Manage views"
				type="button"
				onClick={onManageViews}
			>
				<ListFilter aria-hidden="true" />
			</button>
			<span className="entity-view-select-wrap">
				<select
					aria-label="Select data explorer view"
					value={selectedViewId}
					onChange={(event) => {
						const view = savedViews.find(
							(candidate) => candidate.id === event.target.value,
						)

						if (view) {
							onSelectView(view)
						} else {
							onClearView()
						}
					}}
				>
					<option value="">Views</option>
					{savedViews.map((view) => (
						<option key={view.id} value={view.id}>
							{view.name}
						</option>
					))}
				</select>
			</span>
			<label
				className="entity-search-field"
				data-tooltip={
					selectedView
						? selectedView.description ||
							`View filter: ${selectedView.searchText}`
						: "Search through entities' attributes names and values"
				}
			>
				<input
					aria-label="Search entities"
					placeholder="Search"
					type="search"
					value={searchTerm}
					onChange={(event) => onSearchTermChange(event.target.value)}
				/>
			</label>
		</div>
	)
}

export function DataExplorerViewsModal({
	currentSearchTerm,
	initialPosition,
	onApplyView,
	onClose,
	onSaveViews,
	savedViews,
	zIndex,
}: DataExplorerViewsModalProps) {
	const [draft, setDraft] = useState<DataExplorerViewDraft>(() =>
		getEmptyViewDraft(currentSearchTerm),
	)
	const [formError, setFormError] = useState<string | null>(null)

	const isEditing = draft.id !== null

	function resetDraft(searchText = ''): void {
		setDraft(getEmptyViewDraft(searchText))
		setFormError(null)
	}

	function editView(view: DataExplorerSavedView): void {
		setDraft({
			description: view.description,
			id: view.id,
			name: view.name,
			searchText: view.searchText,
		})
		setFormError(null)
	}

	function saveView(event: SyntheticEvent<HTMLFormElement>): void {
		event.preventDefault()

		const name = draft.name.trim()
		const description = draft.description.trim()
		const searchText = draft.searchText.trim()

		if (name.length === 0) {
			setFormError('Name is required')
			return
		}

		if (searchText.length === 0) {
			setFormError('Search filter is required')
			return
		}

		const duplicate = savedViews.some(
			(view) =>
				view.id !== draft.id &&
				view.name.trim().toLowerCase() === name.toLowerCase(),
		)

		if (duplicate) {
			setFormError('A view with this name already exists')
			return
		}

		const nextView: DataExplorerSavedView = {
			description,
			id: draft.id ?? crypto.randomUUID(),
			name,
			searchText,
		}
		const nextViews =
			draft.id === null
				? [...savedViews, nextView]
				: savedViews.map((view) =>
						view.id === draft.id ? nextView : view,
					)

		onSaveViews(nextViews)
		resetDraft()
	}

	function deleteView(viewId: string): void {
		onSaveViews(savedViews.filter((view) => view.id !== viewId))

		if (draft.id === viewId) {
			resetDraft()
		}
	}

	return (
		<BaseDraggableModal
			contentClassName="data-explorer-views-modal-content"
			initialPosition={initialPosition}
			initialSize={{ height: 430, width: 560 }}
			minSize={{ height: 360, width: 460 }}
			title="Views :: Manage"
			zIndex={zIndex}
			renderTitlebarActions={() => (
				<button
					aria-label="Close views manager"
					className="draggable-modal-titlebar-button draggable-modal-close"
					data-no-drag="true"
					type="button"
					onPointerDown={(event) => event.stopPropagation()}
					onClick={onClose}
				>
					<X aria-hidden="true" />
				</button>
			)}
		>
			<div
				className="entity-template-edit-form data-explorer-views-form"
				data-no-drag="true"
			>
				<div className="data-explorer-views-grid">
					<div className="data-explorer-views-list" role="list">
						{savedViews.length === 0 ? (
							<p className="data-explorer-views-empty">
								No saved views
							</p>
						) : (
							savedViews.map((view) => (
								<div
									key={view.id}
									className={
										draft.id === view.id
											? 'data-explorer-view-item is-selected'
											: 'data-explorer-view-item'
									}
									role="listitem"
								>
									<button
										className="data-explorer-view-copy"
										type="button"
										onClick={() => editView(view)}
									>
										<strong>{view.name}</strong>
										<span>{view.description}</span>
										<code>{view.searchText}</code>
									</button>
									<div className="data-explorer-view-actions">
										<button
											aria-label={`Apply ${view.name}`}
											className="draggable-modal-titlebar-button"
											data-tooltip="Apply"
											type="button"
											onClick={() => onApplyView(view)}
										>
											<ListFilter aria-hidden="true" />
										</button>
										<button
											aria-label={`Edit ${view.name}`}
											className="draggable-modal-titlebar-button"
											data-tooltip="Edit"
											type="button"
											onClick={() => editView(view)}
										>
											<Pencil aria-hidden="true" />
										</button>
										<button
											aria-label={`Delete ${view.name}`}
											className="draggable-modal-titlebar-button"
											data-tooltip="Delete"
											type="button"
											onClick={() => deleteView(view.id)}
										>
											<Trash2 aria-hidden="true" />
										</button>
									</div>
								</div>
							))
						)}
					</div>
					<form className="data-explorer-view-editor" onSubmit={saveView}>
						<label>
							<span>name</span>
							<input
								value={draft.name}
								onChange={(event) =>
									setDraft((current) => ({
										...current,
										name: event.target.value,
									}))
								}
							/>
						</label>
						<label>
							<span>description</span>
							<textarea
								value={draft.description}
								onChange={(event) =>
									setDraft((current) => ({
										...current,
										description: event.target.value,
									}))
								}
							/>
						</label>
						<label>
							<span>search filter</span>
							<textarea
								value={draft.searchText}
								onChange={(event) =>
									setDraft((current) => ({
										...current,
										searchText: event.target.value,
									}))
								}
							/>
						</label>
						{formError ? (
							<p className="entity-create-error">{formError}</p>
						) : null}
						<div className="data-explorer-view-editor-actions">
							<button type="button" onClick={() => resetDraft()}>
								New
							</button>
							<button
								type="button"
								onClick={() => resetDraft(currentSearchTerm)}
							>
								Use current search
							</button>
							<button type="submit">
								<Save aria-hidden="true" />
								<span>{isEditing ? 'Save' : 'Create'}</span>
							</button>
						</div>
					</form>
				</div>
			</div>
		</BaseDraggableModal>
	)
}
