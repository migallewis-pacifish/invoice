# FreeMarker invoice templates

This folder contains seven self-contained, print-ready HTML/FreeMarker invoice
templates. Each file targets A4 paper, uses no external fonts or images, and
can therefore be rendered in an offline HTML-to-PDF pipeline.

## Available designs

| File | Style |
| --- | --- |
| `01-azure-ledger.ftl` | Crisp blue corporate ledger |
| `02-midnight-teal.ftl` | Dark, technology-focused masthead |
| `03-sage-studio.ftl` | Warm editorial layout for creative businesses |
| `04-coral-sidebar.ftl` | Bold sidebar with payment details |
| `05-monochrome-grid.ftl` | Minimal black-and-white Swiss grid |
| `06-violet-gradient.ftl` | Contemporary violet statement design |
| `07-tricolour-sidebar.ftl` | Reference-inspired invoice with a custom three-colour sidebar |

## Data contract

The templates use the application's canonical variables (`company`, `client`,
`invoice`, and `payment`). `invoice.items` is expected to be a list whose items
contain `description`, `hours`, `rate`, and `amount` properties. Values such as
money and dates should be formatted before rendering.

All dynamic text is HTML-escaped with FreeMarker's `?html` built-in. The files
also include sensible optional-field checks, but `company`, `client`, `invoice`,
`payment`, and `invoice.items` should always be present in the render model.

## Three-colour sidebar template

`07-tricolour-sidebar.ftl` adds `theme` and `signature` objects to the standard
model. Set `theme.sidebarColor1`, `theme.sidebarColor2`, and
`theme.sidebarColor3` to CSS colours (hex values are recommended) to control
the three stops in the sidebar blend. If they are omitted, the template uses
the teal palette shown in the design by default.

The template supports the following additional optional fields:

- `company.logoUrl`, `company.website`, `company.registrationNumber`, and
  `company.taxNumber`
- `client.address`
- `payment.bankName`, `payment.accountHolder`, `payment.accountType`,
  `payment.accountNumber`, and `payment.branchCode`
- `signature.imageUrl` and `signature.name`

Logo and signature values can be accessible image URLs or data URIs. The PDF
renderer must be allowed to load remote URLs; use data URIs when rendering
offline.
