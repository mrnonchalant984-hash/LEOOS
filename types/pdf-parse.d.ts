declare module 'pdf-parse' {
  type PdfParseResult = {
    text: string;
    numpages: number;
    numrender: number;
    info: Record<string, unknown>;
    metadata: unknown;
    version: string;
  };

  function pdfParse(data: Buffer): Promise<PdfParseResult>;
  export default pdfParse;
}