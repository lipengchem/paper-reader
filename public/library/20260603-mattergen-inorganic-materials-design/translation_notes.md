# Translation Notes

- Source type: selectable-text PDF. OCR was not needed.
- Main text coverage: all extractable article body paragraphs, section headings, online/data/code/acknowledgement/contribution/competing-interest/additional-information statements were translated as paragraph-level bilingual blocks.
- References: the bibliography list on pages 8-9 was recorded as skipped for item-by-item translation, following the task rule that references do not need line-by-line translation.
- Figure/table handling: no standalone tables were detected in the main article. Six main figures were cropped into `assets/` and placed near first substantive discussion points.
- Crop uncertainty: figure crops are tight page-region crops based on visible figure panels and captions were kept separate. Some multi-panel labels and axes remain inside image crops as part of the figure, but they were not treated as prose paragraphs.
- Formula/unit handling: units such as eV per atom, GPa, Å, Å^-3, RMSD and HHI were preserved. Superscript/subscript typography may be normalized in Markdown for readability.
- Layout uncertainty: the Nature two-column layout causes some paragraphs to continue across pages. Cross-page continuations were joined into single source blocks where the prose is continuous.
- Skipped content: figure-internal axis labels, panel labels, crystal labels, page headers/footers and individual reference-list entries were not translated as prose blocks.
- Related reading decision: one strongly recommended predecessor/baseline paper is listed in `related_reading.md`; no broad similar-title list was generated.
