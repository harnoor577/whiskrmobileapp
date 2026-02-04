/**
 * Strips markdown formatting characters from text for clean display.
 * Converts markdown to plain, professional text.
 */
export function stripMarkdown(text: string): string {
  return text
    // Remove headers (### Header -> Header)
    .replace(/^#{1,6}\s*/gm, '')
    // Remove bold (**text** or __text__ -> text)
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    // Remove italic (*text* or _text_ -> text)
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '$1')
    .replace(/(?<!_)_([^_\n]+)_(?!_)/g, '$1')
    // Convert ONLY top-level markdown bullets to clean bullets (no leading whitespace)
    .replace(/^[-*+]\s+/gm, '• ')
    // Preserve indented sub-items with dashes (keep the dash, just normalize spacing)
    .replace(/^([ \t]+)[-*+]\s+/gm, '$1- ')
    // Clean up excessive whitespace
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Strips markdown and removes extra spacing for compact clipboard output.
 * All double+ newlines become single newlines.
 */
export function stripMarkdownCompact(text: string): string {
  return text
    // Remove headers (### Header -> Header)
    .replace(/^#{1,6}\s*/gm, '')
    // Remove bold (**text** or __text__ -> text)
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    // Remove italic (*text* or _text_ -> text)
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '$1')
    .replace(/(?<!_)_([^_\n]+)_(?!_)/g, '$1')
    // Convert ONLY top-level markdown bullets to clean bullets (no leading whitespace)
    .replace(/^[-*+]\s+/gm, '• ')
    // Preserve indented sub-items with dashes (keep the dash, just normalize spacing)
    .replace(/^([ \t]+)[-*+]\s+/gm, '$1- ')
    // Remove ALL extra blank lines (2+ newlines → single newline)
    .replace(/\n{2,}/g, '\n')
    .trim();
}
