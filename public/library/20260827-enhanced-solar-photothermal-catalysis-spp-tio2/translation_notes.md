# Translation and extraction notes / 翻译与抽取说明

- **Status / 状态：** passed the strict local validators and the production SHA-256 publication chain.
- **Source / 来源：** Zotero attachment GMLC47C5；`paper.pdf` 为原附件字节保留副本（SHA-256 `f5cddd49d6284a04e4258d8c44a4b93d17abe8252e00ff6db6fbd43f6e1cc6f4`）。
- **Layout / 版式：** 11 页均经渲染复核；第 1 页为混合全宽/双栏，余页为双栏。阅读顺序为全宽内容、左栏自上而下、右栏自上而下；没有跨栏自动拼接。
- **Coverage / 覆盖：** 作者、单位、摘要、全部可抽取正文、方法、两条公式、5 个 Figure、2 个 Table 的图注、Supporting Information、Acknowledgements、Conflict of Interest、Keywords 和收稿信息均进入 source map。参考文献保留为有理由的 excluded blocks，且其后的后置声明已映射。
- **Formulae / 公式：** E001–E002 的 PDF 文本层会打散分式/括号，均提供紧密原图和低置信度转写；以原图和 `paper.pdf` 为准。
- **Visuals / 图表：** F001–F005、T001–T002 均为紧密裁切，不使用整页或诊断图；已逐张检查面板、轴、图例、颜色、标签、误差条与表格脚注。
- **QA / 质控：** translation_quality_audit 为 source-first 对抗式检查，覆盖否定、条件、比较、参数、数值、单位、化学式、模型名与引文标记；未解决项必须阻断发布。
