# Translation and extraction notes / 翻译与抽取说明

- **Status / 状态：** local quality gate passed; public publication remains partial until the deployed SHA-256 chain is verified and legacy unused assets are removed under explicit approval.
- **Source / 来源：** Zotero attachment FYMS44HI，4 页可选文本 PRL PDF；`paper.pdf` 为原附件字节保留副本（SHA-256 `73e5c26265f99dc552b6e6aabd9361c05343ae59badd231c2ce7cdbf4893b82e`）。
- **Text layout / 文本版式：** 四页均由视觉检查确认为双栏；按页眉/全宽内容、左栏自上而下、右栏自上而下建立 source map。未跨栏自动拼接，未记录 `merged_from`。
- **Coverage / 覆盖：** 正文、作者/单位/收稿信息、摘要、DOI/PACS、方法推导、图注、表注、致谢均有 source block。参考文献逐条保留在 `coverage_audit.excluded_blocks`，不逐条翻译；它们之后的致谢已经作为正文块保留。
- **Formulae / 公式：** 12 个显示公式均裁入 `assets/equations/`；PDF 文本层会压平上下标、积分和分式，因此 Markdown 中的转写均明确为低置信度，须以公式原图和 `paper.pdf` 为准。
- **Visuals / 图表：** Fig. 1、Table I、Fig. 2 均为紧密裁图，并已对面板、坐标轴、图例、双纵轴与表格脚注进行视觉复核；对应 crop bbox 和放置证据记录在 source map。
- **QA / 质控：** 翻译质量审计对每一个实质块单独记录为 reviewed；数值、单位、化学式、模型名、方程号和引文标记通过 source-first 检查。无未解决项才可发布。
