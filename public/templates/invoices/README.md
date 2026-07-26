# FreeMarker invoice templates

This folder contains six self-contained, print-ready HTML/FreeMarker invoice
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

## Data contract

The templates use the application's canonical variables (`company`, `client`,
`invoice`, and `payment`). `invoice.items` is expected to be a list whose items
contain `description`, `hours`, `rate`, and `amount` properties. Values such as
money and dates should be formatted before rendering.

All dynamic text is HTML-escaped with FreeMarker's `?html` built-in. The files
also include sensible optional-field checks, but `company`, `client`, `invoice`,
`payment`, and `invoice.items` should always be present in the render model.
