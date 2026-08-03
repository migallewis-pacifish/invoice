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

  assert.deepStrictEqual(_test.validatePdfGenerationRequest({ companyId: 'co', clientId: 'cl', documentType: 'invoice', documentId: 'INV-1' }), []);
  assert.deepStrictEqual(_test.validatePdfGenerationRequest({ companyId: 'co', clientId: 'cl', documentType: 'invoice', documentId: 'INV-1', templateId: 'invoice-standard' }), []);
  assert(_test.validatePdfGenerationRequest({ companyId: 'co', clientId: 'cl', documentType: 'invoice', documentId: 'INV-1', templateId: '../invalid' }).includes('templateId is invalid'));
  assert(_test.validatePdfGenerationRequest({ companyId: '', documentType: 'receipt' }).includes('companyId is required'));
  assert.strictEqual(_test.sanitizePathSegment('Client / ACME Ltd.'), 'Client-ACME-Ltd.');
  const pdfBuffer = _test.minimalPdfBuffer('Invoice INV-1');
  assert(pdfBuffer.toString('utf8', 0, 8).startsWith('%PDF-1.4'));

  const meta = _test.generatedPdfMetadata(Buffer.from('%PDF'), 2);
  assert.strictEqual(meta.contentType, 'application/pdf');
  assert.strictEqual(meta.pageCount, 2);
  assert.strictEqual(meta.bytes, 4);

  const documentHtml = _test.renderDocumentTemplate(
    `<style>.total{color:red}</style><#if (company.logoUrl)?has_content><img src="\${company.logoUrl?html}"></#if><#list invoice.items as item><p>\${item.description?html}: \${item.amount?html}</p></#list><strong>\${invoice.total?html}</strong>`,
    { company: { logoUrl: '' }, invoice: { items: [{ description: '<Design>', amount: 'R 100.00' }], total: 'R 100.00' } }
  );
  assert(documentHtml.includes('<style>.total{color:red}</style>'));
  assert(!documentHtml.includes('<img'));
  assert(documentHtml.includes('&lt;Design&gt;: R 100.00'));
  assert(documentHtml.includes('<strong>R 100.00</strong>'));

  console.log('template rendering tests passed');
})();
