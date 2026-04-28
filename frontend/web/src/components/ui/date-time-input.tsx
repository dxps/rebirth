import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import {
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
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

interface ParsedDateTimeValue {
	date: Date
	hour: string
	minute: string
	second: string
}

const inputFormats: Record<DateTimeInputMode, string> = {
	date: 'YYYY-MM-DD',
	datetime: 'YYYY-MM-DD HH:mm:ss',
}

const weekdayLabels = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const monthFormatter = new Intl.DateTimeFormat('en', {
	month: 'long',
	year: 'numeric',
})

function padNumber(value: number): string {
	return String(value).padStart(2, '0')
}

function formatDateValue(date: Date): string {
	return `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(
		date.getDate(),
	)}`
}

function formatDateTimeValue(
	date: Date,
	hour: string,
	minute: string,
	second: string,
): string {
	return `${formatDateValue(date)} ${hour}:${minute}:${second}`
}

function parseDateTimeValue(
	value: string,
	mode: DateTimeInputMode,
): ParsedDateTimeValue | null {
	const datePattern =
		mode === 'date'
			? /^(\d{4})-(\d{2})-(\d{2})$/
			: /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/
	const match = value.match(datePattern)

	if (!match) {
		return null
	}

	const year = Number(match[1])
	const month = Number(match[2])
	const day = Number(match[3])
	const date = new Date(year, month - 1, day)

	if (
		date.getFullYear() !== year ||
		date.getMonth() !== month - 1 ||
		date.getDate() !== day
	) {
		return null
	}

	return {
		date,
		hour: match[4] ?? '00',
		minute: match[5] ?? '00',
		second: match[6] ?? '00',
	}
}

function clampTimePart(value: string, max: number): string {
	const numberValue = Number(value)

	if (!Number.isFinite(numberValue)) {
		return '00'
	}

	return padNumber(Math.max(0, Math.min(max, numberValue)))
}

function getCalendarDays(viewDate: Date): Date[] {
	const year = viewDate.getFullYear()
	const month = viewDate.getMonth()
	const firstOfMonth = new Date(year, month, 1)
	const firstCalendarDay = new Date(year, month, 1 - firstOfMonth.getDay())

	return Array.from({ length: 42 }, (_, index) => {
		const date = new Date(firstCalendarDay)
		date.setDate(firstCalendarDay.getDate() + index)
		return date
	})
}

function isSameDay(first: Date, second: Date): boolean {
	return (
		first.getFullYear() === second.getFullYear() &&
		first.getMonth() === second.getMonth() &&
		first.getDate() === second.getDate()
	)
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
	const containerRef = useRef<HTMLSpanElement>(null)
	const parsedValue = useMemo(
		() => parseDateTimeValue(value, mode),
		[mode, value],
	)
	const [isCalendarOpen, setIsCalendarOpen] = useState(false)
	const [viewDate, setViewDate] = useState(
		() => parsedValue?.date ?? new Date(),
	)
	const format = inputFormats[mode]
	const tooltip = `Allowed format: ${format}`
	const calendarDays = getCalendarDays(viewDate)
	const selectedDate = parsedValue?.date ?? null
	const timeParts = {
		hour: parsedValue?.hour ?? '00',
		minute: parsedValue?.minute ?? '00',
		second: parsedValue?.second ?? '00',
	}

	useEffect(() => {
		if (parsedValue) {
			setViewDate(parsedValue.date)
		}
	}, [parsedValue])

	useEffect(() => {
		if (!isCalendarOpen) {
			return
		}

		function closeCalendar(event: PointerEvent): void {
			const target = event.target

			if (
				target instanceof Node &&
				containerRef.current?.contains(target)
			) {
				return
			}

			setIsCalendarOpen(false)
		}

		document.addEventListener('pointerdown', closeCalendar)

		return () => {
			document.removeEventListener('pointerdown', closeCalendar)
		}
	}, [isCalendarOpen])

	function toggleCalendar(): void {
		if (disabled) {
			return
		}

		setIsCalendarOpen((current) => !current)
	}

	function moveMonth(direction: -1 | 1): void {
		setViewDate(
			(current) =>
				new Date(current.getFullYear(), current.getMonth() + direction, 1),
		)
	}

	function selectDate(date: Date): void {
		if (mode === 'date') {
			onChange(formatDateValue(date))
			setIsCalendarOpen(false)
			return
		}

		onChange(
			formatDateTimeValue(
				date,
				timeParts.hour,
				timeParts.minute,
				timeParts.second,
			),
		)
	}

	function updateTimePart(part: 'hour' | 'minute' | 'second', next: string): void {
		const date = selectedDate ?? new Date()
		const nextTimeParts = {
			...timeParts,
			[part]: clampTimePart(next, part === 'hour' ? 23 : 59),
		}

		onChange(
			formatDateTimeValue(
				date,
				nextTimeParts.hour,
				nextTimeParts.minute,
				nextTimeParts.second,
			),
		)
	}

	return (
		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger asChild>
					<span
						ref={containerRef}
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
							aria-expanded={isCalendarOpen}
							aria-label="Open calendar"
							className="date-time-input-picker-button"
							data-no-drag={dataNoDrag}
							data-slot="button"
							disabled={disabled}
							type="button"
							onClick={toggleCalendar}
						>
							<CalendarDays aria-hidden="true" />
						</button>
						{isCalendarOpen ? (
							<div
								className="date-time-calendar-popover"
								data-no-drag={dataNoDrag}
								onPointerDown={(event) => event.stopPropagation()}
							>
								<div className="date-time-calendar-header">
									<button
										aria-label="Previous month"
										className="date-time-calendar-nav"
										data-slot="button"
										type="button"
										onClick={() => moveMonth(-1)}
									>
										<ChevronLeft aria-hidden="true" />
									</button>
									<span>{monthFormatter.format(viewDate)}</span>
									<button
										aria-label="Next month"
										className="date-time-calendar-nav"
										data-slot="button"
										type="button"
										onClick={() => moveMonth(1)}
									>
										<ChevronRight aria-hidden="true" />
									</button>
								</div>
								<div className="date-time-calendar-weekdays">
									{weekdayLabels.map((weekday) => (
										<span key={weekday}>{weekday}</span>
									))}
								</div>
								<div className="date-time-calendar-grid">
									{calendarDays.map((date) => {
										const isOutsideMonth =
											date.getMonth() !== viewDate.getMonth()
										const isSelected =
											selectedDate !== null &&
											isSameDay(date, selectedDate)
										const dateValue = formatDateValue(date)

										return (
											<button
												key={dateValue}
												aria-pressed={isSelected}
												className="date-time-calendar-day"
												data-outside-month={
													isOutsideMonth || undefined
												}
												data-selected={isSelected || undefined}
												data-slot="button"
												type="button"
												onClick={() => selectDate(date)}
											>
												{date.getDate()}
											</button>
										)
									})}
								</div>
								{mode === 'datetime' ? (
									<div className="date-time-calendar-time">
										<label>
											<span>HH</span>
											<input
												aria-label="Hours"
												inputMode="numeric"
												max="23"
												min="0"
												type="number"
												value={timeParts.hour}
												onChange={(event) =>
													updateTimePart(
														'hour',
														event.target.value,
													)
												}
											/>
										</label>
										<label>
											<span>MM</span>
											<input
												aria-label="Minutes"
												inputMode="numeric"
												max="59"
												min="0"
												type="number"
												value={timeParts.minute}
												onChange={(event) =>
													updateTimePart(
														'minute',
														event.target.value,
													)
												}
											/>
										</label>
										<label>
											<span>SS</span>
											<input
												aria-label="Seconds"
												inputMode="numeric"
												max="59"
												min="0"
												type="number"
												value={timeParts.second}
												onChange={(event) =>
													updateTimePart(
														'second',
														event.target.value,
													)
												}
											/>
										</label>
										<button
											className="date-time-calendar-done"
											data-slot="button"
											type="button"
											onClick={() => setIsCalendarOpen(false)}
										>
											Done
										</button>
									</div>
								) : null}
							</div>
						) : null}
					</span>
				</TooltipTrigger>
				<TooltipContent>{tooltip}</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	)
}

export { DateTimeInput, type DateTimeInputMode }
