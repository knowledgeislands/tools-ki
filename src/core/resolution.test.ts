import { expect, test } from 'vitest'
import type { DeclaredSkill } from './configuration.ts'
import type { HarnessCapability, InstalledHarness } from './harness.ts'
import { resolveDeclaredSkills } from './resolution.ts'

const capability = (name: string, dependsOn: readonly string[] = []): HarnessCapability => ({
  kind: 'skill',
  name,
  source: `skills/${name}`,
  dependsOn,
  operations: []
})

const harness = (...capabilities: readonly HarnessCapability[]): InstalledHarness => ({
  id: 'example/harness',
  root: '/verified/harness',
  capabilities
})

const declarations = (...names: readonly string[]): readonly DeclaredSkill[] => names.map((name) => ({ name, configuration: {} }))

test('orders declared skills after their explicit dependencies', () => {
  const installed = [harness(capability('ki-foundation'), capability('ki-feature', ['ki-foundation']))]

  const resolved = resolveDeclaredSkills(declarations('ki-feature', 'ki-foundation'), installed)

  expect(resolved.map((skill) => skill.declaration.name)).toEqual(['ki-foundation', 'ki-feature'])
})

test('includes declared dependencies when selecting one capability', () => {
  const installed = [harness(capability('ki-foundation'), capability('ki-feature', ['ki-foundation']))]

  const resolved = resolveDeclaredSkills(declarations('ki-foundation', 'ki-feature'), installed, 'ki-feature')

  expect(resolved.map((skill) => skill.declaration.name)).toEqual(['ki-foundation', 'ki-feature'])
})

test('refuses undeclared and cyclic capability dependencies', () => {
  expect(() => resolveDeclaredSkills(declarations('ki-feature'), [harness(capability('ki-feature', ['ki-foundation']))])).toThrow(
    'declared skill ki-feature requires declared dependency ki-foundation'
  )
  expect(() =>
    resolveDeclaredSkills(declarations('ki-first', 'ki-second'), [
      harness(capability('ki-first', ['ki-second']), capability('ki-second', ['ki-first']))
    ])
  ).toThrow('declared skill ki-first has a dependency cycle')
})
