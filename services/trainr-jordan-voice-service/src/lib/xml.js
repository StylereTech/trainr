export function escapeXml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export function twiml(xmlBody) {
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${xmlBody}</Response>`;
}
