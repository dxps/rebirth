import { CalendarDays } from 'lucide-react'
import {
	useId,
	useRef,
	type ChangeEvent,
	type ComponentPropsWithoutRef,
} from 'react'
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from './tooltip'

type DateTimeInputMode = 'date' | 'datetime'

type DateTimeInputProps = Omit<
	ComponentPropsWithoutRef<'input'>,
	'onChange' | 'type' | 'value'
> & {
	'data-no-drag'?: string
	mode?: DateTimeInputMode
	onChange: (value: string) => void
	value: string
}

const inputFormats: Record<DateTimeInputMode, string> = {
	date: 'YYYY-MM-DD',
	datetime: 'YYYY-MM-DD HH:mm:ss',
}

function getNativePickerValue(value: string, mode: DateTimeInputMode): string {
	if (mode === 'date') {
		return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : ''
	}

	if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(value)) {
		return value.replace(' ', 'T')
	}

	if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) {
		return value.replace(' ', 'T')
	}

	if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(value)) {
		return value
	}

	return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ? value : ''
}

function getDisplayValueFromPicker(
	value: string,
	mode: DateTimeInputMode,
): string {
	if (mode !== 'datetime') {
		return value
	}

	const displayValue = value.replace('T', ' ')
	return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(displayValue)
		? `${displayValue}:00`
		: displayValue
}

function DateTimeInput({
	className,
	'data-no-drag': dataNoDrag,
	disabled,
	id,
	mode = 'date',
	onChange,
	placeholder,
	value,
	...props
}: DateTimeInputProps) {
	const generatedId = useId()
	const inputId = id ?? generatedId
	const pickerRef = useRef<HTMLInputElement>(null)
	const format = inputFormats[mode]
	const tooltip = `Allowed format: ${format}`

	function openPicker(): void {
		const picker = pickerRef.current

		if (!picker || disabled) {
			return
		}

		picker.focus()

		const pickerWithNativePopover = picker as HTMLInputElement & {
			showPicker?: () => void
		}

		if (typeof pickerWithNativePopover.showPicker === 'function') {
			pickerWithNativePopover.showPicker()
			return
		}

		picker.click()
	}

	function handlePickerChange(event: ChangeEvent<HTMLInputElement>): void {
		onChange(getDisplayValueFromPicker(event.target.value, mode))
	}

	return (
		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger asChild>
					<span
						className="date-time-input"
						data-disabled={disabled || undefined}
						data-no-drag={dataNoDrag}
					>
						<input
							{...props}
							id={inputId}
							className={className}
							disabled={disabled}
							placeholder={placeholder ?? format}
							type="text"
							value={value}
							onChange={(event) => onChange(event.target.value)}
						/>
						<button
							aria-label="Open calendar"
							className="date-time-input-picker-button"
							data-no-drag={dataNoDrag}
							data-slot="button"
							disabled={disabled}
							type="button"
							onClick={openPicker}
						>
							<CalendarDays aria-hidden="true" />
						</button>
						<input
							ref={pickerRef}
							aria-hidden="true"
							className="date-time-input-native-picker"
							disabled={disabled}
							tabIndex={-1}
							step={mode === 'datetime' ? 1 : undefined}
							type={mode === 'date' ? 'date' : 'datetime-local'}
							value={getNativePickerValue(value, mode)}
							onChange={handlePickerChange}
						/>
					</span>
				</TooltipTrigger>
				<TooltipContent>{tooltip}</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	)
}

export { DateTimeInput, type DateTimeInputMode }
