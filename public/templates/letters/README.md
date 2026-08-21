# FreeMarker letter templates

This folder contains thirteen self-contained, print-ready HTML/FreeMarker letter
templates. Each design targets A4 paper and uses no external fonts or assets,
so it can be rendered by an offline HTML-to-PDF pipeline.

## Available designs

| File | Layout |
| --- | --- |
| `01-classic-formal.ftl` | Traditional business letter with a restrained rule and formal address block |
| `02-modern-sidebar.ftl` | Contact details and sender identity in a narrow side rail |
| `03-editorial-centred.ftl` | Spacious, centred masthead with an editorial body column |
| `04-compact-business.ftl` | Dense business layout with a structured metadata grid |
| `05-window-envelope.ftl` | Recipient-first layout suited to a window envelope |
| `06-executive-banner.ftl` | Strong top banner with a split sender-and-date header |
| `07-azure-ledger-letter.ftl` | Blue corporate header matching the Classic Ledger invoice |
| `08-midnight-teal-letter.ftl` | High-contrast masthead matching the Executive Masthead invoice |
| `09-sage-studio-letter.ftl` | Refined editorial styling matching the Editorial Studio invoice |
| `10-coral-sidebar-letter.ftl` | Bold side rail matching the Payment Sidebar invoice |
| `11-monochrome-grid-letter.ftl` | Structured black-and-white grid matching the Minimalist Grid invoice |
| `12-violet-gradient-letter.ftl` | Layered violet treatment matching the Contemporary Flow invoice |
| `13-tricolour-sidebar-letter.ftl` | Custom three-colour rail matching the Tricolour Sidebar invoice |

## Data contract

All templates use the application's canonical `company`, `client`, and `letter`
objects. The required fields are `letter.title`, `letter.message`, and
`letter.date`. Optional sender, recipient, logo, website, signature, and contact
fields are guarded with FreeMarker checks. Dynamic text is HTML-escaped except
for `letter.message`, which receives the application's sanitised rich-text HTML.

The letter message supports the safe formatting emitted by the letter editor:
bold, italic, underline, text colour, paragraphs, and line breaks. The backend
sanitises this value again before rendering the PDF.

## Theme colours

The designs are deliberately colour-agnostic. Supply the existing theme values
`theme.sidebarColor1`, `theme.sidebarColor2`, and `theme.sidebarColor3` to select
the primary, accent, and light-surface colours. Neutral monochrome defaults are
used when no theme is supplied, so changing colours never changes the layout.
