export interface InvoiceData {
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  academy: {
    name: string;
    address?: string;
    email?: string;
    phone?: string;
    logo?: string;
    vatRegistrationNumber?: string;
  };
  player: {
    name: string;
    email?: string;
    phone?: string;
  };
  lineItems: {
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }[];
  subtotal: number;
  tax?: number;
  taxRate?: number;
  discount?: number;
  total: number;
  currency: string;
  notes?: string;
  status: 'pending' | 'paid' | 'overdue' | 'cancelled';
  paidAt?: string;
}

export function generateInvoiceHtml(data: InvoiceData): string {
  const currencySymbol = data.currency === 'AED' ? 'AED' : 
                         data.currency === 'USD' ? '$' :
                         data.currency === 'EUR' ? '€' :
                         data.currency === 'GBP' ? '£' : data.currency;
  
  const formatCurrency = (amount: number) => 
    `${currencySymbol} ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  const statusColor = data.status === 'paid' ? '#10B981' :
                      data.status === 'overdue' ? '#EF4444' :
                      data.status === 'cancelled' ? '#6B7280' : '#F59E0B';
  
  const statusLabel = data.status.charAt(0).toUpperCase() + data.status.slice(1);

  const lineItemsHtml = data.lineItems.map(item => `
    <tr>
      <td style="padding: 16px 20px; border-bottom: 1px solid #E5E7EB;">${item.description}</td>
      <td style="padding: 16px 20px; border-bottom: 1px solid #E5E7EB; text-align: center;">${item.quantity}</td>
      <td style="padding: 16px 20px; border-bottom: 1px solid #E5E7EB; text-align: right;">${formatCurrency(item.unitPrice)}</td>
      <td style="padding: 16px 20px; border-bottom: 1px solid #E5E7EB; text-align: right; font-weight: 500;">${formatCurrency(item.total)}</td>
    </tr>
  `).join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      line-height: 1.6;
      color: #1F2937;
      background: #FFFFFF;
    }
    
    .invoice-container {
      max-width: 800px;
      margin: 0 auto;
      padding: 48px;
    }
    
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 48px;
      padding-bottom: 32px;
      border-bottom: 2px solid #E5E7EB;
    }
    
    .academy-info h1 {
      font-size: 28px;
      font-weight: 700;
      color: #111827;
      margin-bottom: 8px;
    }
    
    .academy-info p {
      color: #6B7280;
      font-size: 13px;
      margin: 2px 0;
    }
    
    .invoice-title {
      text-align: right;
    }
    
    .invoice-title h2 {
      font-size: 32px;
      font-weight: 700;
      color: #111827;
      letter-spacing: -0.5px;
    }
    
    .invoice-number {
      font-size: 14px;
      color: #6B7280;
      margin-top: 4px;
    }
    
    .status-badge {
      display: inline-block;
      padding: 6px 16px;
      border-radius: 20px;
      font-size: 13px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-top: 12px;
    }
    
    .billing-section {
      display: flex;
      justify-content: space-between;
      margin-bottom: 40px;
    }
    
    .billing-box {
      flex: 1;
    }
    
    .billing-box h3 {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #9CA3AF;
      margin-bottom: 12px;
    }
    
    .billing-box .name {
      font-size: 16px;
      font-weight: 600;
      color: #111827;
      margin-bottom: 4px;
    }
    
    .billing-box p {
      color: #6B7280;
      font-size: 13px;
      margin: 2px 0;
    }
    
    .dates-box {
      text-align: right;
    }
    
    .date-row {
      display: flex;
      justify-content: flex-end;
      gap: 16px;
      margin-bottom: 8px;
    }
    
    .date-label {
      font-size: 13px;
      color: #9CA3AF;
    }
    
    .date-value {
      font-size: 13px;
      color: #111827;
      font-weight: 500;
      min-width: 140px;
      text-align: right;
    }
    
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 32px;
    }
    
    .items-table thead th {
      background: #F9FAFB;
      padding: 14px 20px;
      text-align: left;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #6B7280;
      border-bottom: 2px solid #E5E7EB;
    }
    
    .items-table thead th:nth-child(2),
    .items-table thead th:nth-child(3),
    .items-table thead th:nth-child(4) {
      text-align: right;
    }
    
    .items-table thead th:nth-child(2) {
      text-align: center;
    }
    
    .totals-section {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 40px;
    }
    
    .totals-box {
      width: 300px;
    }
    
    .totals-row {
      display: flex;
      justify-content: space-between;
      padding: 10px 0;
      border-bottom: 1px solid #E5E7EB;
    }
    
    .totals-row.total {
      border-bottom: none;
      border-top: 2px solid #111827;
      margin-top: 8px;
      padding-top: 16px;
    }
    
    .totals-label {
      color: #6B7280;
      font-size: 14px;
    }
    
    .totals-value {
      font-weight: 500;
      color: #111827;
    }
    
    .totals-row.total .totals-label,
    .totals-row.total .totals-value {
      font-size: 18px;
      font-weight: 700;
      color: #111827;
    }
    
    .notes-section {
      background: #F9FAFB;
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 40px;
    }
    
    .notes-section h4 {
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #6B7280;
      margin-bottom: 8px;
    }
    
    .notes-section p {
      color: #4B5563;
      font-size: 13px;
    }
    
    .footer {
      text-align: center;
      padding-top: 32px;
      border-top: 1px solid #E5E7EB;
    }
    
    .footer p {
      color: #9CA3AF;
      font-size: 12px;
    }
    
    .glow-branding {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      margin-top: 16px;
    }
    
    .glow-branding span {
      font-size: 11px;
      color: #9CA3AF;
    }
    
    .glow-logo {
      font-weight: 700;
      color: #10B981;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="invoice-container">
    <div class="header">
      <div class="academy-info">
        ${data.academy.logo ? `<img src="${data.academy.logo}" alt="${data.academy.name}" style="max-height:64px;max-width:200px;display:block;margin-bottom:12px;object-fit:contain;" />` : ''}
        <h1>${data.academy.name}</h1>
        ${data.academy.address ? `<p>${data.academy.address}</p>` : ''}
        ${data.academy.email ? `<p>${data.academy.email}</p>` : ''}
        ${data.academy.phone ? `<p>${data.academy.phone}</p>` : ''}
        <p style="margin-top: 8px; font-style: italic; color: #6B7280; font-size: 12px;">${data.academy.vatRegistrationNumber ? `TRN: ${data.academy.vatRegistrationNumber}` : 'Not VAT registered'}</p>
      </div>
      <div class="invoice-title">
        <h2>INVOICE</h2>
        <p class="invoice-number">${data.invoiceNumber}</p>
        <span class="status-badge" style="background: ${statusColor}20; color: ${statusColor};">
          ${statusLabel}
        </span>
      </div>
    </div>
    
    <div class="billing-section">
      <div class="billing-box">
        <h3>Bill To</h3>
        <p class="name">${data.player.name}</p>
        ${data.player.email ? `<p>${data.player.email}</p>` : ''}
        ${data.player.phone ? `<p>${data.player.phone}</p>` : ''}
      </div>
      <div class="billing-box dates-box">
        <div class="date-row">
          <span class="date-label">Issue Date:</span>
          <span class="date-value">${formatDate(data.issueDate)}</span>
        </div>
        <div class="date-row">
          <span class="date-label">Due Date:</span>
          <span class="date-value">${formatDate(data.dueDate)}</span>
        </div>
        ${data.paidAt ? `
        <div class="date-row">
          <span class="date-label">Paid On:</span>
          <span class="date-value" style="color: #10B981;">${formatDate(data.paidAt)}</span>
        </div>
        ` : ''}
      </div>
    </div>
    
    <table class="items-table">
      <thead>
        <tr>
          <th style="width: 45%;">Description</th>
          <th style="width: 15%;">Qty</th>
          <th style="width: 20%;">Unit Price</th>
          <th style="width: 20%;">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${lineItemsHtml}
      </tbody>
    </table>
    
    <div class="totals-section">
      <div class="totals-box">
        <div class="totals-row">
          <span class="totals-label">Subtotal</span>
          <span class="totals-value">${formatCurrency(data.subtotal)}</span>
        </div>
        ${data.taxRate ? `
        <div class="totals-row">
          <span class="totals-label">Tax (${data.taxRate}%)</span>
          <span class="totals-value">${formatCurrency(data.tax || 0)}</span>
        </div>
        ` : ''}
        ${data.discount ? `
        <div class="totals-row">
          <span class="totals-label">Discount</span>
          <span class="totals-value" style="color: #10B981;">-${formatCurrency(data.discount)}</span>
        </div>
        ` : ''}
        <div class="totals-row total">
          <span class="totals-label">Total Due</span>
          <span class="totals-value">${formatCurrency(data.total)}</span>
        </div>
      </div>
    </div>
    
    ${data.notes ? `
    <div class="notes-section">
      <h4>Notes</h4>
      <p>${data.notes}</p>
    </div>
    ` : ''}
    
    <div class="footer">
      <p>Thank you for your business!</p>
      <div class="glow-branding">
        <span>Powered by</span>
        <span class="glow-logo">Glow Up Sports</span>
      </div>
    </div>
  </div>
</body>
</html>
`;
}

function parseNumericValue(value: unknown): number {
  if (typeof value === 'number' && !isNaN(value)) return value;
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^0-9.-]/g, '');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

export function parseLineItems(lineItemsJson: string | null): InvoiceData['lineItems'] {
  if (!lineItemsJson) return [];
  try {
    const parsed = JSON.parse(lineItemsJson);
    const items = Array.isArray(parsed) ? parsed : (parsed?.items || []);
    if (!Array.isArray(items)) return [];
    return items.map(item => {
      const unitPrice = parseNumericValue(item.unitPrice);
      const quantity = parseNumericValue(item.quantity) || 1;
      const total = parseNumericValue(item.total) || (unitPrice * quantity);
      return {
        description: item.description || 'Item',
        quantity,
        unitPrice,
        total,
      };
    });
  } catch {
    return [];
  }
}

export function parseInvoiceMetadata(lineItemsJson: string | null): { discount?: number; taxRate?: number; taxAmount?: number; subtotal?: number } {
  if (!lineItemsJson) return {};
  try {
    const parsed = JSON.parse(lineItemsJson);
    if (Array.isArray(parsed)) return {};
    return {
      discount: parsed.discount ? Number(parsed.discount) : undefined,
      taxRate: parsed.taxRate ? Number(parsed.taxRate) : undefined,
      taxAmount: parsed.taxAmount ? Number(parsed.taxAmount) : undefined,
      subtotal: parsed.subtotal ? Number(parsed.subtotal) : undefined,
    };
  } catch {
    return {};
  }
}
