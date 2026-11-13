// Keeps the website's download version in one piece.
//   node scripts/site-version.js         check: every download link, redirect and version label in
//                                        landing/ names the same version, and it isn't newer than
//                                        package.json (CI runs this; the site trails a release, so
//                                        an older site version is fine)
//   node scripts/site-version.js --set   after a release is published: move all of them to the
//                                        package.json version, and point the "old links" redirect
//                                        at the version being replaced
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const landing = path.join(root, 'landing')
const pkg = require(path.join(root, 'package.json')).version
const files = fs.readdirSync(landing)
  .filter(f => f.endsWith('.html') && f !== 'changelog.html')
  .concat('netlify.toml')
  .map(f => path.join(landing, f))

const V = String.raw`(\d+\.\d+\.\d+)`
const patterns = [
  new RegExp(String.raw`(Islet-(?:Setup|Update)-)${V}(\.exe)`, 'g'),
  new RegExp(String.raw`(releases/download/v)${V}(/)`, 'g'),
  new RegExp(String.raw`(<dd>)${V}(</dd>)`, 'g'),
  new RegExp(String.raw`(Version )${V}(<)`, 'g'),
  new RegExp(String.raw`(Download Islet )${V}(,)`, 'g'),
]
// the "old links" redirect deliberately names an earlier version
const OLD = /(# old links[^\n]*\n\[\[redirects\]\]\r?\n\s*from = "\/Islet-Setup-)(\d+\.\d+\.\d+)(\.exe")/

const strip = (text, file) => file.endsWith('.toml') ? text.replace(OLD, '') : text
const found = new Map()
for (const file of files) {
  const text = strip(fs.readFileSync(file, 'utf8'), file)
  for (const re of patterns) for (const m of text.matchAll(re)) {
    if (!found.has(m[2])) found.set(m[2], new Set())
    found.get(m[2]).add(path.relative(root, file))
  }
}

const cmp = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); return x[0] - y[0] || x[1] - y[1] || x[2] - y[2] }

if (process.argv.includes('--set')) {
  if (found.size !== 1) { console.error('The site names more than one version; fix it by hand first:', [...found.keys()].join(', ')); process.exit(1) }
  const old = [...found.keys()][0]
  if (old === pkg) { console.log(`The site already says ${pkg}`); process.exit(0) }
  for (const file of files) {
    let text = fs.readFileSync(file, 'utf8'), next = text
    for (const re of patterns) next = next.replace(re, (all, a, v, b) => v === old ? a + pkg + b : all)
    if (file.endsWith('.toml')) next = next.replace(OLD, `$1${old}$3`)
    if (next !== text) { fs.writeFileSync(file, next); console.log('updated', path.relative(root, file)) }
  }
  console.log(`Site moved from ${old} to ${pkg}. Check the installer size in downloads.html.`)
  process.exit(0)
}

if (found.size !== 1) {
  console.error('The site names different versions; a link was missed:')
  for (const [v, where] of found) console.error(`  ${v}: ${[...where].join(', ')}`)
  console.error('Run `node scripts/site-version.js --set` after publishing a release.')
  process.exit(1)
}
const site = [...found.keys()][0]
if (cmp(site, pkg) > 0) { console.error(`The site offers ${site}, newer than package.json (${pkg})`); process.exit(1) }
console.log(`The site offers ${site} everywhere` + (site === pkg ? '' : ` (package.json is ${pkg}; run --set once that release is published)`))
