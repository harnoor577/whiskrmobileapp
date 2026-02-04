import jsPDF from "jspdf";
import { format } from "date-fns";
import type { ClinicInfo } from "./pdfExport";

// Brand colors matching the PDF template
const SECTION_BG = { r: 245, g: 245, b: 245 }; // Light gray
const SECTION_TEXT = { r: 32, g: 96, b: 223 }; // Blue text for headings
const BODY_TEXT = { r: 31, g: 41, b: 55 };
const MUTED_TEXT = { r: 107, g: 114, b: 128 };

export interface MedicationProfile {
  drugName: string;
  brandNames?: string;
  description: string;
  uses: string;
  durationOfTherapy: string;
  durationOfEffects: string;
  commonSideEffects: string;
  severeSideEffects: string;
  animalWarnings?: string;
  storageDirections: string;
  disposal: string;
  missedDoseProtocol: string;
  overdose: string;
}

export interface PatientInfoMed {
  name: string;
  species?: string;
  breed?: string | null;
}

/**
 * Draw a simple bold title header
 */
function drawHeader(doc: jsPDF, pageWidth: number): number {
  const margin = 15;

  // Simple bold title
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(BODY_TEXT.r, BODY_TEXT.g, BODY_TEXT.b);
  doc.text("Pet Medication Summary", pageWidth / 2, 25, { align: "center" });

  return 40; // Return y position after header
}

/**
 * Draw a section header with gray background
 */
function drawSectionHeader(doc: jsPDF, title: string, yPos: number, pageWidth: number, margin: number): number {
  const headerHeight = 14;
  const contentWidth = pageWidth - margin * 2;

  // Gray background
  doc.setFillColor(SECTION_BG.r, SECTION_BG.g, SECTION_BG.b);
  doc.roundedRect(margin, yPos, contentWidth, headerHeight, 2, 2, "F");

  // Blue text
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(SECTION_TEXT.r, SECTION_TEXT.g, SECTION_TEXT.b);
  doc.text(title, margin + 6, yPos + 10);

  return yPos + headerHeight + 10;
}

/**
 * Draw a field label and value with bullet point support
 */
function drawField(
  doc: jsPDF,
  label: string,
  value: string | undefined,
  yPos: number,
  margin: number,
  contentWidth: number,
  pageHeight: number,
): number {
  if (!value || value.trim() === "") return yPos;

  // Check for page break
  if (yPos > pageHeight - 40) {
    doc.addPage();
    yPos = 20;
  }

  // Bold label (only if label exists)
  if (label) {
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(BODY_TEXT.r, BODY_TEXT.g, BODY_TEXT.b);
    doc.text(`${label}:`, margin, yPos);
    yPos += 9;
  }

  // Split value into lines to detect bullet points
  const textLines = value.split("\n");

  doc.setFontSize(14);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(BODY_TEXT.r, BODY_TEXT.g, BODY_TEXT.b);

  for (const line of textLines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;

    // Check for page break
    if (yPos > pageHeight - 20) {
      doc.addPage();
      yPos = 20;
    }

    // Check if this is a bullet point
    const isBullet = trimmedLine.startsWith("•") || trimmedLine.startsWith("-") || trimmedLine.startsWith("*");

    if (isBullet) {
      // Remove bullet character and trim
      const bulletText = trimmedLine.replace(/^[•\-\*]\s*/, "");
      const bulletIndent = margin + 8;
      const bulletTextWidth = contentWidth - 18;

      // Draw bullet character
      doc.text("•", margin + 2, yPos);

      // Wrap and draw bullet text
      const wrappedLines = doc.splitTextToSize(bulletText, bulletTextWidth);
      for (let i = 0; i < wrappedLines.length; i++) {
        if (yPos > pageHeight - 20) {
          doc.addPage();
          yPos = 20;
        }
        doc.text(wrappedLines[i], bulletIndent, yPos);
        yPos += 8;
      }
    } else {
      // Regular text - wrap and draw
      const wrappedLines = doc.splitTextToSize(trimmedLine, contentWidth - 10);
      for (const wrappedLine of wrappedLines) {
        if (yPos > pageHeight - 20) {
          doc.addPage();
          yPos = 20;
        }
        doc.text(wrappedLine, margin, yPos);
        yPos += 8;
      }
    }
  }

  return yPos + 6;
}

/**
 * Draw disclaimer in a boxed section spanning full width
 */
function drawDisclaimerBox(doc: jsPDF, yPos: number, pageWidth: number, margin: number, contentWidth: number): number {
  const disclaimer =
    "Disclaimer: This summary is a helpful overview, not a complete medical resource. For full safety details and a treatment plan tailored to your pet, please consult directly with your veterinary healthcare provider.";

  // Draw box background with border - full width
  doc.setFillColor(SECTION_BG.r, SECTION_BG.g, SECTION_BG.b);
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.5);

  // Calculate text wrapping with proper padding - use larger font for readability
  doc.setFontSize(10);
  const textPadding = 12;
  const textWidth = contentWidth - textPadding * 2;
  const disclaimerLines = doc.splitTextToSize(disclaimer, textWidth);
  const lineHeight = 5.5;
  const boxHeight = disclaimerLines.length * lineHeight + 14;

  // Draw full-width box
  doc.roundedRect(margin, yPos, contentWidth, boxHeight, 2, 2, "FD");

  // Draw disclaimer text centered within box
  doc.setFont("helvetica", "italic");
  doc.setTextColor(MUTED_TEXT.r, MUTED_TEXT.g, MUTED_TEXT.b);

  let textY = yPos + 7;
  for (const line of disclaimerLines) {
    textY += lineHeight;
    doc.text(line, pageWidth / 2, textY, { align: "center" });
  }

  return yPos + boxHeight + 6;
}

/**
 * Generate a medication PDF matching the provided template design
 */
export function generateMedicationPDF(
  profile: MedicationProfile,
  clinic: ClinicInfo | null,
  _patient: PatientInfoMed | null, // Kept for API compatibility but not used
): jsPDF {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;

  // ============ PAGE 1 ============

  // Simple bold header
  let yPos = drawHeader(doc, pageWidth);

  // DISCLAIMER IN BOX AT TOP
  yPos = drawDisclaimerBox(doc, yPos, pageWidth, margin, contentWidth);

  // MEDICATION INFORMATION SECTION
  yPos = drawSectionHeader(doc, "Medication Information", yPos, pageWidth, margin);

  yPos = drawField(
    doc,
    "Drug Name",
    profile.drugName + (profile.brandNames ? ` (${profile.brandNames})` : ""),
    yPos,
    margin,
    contentWidth,
    pageHeight,
  );
  yPos = drawField(doc, "Drug Description/Type", profile.description, yPos, margin, contentWidth, pageHeight);
  yPos += 8;

  // USES & DURATION SECTION
  yPos = drawSectionHeader(doc, "Uses & Duration", yPos, pageWidth, margin);

  yPos = drawField(doc, "Uses", profile.uses, yPos, margin, contentWidth, pageHeight);
  yPos = drawField(doc, "Duration of Therapy", profile.durationOfTherapy, yPos, margin, contentWidth, pageHeight);
  yPos = drawField(doc, "Duration of Drug Effects", profile.durationOfEffects, yPos, margin, contentWidth, pageHeight);
  yPos += 8;

  // SAFETY & SIDE EFFECTS SECTION
  yPos = drawSectionHeader(doc, "Safety & Side Effects", yPos, pageWidth, margin);

  yPos = drawField(doc, "Common Side Effects", profile.commonSideEffects, yPos, margin, contentWidth, pageHeight);
  yPos = drawField(doc, "Severe Side Effects", profile.severeSideEffects, yPos, margin, contentWidth, pageHeight);
  if (profile.animalWarnings) {
    yPos = drawField(doc, "Warnings for Animals", profile.animalWarnings, yPos, margin, contentWidth, pageHeight);
  }
  yPos += 8;

  // STORAGE & DISPOSAL SECTION
  yPos = drawSectionHeader(doc, "Storage & Disposal", yPos, pageWidth, margin);

  yPos = drawField(doc, "Storage Directions", profile.storageDirections, yPos, margin, contentWidth, pageHeight);
  yPos = drawField(doc, "Disposal", profile.disposal, yPos, margin, contentWidth, pageHeight);
  yPos += 8;

  // Check if we need page 2 for remaining content
  if (yPos > pageHeight - 80) {
    doc.addPage();
    yPos = 20;
  }

  // MISSED DOSE PROTOCOL SECTION
  yPos = drawSectionHeader(doc, "Missed Dose Protocol", yPos, pageWidth, margin);
  yPos = drawField(doc, "", profile.missedDoseProtocol, yPos, margin, contentWidth, pageHeight);
  yPos += 8;

  // OVERDOSE SECTION
  yPos = drawSectionHeader(doc, "Overdose", yPos, pageWidth, margin);
  yPos = drawField(doc, "", profile.overdose, yPos, margin, contentWidth, pageHeight);

  // ============ ADD FOOTERS ============
  const totalPages = doc.getNumberOfPages();

  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    const footerY = pageHeight - 10;

    // Footer line
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.3);
    doc.line(margin, footerY - 5, pageWidth - margin, footerY - 5);

    // Left: Branding
    doc.setFontSize(9);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(MUTED_TEXT.r, MUTED_TEXT.g, MUTED_TEXT.b);
    doc.text("Generated by whiskr.ai", margin, footerY);

    // Center: Clinic name or date
    if (clinic?.name) {
      doc.text(clinic.name, pageWidth / 2, footerY, { align: "center" });
    } else {
      doc.text(format(new Date(), "MMM d, yyyy"), pageWidth / 2, footerY, { align: "center" });
    }

    // Right: Page number
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, footerY, { align: "right" });
  }

  return doc;
}

/**
 * Generate and download the medication PDF
 */
export function downloadMedicationPDF(
  profile: MedicationProfile,
  clinic: ClinicInfo | null,
  patient: PatientInfoMed | null,
): void {
  const doc = generateMedicationPDF(profile, clinic, patient);
  const fileName = `${profile.drugName.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`;
  doc.save(fileName);
}
