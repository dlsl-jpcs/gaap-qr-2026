/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { makeLoader, root } = require('./helpers/load-typescript.cjs');

const Status = makeLoader({ './nfc-registration.module.css': new Proxy({}, { get: (_, name) => String(name) }) })('components/NfcRegistrationStatus.tsx').default;
const render = props => renderToStaticMarkup(React.createElement(Status, { modeLoading: false, loading: false, error: '', groupNumber: null, ...props }));

test('NFC waiting, processing and success use one persistent status region', () => {
  for (const props of [{}, { loading: true }, { groupNumber: 4 }]) {
    const markup = render(props);
    assert.equal((markup.match(/<section/g) || []).length, 1);
    assert.match(markup, /id="nfc-registration-status"/);
    assert.match(markup, /role="status"/);
    assert.match(markup, /aria-live="polite"/);
  }
  assert.match(render({}), /Waiting for card input/);
  assert.match(render({ loading: true }), /Card read/);
  assert.match(render({ groupNumber: 4 }), /Group <span>4<\/span>/);
  assert.match(render({ groupNumber: 5 }), /Ready for the next card/);
});

test('NFC errors replace the old success inside the same fixed result area', () => {
  const markup = render({ error: 'CARD INPUT WAS INCOMPLETE. TAP AGAIN.', groupNumber: 4 });
  assert.match(markup, /data-state="error"/);
  assert.match(markup, /Please tap again/);
  assert.doesNotMatch(markup, /Group <span>/);
  assert.match(render({ modeLoading: true }), /Loading…/);
  const css = fs.readFileSync(path.join(root, 'components/nfc-registration.module.css'), 'utf8');
  assert.match(css, /height: 156px/);
  assert.match(css, /prefers-reduced-motion/);
});

test('NFC success retains the original form and its single scan field', () => {
  const source = fs.readFileSync(path.join(root, 'app/page.tsx'), 'utf8');
  assert.match(source, /registrationMode === 'nfc' \|\| !assignedGroup/);
  assert.doesNotMatch(source, /nfc-next-card/);
  assert.equal((source.match(/<input\b/g) || []).length, 1);
  assert.match(source, /ref=\{registrationMode === 'nfc' \? nfcInputRef : undefined\}/);
  assert.match(source, /onKeyDown=\{registrationMode === 'nfc' \? handleNfcKeyDown : undefined\}/);
});
