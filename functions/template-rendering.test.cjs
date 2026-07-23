const assert = require('assert');
const { _test } = require('./index.js');

(async () => {
  const rendered = _test.renderFreeMarkerTemplate('<h1>${client.name}</h1><p>${invoice.total}</p>', {
    client: { name: 'Acme' },
    invoice: { total: '$42.00' }
  });
  assert.strictEqual(rendered.html, '<h1>Acme</h1><p>$42.00</p>');
  assert.deepStrictEqual(rendered.unresolved, []);

  const unresolved = _test.renderFreeMarkerTemplate('<p>${client.secret}</p><p>${invoice.total}</p>', { invoice: { total: '$42.00' } });
  assert.deepStrictEqual(unresolved.unresolved, ['client.secret']);

  const htmlText = _test.htmlToText('<style>.x{}</style><h1>Hello</h1><p>World</p>');
  assert.strictEqual(htmlText, 'Hello World');

  const errors = _test.validatePayload({
    companyId: 'co', clientId: 'cl', documentType: 'invoice', documentId: 'inv', recipient: 'a@example.com', subject: 'Subject',
    templateSelection: { kind: 'designed', templateId: 'tmpl' }, attachment: { storagePath: 'docs/invoice.pdf' }
  });
  assert.deepStrictEqual(errors, []);

  const content = await _test.buildEmailContent({ messageBody: 'Plain fallback', templateSelection: { kind: 'simple' } });
  assert.deepStrictEqual(content, [{ type: 'text/plain', value: 'Plain fallback' }]);

  console.log('template rendering tests passed');
})();
