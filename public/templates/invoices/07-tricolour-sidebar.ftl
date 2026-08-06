<#--
  Three-colour sidebar invoice.

  The theme colours accept CSS colour values (hex values are recommended):
    theme.sidebarColor1, theme.sidebarColor2, theme.sidebarColor3

  Image values must be URLs or data URIs that the HTML-to-PDF renderer can access:
    company.logoUrl, signature.imageUrl
-->
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Invoice ${invoice.number?html}</title>
  <style>
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #eef0f1; color: #211f1e; font: 12px Arial, sans-serif; }
    .page { width: 210mm; min-height: 297mm; margin: auto; background: #fff; display: grid; grid-template-columns: 55mm 1fr; }
    .sidebar {
      min-height: 297mm;
      padding: 18mm 6mm;
      color: #fff;
      background: linear-gradient(180deg,
        ${(theme.sidebarColor1)!'#3a666d'} 0%,
        ${(theme.sidebarColor2)!'#2a7a87'} 52%,
        ${(theme.sidebarColor3)!'#71c2a7'} 100%);
      display: flex;
      flex-direction: column;
    }
    .logo { display: block; max-width: 35mm; max-height: 18mm; object-fit: contain; object-position: left center; margin-bottom: 9mm; }
    .company-name { margin: 0 0 18mm; font: 24px Georgia, serif; letter-spacing: .01em; overflow-wrap: anywhere; }
    .side-label { margin: 0 0 5mm; font-size: 10px; font-weight: bold; }
    .client-name { font: 16px Georgia, serif; line-height: 1.45; margin-bottom: 6px}
    .side-section { margin-top: 25mm; line-height: 1.45; overflow-wrap: anywhere; }
    .side-section.account { margin-top: auto; }
    .side-section h2 { margin: 0 0 4mm; font: 22px Georgia, serif; font-weight: normal; }
    .side-section p { margin: 0; font-size: 10px; }
    .side-section strong { font-weight: bold; }
    .contact { margin-top: 18mm; }
    .address { margin-top: 6mm; }
    .contact .email { margin-bottom: 3mm; font-size: 10px; }
    .main { min-width: 0; min-height: 297mm; padding: 18mm 16mm 25mm; display: flex; flex-direction: column; }
    .invoice-head {margin-bottom: 12px; margin-bottom: 5mm; text-align: right;} 
    .invoice-head h1 { margin: 6px; font-size: 34px; line-height: 1; letter-spacing: .05em; text-transform: uppercase; }
    .meta { margin-left: 8mm; text-align: right; line-height: 1.55; white-space: nowrap; }
    .meta strong { display: inline-block; min-width: 24mm; font-weight: normal; }
    .company-details { color: #625e5b; font-size: 10px; line-height: 1.45; text-align: right; margin: 0 0 5mm auto; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    thead { border: 1px solid #2a7a87; }
    .items th { padding: 3mm 2mm; color: #fff; background: ${(theme.sidebarColor2)!'#2a7a87'}; font-size: 12px; text-align: right; }
    .items th:first-child { width: 62%; text-align: left; }
    .items td { padding: 3mm 2mm; border: 1px solid #a5abad; border-top: 0; text-align: right; vertical-align: top; overflow-wrap: anywhere; }
    .items td:first-child { text-align: left; }
    .totals { width: 58%; margin: auto 0 0 auto; }
    .totals td { padding: 1.4mm 3mm; text-align: right; }
    .totals td:first-child { width: 58%; }
    .totals .grand td { padding-top: 3mm; padding-bottom: 3mm; color: #fff; background: ${(theme.sidebarColor2)!'#2a7a87'}; font-size: 14px; font-weight: bold; }
    .closing { min-height: 48mm; margin-top: 36mm; display: flex; justify-content: flex-end; align-items: flex-end; }
    .signature { width: 57mm; text-align: center; }
    .signature img { display: block; width: auto; max-width: 52mm; height: auto; max-height: 22mm; margin: 0 auto -1mm; object-fit: contain; }
    .signature-line { border-top: 1px solid #667175; padding-top: 3mm; font-weight: bold; }
    .brand-footer { margin-top: 17mm; text-align: right; color: ${(theme.sidebarColor1)!'#3a666d'}; font: 25px Georgia, serif; }
  </style>
</head>
<body>
  <main class="page">
    <aside class="sidebar">
      <#if (company.logoUrl)?has_content><img class="logo" src="${company.logoUrl?html}" alt="${company.name?html} logo"></#if>
      <h2 class="company-name">${company.name?html}</h2>

      <section>
        <p class="side-label">Invoice for:</p>
        <div class="client-name"><#if (client.title)?has_content>${client.title?html}</#if> ${client.name?html}</div>
        <p>
          <#if (client.address.building)?has_content>${client.address.building?html}<br></#if>
          <#if (client.address.line1)?has_content>${client.address.line1?html}<br></#if>
          <#if (client.address.line2)?has_content>${client.address.line2?html}<br></#if>
          <#if (client.address.suburb)?has_content>${client.address.suburb?html}<br></#if>
          <#if (client.address.city)?has_content>${client.address.city?html}<br></#if>
          <#if (client.address.postalCode)?has_content>${client.address.postalCode?html}<br></#if>
        </p>
      </section>

      <section class="side-section account">
        <h2>Account Details</h2>
        <p>
          <#if (payment.bankName)?has_content>Bank: ${payment.bankName?html}<br></#if>
          <#if (payment.accountHolder)?has_content>Account Holder: ${payment.accountHolder?html}<br></#if>
          <#if (payment.accountType)?has_content>Account Type: ${payment.accountType?html}<br></#if>
          <#if (payment.accountNumber)?has_content>Account Number: ${payment.accountNumber?html}<br></#if>
          <#if (payment.branchCode)?has_content>Branch Code: ${payment.branchCode?html}</#if>
        </p>
      </section>

      <section class="side-section contact">
        <h2>Contact</h2>
        <p class="email">
          <#if (company.email)?has_content>${company.email?html}<br></#if>
        </p>
        <p>
          <#if (company.phone)?has_content>${company.phone?html}<br></#if>
          <#if (company.website)?has_content>${company.website?html}</#if>
        </p>
      </section>

      <section class="side-section address">
        <h2>Address</h2>
        <p>
          <#if (company.address.building)?has_content>${company.address.building?html}<br></#if>
          <#if (company.address.line1)?has_content>${company.address.line1?html}<br></#if>
          <#if (company.address.line2)?has_content>${company.address.line2?html}<br></#if>
          <#if (company.address.suburb)?has_content>${company.address.suburb?html}<br></#if>
          <#if (company.address.city)?has_content>${company.address.city?html}<br></#if>
          <#if (company.address.postalCode)?has_content>${company.address.postalCode?html}<br></#if>
        </p>
      </section>
    </aside>

    <section class="main">
      <header class="invoice-head">
        <h1>Tax Invoice</h1>
        <div class="meta">
          Invoice number: <strong>${invoice.number?html}</strong><br>
          Invoice Date: <strong>${invoice.date?html}</strong><br>
          Due Date: <strong>${invoice.dueDate?html}</strong>
        </div>
      </header>

      <table class="items">
        <thead><tr><th>Description</th><th>Price</th></tr></thead>
        <tbody>
          <#list invoice.items as item>
            <tr><td>${item.description?html}</td><td>${item.amount?html}</td></tr>
          </#list>
        </tbody>
      </table>

      <table class="totals">
        <tr><td>Sub Total:</td><td>${invoice.subtotal?html}</td></tr>
        <tr><td>VAT <#if (invoice.vatPercentage)?has_content>(${invoice.vatPercentage?html}%)</#if>:</td><td>${invoice.vat?html}</td></tr>
        <tr class="grand"><td>Total:</td><td>${invoice.total?html}</td></tr>
      </table>

      <div class="closing">
        <#if (signature.imageUrl)?has_content || (signature.name)?has_content>
          <div class="signature">
            <#if (signature.imageUrl)?has_content><img src="${signature.imageUrl?html}" alt="Signature"></#if>
            <div class="signature-line">${((signature.name)!'')?html}</div>
          </div>
        </#if>
      </div>
      <div class="brand-footer">${company.name?html}</div>
    </section>
  </main>
</body>
</html>
