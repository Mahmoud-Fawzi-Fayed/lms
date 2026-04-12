export type ExportColumn<T> = {
  header: string;
  value: (row: T) => string | number | null | undefined;
};

function normalizeCell(value: string | number | null | undefined): string | number {
  if (value === null || value === undefined) return '';
  return typeof value === 'number' ? value : String(value);
}

export async function exportToExcel<T>(
  fileName: string,
  sheetName: string,
  rows: T[],
  columns: ExportColumn<T>[]
) {
  const XLSX = await import('xlsx');

  const data = rows.map((row) => {
    const item: Record<string, string | number> = {};
    for (const col of columns) {
      item[col.header] = normalizeCell(col.value(row));
    }
    return item;
  });

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`);
}

export async function exportToPdf<T>(
  fileName: string,
  title: string,
  rows: T[],
  columns: ExportColumn<T>[]
) {
  const html2canvas = (await import('html2canvas')).default;
  const { default: jsPDF } = await import('jspdf');

  const container = document.createElement('div');
  container.dir = 'rtl';
  container.style.position = 'fixed';
  container.style.left = '-10000px';
  container.style.top = '0';
  container.style.width = '1200px';
  container.style.background = '#ffffff';
  container.style.color = '#0f172a';
  container.style.fontFamily = 'Cairo, Tahoma, Arial, sans-serif';
  container.style.padding = '24px';

  const nowText = new Date().toLocaleDateString('ar-EG', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const summaryHtml = `
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:18px;">
      <div style="border:1px solid #e2e8f0;border-radius:10px;padding:10px;background:#f8fafc;"><div style="font-size:12px;color:#64748b;">عدد السجلات</div><div style="font-size:18px;font-weight:700;">${rows.length}</div></div>
      <div style="border:1px solid #e2e8f0;border-radius:10px;padding:10px;background:#f8fafc;"><div style="font-size:12px;color:#64748b;">نوع التقرير</div><div style="font-size:18px;font-weight:700;">تحليلات</div></div>
      <div style="border:1px solid #e2e8f0;border-radius:10px;padding:10px;background:#f8fafc;"><div style="font-size:12px;color:#64748b;">التاريخ</div><div style="font-size:18px;font-weight:700;">${nowText}</div></div>
      <div style="border:1px solid #e2e8f0;border-radius:10px;padding:10px;background:#f8fafc;"><div style="font-size:12px;color:#64748b;">الحالة</div><div style="font-size:18px;font-weight:700;">جاهز للطباعة</div></div>
    </div>`;

  const headerHtml = `
    <div style="margin-bottom:16px;display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
      <div>
        <div style="font-size:24px;font-weight:800;color:#0f172a;">${title}</div>
        <div style="font-size:13px;color:#64748b;margin-top:4px;">تقرير بصيغة لوحة تحكم</div>
      </div>
      <div style="font-size:12px;color:#64748b;">${nowText}</div>
    </div>`;

  const tableHead = columns
    .map(
      (c) =>
        `<th style="background:#0ea5e9;color:#fff;padding:10px 8px;border:1px solid #dbeafe;font-size:12px;font-weight:700;text-align:right;">${c.header}</th>`
    )
    .join('');

  const tableRows = rows
    .map((row, rowIndex) => {
      const cells = columns
        .map((c) => {
          const value = String(normalizeCell(c.value(row)));
          return `<td style="padding:8px;border:1px solid #e2e8f0;font-size:12px;text-align:right;background:${
            rowIndex % 2 === 0 ? '#ffffff' : '#f8fafc'
          };">${value}</td>`;
        })
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');

  container.innerHTML = `
    ${headerHtml}
    ${summaryHtml}
    <table style="width:100%;border-collapse:collapse;table-layout:fixed;">
      <thead><tr>${tableHead}</tr></thead>
      <tbody>${tableRows}</tbody>
    </table>
  `;

  document.body.appendChild(container);

  const canvas = await html2canvas(container, {
    scale: 2,
    backgroundColor: '#ffffff',
    useCORS: true,
  });

  document.body.removeChild(container);

  const imgData = canvas.toDataURL('image/png');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 16;
  const imgWidth = pageWidth - margin * 2;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  let heightLeft = imgHeight;
  let position = margin;

  doc.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight);
  heightLeft -= pageHeight - margin * 2;

  while (heightLeft > 0) {
    position = heightLeft - imgHeight + margin;
    doc.addPage();
    doc.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight);
    heightLeft -= pageHeight - margin * 2;
  }

  doc.save(fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`);
}
