const tidy = (value: string): string => value.trim().replace(/\s+/g, ' ')
const key = (value: string): string => tidy(value).toLocaleLowerCase('en-US')

// Display formatting only. Identity matching and stored source text stay unchanged.
export const medicationNameLabel = (value: string): string => {
  const name = tidy(value)
  if (!name) return 'Medication name unavailable'
  return name.toLowerCase().replace(/(^|[\s/-])([a-z])/g, (_, separator: string, letter: string) => separator + letter.toUpperCase())
    .replace(/\b(Er|Xr|Sr|Dr|Xl|Hcl|Hbr)\b/g, abbreviation => ({ Er: 'ER', Xr: 'XR', Sr: 'SR', Dr: 'DR', Xl: 'XL', Hcl: 'HCl', Hbr: 'HBr' })[abbreviation]!)
}

export const uniqueMedicationLabels = (values: readonly string[] = []): string[] => {
  const seen = new Set<string>()
  return values.flatMap(value => {
    const label = tidy(value)
    const normalized = key(label)
    if (!normalized || seen.has(normalized)) return []
    seen.add(normalized)
    return [label]
  })
}

export const medicationBrandLabels = (genericName: string, brands: readonly string[] = []): string[] =>
  uniqueMedicationLabels(brands).filter(brand => key(brand) !== key(genericName)).map(medicationNameLabel)

export const medicationFormLabel = (value: string): string => {
  const label = tidy(value).toLowerCase()
  return label ? label.charAt(0).toUpperCase() + label.slice(1) : 'Form unavailable'
}

export const medicationCategoryLabel = (value: string): string => {
  const category = key(value).replaceAll('-', ' ')
  return !category || ['uncategorized', 'other', 'other medications'].includes(category)
    ? 'Other medications'
    : category.charAt(0).toUpperCase() + category.slice(1)
}

export const compactMedicationLabels = (values: readonly string[], limit: number): string =>
  values.slice(0, limit).join(' · ') + (values.length > limit ? ` · +${values.length - limit} more` : '')
