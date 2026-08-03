# FreeMarker letter templates

This folder contains six self-contained, print-ready HTML/FreeMarker letter
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

## Data contract

All templates use the application's canonical `company`, `client`, and `letter`
objects. The required fields are `letter.title`, `letter.message`, and
`letter.date`. Optional sender, recipient, logo, website, signature, and contact
fields are guarded with FreeMarker checks. Dynamic text is HTML-escaped.

The letter message is rendered with `white-space: pre-line`, preserving line
breaks without allowing message content to inject HTML.

## Theme colours

The designs are deliberately colour-agnostic. Supply the existing theme values
`theme.sidebarColor1`, `theme.sidebarColor2`, and `theme.sidebarColor3` to select
the primary, accent, and light-surface colours. Neutral monochrome defaults are
used when no theme is supplied, so changing colours never changes the layout.

