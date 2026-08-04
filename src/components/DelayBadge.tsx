type Status = 'onTime' | 'delayed' | 'cancelled' | 'unknown' | 'notStarted'

type Props = {
  status: Status
  delayMinutes: number
}

const LABELS: Record<Status, string> = {
  onTime: 'punktualnie',
  delayed: 'opóźniony',
  cancelled: 'odwołany',
  unknown: 'brak danych',
  notStarted: 'jeszcze nie wyjechał',
}

const STYLES: Record<Status, string> = {
  onTime: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  delayed: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  cancelled: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  unknown: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
  notStarted: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
}

export function DelayBadge({ status, delayMinutes }: Props) {
  const text = status === 'delayed' ? `+${delayMinutes} min` : LABELS[status]
  return <span className={`rounded-full px-2.5 py-0.5 text-sm font-medium ${STYLES[status]}`}>{text}</span>
}
