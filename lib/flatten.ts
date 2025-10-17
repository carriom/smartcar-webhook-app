export type FlattenedEntry = { path: string; value: number | string | boolean | null; unit?: string }

export function flattenData(
  data: Record<string, unknown>,
  parentKey: string[] = []
): FlattenedEntry[] {
  const entries: FlattenedEntry[] = []

  for (const [key, value] of Object.entries(data)) {
    const nextKeys = [...parentKey, key]

    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      // Special-case common unit fields next to values
      const nested = value as Record<string, unknown>
      const unit = typeof nested.unit === 'string' ? (nested.unit as string) : undefined

      for (const [childKey, childValue] of Object.entries(nested)) {
        if (childKey === 'unit') continue
        const path = [...nextKeys, childKey].join('.')
        if (typeof childValue === 'number' || typeof childValue === 'string' || typeof childValue === 'boolean' || childValue === null) {
          entries.push({ path, value: childValue as any, unit })
        } else if (childValue && typeof childValue === 'object') {
          entries.push(...flattenData({ [childKey]: childValue as any }, nextKeys))
        }
      }
    } else if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean' || value === null) {
      entries.push({ path: nextKeys.join('.'), value: value as any })
    }
  }

  return entries
}


