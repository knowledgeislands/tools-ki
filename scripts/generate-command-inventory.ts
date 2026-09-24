import { readFile, writeFile } from 'node:fs/promises'
import { renderCommandInventory } from './command-inventory.ts'

const manual = await readFile('man/ki.1', 'utf8')
const expected = renderCommandInventory(manual)
const target = 'man/ki.commands.json'

if (process.argv.includes('--write')) {
  await writeFile(target, expected, 'utf8')
} else {
  const actual = await readFile(target, 'utf8').catch(() => '')
  if (actual !== expected) {
    process.stderr.write(`${target} is stale; run bun scripts/generate-command-inventory.ts --write\n`)
    process.exitCode = 1
  }
}
