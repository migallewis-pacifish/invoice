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

  assert.strictEqual(_test.isCompanyMember('u1', 'co1', 'co1', []), true);
  assert.strictEqual(_test.isCompanyMember('u1', 'co1', 'co2', ['u1']), true);
  assert.strictEqual(_test.isCompanyMember('u1', 'co1', 'co2', ['u2']), false);


  assert.deepStrictEqual(_test.validatePdfAnalysisRequest({
    companyId: 'co', templateId: 'invoice-123', sourcePdfPath: 'companies/co/pdf-templates/invoice-123/source.pdf'
  }), []);

  const badPdfRequest = _test.validatePdfAnalysisRequest({ companyId: 'co', templateId: '../x', sourcePdfPath: 'wrong.pdf' });
  assert(badPdfRequest.includes('templateId is invalid'));
  assert(badPdfRequest.includes('sourcePdfPath must match the company-scoped PDF template path'));

  const mapping = _test.buildPdfMapping({ companyId: 'co', templateId: 'invoice-123', sourcePdfPath: 'companies/co/pdf-templates/invoice-123/source.pdf' });
  assert.strictEqual(mapping.companyId, 'co');
  assert.strictEqual(mapping.regions.length, 5);
  assert(mapping.requiredVariables.includes('invoice.total'));

  assert.deepStrictEqual(_test.validatePdfVariables(mapping, {
    invoice: { number: 'INV-1', date: '2026-07-24', items: ['Design'], total: '$10.00' },
    client: { name: 'Acme' }
  }), []);
  assert.deepStrictEqual(_test.validatePdfVariables(mapping, { invoice: { number: 'INV-1' } }), ['invoice.date', 'client.name', 'invoice.items', 'invoice.total']);

  const meta = _test.generatedPdfMetadata(Buffer.from('%PDF'), 2);
  assert.strictEqual(meta.contentType, 'application/pdf');
  assert.strictEqual(meta.pageCount, 2);
  assert.strictEqual(meta.bytes, 4);

  console.log('template rendering tests passed');
})();
