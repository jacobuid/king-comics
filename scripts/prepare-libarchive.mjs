import { copyFile, mkdir } from 'node:fs/promises'
import path from 'node:path'

const projectRoot = process.cwd()
const libarchiveRoot = path.join(projectRoot, 'public', 'libarchive')
const libarchiveDist = path.join(projectRoot, 'node_modules', 'libarchive.js', 'dist')

await mkdir(libarchiveRoot, { recursive: true })
await Promise.all([
  copyFile(
    path.join(libarchiveDist, 'worker-bundle.js'),
    path.join(libarchiveRoot, 'worker-bundle.js'),
  ),
  copyFile(
    path.join(libarchiveDist, 'libarchive.wasm'),
    path.join(libarchiveRoot, 'libarchive.wasm'),
  ),
])

console.log('Comic reader runtime prepared.')
