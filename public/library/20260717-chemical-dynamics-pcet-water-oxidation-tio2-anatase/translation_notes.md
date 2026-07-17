# Translation Notes

- Source mode: `pdf-text`; the four-page publisher PDF has selectable text and did not require OCR.
- The original Zotero attachment was copied byte-for-byte to `paper.pdf`. A PyMuPDF audit found no embedded PDF annotations in the source attachment.
- PDF ligatures and broken mathematical glyphs were normalized manually (`fi`, `fl`, minus signs, arrows, Angstrom symbols, subscripts, and superscripts). Chemical meaning was checked against the rendered pages.
- The four figures were extracted from the PDF's embedded image objects (`xref` 136, 137, 168, and 169). No full-page screenshot was used, and no axes, legends, or panels were cropped away.
- Main-text paragraph boundaries were reconstructed from the two-column layout. Long PDF text blocks that contained multiple semantic paragraphs were split; continuations across page boundaries were merged.
- The main article, figure captions, associated content, author information, conflict statement, and acknowledgments are translated. The 32-item reference list is preserved as bibliographic information and is not translated item by item, as allowed by the automation rule.
- Supporting Information was described but was not attached to this Zotero item; claims that rely on Figures S1-S6 are reported only to the level stated in the main paper.
- All 22 substantive source blocks have non-empty Chinese translations. Figure captions are stored as C001-C004 in `source_map.json`.
