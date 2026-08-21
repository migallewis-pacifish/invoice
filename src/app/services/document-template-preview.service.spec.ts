import { TestBed } from '@angular/core/testing';
import { DocumentTemplatePreviewService } from './document-template-preview.service';

describe('DocumentTemplatePreviewService', () => {
  let service: DocumentTemplatePreviewService;

  beforeEach(() => service = TestBed.inject(DocumentTemplatePreviewService));

  it('omits optional images when their preview data is absent', () => {
    const source = `<#if (company.logoUrl)?has_content><img class="logo" src="\${company.logoUrl?html}"></#if>
      <#if (signature.imageUrl)?has_content><img class="signature" src="\${signature.imageUrl?html}"></#if>`;

    expect(service.buildHtml(source)).not.toContain('<img');
  });

  it('renders nested and OR conditions using available sample data', () => {
    const source = `<#if (signature.imageUrl)?has_content || (signature.name)?has_content>
      <div class="signature"><#if (signature.imageUrl)?has_content><img src="\${signature.imageUrl?html}"></#if><span>\${signature.name?html}</span></div>
    </#if>`;

    const html = service.buildHtml(source);
    expect(html).toContain('<div class="signature">');
    expect(html).toContain('Mia Daniels');
    expect(html).not.toContain('<img');
  });

  it('renders meaningful Pacifish and Nexus invoice preview data', () => {
    const html = service.buildHtml('<h1>${company.name?html}</h1><strong>${client.title?html} ${client.name?html}</strong><address>${client.address.building?html}</address><b>${invoice.total?html}</b>');

    expect(html).toContain('Pacifish Consulting (Pty) Ltd');
    expect(html).toContain('Ms Naledi Mokoena');
    expect(html).toContain('Nexus House');
    expect(html).toContain('R 13,800.00');
  });

  it('renders meaningful sample data for letter templates', () => {
    const html = service.buildHtml('<time>${letter.date?html}</time><h1>${letter.title?html}</h1><article>${letter.message?html}</article><b>${letter.signedBy?html}</b>');

    expect(html).toContain('6 August 2026');
    expect(html).toContain('Project update and next steps');
    expect(html).toContain('Thank you for partnering with Pacifish Consulting.');
    expect(html).toContain('Mia Daniels');
  });

  it('renders sanitised letter message formatting in legacy templates that use ?html', () => {
    const html = service.buildHtml('<article>${letter.message?html}</article>', {
      'letter.message': '<b>Bold</b> <i>italic</i> <u>underlined</u>'
    });

    expect(html).toContain('<article><b>Bold</b> <i>italic</i> <u>underlined</u></article>');
    expect(html).not.toContain('&lt;b&gt;');
  });
});
