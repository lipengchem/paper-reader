# Neural-network-based molecular dynamics simulations reveal that proton transport in water is doubly gated by sequential hydrogen-bond exchange

**Zotero key:** FTDJFF56  
**Attachment key:** 4BNFIHFL  
**Journal:** Nature Chemistry  
**DOI:** 10.1038/s41557-024-01593-y  
**Task date:** 2026-06-09  
**Source PDF:** paper.pdf

## Why This Paper / 为什么选这篇

**English:** This paper is a strong fit for a first-year computational chemistry workflow because it combines machine-learning potentials, molecular dynamics, nuclear quantum effects, spectroscopy and a crisp mechanistic question in one place. It also rotates well relative to the previous three automation picks: after a Nature materials-generation paper, an ACS Catalysis methodology Perspective and a Science catalyst-interface mechanism paper, today shifts toward proton transfer in aqueous chemistry and gives us a different kind of conceptual foundation.

**中文说明:** 这篇文献非常适合一年级计算化学研究生做“框架型精读”：它把神经网络势、分子动力学、核量子效应、振动光谱以及一个很明确的机制问题放在同一篇文章里讲清楚了。轮换上也合适：前三次自动化分别是 `Nature` 材料生成、`ACS Catalysis` 方法学 Perspective 和 `Science` 催化界面机制；今天切换到水相质子转移，不再重复同一类 AI/催化叙事，同时又和你关心的质子/自由基/氢键传递方向高度贴近。

## Reading Guide / 读前导读

**English:** Read this paper in three passes. First, isolate the structural claim: the proton remains covalently localized, but its hydrogen-bond environment has two stable states. Second, focus on Fig. 2 and ask which of the two gate events is actually rate-limiting. Third, revisit Figs. 3 and 4 to see how spectroscopy and transport statistics both support the same sequential mechanism.

**中文说明:** 建议分三遍读。第一遍只抓结构结论：质子在共价键层面仍主要局域，但其氢键环境有两个稳定态。第二遍重点看图 2，问自己两道“门”里到底哪一道才是真正的限速步骤。第三遍回到图 3 和图 4，看看光谱证据和输运统计如何一起支持同一个顺序机制。

## Reading Tips / 阅读提示

**English:** A common misunderstanding is to equate 'Zundel-like' with 'fully delocalized proton'. The authors explicitly do not make that move. Their point is subtler: the hydrogen-bond arrangement can be Zundel-like and stable even when the proton potential asymmetry still keeps the proton mostly on one side.

**中文说明:** 一个很容易犯的误解是把“类 Zundel”直接等同于“质子完全离域”。作者明确不是这么说的。更精细的表述是：即使 ΔE 仍然把质子主要压在某一侧，氢键环境本身也可以呈现稳定的类 Zundel 图样。

## Terminology / 术语表

| English | 中文 | Note |
| --- | --- | --- |
| excess proton | 过量质子 | 指水中多出来的质子缺陷，不等同于一颗静止的 H3O+，而是会在氢键网络中迁移的电荷缺陷。 |
| Eigen-like structure | 类 Eigen 结构 | 共价键层面更像 H3O+(H2O)3，质子主要局域在单个水分子上。 |
| Zundel-like structure | 类 Zundel 结构 | 溶剂化环境更接近 H5O2+ 的对称氢键图景，但本文强调这不必意味着质子真正完全离域。 |
| proton potential asymmetry, ΔE | 质子势能不对称坐标 ΔE | 用来判断质子势阱更偏向供体侧还是受体侧，是本文识别稳定跃迁而非瞬时振动拉伸的关键坐标。 |
| TRPMD | 恒温环聚合物分子动力学 | 一种显式引入核量子效应的路径积分动力学近似，适合研究轻原子尤其是氢相关过程。 |
| NNP | 神经网络势 | 用深度学习势能面近似高水平 DFT，使得长时间尺度动力学成为可能。 |
| vehicular diffusion | 载体式扩散 | 把质子当作固定在水合离子上整体移动时的扩散分量，用来和真正的跳跃式质子传输区分。 |

## Page / Section Index

- `p.1` Metadata, abstract and problem setup
- `p.2` Simulation validation and coordinate design
- `p.3-p.4` Two stable proton environments and sequential transfer pathway
- `p.4-p.5` Spectroscopy interpretation and Zundel-like signatures
- `p.5-p.6` Stable-hop statistics, random-walk transport and activation energy
- `p.8-p.10` Methods, data availability and end matter
- `p.11-p.15` Extended data summaries

## Bilingual Reader / 双语正文

<a id="S001"></a>
### Metadata And Abstract

**Source:** p.1 S001

**Original:** Neural-network-based molecular dynamics simulations reveal that proton transport in water is doubly gated by sequential hydrogen-bond exchange. Axel Gomez, Ward H. Thompson and Damien Laage. Nature Chemistry 16, 1838-1844 (2024), published online 20 August 2024.

**中文:** 题目是《基于神经网络势的分子动力学模拟揭示：水中的质子传输由顺序发生的氢键交换进行双重门控》。作者为 Axel Gomez、Ward H. Thompson 和 Damien Laage，发表于 Nature Chemistry 2024 年第 16 卷 1838-1844 页，在线发表日期为 2024 年 8 月 20 日。

<a id="S002"></a>
### Abstract

**Source:** p.1 S002

**Original:** The paper combines vibrational spectroscopy calculations with neural-network-based molecular dynamics including nuclear quantum effects. It finds that the hydrated excess proton alternates between two stable proton-localized environments with Eigen-like and Zundel-like hydrogen-bond motifs. Proton transport is not a single concerted event but a three-step process: a first hydrogen-bond exchange lowers the proton-acceptor coordination, proton transfer then occurs, and a second hydrogen-bond exchange on the former donor prevents rapid back-transfer. This mechanism explains both the low diffusion activation energy and the long-lived vibrational signatures.

**中文:** 这篇文章把振动光谱计算与显式包含核量子效应的神经网络势分子动力学结合起来。作者发现，水合过量质子并不是只在单一稳定构型附近波动，而是在两类都稳定、但氢键图样不同的局域环境之间平衡：一种更接近 Eigen-like，另一种更接近 Zundel-like。质子传输也不是一步协同完成，而是三步过程：先发生第一次氢键交换，降低受体侧配位；随后质子转移；最后在原供体侧发生第二次氢键交换，把“门”关上，阻止快速回跳。这个机制同时解释了质子扩散活化能为何很低，以及为什么超快振动光谱会看到寿命较长的中间态特征。

<a id="S003"></a>
### Introduction

**Source:** p.1 S003

**Original:** The long-standing controversy is twofold. First, does the excess proton mainly adopt an Eigen structure, with Zundel only as an unstable transition state, or are Zundel-like motifs themselves stable? Second, what is the rate-limiting step: a concerted rearrangement of several hydrogen bonds or something more sequential? Recent nonlinear vibrational spectroscopy suggested long-lived distorted Zundel-like species, while older simulation pictures favored an Eigen basin plus a fleeting Zundel crossing.

**中文:** 文章聚焦于两个长期悬而未决的核心争议。第一，过量质子在水中的平衡结构究竟主要是 Eigen 形式，Zundel 只是瞬时过渡态，还是说类 Zundel 图样本身也可以稳定存在？第二，真正的限速步骤到底是多个氢键的协同重排，还是一个更顺序化的过程？近年的非线性振动光谱实验指向“寿命较长的类 Zundel 中间态”，而较早的模拟图景则更倾向“稳定 Eigen 盆地 + 转瞬即逝的 Zundel 过渡态”。

<a id="S004"></a>
### Simulation Setup And Validation

**Source:** p.2 S004

**Original:** To address this, the authors train deep neural network potentials at the revPBE0-D3 hybrid DFT level and run thermostatted ring-polymer molecular dynamics for an excess proton in water. This setup is designed to satisfy three requirements simultaneously: accurate reactive electronic structure, explicit nuclear quantum effects for all atoms, and trajectories long enough to resolve subtle free-energy differences. The method reproduces the anomalously fast proton diffusion coefficient, the water/proton diffusion ratio, and the infrared spectral fingerprints of acidic water.

**中文:** 为了解决这个问题，作者在 revPBE0-D3 杂化 DFT 水平上训练深度神经网络势，并对含过量质子的水体系开展 TRPMD 模拟。这套设置同时满足三件事：反应性电子结构要足够准、所有原子的核量子效应要显式保留、轨迹还要足够长，才能分辨细微但关键的自由能差异。结果表明，该方法不仅重现实验中的异常快速质子扩散，还能给出合理的水/质子扩散系数比和酸性水红外谱特征，因此其后续机制分析有比较坚实的基础。

<a id="F001"></a>
### Fig. 1. Diffusion constant and vibrational spectra

**Placed near:** p.2 S004

**Source:** p.2 F001

![Fig. 1. Diffusion constant and vibrational spectra](assets/fig1_diffusion_ir.png)

**Original caption:** Fig. 1 validates the simulation setup. It compares mean-squared displacements for excess protons, constrained vehicular diffusion and water, and shows that the computed infrared and difference spectra reproduce experimental acidic-water signatures.

**中文图注:** 图 1 用来验证模拟方案是否可靠。它比较了过量质子、受限载体式扩散和水分子的均方位移，并展示计算得到的红外谱与差谱能够重现实验中的酸性水特征。

**Reading note:** 先看这里，可以确认 NNP+TRPMD 不是“机制先行、验证滞后”，而是先把扩散和光谱两个实验锚点都对上了。

<a id="S005"></a>
### Key Coordinates

**Source:** p.2-3 S005

**Original:** A major methodological contribution is the choice of two coordinates. The first is the proton potential asymmetry ΔE, built from the energy difference between two reference proton positions on donor and acceptor sides, which distinguishes true transfer propensity from transient OH stretching. The second is a periodic hydrogen-bond coordinate that tracks whether donor and acceptor oxygens are three- or four-coordinated by stable hydrogen-bond partners.

**中文:** 本文一个很关键的方法学贡献，是把质子传输问题压缩进两个真正有物理意义的坐标。第一个是质子势能不对称坐标 ΔE，它通过把质子放到供体侧和受体侧的参考位置来比较势能高低，从而区分“真的要发生转移”与“只是 OH 键瞬时拉长”这两种情况。第二个是一个周期性的氢键坐标，用来追踪供体氧和受体氧周围稳定氢键伙伴数是三配位还是四配位。

<a id="S006"></a>
### Stable Proton Structures

**Source:** p.3 S006

**Original:** The resulting two-dimensional free-energy surface overturns the one-basin picture. While the proton remains covalently localized on one water molecule, the surrounding hydrogen-bond environment switches between two stable arrangements: an Eigen-like state where the acceptor remains four-coordinated and a Zundel-like state where both donor and acceptor are undercoordinated. Thus, the paper argues that the equilibrium proton structure is dual in solvation pattern but still largely localized in covalent bonding.

**中文:** 沿着这两个坐标构建出来的二维自由能面，直接推翻了“只有一个稳定盆地”的简单图景。即使在共价键意义上，质子仍主要局域在某一个水分子上，它周围的氢键环境却会在两类都稳定的构型之间切换：一种是更像 Eigen 的状态，此时受体侧仍保持四配位；另一种是更像 Zundel 的状态，此时供体和受体都处于欠配位状态。换句话说，本文给出的结论不是“质子完全离域了”，而是“共价键仍偏局域，但溶剂化图样存在双稳态平衡”。

<a id="F002"></a>
### Fig. 2. Proton transfer mechanism

**Placed near:** p.3-4 S006

**Source:** p.3 F002

![Fig. 2. Proton transfer mechanism](assets/fig2_transfer_mechanism.png)

**Original caption:** Fig. 2 defines the ΔE coordinate and the periodic hydrogen-bond coordinate, maps the free-energy surface, and summarizes the sequential mechanism from gate opening to proton transfer and gate closing.

**中文图注:** 图 2 给出了 ΔE 坐标和周期性氢键坐标的定义，展示二维自由能面，并把“开门-转移-关门”的顺序机制浓缩成一个清晰示意图。

**Reading note:** 这是全文最值得反复看的图，因为它把“结构争议”和“动力学限速”放到同一张自由能图里解决了。

<a id="S007"></a>
### Sequential Mechanism

**Source:** p.4 S007

**Original:** The minimum free-energy path yields a sequential three-step mechanism. Starting from an Eigen-like hydrogen-bond arrangement, the first event is hydrogen-bond breaking on the proton acceptor, which opens the gate and creates a Zundel-like coordination shell. A rapid proton transfer over a mostly entropic barrier follows, and only then does a second hydrogen-bond exchange reform coordination on the former donor and stabilize the hop.

**中文:** 沿最小自由能路径得到的，不是过去常说的一步协同跃迁，而是一个清晰的三步顺序机制。体系先从 Eigen-like 氢键环境出发，第一步是在受体侧断开一个稳定氢键，相当于把质子前方的“门”打开，并形成类 Zundel 的配位环境。接着，质子跨越一个较低且主要带有熵性质的势垒完成转移。最后，原供体侧再通过第二次氢键交换恢复配位，把后方的“门”关上，从而把这次跃迁真正固定下来。

<a id="S008"></a>
### Why This Differs From Older Models

**Source:** p.4-5 S008

**Original:** This picture differs from earlier presolvation or concerted models in an important way: the first hydrogen-bond rearrangement is necessary but not rate-limiting. The decisive slow step is the hydrogen-bond reformation on the former donor, because without it the proton simply rattles back and forth between the same pair of water molecules. The paper therefore reframes proton diffusion as a doubly gated pull-push process rather than a symmetric collective crossing.

**中文:** 这套图景与早期的预溶剂化模型或多氢键协同模型最大的不同，在于第一步受体侧氢键重排虽然必要，却不是最后真正卡住扩散的限速步骤。真正慢、也真正决定质子能不能留下来的，是原供体侧氢键重新形成这一步；否则质子只会在同一对水分子之间来回“抖动式”回跳。因此，作者把质子扩散重新表述为一个“双重门控的 pull-push 过程”，而不是一个对称的集体跨越。

<a id="S009"></a>
### Spectroscopy Interpretation

**Source:** p.5 S009

**Original:** The spectroscopy section is central because it closes the loop with experiment. The simulations explain why ultrafast vibrational spectroscopy detects long-lived Zundel-like signatures: the observed species corresponds to a stable Zundel-like hydrogen-bond arrangement, not necessarily to a fully delocalized proton. Different hydrogen-bond arrangements produce different proton-transfer mode frequencies and recover on the timescale of hydrogen-bond rearrangement, matching the observed long-lived structural heterogeneity.

**中文:** 光谱部分非常关键，因为它把模拟和实验真正闭环起来。作者说明，超快振动光谱之所以能看到寿命较长的类 Zundel 信号，并不意味着质子一定处于完全离域的理想 Zundel 结构，而是因为这里确实存在一个稳定的类 Zundel 氢键环境。不同氢键环境对应不同的质子转移振动频率分布，而这些分布恢复到平衡所需的时间，正好落在氢键重排的皮秒尺度上，这就解释了实验中观察到的长寿命结构异质性。

<a id="F003"></a>
### Fig. 3. Vibrational fingerprints of hydrogen-bond configurations

**Placed near:** p.4-5 S009

**Source:** p.4 F003

![Fig. 3. Vibrational fingerprints of hydrogen-bond configurations](assets/fig3_vibrational_fingerprints.png)

**Original caption:** Fig. 3 links structure to spectroscopy. It correlates proton-transfer vibrational levels, compares Eigen-like and Zundel-like spectral distributions, and explains why long-lived Zundel-like signatures can arise without full proton delocalization.

**中文图注:** 图 3 负责把结构与光谱联系起来。它关联质子转移振动态、比较类 Eigen 与类 Zundel 状态下的频率分布，并解释为什么即使质子没有完全离域，也会出现长寿命类 Zundel 光谱特征。

**Reading note:** 如果你关心实验为什么会“看见”和旧模型相冲突的信号，这张图是关键证据。

<a id="S010"></a>
### Transport Statistics

**Source:** p.5-6 S010

**Original:** When the authors focus only on stable hops rather than transient rattling, multiple-hop bursts disappear and the hopping statistics become Poisson-like. This supports a random-walk picture with independent single hops plus a smaller vehicular diffusion contribution. The resulting model reproduces the simulated diffusion coefficient and its changes with isotope substitution, nuclear quantum effects and electronic-structure level.

**中文:** 当作者把分析对象限定为“稳定跃迁”而不是瞬时回跳时，所谓多步爆发式跳跃现象就不再成立，统计分布反而更像泊松过程。这支持了一个更朴素、但也更干净的图景：质子扩散主要可以看成相互独立的单步跳跃随机游走，再加上一小部分载体式扩散贡献。这个模型不仅重现了模拟得到的扩散系数，还能合理解释同位素替换、核量子效应以及电子结构水平变化带来的差异。

<a id="F004"></a>
### Fig. 4. Proton transport statistics and activation energy

**Placed near:** p.5-6 S010

**Source:** p.5 F004

![Fig. 4. Proton transport statistics and activation energy](assets/fig4_transport_statistics.png)

**Original caption:** Fig. 4 shows that stable hops obey Poisson-like statistics, that a random-walk model reproduces the simulated diffusion coefficient, and that the temperature dependence yields a lower activation energy for proton diffusion than for water self-diffusion.

**中文图注:** 图 4 表明稳定跃迁服从近似泊松统计，随机游走模型可以重现实测的模拟扩散系数，并且温度依赖分析给出低于水自扩散的质子扩散活化能。

**Reading note:** 这张图把“机制故事”变成了可计量的输运统计，因此非常适合做组会或读书汇报的收束图。

<a id="S011"></a>
### Activation Energy And Conclusion

**Source:** p.6 S011

**Original:** The low activation energy of proton diffusion follows naturally from the sequential mechanism. Because the rate-determining event is hydrogen-bond formation on the donor rather than simultaneous crossing of several barriers, the effective barrier remains below that of water self-diffusion. The final conclusion is that proton transport in water is a multistep process controlled by two successive stable hydrogen-bond exchanges, with the second one being the crucial gate that locks in the transport event.

**中文:** 质子扩散活化能为什么比水自扩散还低，本文也给出了一个自然解释。由于限速步骤不是多个势垒的同步跨越，而是原供体侧氢键重新形成这件事，所以整体有效势垒会保持在比较低的水平。文章最后把核心结论压缩得很明确：水中的质子传输是一个多步过程，由两次连续且稳定的氢键交换控制，而真正决定“这次传输能否被锁定下来”的，是第二道门。

<a id="S012"></a>
### Methods - NNP Training

**Source:** p.8 S012

**Original:** The methods section shows that the neural network potential is not a black-box add-on but the technical backbone of the work. The authors train DeePMD-kit models for O and H using hybrid DFT reference data, with concurrent learning and query-by-committee active selection. They verify on unseen configurations that the force errors remain below 0.1 eV/Å and that the model stays close to hybrid-DFT quality.

**中文:** Methods 部分说明，神经网络势在这里不是一个装饰性的“加速器”，而是整篇工作的技术骨架。作者使用 DeePMD-kit 为 O 和 H 训练势函数，参考数据来自杂化 DFT，并通过 concurrent learning 与 query-by-committee 的主动学习流程迭代扩充训练集。在未见过的构型上，力误差保持在 0.1 eV/Å 以内，说明这套势函数确实接近杂化 DFT 质量，而不是只在训练集附近拟合得好看。

<a id="S013"></a>
### Methods - Dynamics

**Source:** p.8 S013

**Original:** For dynamics, the authors run TRPMD with 32 beads per atom for systems containing one excess proton and 192 waters. They analyze 20 independent 200 ps trajectories for each DFT level and isotope, add classical-nuclei controls, and also run constrained simulations where the hydronium covalent bonds are frozen to isolate vehicular diffusion. This is a carefully controlled simulation campaign rather than a single showcase trajectory.

**中文:** 在动力学设置上，作者对每个原子使用 32 beads 的 TRPMD，并模拟一个过量质子加 192 个水分子的体系。他们对每个 DFT 水平和同位素体系都分析了 20 条独立的 200 ps 轨迹，还补充了经典原子核对照，以及把水合氢离子内部共价键冻结的受限模拟，专门分离载体式扩散贡献。这说明本文不是只拿一条漂亮轨迹讲故事，而是做了一套控制变量相当完整的模拟方案。

<a id="S014"></a>
### Methods - Spectra And Quantization

**Source:** p.8-9 S014

**Original:** The infrared spectra are computed from trajectory dipoles obtained with a deep Wannier neural network. For the proton-transfer mode, the authors quantize the transferred-proton vibration a posteriori along the donor-acceptor axis while keeping the remaining atoms fixed at centroid positions. This gives a direct link between local structure, proton potential asymmetry and vibrational observables such as ω01 and ω12.

**中文:** 红外谱不是简单从经验参数估出来的，而是先用 deep Wannier 神经网络重建轨迹中每一帧的偶极，再计算相关函数得到。对于质子转移模，作者在事后分析中沿着供体-受体轴对被转移质子的振动进行量子化，同时把其余原子固定在质心位置。这样就能把局部结构、ΔE 势能不对称以及 ω01、ω12 这类振动态观测量直接联系起来。

<a id="S015"></a>
### Methods - Coordinates And Diffusion Model

**Source:** p.9 S015

**Original:** The paper defines explicit formulas for ΔE, for the hydrogen-bond coordinate, for side-side correlation-function-based hopping times, and for the final random-walk diffusion model. This matters because the mechanism is not just a narrative interpretation of trajectories: it is operationalized into measurable coordinates, basin definitions and transport timescales that can be reproduced or challenged.

**中文:** 作者不仅给出定性图像，还把 ΔE、氢键坐标、稳定跃迁时间以及最终随机游走扩散模型都写成了明确公式。这一点很重要，因为这意味着文章的机制并不只是“看轨迹后的主观解读”，而是被落实成可操作、可复现、也可被他人检验的坐标定义、状态划分和时间尺度。

<a id="S016"></a>
### Data Availability And End Matter

**Source:** p.9-15 S016

**Original:** Training configurations, energies, forces and deep-Wannier data are deposited on Zenodo, and source data accompany the paper. The acknowledgements note support from the French Ministry of Higher Education and Research, GENCI-IDRIS and the US Department of Energy. The article declares no competing interests, and the extended data figures further document isotope effects, temperature dependence, the random-walk model and the proton-transfer enthalpy surface.

**中文:** 训练所需的分子构型、能量、力以及 deep-Wannier 相关数据被公开存放在 Zenodo，上游 source data 也随论文提供。致谢部分注明了法国高等教育与研究部、GENCI-IDRIS 以及美国能源部的资助来源；作者声明不存在竞争性利益。此外，Extended Data 还补充了同位素效应、温度依赖、随机游走建模细节以及质子转移焓面，这些内容有助于后续复核和方法迁移。

## Critical Reading Notes / 批判性阅读提示

**English:** The most transferable idea is not merely that proton transfer is sequential. It is that a mechanism only becomes convincing when the same coordinates can simultaneously explain structure, spectroscopy and transport. That is the real methodological lesson worth porting to other hydrogen-transfer or charge-transfer problems.

**中文说明:** 最值得迁移的并不只是“质子传输是顺序过程”这个结论本身，而是作者如何让同一组坐标同时解释结构、光谱和输运。对别的氢转移、质子耦合电子转移或界面传递问题来说，这才是最有方法学含金量的部分。

## Related Reading / 相关必读

**English:** See `related_reading.md` for two strong background papers that frame today's result as a revision of the classic hydrated-proton picture and as a response to key ultrafast spectroscopy evidence.

**中文说明:** 更完整的推荐请看 `related_reading.md`。那里列出的两篇文献分别对应“经典基线图景”和“推动本工作出现的关键超快光谱证据”。

## Extraction And Layout Notes / 抽取与版式说明

**English:** Reference entries were not translated one by one. Extended Data figures were summarized in prose and cited in the notes where relevant. The image crops are semantic rather than publication-layout exact.

**中文说明:** 参考文献列表没有逐条翻译；Extended Data 图主要以文字方式纳入 reader；图像裁剪强调语义可读性，而不是逐像素复刻出版社版式。
