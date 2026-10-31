const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const selfCheckin = require('../data/self-checkin-copy')

const root = path.resolve(__dirname, '..')
const read = (file) => readFileSync(path.join(root, file), 'utf8')

const selfWxml = read('pages/index/index.wxml')
const luggageWxml = read('pages/luggage-storage/index.wxml')
const arrivalWxml = read('pages/pre-arrival/index.wxml')

for (const [pageName, markup] of Object.entries({ selfWxml, luggageWxml, arrivalWxml })) {
  const arrowButtons = markup.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) || []
  for (const button of arrowButtons.filter((item) => item.includes('class="button-arrow"'))) {
    assert.match(button, /class="button-label"/, `${pageName} gives arrow-bearing button labels a separate wrapping box`)
  }
}

for (const file of ['pages/index/index.wxss', 'pages/luggage-storage/index.wxss', 'pages/pre-arrival/index.wxss']) {
  const styles = read(file)
  assert.match(styles, /\.button-label\s*\{[^}]*padding:[^}]*white-space:\s*normal;[^}]*overflow-wrap:\s*anywhere;/s, `${file} reserves arrow space and allows long labels to wrap`)
  assert.match(styles, /\.language-label\s*\{[^}]*min-width:\s*0;[^}]*white-space:\s*normal;/s, `${file} allows language labels to wrap beside their arrow`)
}

const localeFiles = ['en-US', 'de-DE', 'fr-FR', 'es-ES', 'it-IT', 'ja-JP', 'ko-KR']
for (const locale of localeFiles) {
  const text = selfCheckin.locales[locale]
  assert.ok(text.submittedMessage && text.submittedNotice, `${locale} has localized submission success copy`)
  assert.doesNotMatch(text.submittedMessage, /WeChat/i, `${locale} success message does not promise a WeChat delivery channel`)
  assert.doesNotMatch(text.submittedNotice, /WeChat/i, `${locale} notice does not promise a WeChat delivery channel`)
}

assert.match(selfCheckin.locales['en-US'].submittedMessage, /After reviewing your registration.*door access code.*room and bed numbers.*slipper number/i)
assert.match(selfCheckin.locales['en-US'].submittedNotice, /contact us before 22:30 on your check-in date/i)

for (const preview of ['../..//previews/self-checkin-annotation-preview.html', '../..//previews/luggage-storage-annotation-preview.html', '../..//previews/pre-arrival-annotation-preview.html']) {
  const html = readFileSync(path.resolve(__dirname, preview), 'utf8')
  assert.match(html, /\.action(?:s)?[^{}]*\{[^}]*padding-left:[^}]*padding-right:/s, `${preview} reserves balanced label space in preview actions`)
}

console.log('multilingual button layout and success copy checks passed')
