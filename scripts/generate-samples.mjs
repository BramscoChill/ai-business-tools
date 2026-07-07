// One-off generator for the demo's sample invoice PDFs.
// Run with: npm run samples   (outputs to public/samples/invoices/)
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const OUT_DIR = path.join(process.cwd(), "public", "samples", "invoices");

async function makeDoc() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]); // A4
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  return { doc, page, font, bold };
}

function text(page, str, x, y, opts = {}) {
  page.drawText(String(str), {
    x,
    y,
    size: opts.size ?? 10,
    font: opts.font,
    color: opts.color ?? rgb(0.1, 0.1, 0.12),
  });
}

function line(page, x1, y, x2, thickness = 0.7) {
  page.drawLine({
    start: { x: x1, y },
    end: { x: x2, y },
    thickness,
    color: rgb(0.75, 0.75, 0.78),
  });
}

/* ---------- 1. SaaS invoice (clean, itemized, EUR) ---------- */
async function saasInvoice() {
  const { doc, page, font, bold } = await makeDoc();
  let y = 780;
  text(page, "NimbusStack B.V.", 50, y, { font: bold, size: 20, color: rgb(0.15, 0.3, 0.7) });
  text(page, "INVOICE", 460, y, { font: bold, size: 16 });
  y -= 18;
  text(page, "Keizersgracht 221, 1016 DV Amsterdam, NL", 50, y, { font, size: 9 });
  text(page, "VAT: NL861234567B01", 50, (y -= 12), { font, size: 9 });

  y -= 30;
  text(page, "Bill to:", 50, y, { font: bold });
  text(page, "Invoice number: NS-2026-0412", 350, y, { font });
  text(page, "Van Dijk Consultancy", 50, (y -= 14), { font });
  text(page, "Invoice date: 12 June 2026", 350, y, { font });
  text(page, "Prinsenstraat 8, Utrecht", 50, (y -= 14), { font });
  text(page, "Due date: 26 June 2026", 350, y, { font });

  y -= 36;
  text(page, "Description", 50, y, { font: bold });
  text(page, "Qty", 340, y, { font: bold });
  text(page, "Unit price", 400, y, { font: bold });
  text(page, "Amount", 490, y, { font: bold });
  line(page, 50, y - 6, 545);

  const items = [
    ["Team plan subscription (June 2026)", 12, 24.0],
    ["Additional storage 100 GB", 2, 9.5],
    ["Priority support add-on", 1, 49.0],
    ["Onboarding workshop (remote)", 1, 150.0],
  ];
  y -= 24;
  for (const [desc, qty, price] of items) {
    text(page, desc, 50, y, { font });
    text(page, qty, 348, y, { font });
    text(page, `€ ${price.toFixed(2)}`, 400, y, { font });
    text(page, `€ ${(qty * price).toFixed(2)}`, 490, y, { font });
    y -= 18;
  }
  line(page, 340, y + 6, 545);

  const subtotal = items.reduce((s, [, q, p]) => s + q * p, 0);
  const tax = subtotal * 0.21;
  y -= 8;
  text(page, "Subtotal", 400, y, { font });
  text(page, `€ ${subtotal.toFixed(2)}`, 490, y, { font });
  text(page, "VAT 21%", 400, (y -= 16), { font });
  text(page, `€ ${tax.toFixed(2)}`, 490, y, { font });
  text(page, "Total due", 400, (y -= 18), { font: bold, size: 12 });
  text(page, `€ ${(subtotal + tax).toFixed(2)}`, 480, y, { font: bold, size: 12 });

  y -= 40;
  text(page, "Please pay within 14 days to IBAN NL02 ABNA 0123 4567 89 quoting NS-2026-0412.", 50, y, { font, size: 9 });
  return doc.save();
}

/* ---------- 2. Retail receipt (narrow, no itemized tax breakdown, USD) ---------- */
async function retailReceipt() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([230, 500]);
  const font = await doc.embedFont(StandardFonts.Courier);
  const bold = await doc.embedFont(StandardFonts.CourierBold);
  let y = 460;
  const c = (s, yy, f = font, size = 9) =>
    page.drawText(s, { x: 115 - f.widthOfTextAtSize(s, size) / 2, y: yy, size, font: f });

  c("CORNER HARDWARE CO.", y, bold, 11);
  c("482 Maple Ave, Springfield IL", (y -= 14));
  c("Tel (217) 555-0148", (y -= 12));
  c("--------------------------", (y -= 16));
  c("RECEIPT #38271", (y -= 14), bold);
  c("07/03/2026  14:32", (y -= 12));
  c("--------------------------", (y -= 14));

  const rows = [
    ["WOOD SCREWS 4x40 (BOX)", "2 x 3.49", "6.98"],
    ["HAMMER FIBERGLASS 16OZ", "1 x 18.99", "18.99"],
    ["PAINTERS TAPE 36MM", "3 x 4.25", "12.75"],
    ["DISCOUNT MEMBER 10%", "", "-3.87"],
  ];
  y -= 6;
  for (const [name, qty, amt] of rows) {
    y -= 13;
    page.drawText(name, { x: 12, y, size: 8, font });
    y -= 11;
    if (qty) page.drawText(qty, { x: 24, y, size: 8, font });
    page.drawText(amt.padStart(8), { x: 160, y, size: 8, font });
  }
  c("--------------------------", (y -= 16));
  y -= 14;
  page.drawText("SUBTOTAL", { x: 12, y, size: 9, font: bold });
  page.drawText("34.85", { x: 165, y, size: 9, font: bold });
  y -= 13;
  page.drawText("SALES TAX 6.25%", { x: 12, y, size: 9, font });
  page.drawText("2.18", { x: 170, y, size: 9, font });
  y -= 15;
  page.drawText("TOTAL USD", { x: 12, y, size: 11, font: bold });
  page.drawText("$37.03", { x: 150, y, size: 11, font: bold });
  y -= 16;
  page.drawText("VISA ****4821   APPROVED", { x: 12, y, size: 8, font });
  c("THANK YOU - NO REFUNDS", (y -= 22));
  c("AFTER 30 DAYS", (y -= 11));
  return doc.save();
}

/* ---------- Dutch grocery receipt (Albert Heijn style: comma decimals,
   bonus discounts, VAT included in total, EUR) ---------- */
async function groceryReceipt() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([250, 640]);
  const font = await doc.embedFont(StandardFonts.Courier);
  const bold = await doc.embedFont(StandardFonts.CourierBold);
  let y = 600;
  const c = (s, yy, f = font, size = 9) =>
    page.drawText(s, { x: 125 - f.widthOfTextAtSize(s, size) / 2, y: yy, size, font: f });
  const l = (s, yy, f = font, size = 9) => page.drawText(s, { x: 14, y: yy, size, font: f });
  const r = (s, yy, f = font, size = 9) =>
    page.drawText(s, { x: 236 - f.widthOfTextAtSize(s, size), y: yy, size, font: f });

  c("Albert Heijn 1494", y, bold, 10);
  c("Mgr. Van Roosmalenplein 19", (y -= 13));
  c("TEL: 088-6591494", (y -= 12));

  y -= 20;
  l("AANTAL OMSCHRIJVING  PRIJS BEDRAG", y, bold, 8.5);
  l("---------------------------------", (y -= 11), font, 8.5);
  y -= 13;
  l("       BONUSKAART", y, font, 8.5);
  r("xx8711", y, font, 8.5);
  const items = [
    ["2", "SAPORI", "3,39", "6,78 B"],
    ["2", "AH KOEK", "3,29", "6,58 B"],
    ["2", "AARDBEI NED", "5,99", "11,98 B"],
  ];
  for (const [qty, name, price, amt] of items) {
    y -= 13;
    l(`${qty}      ${name}`, y, font, 8.5);
    page.drawText(price, { x: 150, y, size: 8.5, font });
    r(amt, y, font, 8.5);
  }
  l("---------------------------------", (y -= 11), font, 8.5);
  y -= 14;
  l("6      SUBTOTAAL", y, bold, 9);
  r("25,34", y, bold, 9);

  y -= 18;
  const bonuses = [
    ["ALLEAHKOEKEN", "-1,64"],
    ["SAPORI", "-1,70"],
    ["AHNEDAARDBEI", "-4,00"],
  ];
  for (const [name, amt] of bonuses) {
    l(`BONUS  ${name}`, y, font, 8.5);
    r(amt, y, font, 8.5);
    y -= 13;
  }
  y -= 6;
  l("JOUW VOORDEEL", y, bold, 11);
  r("7,34", y, bold, 11);
  y -= 13;
  l("       waarvan", y, font, 8.5);
  y -= 12;
  l("       BONUS BOX", y, font, 8.5);
  r("0,00", y, font, 8.5);
  l("---------------------------------", (y -= 11), font, 8.5);
  y -= 16;
  l("TOTAAL", y, bold, 12);
  r("18,00", y, bold, 12);

  y -= 20;
  l("BETAALD MET:", y, font, 9);
  y -= 13;
  l("       PINNEN", y, font, 9);
  r("18,00", y, font, 9);

  y -= 20;
  l("POI: 50286930        KLANTTICKET", y, font, 8);
  y -= 11;
  l("Terminal   BS156039  Merchant", y, font, 8);
  r("3603010101", y, font, 8);
  y -= 11;
  l("Periode        6101  Transactie", y, font, 8);
  r("00020786", y, font, 8);
  y -= 11;
  l("Token 1053032057579172728", y, font, 8);

  y -= 18;
  l("BTW          OVER           EUR", y, font, 8.5);
  y -= 12;
  l("9%          16,51          1,49", y, font, 8.5);
  y -= 12;
  l("TOTAAL      16,51          1,49", y, font, 8.5);

  // simple barcode strip
  y -= 30;
  let bx = 60;
  for (let i = 0; i < 42; i++) {
    const w = i % 3 === 0 ? 2.2 : 1;
    page.drawRectangle({ x: bx, y, width: w, height: 22, color: rgb(0.1, 0.1, 0.12) });
    bx += w + (i % 4 === 1 ? 2.6 : 1.4);
  }

  y -= 16;
  l("1494         36", y, font, 8.5);
  r("32", y, font, 8.5);
  y -= 12;
  l("12:59", y, font, 8.5);
  r("11-04-2026", y, font, 8.5);

  y -= 20;
  c("Vragen over je kassabon?", y, font, 8.5);
  c("Onze collega's", (y -= 11), font, 8.5);
  c("helpen je graag.", (y -= 11), font, 8.5);
  return doc.save();
}

/* ---------- Dutch supermarket receipt (Coop style: interleaved discount
   rows, Van-Voor markdowns, quantity-prefixed items, EUR) ---------- */
async function coopReceipt() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([250, 800]);
  const font = await doc.embedFont(StandardFonts.Courier);
  const bold = await doc.embedFont(StandardFonts.CourierBold);
  const boldItalic = await doc.embedFont(StandardFonts.HelveticaBold);
  let y = 750;
  const c = (s, yy, f = font, size = 9) =>
    page.drawText(s, { x: 125 - f.widthOfTextAtSize(s, size) / 2, y: yy, size, font: f });
  const l = (s, yy, f = font, size = 8.5) => page.drawText(s, { x: 14, y: yy, size, font: f });
  const mid = (s, yy, f = font, size = 8.5) =>
    page.drawText(s, { x: 175 - f.widthOfTextAtSize(s, size), y: yy, size, font: f });
  const r = (s, yy, f = font, size = 8.5) =>
    page.drawText(s, { x: 236 - f.widthOfTextAtSize(s, size), y: yy, size, font: f });
  const dashes = (yy) => l("-".repeat(37), yy, font, 8.5);

  c("coop", y, boldItalic, 26);
  c("Samen maak je 't verschil", (y -= 14), font, 7.5);
  y -= 18;
  c("Coop Tholen", y, bold, 10);
  c("Willibrordusstraat 36a", (y -= 12));
  c("5513 AC  WINTELRE", (y -= 12));
  c("Tel: 040-2052867", (y -= 12));
  c("Duplicaat", (y -= 16), bold, 12);

  y -= 24;
  l("Omschrijving", y, font, 8.5);
  mid("P.st/kg", y);
  r("Bedrag", y);
  y -= 11;
  mid("EUR", y);
  r("EUR", y);
  dashes((y -= 11));

  // [description, unit price, amount] — discount/markdown rows have no unit price
  const rows = [
    ["2 GEROOSTERD SPAANS BR", "1,99", "3,98"],
    ["2 MULTIKORN BROODJE", "0,69", "1,38"],
    ["  KORT.Coop Italiaanse-volkoren-", "", "-0,65"],
    ["5 SPELT POMP MAIS BR", "0,89", "4,45"],
    ["8 VOLKORENBOL", "0,59", "4,72"],
    ["  KORT.Coop Italiaanse-volkoren-", "", "-2,40"],
    ["  STOKBROOD WIT", "1,39", "1,39"],
    ["  Zaterdag actie", "", "-0,64"],
    ["  STOKBROOD TARWE", "1,39", "1,39"],
    ["  Zaterdag actie", "", "-0,64"],
    ["  MINI MUESLI BOLLEN", "2,49", "2,49"],
    ["  MINI KRENTENBOL", "1,79", "1,79"],
    ["  PHILADELPHIA KRUIDEN", "2,39", ""],
    ["  Van-Voor", "1,99", "1,99"],
    ["  ROOMKA GEMBER", "2,19", ""],
    ["  Van-Voor", "1,49", "1,49"],
    ["2 KAAS EXTRA BEL.GESN.", "3,94", "7,88"],
    ["  PLUS Kaasplakken 30+ of 48+", "", "-3,94"],
    ["  JONG 48+ PLAKKEN", "3,10", "3,10"],
    ["  PLUS Kaasplakken 30+ of 48+", "", "-1,55"],
    ["  PHILADELPHIA PLANT", "3,14", ""],
    ["  Van-Voor", "1,99", "1,99"],
    ["  MAZA MUHAMMARA", "2,59", "2,59"],
    ["  ZUIVLEHOEVE HP", "1,99", "1,99"],
    ["  KORT. ZUIVELHOEVE HP", "", "-1,00"],
  ];
  for (const [desc, price, amt] of rows) {
    y -= 12;
    l(desc, y, font, 8);
    if (price) mid(price, y, font, 8);
    if (amt) r(amt, y, font, 8);
  }
  dashes((y -= 12));

  y -= 18;
  l("Te betalen", y, bold, 14);
  r("31,80", y, bold, 14);

  y -= 20;
  l("Debit Mastercard", y);
  r("31,80", y);
  y -= 14;
  l("Wisselgeld (contant)", y, bold, 8.5);
  r("0,00", y);
  y -= 14;
  l("Jouw voordeel", y, bold, 8.5);
  r("13,07", y);
  y -= 14;
  l("Aantal Spaarzegel", y);
  r("6", y);
  dashes((y -= 12));

  y -= 14;
  l("BTW groep", y);
  mid("Excl.", y);
  page.drawText("BTW", { x: 195, y, size: 8.5, font });
  y -= 12;
  l("9,00 %", y);
  mid("29,17", y);
  r("2,63", y);
  y -= 12;
  l("Totaal", y);
  mid("29,17", y);
  r("2,63", y);

  y -= 20;
  c("Bedankt voor je bezoek", y, font, 8.5);
  c("en graag tot ziens!", (y -= 11), font, 8.5);
  return doc.save();
}

/* ---------- 3. Services invoice (hours-based, discount row, GBP) ---------- */
async function servicesInvoice() {
  const { doc, page, font, bold } = await makeDoc();
  let y = 780;
  text(page, "Harrington Design Studio Ltd", 50, y, { font: bold, size: 18, color: rgb(0.4, 0.2, 0.45) });
  y -= 16;
  text(page, "14 Camden Mews, London NW1 9BX - Company No. 09876543", 50, y, { font, size: 9 });

  y -= 34;
  text(page, "Invoice ref: HDS/26/091", 50, y, { font: bold });
  text(page, "Date of issue: 28-02-2026", 350, y, { font: bold });
  y -= 16;
  text(page, "Client: Bloomfield Organic Foods Ltd, Brighton", 50, y, { font });

  y -= 34;
  text(page, "Service", 50, y, { font: bold });
  text(page, "Hours", 330, y, { font: bold });
  text(page, "Rate", 400, y, { font: bold });
  text(page, "Amount (GBP)", 470, y, { font: bold });
  line(page, 50, y - 6, 545);

  const items = [
    ["Brand identity refresh - discovery & research", 14, 85],
    ["Logo & visual system design", 22, 85],
    ["Packaging design, 3 product lines", 31.5, 85],
    ["Print supplier liaison", 6, 60],
  ];
  y -= 24;
  for (const [desc, hrs, rate] of items) {
    text(page, desc, 50, y, { font });
    text(page, hrs, 335, y, { font });
    text(page, rate.toFixed(2), 400, y, { font });
    text(page, (hrs * rate).toFixed(2), 480, y, { font });
    y -= 18;
  }
  text(page, "Returning client discount", 50, y, { font });
  text(page, "-250.00", 478, y, { font });
  y -= 18;
  line(page, 330, y + 8, 545);

  const gross = items.reduce((s, [, h, r]) => s + h * r, 0) - 250;
  const vat = gross * 0.2;
  y -= 6;
  text(page, "Net", 400, y, { font });
  text(page, gross.toFixed(2), 480, y, { font });
  text(page, "VAT 20%", 400, (y -= 16), { font });
  text(page, vat.toFixed(2), 480, y, { font });
  text(page, "TOTAL", 400, (y -= 18), { font: bold, size: 12 });
  text(page, `£${(gross + vat).toFixed(2)}`, 472, y, { font: bold, size: 12 });

  y -= 40;
  text(page, "Payment terms: 30 days net. Sort code 20-41-77, account 55019283.", 50, y, { font, size: 9 });
  return doc.save();
}

const outputs = [
  ["saas-invoice.pdf", saasInvoice],
  ["retail-receipt.pdf", retailReceipt],
  ["grocery-receipt.jpeg", groceryReceipt],
  ["supermarket-receipt.jpg", coopReceipt],
  ["services-invoice.pdf", servicesInvoice],
];

await mkdir(OUT_DIR, { recursive: true });
for (const [name, gen] of outputs) {
  const bytes = await gen();
  await writeFile(path.join(OUT_DIR, name), bytes);
  console.log(`wrote ${name} (${bytes.length} bytes)`);
}
