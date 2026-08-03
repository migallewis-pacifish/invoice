# FreeMarker email templates

These responsive, table-based HTML emails focus on six reusable layouts rather
than fixed branding. Each template accepts three theme inputs:

- `theme.primary` — the dominant structural colour
- `theme.secondary` — supporting text and rule colour
- `theme.accent` — the light panel or highlight colour

The fallback values make each file independently previewable. The application
replaces them with the colours selected by the user before the design is opened.
All templates accept `company`, `client`, and `message.body`; the receipt layout
also uses `invoice.number`, `invoice.total`, and `invoice.dueDate`.
