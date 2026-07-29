# Translation and extraction notes / 翻译与抽取说明

- The source is a nine-page selectable-text PDF. No OCR was applied.
- Each source-map block preserves one selectable-text block; no cross-column sentence blocks were automatically merged.
- Vector figures and Table 1 were rendered from caption-adjacent crop boxes at 2x resolution. Crop boundaries are approximate where the PDF uses vector artwork; captions remain separately anchored and bilingual.
- Superscripts, subscripts, mathematical symbols, angular-momentum notation, and hyphenation can be flattened by the PDF text layer. They were retained when extractable and should be checked against `paper.pdf` before reusing an equation or exact unit in research work.
- The reference list is retained as bibliographic information in `paper.pdf` and is intentionally not translated entry by entry.
- Automatic translation was used as a first pass and is source anchored; technical notation and model names are preserved, but dense method statements merit manual verification against the original PDF.
