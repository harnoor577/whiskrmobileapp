import jsPDF from 'jspdf';
import { format } from 'date-fns';

// Brand colors
const BRAND_PRIMARY = '#2C4554';
const BRAND_PRIMARY_RGB = { r: 44, g: 69, b: 84 };
const TEXT_BODY = '#1F2937';
const TEXT_BODY_RGB = { r: 31, g: 41, b: 55 };
const TEXT_MUTED = '#6B7280';
const TEXT_MUTED_RGB = { r: 107, g: 114, b: 128 };
const DIVIDER_COLOR = '#E5E7EB';
const DIVIDER_RGB = { r: 229, g: 231, b: 235 };

export interface ClinicInfo {
  name: string;
  address?: string | null;
  phone?: string | null;
  clinic_email?: string | null;
  header_logo_url?: string | null;
}

export interface VetInfo {
  name: string;
  name_prefix?: string | null;
  dvm_role?: string | null;
}

export interface PatientInfoPDF {
  name: string;
  species: string;
  breed?: string | null;
  patientId?: string;
}

export interface PDFContext {
  doc: jsPDF;
  yPos: number;
  pageWidth: number;
  pageHeight: number;
  margin: number;
  contentWidth: number;
  currentPage: number;
  totalPages?: number;
}

/**
 * Creates a new PDF context with default settings
 */
export function createPDFContext(): PDFContext {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  
  return {
    doc,
    yPos: margin,
    pageWidth,
    pageHeight,
    margin,
    contentWidth: pageWidth - (margin * 2),
    currentPage: 1,
  };
}

/**
 * Checks if we need a new page and adds one if necessary
 */
export function checkPageBreak(ctx: PDFContext, requiredSpace: number = 20): PDFContext {
  if (ctx.yPos + requiredSpace > ctx.pageHeight - 30) {
    ctx.doc.addPage();
    ctx.currentPage++;
    ctx.yPos = ctx.margin;
  }
  return ctx;
}

/**
 * Adds the document title (e.g., "SOAP Notes", "Wellness Report")
 */
export function addDocumentTitle(ctx: PDFContext, title: string): PDFContext {
  const { doc, pageWidth } = ctx;
  let yPos = ctx.yPos;

  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(BRAND_PRIMARY_RGB.r, BRAND_PRIMARY_RGB.g, BRAND_PRIMARY_RGB.b);
  doc.text(title, pageWidth / 2, yPos, { align: 'center' });
  yPos += 12;

  return { ...ctx, yPos };
}

/**
 * Adds patient info on left and clinic/vet info on right in a side-by-side layout
 */
export function addHeaderWithPatientAndClinic(
  ctx: PDFContext,
  patient: PatientInfoPDF | null,
  consultDate: string | undefined,
  clinic: ClinicInfo | null,
  vet: VetInfo | null
): PDFContext {
  const { doc, pageWidth, margin } = ctx;
  let yPos = ctx.yPos;
  const rightColX = pageWidth / 2 + 10;
  const startY = yPos;

  // === LEFT COLUMN: Patient Info ===
  if (patient) {
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(TEXT_BODY_RGB.r, TEXT_BODY_RGB.g, TEXT_BODY_RGB.b);
    
    // Patient name with species and breed
    let patientLine = `Patient: ${patient.name}`;
    if (patient.species) patientLine += ` • ${patient.species}`;
    if (patient.breed) patientLine += ` (${patient.breed})`;
    doc.text(patientLine, margin, yPos);
    yPos += 7;

    // Patient ID if available
    if (patient.patientId) {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(TEXT_MUTED_RGB.r, TEXT_MUTED_RGB.g, TEXT_MUTED_RGB.b);
      doc.text(`Patient ID: ${patient.patientId}`, margin, yPos);
      yPos += 7;
    }
  }

  // Date on left column
  if (consultDate) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(TEXT_MUTED_RGB.r, TEXT_MUTED_RGB.g, TEXT_MUTED_RGB.b);
    try {
      doc.text(`Date: ${format(new Date(consultDate), 'MMMM d, yyyy h:mm a')}`, margin, yPos);
    } catch {
      doc.text(`Date: ${consultDate}`, margin, yPos);
    }
    yPos += 7;
  }

  // === RIGHT COLUMN: Clinic & Vet Info ===
  let rightY = startY;

  // Clinic name - bold and branded
  if (clinic?.name) {
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(BRAND_PRIMARY_RGB.r, BRAND_PRIMARY_RGB.g, BRAND_PRIMARY_RGB.b);
    doc.text(clinic.name, pageWidth - margin, rightY, { align: 'right' });
    rightY += 6;
  }

  // Clinic address
  if (clinic?.address) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(TEXT_MUTED_RGB.r, TEXT_MUTED_RGB.g, TEXT_MUTED_RGB.b);
    doc.text(clinic.address, pageWidth - margin, rightY, { align: 'right' });
    rightY += 5;
  }

  // Phone and email
  const contactParts: string[] = [];
  if (clinic?.phone) contactParts.push(clinic.phone);
  if (clinic?.clinic_email) contactParts.push(clinic.clinic_email);
  
  if (contactParts.length > 0) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(TEXT_MUTED_RGB.r, TEXT_MUTED_RGB.g, TEXT_MUTED_RGB.b);
    doc.text(contactParts.join(' • '), pageWidth - margin, rightY, { align: 'right' });
    rightY += 5;
  }

  // Vet name
  if (vet?.name) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(TEXT_MUTED_RGB.r, TEXT_MUTED_RGB.g, TEXT_MUTED_RGB.b);
    
    // Use name_prefix if available and not 'None'
    const displayName = vet.name_prefix && vet.name_prefix !== 'None' 
      ? `${vet.name_prefix} ${vet.name}` 
      : vet.name;
    const vetTitle = vet.dvm_role ? `${displayName}, ${vet.dvm_role}` : displayName;
    
    doc.text(vetTitle, pageWidth - margin, rightY, { align: 'right' });
    rightY += 5;
  }

  // Use the max of left and right columns
  yPos = Math.max(yPos, rightY) + 8;

  // Divider line
  doc.setDrawColor(DIVIDER_RGB.r, DIVIDER_RGB.g, DIVIDER_RGB.b);
  doc.setLineWidth(0.5);
  doc.line(margin, yPos, pageWidth - margin, yPos);
  yPos += 12;

  return { ...ctx, yPos };
}

/**
 * Adds a colored section heading - 14pt
 */
export function addSectionHeading(ctx: PDFContext, heading: string): PDFContext {
  ctx = checkPageBreak(ctx, 25);
  const { doc, margin } = ctx;
  let yPos = ctx.yPos;

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(BRAND_PRIMARY_RGB.r, BRAND_PRIMARY_RGB.g, BRAND_PRIMARY_RGB.b);
  doc.text(heading, margin, yPos);
  yPos += 10;

  return { ...ctx, yPos };
}

/**
 * Adds body text with proper spacing and formatting - 11pt with 7pt line height
 * Handles bullets and line breaks
 */
export function addBodyText(ctx: PDFContext, text: string | null): PDFContext {
  if (!text) return ctx;

  const { doc, margin, contentWidth } = ctx;
  let yPos = ctx.yPos;

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(TEXT_BODY_RGB.r, TEXT_BODY_RGB.g, TEXT_BODY_RGB.b);

  // Clean markdown but preserve structure
  let cleanText = text
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/#{1,6}\s/g, '');

  // Split by line breaks to handle paragraphs
  const paragraphs = cleanText.split(/\n/);

  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) {
      yPos += 5; // Paragraph spacing (increased)
      continue;
    }

    // Check for bullet points - detect indentation level for hierarchy
    const isSubItem = paragraph.match(/^[ \t]+[-•]\s*/);
    const isTopLevelBullet = !isSubItem && paragraph.trim().match(/^[-•]\s*/);
    
    let bulletChar = '';
    let indent = margin;
    let textContent = paragraph.trim();
    let textWidth = contentWidth;

    if (isSubItem) {
      bulletChar = '-';
      indent = margin + 12; // More indent for sub-items
      textContent = paragraph.trim().replace(/^[-•]\s*/, '');
      textWidth = contentWidth - 12;
    } else if (isTopLevelBullet) {
      bulletChar = '•';
      indent = margin + 6;
      textContent = paragraph.trim().replace(/^[-•]\s*/, '');
      textWidth = contentWidth - 6;
    }

    if (bulletChar) {
      // Draw bullet point or dash
      ctx = checkPageBreak({ ...ctx, yPos }, 10);
      yPos = ctx.yPos;
      doc.text(bulletChar, indent - 4, yPos);
    }

    const lines = doc.splitTextToSize(textContent, textWidth);
    
    for (const line of lines) {
      ctx = checkPageBreak({ ...ctx, yPos }, 10);
      yPos = ctx.yPos;
      doc.text(line, indent, yPos);
      yPos += 7; // Line height (increased from 5 to 7)
    }
    
    yPos += 4; // Extra spacing between items (increased from 2 to 4)
  }

  yPos += 10; // Section end spacing (increased from 6 to 10)

  return { ...ctx, yPos };
}

/**
 * Adds a complete section with heading and body text
 */
export function addSection(ctx: PDFContext, heading: string, text: string | null): PDFContext {
  if (!text) return ctx;
  ctx = addSectionHeading(ctx, heading);
  ctx = addBodyText(ctx, text);
  return ctx;
}

/**
 * Adds page footer with branding and page numbers
 * Should be called before saving the PDF
 */
export function addPageFooters(ctx: PDFContext): PDFContext {
  const { doc, pageWidth, pageHeight, margin } = ctx;
  const totalPages = doc.getNumberOfPages();
  const footerY = pageHeight - 10;

  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    
    // Footer divider
    doc.setDrawColor(DIVIDER_RGB.r, DIVIDER_RGB.g, DIVIDER_RGB.b);
    doc.setLineWidth(0.3);
    doc.line(margin, footerY - 5, pageWidth - margin, footerY - 5);
    
    // Left: Whiskr branding
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(TEXT_MUTED_RGB.r, TEXT_MUTED_RGB.g, TEXT_MUTED_RGB.b);
    doc.text('Generated by whiskr.ai', margin, footerY);
    
    // Center: Generation date
    const dateText = format(new Date(), 'MMM d, yyyy');
    doc.text(dateText, pageWidth / 2, footerY, { align: 'center' });
    
    // Right: Page numbers
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, footerY, { align: 'right' });
  }

  return { ...ctx, totalPages };
}

/**
 * Helper to clean markdown from text
 */
export function cleanMarkdownForPDF(text: string): string {
  return text
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/#{1,6}\s/g, '')
    .replace(/`/g, '');
}

// Legacy functions for backward compatibility
export function addClinicHeader(
  ctx: PDFContext,
  clinic: ClinicInfo | null,
  vet: VetInfo | null
): PDFContext {
  // Now handled by addHeaderWithPatientAndClinic
  return ctx;
}

export function addPatientInfo(
  ctx: PDFContext,
  patient: PatientInfoPDF | null,
  consultDate?: string
): PDFContext {
  // Now handled by addHeaderWithPatientAndClinic
  return ctx;
}

/**
 * Generate a complete professional PDF with side-by-side header layout
 */
export function generateProfessionalPDF(
  title: string,
  clinic: ClinicInfo | null,
  vet: VetInfo | null,
  patient: PatientInfoPDF | null,
  consultDate: string | undefined,
  sections: Array<{ heading: string; content: string | null }>
): jsPDF {
  let ctx = createPDFContext();
  
  // Add centered title first
  ctx = addDocumentTitle(ctx, title);
  
  // Add side-by-side patient (left) and clinic/vet (right) info
  ctx = addHeaderWithPatientAndClinic(ctx, patient, consultDate, clinic, vet);
  
  // Add all sections
  for (const section of sections) {
    if (section.content) {
      ctx = addSection(ctx, section.heading, section.content);
    }
  }
  
  // Add footers to all pages
  ctx = addPageFooters(ctx);
  
  return ctx.doc;
}
