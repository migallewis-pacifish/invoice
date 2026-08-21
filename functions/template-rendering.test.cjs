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

  const brandedVariables = _test.buildTemplateVariables({
    documentId: 'LETTER-1', payload: { title: 'Hello' }, company: {
      name: 'Acme', logoUrl: 'logo.png', signature: { name: 'Alex', imageUrl: 'signature.png' }
    }
  });
  assert.strictEqual(brandedVariables.company.logoUrl, 'logo.png');
  assert.strictEqual(brandedVariables.signature.imageUrl, 'signature.png');
  assert.strictEqual(brandedVariables.letter.signatureUrl, 'signature.png');
  assert.strictEqual(brandedVariables.letter.signedBy, 'Alex');

  const richLetter = _test.buildTemplateVariables({
    documentId: 'LETTER-2', payload: { message: '<b>Bold</b> <span style="color:#c00">red</span><script>alert(1)</script>', includeSignature: false },
    company: { signature: { name: 'Alex', imageUrl: 'signature.png' } }
  });
  assert.strictEqual(richLetter.letter.message, '<b>Bold</b> <span style="color:#c00">red</span>');
  assert.strictEqual(richLetter.letter.signatureUrl, '');
  assert.strictEqual(richLetter.letter.signedBy, '');
  assert.strictEqual(
    _test.renderDocumentTemplate('<article>${letter.message?html}</article>', richLetter),
    '<article><b>Bold</b> <span style="color:#c00">red</span></article>'
  );

  const addressVariables = _test.buildTemplateVariables({
    documentId: 'INV-ADDRESS',
    payload: { client_title: 'Dr', client_name: 'Jamie Client' },
    company: { address: { building: 'North Tower', line1: '1 Main Road', line2: 'Suite 2', suburb: 'Sandton', city: 'Johannesburg', postalCode: '2196' } }
  });
  assert.strictEqual(addressVariables.client.title, 'Dr');
  assert.strictEqual(addressVariables.company.address.building, 'North Tower');
  assert.strictEqual(addressVariables.company.address.line1, '1 Main Road');
  assert.strictEqual(String(addressVariables.company.address), 'North Tower, 1 Main Road, Suite 2, Sandton, Johannesburg, 2196');
  assert.strictEqual(_test.formatPhoneNumber('+27891231234'), '+2789 123 1234');
  assert.strictEqual(_test.formatPhoneNumber('0891231234'), '089 123 1234');

  const clientAddressVariables = _test.buildTemplateVariables({
    documentId: 'INV-CLIENT-ADDRESS',
    payload: {
      client_name: 'Jamie Client', client_building: 'South Block', client_line1: '2 High Street', client_line2: 'Unit 4',
      client_suburb: 'Rosebank', client_city: 'Johannesburg', client_province: 'Gauteng', client_postal_code: '2196', client_country: 'South Africa'
    },
    client: { phone: '+27891231234' }
  });
  assert.strictEqual(clientAddressVariables.client.address.building, 'South Block');
  assert.strictEqual(clientAddressVariables.client.address.line2, 'Unit 4');
  assert.strictEqual(clientAddressVariables.client.address.country, 'South Africa');
  assert.strictEqual(String(clientAddressVariables.client.address), 'South Block, 2 High Street, Unit 4, Rosebank, Johannesburg, Gauteng, 2196, South Africa');
  assert.strictEqual(clientAddressVariables.client.phone, '+2789 123 1234');

  const invoiceVariables = _test.buildTemplateVariables({
    documentId: 'INV-42',
    payload: { dueDate: '2026-09-30', reference: 'INV-42' },
    company: { banking: { bankName: 'Nexus Bank', accountName: 'Nexus Studio', accountNumber: '12345', branchCode: '67890' } }
  });
  assert.strictEqual(invoiceVariables.invoice.dueDate, '2026-09-30');
  assert.deepStrictEqual(invoiceVariables.payment, {
    bankName: 'Nexus Bank', accountName: 'Nexus Studio', accountNumber: '12345', branchCode: '67890', accountHolder: 'Nexus Studio', reference: 'INV-42'
  });
  const bankingHtml = _test.renderDocumentTemplate(
    `<#if (payment.bankName)?has_content><b>\${payment.bankName?html}</b></#if><span>\${payment.accountHolder?html}</span><time>\${invoice.dueDate?html}</time>`,
    invoiceVariables
  );
  assert.strictEqual(bankingHtml, '<b>Nexus Bank</b><span>Nexus Studio</span><time>2026-09-30</time>');

  const htmlText = _test.htmlToText('<style>.x{}</style><h1>Hello</h1><p>World</p>');
  assert.strictEqual(htmlText, 'Hello World');

  const errors = _test.validatePayload({
    companyId: 'co', clientId: 'cl', documentType: 'invoice', documentId: 'inv', idempotencyKey: 'abcdefghijklmnop', recipient: 'a@example.com', subject: 'Subject',
    templateSelection: { kind: 'designed', templateId: 'tmpl' }, attachment: { storagePath: 'docs/invoice.pdf' }
  });
  assert.deepStrictEqual(errors, []);

  const content = await _test.buildEmailContent({ messageBody: 'Plain fallback', templateSelection: { kind: 'simple' } });
  assert.deepStrictEqual(content, [{ type: 'text/plain', value: 'Plain fallback' }]);

  assert.strictEqual(_test.isCompanyMember('u1', 'co1', 'co1', []), true);
  assert.strictEqual(_test.isCompanyMember('u1', 'co1', 'co2', ['u1']), true);
  assert.strictEqual(_test.isCompanyMember('u1', 'co1', 'co2', ['u2']), false);

  function attachmentBucket({ bytes = Buffer.from('PDF'), contentType = 'application/pdf', size = bytes.length, metadataError } = {}) {
    let downloads = 0;
    return {
      get downloads() { return downloads; },
      file() {
        return {
          async getMetadata() {
            if (metadataError) throw metadataError;
            return [{ contentType, size: String(size) }];
          },
          async download() { downloads += 1; return [bytes]; },
        };
      },
    };
  }

  const validBucket = attachmentBucket();
  const emailDocument = { companyId: 'co', clientId: 'cl', documentType: 'invoice', documentId: 'INV-1', record: { generatedOutputs: [{ storagePath: 'companies/co/generated/invoices/INV-1.pdf', fileName: 'Invoice 1.pdf' }, { storagePath: 'companies/co/generated/missing.pdf' }, { storagePath: 'companies/co/generated/large.pdf' }, { storagePath: 'companies/co/generated/file.exe' }] } };
  const validAttachment = await _test.resolveEmailAttachment({
    companyId: 'co', attachment: { storagePath: 'companies/co/generated/invoices/INV-1.pdf', fileName: 'Invoice 1.pdf' }
  }, emailDocument, validBucket);
  assert.deepStrictEqual(validAttachment, {
    filename: 'Invoice 1.pdf', type: 'application/pdf', disposition: 'attachment', content: Buffer.from('PDF').toString('base64')
  });
  assert.strictEqual(validBucket.downloads, 1);
  const sendGridPayload = _test.buildSendGridPayload({
    to: ['client@example.com'], cc: [], bcc: [], subject: 'Invoice', text: 'Attached',
    attachments: [validAttachment], sender: {}
  }, 'billing@example.com', { companyId: 'co', documentId: 'INV-1' });
  assert.deepStrictEqual(sendGridPayload.attachments, [validAttachment]);

  await assert.rejects(
    _test.resolveEmailAttachment({ companyId: 'co', attachment: { storagePath: 'companies/co/generated/missing.pdf' } }, emailDocument, attachmentBucket({ metadataError: { code: 404 } })),
    error => error.code === 'not-found'
  );
  await assert.rejects(
    _test.resolveEmailAttachment({ companyId: 'co', attachment: { storagePath: 'companies/other/generated/INV-1.pdf' } }, emailDocument, attachmentBucket()),
    error => error.code === 'invalid-argument' && /under companies\/co\/generated\//.test(error.message)
  );
  const oversizedBucket = attachmentBucket({ size: _test.MAX_ATTACHMENT_BYTES + 1 });
  await assert.rejects(
    _test.resolveEmailAttachment({ companyId: 'co', attachment: { storagePath: 'companies/co/generated/large.pdf' } }, emailDocument, oversizedBucket),
    error => error.code === 'invalid-argument' && /size limit/.test(error.message)
  );
  assert.strictEqual(oversizedBucket.downloads, 0);
  await assert.rejects(
    _test.resolveEmailAttachment({ companyId: 'co', attachment: { storagePath: 'companies/co/generated/file.exe' } }, emailDocument, attachmentBucket({ contentType: 'application/octet-stream' })),
    error => error.code === 'invalid-argument' && /MIME type/.test(error.message)
  );
  assert(_test.validatePayload({ attachment: { generatedDocumentPayloadRef: 'generatedPayloads/payload-1' } })
    .includes('attachment.generatedDocumentPayloadRef is not supported; provide attachment.storagePath'));
  await assert.rejects(
    _test.resolveEmailAttachment({ companyId: 'co', attachment: { generatedDocumentPayloadRef: 'generatedPayloads/payload-1' } }, emailDocument, attachmentBucket()),
    error => error.code === 'invalid-argument' && /not supported/.test(error.message)
  );


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

  assert.strictEqual(
    _test.firebaseStorageDownloadUrl('invoice.appspot.com', 'companies/co/generated/INV 1.pdf', 'token/value'),
    'https://firebasestorage.googleapis.com/v0/b/invoice.appspot.com/o/companies%2Fco%2Fgenerated%2FINV%201.pdf?alt=media&token=token%2Fvalue'
  );

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
