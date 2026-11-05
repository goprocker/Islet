// Fails when a root-level module or script is missing from package.json build.files,
// because the installer then crashes on a missing file.
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const listed = require(path.join(root, 'package.json')).build.files
const missing = fs.readdirSync(root).filter(f => /\.(js|ps1|cs)$/.test(f) && !listed.includes(f))

if (missing.length) {
  console.error('Add these to build.files in package.json:\n  ' + missing.join('\n  '))
  process.exit(1)
}
console.log('build.files lists every root module and script')
