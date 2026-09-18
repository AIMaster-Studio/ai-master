# 独立评测输入说明

这些是空白模板，不包含真实实验结果。禁止将单元测试夹具、AI 生成候选题或模拟用户当作独立标注或真实用户证据。

运行：`node scripts/evaluate-evidence.js <真实结果.json>`。
输入包含 kind（review/retrieval）、metadata（model、promptVersion、datasetVersion、commit）和非空 rows。

review 行：id、latencyMs、accepted、raterA、raterB；布尔值标签。两人有分歧必须补布尔值 adjudicated。独立标注者身份、评价标准及盲评过程另行留档，不将身份证明公开。
retrieval 行：id、latencyMs、relevant（有依据的相关文档ID数组）、ranked（实际检索的有序且不重复文档ID数组）。

最低目标：100条查询、200条讲解。小样本报告会标 exploratory，不能用来宣称稳定性能。没有标签或缺复现实验元数据时脚本拒绝出分；未定义的指标返回 null，而不是0。

三个检索配置分别运行，保持同一数据集版本，保留原词/同义改写/错别字/难负例分层。开发集用于调参，测试集提前冻结。不将相似度当成经过校准的概率。

生产模型与提示词必须与评测元数据一致。需要两名真实标注者，不可由同一个模型模拟两个人。报告标注一致性、错误放行率、混淆矩阵和95% Wilson区间；独立性及实验设计局限另行说明。
