/**
 * Backpack identities. A territory's bundle of skills is its backpack, published from an
 * `<owner>/<territory>-agent-backpack` repository. Those repositories were named
 * `<owner>/<territory>-agentic-harness` until the rename of 14 November 2026, so for this one
 * release `ki` still recognises the retired spelling: every identifier read from configuration,
 * a declaration, the command line or the installed estate is normalised to the backpack
 * spelling, and the data migration moves an installed slot still under the retired name.
 */
const retiredSpelling = /^([^/]+\/.+)-agentic-harness$/
const backpackSpelling = /^([^/]+\/.+)-agent-backpack$/

/** The backpack spelling of an identifier; one already in that spelling, or naming no backpack, is returned unchanged. */
export const backpackIdentifier = (identifier: string): string =>
  identifier.replace(retiredSpelling, '$1-agent-backpack')

/** Every spelling an identifier may be installed or published under, the backpack spelling first. */
export const backpackSpellings = (identifier: string): readonly string[] => {
  const current = backpackIdentifier(identifier)
  const retired = current.replace(backpackSpelling, '$1-agentic-harness')
  return retired === current ? [current] : [current, retired]
}

/** The retired `*-agentic-harness` spelling of a backpack identifier, or undefined when it names no backpack. */
export const retiredBackpackIdentifier = (identifier: string): string | undefined => backpackSpellings(identifier)[1]

/** Whether two identifiers name the same backpack, whichever spelling each uses. */
export const sameBackpack = (left: string, right: string): boolean =>
  backpackIdentifier(left) === backpackIdentifier(right)
