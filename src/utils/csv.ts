export function sanitizeCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '""';
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : '""';
  }
  let text = String(value);
  // Prevent CSV spreadsheet formula injection when opened in Excel / Google Sheets
  if (/^[=+\-@\t\r]/.test(text.trimStart())) {
    text = `'${text}`;
  }
  const escaped = text.replace(/"/g, '""');
  return `"${escaped}"`;
}

export function downloadCsv(
  filename: string,
  headers: string[],
  rows: (string | number | null | undefined)[][]
): void {
  const headerLine = headers.map((h) => sanitizeCsvCell(h)).join(',');
  const bodyLines = rows.map((row) => row.map((cell) => sanitizeCsvCell(cell)).join(','));
  const csvContent = '\ufeff' + [headerLine, ...bodyLines].join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
