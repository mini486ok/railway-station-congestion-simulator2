// sim/*.py 를 web/public/pysim/sim/ 로 복사 (Pyodide가 정적으로 fetch)
import { mkdirSync, copyFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '..', '..')
const src = join(repoRoot, 'sim')
const dest = join(here, '..', 'public', 'pysim', 'sim')

mkdirSync(dest, { recursive: true })
const files = readdirSync(src).filter((f) => f.endsWith('.py'))
for (const f of files) {
  copyFileSync(join(src, f), join(dest, f))
}
console.log(`copied ${files.length} py files -> public/pysim/sim`)
