import { useMemo, useState } from 'react'

export interface CustomDropdownOption {
	label: string
	searchText?: string
	value: string
}

interface CustomDropdownProps {
	ariaLabel: string
	emptyText?: string
	options: CustomDropdownOption[]
	placeholder?: string
	value: string
	onChange: (value: string) => void
}

export function CustomDropdown({
	ariaLabel,
	emptyText = 'No entries found',
	options,
	placeholder = 'Select an entry',
	value,
	onChange,
}: CustomDropdownProps) {
	const [isOpen, setIsOpen] = useState(false)
	const [searchTerm, setSearchTerm] = useState('')
	const selectedOption =
		options.find((option) => option.value === value) ?? null
	const normalizedSearchTerm = searchTerm.trim().toLowerCase()
	const filteredOptions = useMemo(() => {
		if (normalizedSearchTerm.length === 0) {
			return options
		}

		return options.filter((option) =>
			(option.searchText ?? option.label)
				.toLowerCase()
				.includes(normalizedSearchTerm),
		)
	}, [normalizedSearchTerm, options])

	return (
		<span className="custom-dropdown">
			<input
				aria-expanded={isOpen}
				aria-haspopup="listbox"
				aria-label={ariaLabel}
				className="custom-dropdown-trigger"
				data-empty={selectedOption ? undefined : 'true'}
				placeholder={selectedOption?.label ?? placeholder}
				type="text"
				value={searchTerm}
				onChange={(event) => {
					setSearchTerm(event.target.value)
					setIsOpen(true)
				}}
				onFocus={() => setIsOpen(true)}
				onKeyDown={(event) => {
					if (event.key === 'Escape') {
						setSearchTerm('')
						setIsOpen(false)
					}
				}}
			/>
			{isOpen ? (
				<div className="custom-dropdown-menu" role="listbox">
					{filteredOptions.map((option) => (
						<button
							key={option.value}
							aria-selected={option.value === value}
							className="custom-dropdown-option"
							role="option"
							type="button"
							onClick={() => {
								onChange(option.value)
								setSearchTerm('')
								setIsOpen(false)
							}}
						>
							{option.label}
						</button>
					))}
					{filteredOptions.length === 0 ? (
						<p className="custom-dropdown-empty">{emptyText}</p>
					) : null}
				</div>
			) : null}
		</span>
	)
}
