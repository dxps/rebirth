import type { ComponentPropsWithoutRef } from 'react'

import { cn } from '@/lib/utils'

function Skeleton({
	className,
	...props
}: ComponentPropsWithoutRef<'span'>) {
	return (
		<span
			aria-hidden="true"
			className={cn('skeleton', className)}
			{...props}
		/>
	)
}

export { Skeleton }
