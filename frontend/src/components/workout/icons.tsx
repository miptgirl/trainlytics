import type { ReactNode } from 'react'

/** Stroke icons for workout mode; they take the text colour, and screen readers skip them. */
function Icon({ size, strokeWidth, className, children }: {
  size: number
  strokeWidth: number
  className?: string
  children: ReactNode
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 ${className ?? ''}`}
    >
      {children}
    </svg>
  )
}

type IconProps = { size?: number; strokeWidth?: number; className?: string }

export const CheckIcon = ({ size = 20, strokeWidth = 2.4, className }: IconProps) => (
  <Icon size={size} strokeWidth={strokeWidth} className={className}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Icon>
)

export const PlusIcon = ({ size = 18, strokeWidth = 2.2, className }: IconProps) => (
  <Icon size={size} strokeWidth={strokeWidth} className={className}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
)

export const TrashIcon = ({ size = 20, strokeWidth = 2, className }: IconProps) => (
  <Icon size={size} strokeWidth={strokeWidth} className={className}>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3" />
  </Icon>
)

export const ChevronLeftIcon = ({ size = 20, strokeWidth = 2.2, className }: IconProps) => (
  <Icon size={size} strokeWidth={strokeWidth} className={className}>
    <path d="M15 6l-6 6 6 6" />
  </Icon>
)

export const ChevronRightIcon = ({ size = 20, strokeWidth = 2.2, className }: IconProps) => (
  <Icon size={size} strokeWidth={strokeWidth} className={className}>
    <path d="M9 6l6 6-6 6" />
  </Icon>
)

export const ChevronDownIcon = ({ size = 16, strokeWidth = 2.2, className }: IconProps) => (
  <Icon size={size} strokeWidth={strokeWidth} className={className}>
    <path d="M6 9l6 6 6-6" />
  </Icon>
)
