---
name: docx
description: Create or edit structured Word documents with headings, tables, images, and page metadata when the user asks for a .docx deliverable.
version: 1.0.0
---
# Instructions
1. Clarify the document purpose, audience, sections, page size, and required images or tables.
2. Build a semantic outline before writing prose. Use Heading 1 for major sections and Heading 2 for subsections.
3. Generate a real `.docx` file with a supported document library when available. Preserve user supplied wording and cite sources.
4. Validate that the output opens, has no empty required sections, and includes the requested tables/images.
5. Return a download link, file size, and a short contents summary. Never claim a Word file exists until it is saved successfully.
