// Fails when a module or script sits outside src/, because package.json build.files
// only ships src/** and the installer then crashes on a missing file.
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const listed = require(path.join(root, 'package.json')).build.files
const stray = fs.readdirSync(root).filter(f => /\.(js|ps1|cs)$/.test(f))

if (!listed.includes('src/**') || stray.length) {
  console.error('Keep app modules in src/ and list "src/**" in build.files:\n  ' + stray.join('\n  '))
  process.exit(1)
}
console.log('build.files ships src/** and no module is left at the root')
