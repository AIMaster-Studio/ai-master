const PptxGenJS = require('pptxgenjs');

// 创建 PPT 实例
const ppt = new PptxGenJS();

// 设置 16:9 比例
ppt.layout = 'LAYOUT_16x9';

// 定义深色科技风配色
const colors = {
  bg: '0A0E17',
  bgLight: '151A2E',
  primary: '35E1FF',
  accent: '00D9FF',
  text: 'E5E7EB',
  textSecondary: '9CA3AF',
  warning: 'F59E0B',
  error: 'EF4444',
  success: '10B981'
};

// P01 封面
let slide = ppt.addSlide();
slide.background = { color: colors.bg };
slide.addText('AI Master', {
  x: 1.5, y: 2.5, w: 7, h: 1.5,
  fontSize: 72, bold: true, color: colors.primary,
  align: 'center', fontFace: 'Microsoft YaHei'
});
slide.addText('用"讲解通关"让 AI 学习从"替你说"变成"你真的会"', {
  x: 1, y: 4, w: 8, h: 0.8,
  fontSize: 28, color: colors.text,
  align: 'center', fontFace: 'Microsoft YaHei'
});
slide.addText('iCAN 高校组 · 软件赛道答辩', {
  x: 7, y: 6.8, w: 2.5, h: 0.4,
  fontSize: 18, color: colors.textSecondary,
  align: 'right', fontFace: 'Microsoft YaHei'
});

// P02 真实痛点
slide = ppt.addSlide();
slide.background = { color: colors.bg };
slide.addText('真实痛点', {
  x: 0.5, y: 0.5, w: 9, h: 0.8,
  fontSize: 48, bold: true, color: colors.primary,
  fontFace: 'Microsoft YaHei'
});
slide.addText('学习者看完教程，常常还说不清概念，也无法判断自己能否运用', {
  x: 0.5, y: 1.8, w: 9, h: 1.2,
  fontSize: 32, color: colors.text,
  fontFace: 'Microsoft YaHei'
});
slide.addText([
  { text: 'AI 对话：', options: { bold: true, color: colors.accent } },
  { text: '给出流畅答案\n', options: { color: colors.text } },
  { text: '学习现实：', options: { bold: true, color: colors.warning } },
  { text: '替学习者说出答案 ≠ 学习者已经学会', options: { color: colors.text } }
], {
  x: 0.5, y: 3.5, w: 9, h: 2,
  fontSize: 28, fontFace: 'Microsoft YaHei', lineSpacing: 36
});

// P03 产品定位
slide = ppt.addSlide();
slide.background = { color: colors.bg };
slide.addText('产品定位', {
  x: 0.5, y: 0.5, w: 9, h: 0.8,
  fontSize: 48, bold: true, color: colors.primary,
  fontFace: 'Microsoft YaHei'
});
slide.addText('1. 是什么：面向大模型与 RAG 入门知识学习的本机学习原型', {
  x: 0.5, y: 2, w: 9, h: 0.8,
  fontSize: 30, color: colors.text,
  fontFace: 'Microsoft YaHei'
});
slide.addText('2. 给谁用：学习大模型与 RAG 入门知识的大学生', {
  x: 0.5, y: 3.2, w: 9, h: 0.8,
  fontSize: 30, color: colors.text,
  fontFace: 'Microsoft YaHei'
});
slide.addText('3. 核心创新："讲解通关"——学习后先自己解释，再接受客观题验收，留下可回看和复习的记录', {
  x: 0.5, y: 4.4, w: 9, h: 1.2,
  fontSize: 30, color: colors.accent, bold: true,
  fontFace: 'Microsoft YaHei'
});

// P04 AI 核心作用
slide = ppt.addSlide();
slide.background = { color: colors.bg };
slide.addText('AI 在哪一步不可替代', {
  x: 0.5, y: 0.5, w: 9, h: 0.8,
  fontSize: 48, bold: true, color: colors.primary,
  fontFace: 'Microsoft YaHei'
});
slide.addText('第一层：本地七项完整性筛查（规则引擎）', {
  x: 0.5, y: 1.8, w: 9, h: 0.6,
  fontSize: 28, color: colors.accent, bold: true,
  fontFace: 'Microsoft YaHei'
});
slide.addText('过滤空泛、重复关键词的无效讲解\n边界：启发式检查，不保证语义正确', {
  x: 0.8, y: 2.5, w: 8.5, h: 1,
  fontSize: 24, color: colors.text,
  fontFace: 'Microsoft YaHei'
});
slide.addText('第二层：可选 AI 结构化复评（deepseek-flash）', {
  x: 0.5, y: 3.8, w: 9, h: 0.6,
  fontSize: 28, color: colors.accent, bold: true,
  fontFace: 'Microsoft YaHei'
});
slide.addText('评估讲解的完整性、准确性和逻辑性\n边界：失败时明确降级，不自动通关', {
  x: 0.8, y: 4.5, w: 8.5, h: 1,
  fontSize: 24, color: colors.text,
  fontFace: 'Microsoft YaHei'
});
slide.addText('数据：21 组双盲测试准确率 90.4762%（TP8/FP0/TN11/FN2），零假阳性', {
  x: 0.5, y: 5.8, w: 9, h: 0.6,
  fontSize: 22, color: colors.success,
  fontFace: 'Microsoft YaHei'
});

// P05 评分维度对齐
slide = ppt.addSlide();
slide.background = { color: colors.bg };
slide.addText('对齐评分表：我们在挣哪几分', {
  x: 0.5, y: 0.5, w: 9, h: 0.8,
  fontSize: 44, bold: true, color: colors.primary,
  fontFace: 'Microsoft YaHei'
});

const dimensions = [
  { name: '创新性 (30分)', desc: '讲解通关机制——强制学习者自己解释+双重验收+可复查记录' },
  { name: '技术实现 (30分)', desc: 'Node.js 本机服务+SQLite/Turso 双模式+七项筛查+AI 复评+真机可演示' },
  { name: '实用价值 (20分)', desc: '高校 AI 课程实践包+教师减少重复判断+学生修订反馈' },
  { name: '用户体验 (10分)', desc: '鲸鱼娘陪伴+错题记录+复习安排+刷新恢复进度' },
  { name: '展示效果 (10分)', desc: '本机可运行+真机截图+数据口径清晰+诚实边界四条' }
];

let yPos = 1.6;
dimensions.forEach((dim, idx) => {
  slide.addText(dim.name, {
    x: 0.5, y: yPos, w: 3, h: 0.4,
    fontSize: 22, bold: true, color: colors.accent,
    fontFace: 'Microsoft YaHei'
  });
  slide.addText(dim.desc, {
    x: 3.5, y: yPos, w: 6, h: 0.4,
    fontSize: 20, color: colors.text,
    fontFace: 'Microsoft YaHei'
  });
  yPos += 1;
});

// P06-P11 功能展示页（使用真机截图）
const screenshots = [
  { title: '学习工作台全景', img: '01-workflow-desktop-complete.png', note: '10 章节 57 节点课程结构、基础诊断入口、目标设定界面、鲸鱼娘陪伴呈现，本机可运行' },
  { title: '讲解验收：七项筛查 + AI 复评', img: '02-explanation-feedback.png', note: '学习者提交讲解后，系统先进行七项完整性筛查，配置模型后增加结构化复评，失败时明确显示反馈原因' },
  { title: '学习记录：本机存储 + 刷新恢复', img: '03-learning-records.png', note: '错题记录、复习安排和学习历史存储在本机 SQLite，刷新后可恢复进度' },
  { title: '57 个课程节点的认知地图', img: '04-knowledge-map.png', note: '10 章节 57 节点课程结构，Three.js 星海可视化，每个节点标明目标、任务和证据收集方式' },
  { title: '鲸鱼娘学习陪伴', img: '05-whale-companion.png', note: '鲸鱼娘响应学习状态提供陪伴反馈，提升学习坚持度（注：保留第三方原形象，上游素材禁商用）' },
  { title: '7 个核心模块通关进度', img: '06-progress-view.png', note: '7 个核心模块进入重点通关流程，进度可视化追踪，刷新后恢复状态' }
];

screenshots.forEach((sc, idx) => {
  slide = ppt.addSlide();
  slide.background = { color: colors.bg };
  slide.addText(sc.title, {
    x: 0.5, y: 0.3, w: 9, h: 0.6,
    fontSize: 36, bold: true, color: colors.primary,
    fontFace: 'Microsoft YaHei'
  });

  try {
    slide.addImage({
      path: `D:\\新建文件夹\\github-upload\\ai-master\\inputs\\figs\\${sc.img}`,
      x: 0.5, y: 1.2, w: 9, h: 4.5,
      sizing: { type: 'contain' }
    });
  } catch (e) {
    slide.addText('[截图: ' + sc.img + ']', {
      x: 0.5, y: 3, w: 9, h: 1,
      fontSize: 24, color: colors.textSecondary,
      align: 'center', fontFace: 'Microsoft YaHei'
    });
  }

  slide.addText('这张图证明：' + sc.note, {
    x: 0.5, y: 6, w: 9, h: 0.8,
    fontSize: 20, color: colors.textSecondary, italic: true,
    fontFace: 'Microsoft YaHei'
  });
});

// P12 技术架构
slide = ppt.addSlide();
slide.background = { color: colors.bg };
slide.addText('技术架构', {
  x: 0.5, y: 0.5, w: 9, h: 0.8,
  fontSize: 48, bold: true, color: colors.primary,
  fontFace: 'Microsoft YaHei'
});
slide.addText('前端：静态课程 + Three.js 星海 + Electron 入口', {
  x: 0.5, y: 2, w: 9, h: 0.6,
  fontSize: 28, color: colors.text,
  fontFace: 'Microsoft YaHei'
});
slide.addText('服务端：Node.js 本机服务 + 七项筛查规则 + AI 复评接口', {
  x: 0.5, y: 3, w: 9, h: 0.6,
  fontSize: 28, color: colors.text,
  fontFace: 'Microsoft YaHei'
});
slide.addText('数据库：SQLite（本地）+ Turso（远程持久化）', {
  x: 0.5, y: 4, w: 9, h: 0.6,
  fontSize: 28, color: colors.text,
  fontFace: 'Microsoft YaHei'
});
slide.addText('关键：所有模型密钥通过环境变量注入，代码中无硬编码', {
  x: 0.5, y: 5.2, w: 9, h: 0.6,
  fontSize: 24, color: colors.accent,
  fontFace: 'Microsoft YaHei'
});

// P13 自测数据
slide = ppt.addSlide();
slide.background = { color: colors.bg };
slide.addText('自测数据', {
  x: 0.5, y: 0.5, w: 9, h: 0.8,
  fontSize: 48, bold: true, color: colors.primary,
  fontFace: 'Microsoft YaHei'
});
slide.addText('测试口径：deepseek-v4-pro（线上实际使用：deepseek-flash）', {
  x: 0.5, y: 1.5, w: 9, h: 0.5,
  fontSize: 20, color: colors.textSecondary,
  fontFace: 'Microsoft YaHei'
});
slide.addText('准确率：90.4762%', {
  x: 2, y: 2.5, w: 6, h: 1,
  fontSize: 56, bold: true, color: colors.accent,
  align: 'center', fontFace: 'Microsoft YaHei'
});
slide.addText('混淆矩阵：TP 8  |  FP 0  |  TN 11  |  FN 2', {
  x: 1.5, y: 3.8, w: 7, h: 0.8,
  fontSize: 32, color: colors.text,
  align: 'center', fontFace: 'Microsoft YaHei'
});
slide.addText('零假阳性（FP = 0）——不会错误通过无效讲解', {
  x: 1, y: 4.8, w: 8, h: 0.6,
  fontSize: 28, color: colors.success,
  align: 'center', fontFace: 'Microsoft YaHei'
});
slide.addText('测试日期：2026-09-05  |  21 组双盲测试', {
  x: 0.5, y: 6.2, w: 9, h: 0.4,
  fontSize: 18, color: colors.textSecondary,
  fontFace: 'Microsoft YaHei'
});

// P14 混淆矩阵可视化（简化版表格）
slide = ppt.addSlide();
slide.background = { color: colors.bg };
slide.addText('AI 复评准确率混淆矩阵', {
  x: 0.5, y: 0.5, w: 9, h: 0.8,
  fontSize: 44, bold: true, color: colors.primary,
  fontFace: 'Microsoft YaHei'
});

// 混淆矩阵数据
const matrixRows = [
  ['', '预测为正', '预测为负'],
  ['实际为正', '8 (TP)', '2 (FN)'],
  ['实际为负', '0 (FP)', '11 (TN)']
];

slide.addTable(matrixRows, {
  x: 2, y: 2, w: 6, h: 3,
  fontSize: 24, fontFace: 'Microsoft YaHei',
  color: colors.text, fill: colors.bgLight,
  border: { pt: 1, color: colors.primary }
});

slide.addText('准确率 = (TP + TN) / Total = (8 + 11) / 21 = 90.4762%', {
  x: 1, y: 5.5, w: 8, h: 0.6,
  fontSize: 26, color: colors.accent, bold: true,
  align: 'center', fontFace: 'Microsoft YaHei'
});

// P15 诚实边界
slide = ppt.addSlide();
slide.background = { color: colors.bg };
slide.addText('诚实边界', {
  x: 0.5, y: 0.5, w: 9, h: 0.8,
  fontSize: 48, bold: true, color: colors.warning,
  fontFace: 'Microsoft YaHei'
});

const boundaries = [
  '1. 课程覆盖范围：57 个课程节点，正文与考核覆盖情况逐项标注。不能说"五十七个知识点全部完整、全部掌握"',
  '2. AI 判断能力：规则与可选模型提供练习反馈，存在误判，另设独立客观题。不能说"AI 精准判断学生真正理解"',
  '3. 素材版权：代码 MIT，但 dsh-pet 素材上游 README 写明禁止商用。不能声称"所有素材 MIT，可放心商用"或"原创鲸鱼娘"',
  '4. 效果数据：尚无本项目教育效果数据，已有研究计划。不能说"学习效果提高某个百分比"'
];

let bYPos = 1.8;
boundaries.forEach(b => {
  slide.addText(b, {
    x: 0.5, y: bYPos, w: 9, h: 0.9,
    fontSize: 22, color: colors.text,
    fontFace: 'Microsoft YaHei'
  });
  bYPos += 1.2;
});

// P16 应用前景
slide = ppt.addSlide();
slide.background = { color: colors.bg };
slide.addText('应用前景', {
  x: 0.5, y: 0.5, w: 9, h: 0.8,
  fontSize: 48, bold: true, color: colors.primary,
  fontFace: 'Microsoft YaHei'
});
slide.addText('高校 B 端（主路径）：7 个核心模块课程实践包，按院系或课程授权年费制（待验证）', {
  x: 0.5, y: 1.8, w: 9, h: 1,
  fontSize: 26, color: colors.text,
  fontFace: 'Microsoft YaHei'
});
slide.addText('企业 B 端（次路径）：定制课程任务 + 私有部署方案 + 企业内部知识库 RAG 实验环境（规划中）', {
  x: 0.5, y: 3.2, w: 9, h: 1,
  fontSize: 26, color: colors.text,
  fontFace: 'Microsoft YaHei'
});
slide.addText('C 端长尾：MIT 代码核心 + 本地练习 + 免费核心 + 付费内容/部署/支持', {
  x: 0.5, y: 4.6, w: 9, h: 1,
  fontSize: 26, color: colors.text,
  fontFace: 'Microsoft YaHei'
});
slide.addText('当前状态：无已签客户、无真实营收，待验证', {
  x: 0.5, y: 6, w: 9, h: 0.5,
  fontSize: 22, color: colors.textSecondary, italic: true,
  fontFace: 'Microsoft YaHei'
});

// P17 验证计划
slide = ppt.addSlide();
slide.background = { color: colors.bg };
slide.addText('验证计划', {
  x: 0.5, y: 0.5, w: 9, h: 0.8,
  fontSize: 48, bold: true, color: colors.primary,
  fontFace: 'Microsoft YaHei'
});
slide.addText('可用性验证：\n• 学生能否独立完成任务\n• 能否理解反馈并找到复习入口\n• 通过试点观察', {
  x: 0.5, y: 1.8, w: 4.5, h: 2.5,
  fontSize: 24, color: colors.text,
  fontFace: 'Microsoft YaHei'
});
slide.addText('效果验证：\n• 相同内容、相同学习时间下\n• 讲解通关是否改善迁移任务与延迟测验表现\n• 需要前测、平行题、盲评和预先确定的分析方案', {
  x: 5, y: 1.8, w: 4.5, h: 2.5,
  fontSize: 24, color: colors.text,
  fontFace: 'Microsoft YaHei'
});
slide.addText('当前状态：尚无教育效果数据，已有研究计划', {
  x: 0.5, y: 5.5, w: 9, h: 0.5,
  fontSize: 22, color: colors.textSecondary,
  fontFace: 'Microsoft YaHei'
});

// P18 团队分工与合规
slide = ppt.addSlide();
slide.background = { color: colors.bg };
slide.addText('团队分工与合规', {
  x: 0.5, y: 0.5, w: 9, h: 0.8,
  fontSize: 48, bold: true, color: colors.primary,
  fontFace: 'Microsoft YaHei'
});
slide.addText('资产边界：\n• 已有基础：原有课程、Three.js 星海、Electron 入口\n• 本次工作：组织讲解、确定判题、持久记录，形成可检查的学习流程\n• 第三方资产：鲸鱼娘（保留上游来源，代码 MIT 但素材禁商用）', {
  x: 0.5, y: 1.8, w: 9, h: 2,
  fontSize: 24, color: colors.text,
  fontFace: 'Microsoft YaHei'
});
slide.addText('合规声明：\n• 所有模型密钥通过环境变量注入，代码中无硬编码\n• 学习记录可存本机 SQLite 或远程 Turso\n• 开启远程模型后相关输入会发往服务商\n• 商业化需要先完成素材授权核查', {
  x: 0.5, y: 4.2, w: 9, h: 2,
  fontSize: 24, color: colors.text,
  fontFace: 'Microsoft YaHei'
});

// P19 核心总结
slide = ppt.addSlide();
slide.background = { color: colors.bg };
slide.addText('核心总结', {
  x: 0.5, y: 0.5, w: 9, h: 0.8,
  fontSize: 48, bold: true, color: colors.primary,
  fontFace: 'Microsoft YaHei'
});
slide.addText('1. 创新点：讲解通关机制——自己解释 + 双重验收 + 可复查记录', {
  x: 0.5, y: 2, w: 9, h: 0.8,
  fontSize: 30, color: colors.accent, bold: true,
  fontFace: 'Microsoft YaHei'
});
slide.addText('2. 技术实现：本机可演示，Node.js + SQLite/Turso，七项筛查 + AI 复评，准确率 90.4762%', {
  x: 0.5, y: 3.2, w: 9, h: 1,
  fontSize: 30, color: colors.text,
  fontFace: 'Microsoft YaHei'
});
slide.addText('3. 诚实边界：57 节点逐项标注，AI 存在误判，素材禁商用，无效果数据', {
  x: 0.5, y: 4.6, w: 9, h: 1,
  fontSize: 30, color: colors.text,
  fontFace: 'Microsoft YaHei'
});

// P20 结束页
slide = ppt.addSlide();
slide.background = { color: colors.bg };
slide.addText('请评委检验', {
  x: 1, y: 2, w: 8, h: 1.2,
  fontSize: 64, bold: true, color: colors.primary,
  align: 'center', fontFace: 'Microsoft YaHei'
});
slide.addText('• 讲解是否真的被检查\n• 客观题是否独立验收\n• 记录是否真实保存\n• 学习者能否根据反馈继续练习', {
  x: 2, y: 3.5, w: 6, h: 2,
  fontSize: 26, color: colors.text,
  align: 'center', fontFace: 'Microsoft YaHei', lineSpacing: 36
});
slide.addText('AI Master —— 让 AI 学习从"替你说"变成"你真的会"', {
  x: 1, y: 6, w: 8, h: 0.6,
  fontSize: 24, color: colors.textSecondary,
  align: 'center', fontFace: 'Microsoft YaHei', italic: true
});

// 导出 PPT
const outputPath = 'D:\\新建文件夹\\github-upload\\ai-master\\AI_Master_iCAN答辩_20260914.pptx';
ppt.writeFile({ fileName: outputPath })
  .then(() => {
    console.log('✓ PPT 生成成功！');
    console.log('输出路径：' + outputPath);
    console.log('页数：20 页');
    console.log('使用截图：01-06 共 6 张真机截图');
    console.log('退出代码：0');
  })
  .catch(err => {
    console.error('× PPT 生成失败：', err);
    process.exit(1);
  });
