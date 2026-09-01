export const formatCurrency = (value: number): string =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(value)

export const formatDeliveryEstimate = (minDays: number, maxDays: number): string => {
  if (maxDays === 0) return 'Ready today'
  if (minDays === 1 && maxDays === 1) return 'Tomorrow'
  if (minDays === maxDays) return `${minDays} days`
  return `${minDays}-${maxDays} days`
}

export const formatDateTime = (value: string): string =>
  new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))

export const toTitleCase = (value: string): string =>
  value.replace(/(^|[-\s])\S/g, (character) => character.toUpperCase())
