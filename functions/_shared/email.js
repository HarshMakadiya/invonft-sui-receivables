const RESEND_EMAILS_URL = "https://api.resend.com/emails";
const DEFAULT_EXPLORER_URL = "https://suiscan.xyz/testnet";

export function isInvoiceEmailConfigured(env) {
  return Boolean(env.RESEND_API_KEY?.trim() && env.INVOICE_EMAIL_FROM?.trim());
}

export async function sendInvoiceCreatedEmail(env, invoice, options = {}) {
  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.INVOICE_EMAIL_FROM?.trim();
  const to = invoice.clientEmail?.trim();

  if (!apiKey || !from) {
    return { status: "skipped", reason: "Email provider is not configured." };
  }

  if (!isEmailAddress(to)) {
    return { status: "skipped", reason: "Client email is missing or invalid." };
  }

  const appBaseUrl = baseUrl(env.INVO_PUBLIC_APP_URL || env.CF_PAGES_URL || options.origin);
  const explorerBaseUrl = baseUrl(env.SUI_EXPLORER_URL || DEFAULT_EXPLORER_URL);
  const invoiceUrl = appBaseUrl ? `${appBaseUrl}/invoice/${encodeURIComponent(invoice.id)}` : undefined;
  const suiObjectUrl = invoice.objectId ? `${explorerBaseUrl}/object/${invoice.objectId}` : undefined;
  const suiTxUrl = invoice.txDigest ? `${explorerBaseUrl}/tx/${invoice.txDigest}` : undefined;
  const walrusUrl = invoice.blobId ? walrusEvidenceUrl(env, invoice.blobId, appBaseUrl) : undefined;

  const subject = `Invoice ${invoice.id} created on InvoNFT`;
  const response = await fetch(RESEND_EMAILS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `invoice-created-${invoice.objectId || invoice.id}`.slice(0, 256),
    },
    body: JSON.stringify({
      from,
      to,
      reply_to: env.INVOICE_REPLY_TO?.trim() || undefined,
      subject,
      text: invoiceCreatedText(invoice, { invoiceUrl, suiObjectUrl, suiTxUrl, walrusUrl }),
      html: invoiceCreatedHtml(invoice, { invoiceUrl, suiObjectUrl, suiTxUrl, walrusUrl }),
      tags: [
        { name: "app", value: "invonft" },
        { name: "event", value: "invoice_created" },
      ],
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Invoice email failed: ${response.status} ${response.statusText}${detail ? ` - ${detail}` : ""}`);
  }

  const result = await response.json().catch(() => ({}));
  return { status: "sent", provider: "resend", id: result.id };
}

function invoiceCreatedText(invoice, links) {
  return [
    `Invoice ${invoice.id} was created on InvoNFT.`,
    "",
    `Client: ${invoice.clientName}`,
    `Description: ${invoice.description}`,
    `Amount: ${formatAmount(invoice.amount)}`,
    `Due date: ${invoice.dueDate || "Not set"}`,
    `Issuer wallet: ${invoice.issuer}`,
    `Payer wallet: ${invoice.payer}`,
    "",
    links.invoiceUrl ? `View invoice: ${links.invoiceUrl}` : undefined,
    links.suiObjectUrl ? `Sui object: ${links.suiObjectUrl}` : undefined,
    links.suiTxUrl ? `Create transaction: ${links.suiTxUrl}` : undefined,
    links.walrusUrl ? `Walrus evidence: ${links.walrusUrl}` : undefined,
    "",
    "This is a Testnet receivable notification. Review the invoice details before paying.",
  ]
    .filter(Boolean)
    .join("\n");
}

function invoiceCreatedHtml(invoice, links) {
  const linkRows = [
    ["View invoice", links.invoiceUrl],
    ["Sui object", links.suiObjectUrl],
    ["Create transaction", links.suiTxUrl],
    ["Walrus evidence", links.walrusUrl],
  ].filter(([, href]) => Boolean(href));

  return `<!doctype html>
<html>
  <body style="margin:0;background:#f8f5ed;color:#1d1d1a;font-family:Inter,Arial,sans-serif;">
    <div style="max-width:640px;margin:0 auto;padding:32px 20px;">
      <div style="border:1px solid #d8d0bf;border-radius:18px;background:#fffdf8;padding:28px;">
        <p style="margin:0 0 10px;color:#24533f;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;">InvoNFT receivable</p>
        <h1 style="margin:0 0 16px;font-size:28px;line-height:1.15;">Invoice ${escapeHtml(invoice.id)} was created</h1>
        <p style="margin:0 0 24px;color:#4b4a43;font-size:15px;line-height:1.6;">A Sui Testnet receivable has been created for your review.</p>
        ${detailTable(invoice)}
        ${
          linkRows.length
            ? `<div style="margin-top:24px;">${linkRows
                .map(
                  ([label, href]) =>
                    `<p style="margin:0 0 10px;"><a href="${escapeAttribute(href)}" style="color:#24533f;font-weight:700;text-decoration:none;">${escapeHtml(label)} &rarr;</a></p>`,
                )
                .join("")}</div>`
            : ""
        }
        <p style="margin:24px 0 0;color:#716f67;font-size:12px;line-height:1.5;">This is a Testnet receivable notification. Review the invoice details before paying.</p>
      </div>
    </div>
  </body>
</html>`;
}

function detailTable(invoice) {
  const rows = [
    ["Client", invoice.clientName],
    ["Description", invoice.description],
    ["Amount", formatAmount(invoice.amount)],
    ["Due date", invoice.dueDate || "Not set"],
    ["Issuer", shortAddress(invoice.issuer)],
    ["Payer", shortAddress(invoice.payer)],
  ];

  return `<table style="width:100%;border-collapse:collapse;">${rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:10px 0;border-top:1px solid #e5dece;color:#716f67;font-size:13px;">${escapeHtml(label)}</td><td style="padding:10px 0;border-top:1px solid #e5dece;text-align:right;font-weight:700;font-size:13px;">${escapeHtml(value)}</td></tr>`,
    )
    .join("")}</table>`;
}

function baseUrl(value) {
  return value?.trim().replace(/\/+$/, "");
}

function walrusEvidenceUrl(env, blobId, appBaseUrl) {
  if (appBaseUrl) {
    return `${appBaseUrl}/api/walrus/${encodeURIComponent(blobId)}`;
  }

  const aggregatorUrl = baseUrl(env.VITE_WALRUS_AGGREGATOR_URL || env.WALRUS_AGGREGATOR_URL || "https://aggregator.walrus-testnet.walrus.space");
  return `${aggregatorUrl}/v1/blobs/${encodeURIComponent(blobId)}`;
}

function isEmailAddress(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value ?? "");
}

function formatAmount(amount) {
  return `${Number(amount).toLocaleString(undefined, { maximumFractionDigits: 6 })} USDC`;
}

function shortAddress(value) {
  return value && value.length > 16 ? `${value.slice(0, 8)}...${value.slice(-6)}` : value || "Not set";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}
