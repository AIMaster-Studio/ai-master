import PptxGenJS from 'pptxgenjs';
import path from 'path';

const ASSETS_DIR = 'd:\\新建文件夹\\github-upload\\ai-master\\assets';
const OUTPUT_PATH = path.join('d:\\新建文件夹\\github-upload\\ai-master', 'AI_Master_项目介绍.pptx');

const pptx = new PptxGenJS();
pptx.layout = 'LAYOUT_16x9';
pptx.author = 'TraeDesign';
pptx.company = 'AI Master';
pptx.title = 'AI Master 项目介绍';
pptx.subject = '产品、技术、应用场景与团队';

const T = {
  bg: 'F7F6F2',
  surface: 'FFFFFF',
  ink: '1A1A2E',
  muted: '6B7280',
  accent: '3B6EF5',
  accent2: '00BFA5',
  line: 'E0E2E8',
  darkOverlay: '0A0A1A',
  white: 'FFFFFF',
};

const FONT = 'Microsoft YaHei';
const FONT_NUM = 'Arial';

function textOpt(opt = {}) {
  return { fontFace: FONT, color: T.ink, ...opt };
}

pptx.defineSlideMaster({
  title: 'MASTER',
  background: { color: T.bg },
  objects: [
    { rect: { x: 0, y: 0, w: '100%', h: 0.08, fill: { color: T.accent } } },
    { line: { x: 0.5, y: 5.35, w: 9.0, h: 0, line: { color: T.line, width: 0.5 } } },
    { text: { text: 'AI Master 项目介绍', options: { x: 0.5, y: 5.38, w: 4.0, h: 0.2, fontFace: FONT, fontSize: 9, color: T.muted } } },
    { slideNumber: { x: 9.2, y: 5.38, w: 0.3, h: 0.2, fontFace: FONT_NUM, fontSize: 10, color: T.muted, align: 'right' } },
  ],
});

pptx.defineSlideMaster({
  title: 'MASTER_DARK',
  background: { color: T.ink },
  objects: [
    { rect: { x: 0, y: 0, w: '100%', h: 0.08, fill: { color: T.accent } } },
    { slideNumber: { x: 9.2, y: 5.38, w: 0.3, h: 0.2, fontFace: FONT_NUM, fontSize: 10, color: '99A0B0', align: 'right' } },
  ],
});

function addSection(num, title) {
  const slide = pptx.addSlide({ masterName: 'MASTER_DARK' });
  slide.addText(String(num).padStart(2, '0'), {
    x: 0.5, y: 1.6, w: 2.5, h: 1.0,
    fontFace: FONT_NUM, fontSize: 96, bold: true, color: T.accent, valign: 'middle',
  });
  slide.addText(title, {
    x: 0.5, y: 2.7, w: 9.0, h: 1.0,
    fontFace: FONT, fontSize: 44, bold: true, color: T.white, valign: 'top',
  });
  slide.addText('AI Master', {
    x: 0.5, y: 5.0, w: 3.0, h: 0.3,
    fontFace: FONT, fontSize: 11, color: '99A0B0',
  });
  return slide;
}

function addContentSlide(title, bullets, opts = {}) {
  const slide = pptx.addSlide({ masterName: 'MASTER' });
  slide.addText(title, {
    x: 0.5, y: 0.55, w: 9.0, h: 0.7,
    fontFace: FONT, fontSize: 30, bold: true, color: T.ink, valign: 'middle',
  });
  const items = bullets.map((b) =>
    typeof b === 'string' ? { text: b, options: textOpt({ fontSize: 17, bullet: true, lineSpacing: 28, paraSpaceAfter: 10 }) } : b
  );
  slide.addText(items, {
    x: 0.5, y: 1.45, w: opts.w || 9.0, h: opts.h || 3.6,
    fontFace: FONT, fontSize: 17, color: T.ink, valign: 'top',
  });
  if (opts.note) {
    slide.addText(opts.note, {
      x: 0.5, y: 5.0, w: 9.0, h: 0.3,
      fontFace: FONT, fontSize: 10, color: T.muted, italic: true,
    });
  }
  return slide;
}

function addTwoColumnSlide(title, leftTitle, leftItems, rightTitle, rightItems) {
  const slide = pptx.addSlide({ masterName: 'MASTER' });
  slide.addText(title, {
    x: 0.5, y: 0.55, w: 9.0, h: 0.7,
    fontFace: FONT, fontSize: 30, bold: true, color: T.ink, valign: 'middle',
  });
  slide.addText(leftTitle, {
    x: 0.5, y: 1.45, w: 4.2, h: 0.35,
    fontFace: FONT, fontSize: 14, bold: true, color: T.accent,
  });
  slide.addText(leftItems.map((t) => ({ text: t, options: textOpt({ fontSize: 15, bullet: true, lineSpacing: 26 }) })), {
    x: 0.5, y: 1.85, w: 4.2, h: 3.2,
    fontFace: FONT, fontSize: 15, color: T.ink, valign: 'top',
  });
  slide.addText(rightTitle, {
    x: 5.3, y: 1.45, w: 4.2, h: 0.35,
    fontFace: FONT, fontSize: 14, bold: true, color: T.accent,
  });
  slide.addText(rightItems.map((t) => ({ text: t, options: textOpt({ fontSize: 15, bullet: true, lineSpacing: 26 }) })), {
    x: 5.3, y: 1.85, w: 4.2, h: 3.2,
    fontFace: FONT, fontSize: 15, color: T.ink, valign: 'top',
  });
  return slide;
}

function addTableSlide(title, headers, rows, colW) {
  const slide = pptx.addSlide({ masterName: 'MASTER' });
  slide.addText(title, {
    x: 0.5, y: 0.55, w: 9.0, h: 0.7,
    fontFace: FONT, fontSize: 30, bold: true, color: T.ink, valign: 'middle',
  });
  const tableData = [
    headers.map((h) => ({ text: h, options: { fill: T.accent, color: T.white, fontFace: FONT, fontSize: 12, bold: true, align: 'center' } })),
    ...rows.map((row) =>
      row.map((cell, idx) => ({
        text: cell,
        options: {
          fill: idx === 0 ? 'EDF0FF' : T.surface,
          color: T.ink,
          fontFace: FONT,
          fontSize: 11,
          valign: 'middle',
          paraSpaceAfter: 4,
        },
      }))
    ),
  ];
  slide.addTable(tableData, {
    x: 0.5, y: 1.45, w: 9.0,
    colW,
    border: { type: 'solid', pt: 0.5, color: T.line },
    autoPage: true,
    fontFace: FONT,
  });
  return slide;
}

const cover = pptx.addSlide();
cover.background = { path: path.join(ASSETS_DIR, 'aimaster-nebula.jpg') };
cover.addShape(pptx.ShapeType.rect, {
  x: 0, y: 0, w: '100%', h: '100%',
  fill: { color: T.darkOverlay, transparency: 55 },
});
cover.addText('AI Master', {
  x: 0.6, y: 1.6, w: 8.8, h: 1.1,
  fontFace: FONT, fontSize: 60, bold: true, color: T.white,
});
cover.addText('大学生 AI 通识与 RAG 入门学习平台', {
  x: 0.6, y: 2.7, w: 8.8, h: 0.55,
  fontFace: FONT, fontSize: 24, color: 'E8EAFF',
});
cover.addText('讲解通关 · 即时反馈 · 本机记录', {
  x: 0.6, y: 3.35, w: 8.8, h: 0.4,
  fontFace: FONT, fontSize: 16, color: T.accent2,
});
cover.addText('2026.09', {
  x: 0.6, y: 4.9, w: 2.0, h: 0.3,
  fontFace: FONT_NUM, fontSize: 12, color: '99A0B0',
});

addSection(1, '产品本身');

addContentSlide('产品定位', [
  '面向大学生的 AI 通识与 RAG 入门学习原型',
  '保留星际课程、知识星海、鲸鱼娘陪伴等已有交互资产',
  '新增“讲解通关”工作台：学习者用自己的话解释概念，系统即时反馈',
  '从“看视频”转向“主动表达 + 客观测验”的闭环学习',
]);

addContentSlide('学习闭环', [
  '诊断 → 目标 → 核心任务 → 讲解 → 反馈 → 测验 → 通关 → 记录 / 复习',
  '未通过可重读、修订和重试，结果进入本机学习记录与复习安排',
  '讲解与测验双重验证，避免单纯背题或模型误判',
]);

addContentSlide('七大核心模块', [
  '大模型生成基础',
  '可验收提示',
  'Transformer',
  'RAG 检索',
  'RAG 评估',
  'Agent 工具调用',
  '安全边界',
]);

addTwoColumnSlide('产品体验入口', '浏览器本机服务', [
  '默认 http://127.0.0.1:8787',
  '访客档案与可选本地账号',
  '新增学习 API 与 SQLite 持久化',
], '桌面与静态入口', [
  'Electron 桌面入口（单独验收）',
  '静态课程首页与知识星海',
  '鲸鱼娘陪伴与学习状态响应',
]);

addSection(2, '技术要点');

addContentSlide('讲解 + 测验双重验证', [
  '学习者用自己的话解释概念，系统给出有明确来源的反馈',
  '客观题由服务端预设标答独立判分，不由语言模型决定',
  '讲解通过且测验 ≥75% 才记录通关，降低背题与误判风险',
]);

addContentSlide('来源可溯与失败降级', [
  '讲解反馈显示来源：本地规则或结构化模型复评',
  '模型调用失败明确降级，不自动判定讲解通过',
  '未配置模型时仍可使用本地练习规则，保证可用性',
]);

addContentSlide('轻量本机架构', [
  'Node.js 24 内置 HTTP + SQLite，无需额外数据库服务',
  '学习记录保存在本机，不声称云同步或跨设备账号',
  '默认本机访问，可快速部署、离线使用、隐私可控',
]);

addTableSlide('分层架构与边界', ['层', '当前实现', '能力边界'], [
  ['页面', '原生 HTML / CSS / JS', '沿用现有课程与交互页面'],
  ['3D', '本地 Three.js r128', '浏览器支持与实际性能需实测'],
  ['内容', 'JSON 章节与题库', '原课程待审校，不自动作为标答'],
  ['学习服务', 'Node.js 内置 HTTP', '默认本机，非互联网生产部署'],
  ['记录', 'SQLite', '本机访客档案，不声称云同步'],
  ['讲解评价', '本地规则 + 可选模型复评', '显示来源、失败降级'],
  ['客观判题', '服务端预设标答', '不由模型决定答案'],
  ['桌面入口', 'Electron', '需单独验收资源与许可'],
], [1.5, 3.2, 3.3]);

addSection(3, '应用场景');

addContentSlide('高校 AI 通识课堂', [
  '课前预习：基础诊断 + 学习目标，快速定位知识缺口',
  '课中练习：核心模块讲解与即时反馈，提升课堂参与',
  '课后巩固：测验通关与错题复习，形成过程性记录',
]);

addContentSlide('RAG 入门自学', [
  '面向希望快速理解 RAG 流程的大学生',
  '从检索、评估到安全边界逐步闯关',
  '用自己的话解释抽象概念，系统即时纠偏',
]);

addContentSlide('线下工作坊与能力评测', [
  '实验室 / 工作坊快速部署本机服务',
  '统一学习路径与通关记录',
  '支持导出学习记录，用于过程性评价',
]);

addContentSlide('个人复习与记录管理', [
  '本机保存尝试、错题与复习安排',
  '可选本地账号与访客档案',
  '支持学习记录导出，便于复盘与迁移',
]);

addSection(4, '团队与规划');

addTableSlide('团队分工', ['角色', '职责'], [
  ['项目负责人 / 全栈开发', '产品与技术统筹、后端与架构实现'],
  ['前端 / 文档', '课程页面、交互实现与项目文档'],
  ['测试 / 实验', '学习逻辑测试、实验数据收集与验证'],
], [3.0, 6.0]);

addContentSlide('项目状态与规划', [
  '已完成：静态课程、本机服务、7 模块题库、Electron 入口、认知教学设计',
  '进行中：内容审校、真实用户试点、可用性测试',
  '下一步：教育效果研究、迁移与延迟保持、桌面分发与授权核清',
], { note: '当前为原型阶段，尚未有大规模真实用户数据。' });

addContentSlide('核心创新点', [
  '主动讲解 + 独立测验，避免“只看视频”的浅层学习',
  '反馈来源透明，模型失败不黑箱，保证可用性',
  '轻量本机运行，隐私可控、部署简单',
  '复用已有丰富交互资产：星际课程、知识星海、鲸鱼娘陪伴',
]);

addContentSlide('能力边界与诚实披露', [
  '当前为原型，尚无真实用户留存或教育效果提升数据',
  '讲解检查不能杜绝背题、代答或证明长期掌握',
  '本机服务不等于互联网生产部署或多租户云同步',
  '素材授权与商业化前需核清权利',
]);

const closing = pptx.addSlide({ masterName: 'MASTER_DARK' });
closing.addText('谢谢观看', {
  x: 0.5, y: 1.9, w: 9.0, h: 1.0,
  fontFace: FONT, fontSize: 48, bold: true, color: T.white,
});
closing.addText('AI Master — 让大学生真正开口学 AI', {
  x: 0.5, y: 3.0, w: 9.0, h: 0.5,
  fontFace: FONT, fontSize: 20, color: T.accent2,
});
closing.addText('项目仓库：github-upload/ai-master', {
  x: 0.5, y: 4.9, w: 9.0, h: 0.3,
  fontFace: FONT, fontSize: 11, color: '99A0B0',
});

pptx.writeFile({ fileName: OUTPUT_PATH })
  .then(() => {
    console.log('PPTX generated:', OUTPUT_PATH);
  })
  .catch((err) => {
    console.error('Failed to generate PPTX:', err);
    process.exit(1);
  });
