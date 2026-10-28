/** Canonical and indefinitely readable work spellings, derived from a valid definition. */
export const workNames = (id: string, level: string): readonly string[] => {
  const parts = id.split('.')
  const [territory, kind, name] = parts
  if (level === 'territory') {
    if (parts.length === 1 || (parts.length === 3 && kind === 'sop' && name === 'main'))
      return [`${territory}.sop.main`, territory as string]
    return [id]
  }
  if (level === 'project') {
    if (parts.length === 2 && kind !== 'regular' && kind !== 'reg' && kind !== 'sop')
      return [`${territory}.prj.${kind}`, id]
    if (parts.length === 3 && kind === 'prj') return [id, `${territory}.${name}`]
  }
  if (level === 'regular' && (parts.length === 2 || kind === 'reg' || kind === 'regular')) {
    if (parts.length === 2 || name === 'main')
      return [`${territory}.reg.main`, `${territory}.regular.main`, `${territory}.regular`]
    return [`${territory}.reg.${name}`, `${territory}.regular.${name}`]
  }
  return [id]
}
export const isMainStateOfPlay = (id: string): boolean =>
  !id.includes('.') || (id.split('.').length === 3 && id.endsWith('.sop.main'))
export const projectSlug = (id: string): string =>
  id
    .split('.')
    .slice(id.split('.')[1] === 'prj' ? 2 : 1)
    .join('.')
