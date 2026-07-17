# Translation Notes

## Extraction Quality

- The PDF is selectable text and was parsed successfully, but the paper uses two-column layout. The reader was rebuilt by section/block order rather than raw whole-page extraction to avoid left/right column interleaving.
- Figures and Table 1 were cropped from rendered PDF pages into `assets/`. Crops are visual approximations designed to exclude surrounding prose; captions are kept as text blocks in `paper.md`.
- The PDF contains a vertical Wiley/Readcube download watermark on most pages. It was excluded from the reader.

## Scope Decisions

- Main argumentative prose, methods, results, figure/table captions, conclusions, acknowledgments, conflicts of interest, and data availability are represented in bilingual form.
- Pages 14-17 are mostly references. The reference list is preserved in `extracted_pages.txt` and `source.pdf`, but individual bibliography entries were not translated line by line because they are citation metadata rather than paper prose.
- Some formulas were normalized to ASCII forms such as `H2O* -> OH* + H*` to avoid PDF glyph extraction artifacts like `(cid:2)`.

## Terminology Choices

- Brønsted-Evans-Polanyi relation is translated as `Brønsted-Evans-Polanyi 关系` or `BEP 关系`.
- Activation energy is translated as `活化能`; reaction energy as `反应能`; adsorption energy as `吸附能`.
- LogP is kept as `LogP`, explained as `辛醇/水分配系数的对数`.

## Residual Uncertainty

- The reader is a faithful bilingual study artifact, not a typeset reproduction of the PDF.
- Because the original article is open access but still a formal publication, long verbatim passages are kept in the local artifact only and are not reproduced in chat.
