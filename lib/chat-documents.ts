import JSZip from 'jszip';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export const MAX_CHAT_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const MAX_CHAT_DOCUMENT_TEXT = 12_000;

const MIME_TYPES = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  json: 'application/json',
} as const;

export type ChatDocumentFormat = keyof typeof MIME_TYPES;

export function getChatDocumentFormat(filename: string): ChatDocumentFormat | null {
  const extension = filename.split('.').pop()?.toLowerCase();
  return extension && extension in MIME_TYPES ? extension as ChatDocumentFormat : null;
}

export function getChatDocumentMimeType(format: ChatDocumentFormat) {
  return MIME_TYPES[format];
}

function decodeXmlText(value: string) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (entity, code: string) => {
    if (code[0] === '#') {
      const radix = code[1]?.toLowerCase() === 'x' ? 16 : 10;
      const point = Number.parseInt(code.slice(radix === 16 ? 2 : 1), radix);
      return Number.isInteger(point) && point >= 0 && point <= 0x10ffff ? String.fromCodePoint(point) : '';
    }
    return ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" } as Record<string, string>)[code.toLowerCase()] || entity;
  });
}

function xmlText(xml: string) {
  return decodeXmlText(xml
    .replace(/<\/(?:w:p|a:p|si|row)>/gi, '\n')
    .replace(/<w:tab\b[^>]*\/>/gi, '\t')
    .replace(/<[^>]+>/g, ' '))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function loadOfficeArchive(bytes: Buffer) {
  const archive = await JSZip.loadAsync(bytes, { checkCRC32: false, createFolders: false });
  const entries = Object.values(archive.files);
  if (entries.length > 2000) throw new Error('This office document contains too many internal files.');
  let expandedSize = 0;
  for (const entry of entries) {
    const data = Reflect.get(entry, '_data');
    const size = data && typeof data === 'object' ? Reflect.get(data, 'uncompressedSize') : undefined;
    if (typeof size === 'number') expandedSize += size;
    if (expandedSize > 40 * 1024 * 1024) throw new Error('This office document expands beyond the supported size limit.');
  }
  return archive;
}

async function extractOfficeText(format: 'docx' | 'pptx' | 'xlsx', bytes: Buffer) {
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error('The office document is not a valid ZIP-based file.');
  const archive = await loadOfficeArchive(bytes);
  if (format === 'docx') {
    const document = archive.file('word/document.xml');
    if (!document) throw new Error('This DOCX file does not contain a readable Word document.');
    return xmlText(await document.async('string'));
  }
  if (format === 'pptx') {
    const slides = Object.keys(archive.files)
      .filter(name => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
      .sort((a, b) => Number(a.match(/slide(\d+)/i)?.[1]) - Number(b.match(/slide(\d+)/i)?.[1]));
    const output: string[] = [];
    for (const [index, path] of slides.entries()) {
      const slide = archive.file(path);
      if (slide) output.push(`Slide ${index + 1}\n${xmlText(await slide.async('string'))}`);
    }
    if (!output.length) throw new Error('This PowerPoint file contains no readable slides.');
    return output.join('\n\n');
  }

  const stringsFile = archive.file('xl/sharedStrings.xml');
  const sharedStrings = stringsFile
    ? [...(await stringsFile.async('string')).matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/gi)].map(match => xmlText(match[1]))
    : [];
  const sheets = Object.keys(archive.files).filter(name => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name)).sort();
  const output: string[] = [];
  for (const [index, path] of sheets.entries()) {
    const sheet = archive.file(path);
    if (!sheet) continue;
    const xml = await sheet.async('string');
    const cells = [...xml.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/gi)].map(match => {
      const type = /\bt="([^"]+)"/i.exec(match[1])?.[1];
      const value = /<v\b[^>]*>([\s\S]*?)<\/v>/i.exec(match[2])?.[1];
      const inline = /<is\b[^>]*>([\s\S]*?)<\/is>/i.exec(match[2])?.[1];
      if (type === 's' && value) return sharedStrings[Number(value)] || '';
      return value ? decodeXmlText(value) : inline ? xmlText(inline) : '';
    }).filter(Boolean);
    if (cells.length) output.push(`Sheet ${index + 1}\n${cells.join('\t')}`);
  }
  if (!output.length) throw new Error('This spreadsheet contains no readable cell values.');
  return output.join('\n\n');
}

export async function extractChatDocumentText(filename: string, bytes: Buffer) {
  const format = getChatDocumentFormat(filename);
  if (!format) throw new Error('Supported uploads: PDF, DOCX, PPTX, XLSX, TXT, MD, CSV, and JSON.');
  let text: string;
  if (format === 'pdf') {
    if (bytes.subarray(0, 5).toString('ascii') !== '%PDF-') throw new Error('This PDF file is invalid.');
    const { default: parsePdf } = await import('pdf-parse');
    text = (await parsePdf(bytes)).text;
  } else if (format === 'docx' || format === 'pptx' || format === 'xlsx') {
    text = await extractOfficeText(format, bytes);
  } else {
    if (bytes.includes(0)) throw new Error('Binary files cannot be read as text documents.');
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  }
  const cleaned = text.replace(/\u0000/g, '').replace(/\r\n?/g, '\n').trim();
  if (!cleaned) throw new Error('No readable text was found in this document.');
  return cleaned.slice(0, MAX_CHAT_DOCUMENT_TEXT);
}

function xmlEscape(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

export async function buildChatDocument(format: ChatDocumentFormat, title: string, content: string) {
  if (format === 'pdf') {
    const document = await PDFDocument.create();
    document.setTitle(title);
    document.setCreator('Leo Main Chat');
    const font = await document.embedFont(StandardFonts.Helvetica);
    const bold = await document.embedFont(StandardFonts.HelveticaBold);
    const margin = 52;
    const fontSize = 10;
    const lineHeight = 14;
    const pageWidth = 612;
    const pageHeight = 792;
    let page = document.addPage([pageWidth, pageHeight]);
    let y = pageHeight - margin;
    page.drawText(title, { x: margin, y, size: 18, font: bold, color: rgb(0.08, 0.08, 0.08), maxWidth: pageWidth - margin * 2 });
    y -= 30;
    const printable = Array.from(content
      .replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[–—]/g, '-'))
      .map(character => {
        if (character === '\n' || character === '\r' || character === '\t') return character;
        try {
          font.encodeText(character);
          return character;
        } catch {
          return '?';
        }
      }).join('');
    for (const paragraph of printable.split('\n')) {
      const words = paragraph.trim().split(/\s+/).filter(Boolean);
      if (!words.length) { y -= lineHeight; continue; }
      let line = '';
      for (const word of words) {
        const next = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(next, fontSize) > pageWidth - margin * 2 && line) {
          if (y < margin) { page = document.addPage([pageWidth, pageHeight]); y = pageHeight - margin; }
          page.drawText(line, { x: margin, y, size: fontSize, font, color: rgb(0.12, 0.12, 0.12) });
          y -= lineHeight;
          line = word;
        } else line = next;
      }
      if (line) {
        if (y < margin) { page = document.addPage([pageWidth, pageHeight]); y = pageHeight - margin; }
        page.drawText(line, { x: margin, y, size: fontSize, font, color: rgb(0.12, 0.12, 0.12) });
        y -= lineHeight;
      }
    }
    return Buffer.from(await document.save({ useObjectStreams: false }));
  }
  if (format === 'docx') {
    const paragraphs = content.split(/\r?\n/).map(line => line
      ? `<w:p><w:r><w:t xml:space="preserve">${xmlEscape(line)}</w:t></w:r></w:p>`
      : '<w:p/>').join('');
    const archive = new JSZip();
    archive.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
    archive.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
    archive.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:rPr><w:b/><w:sz w:val="32"/></w:rPr><w:t>${xmlEscape(title)}</w:t></w:r></w:p>${paragraphs}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`);
    return archive.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  }
  return Buffer.from(content, 'utf8');
}
