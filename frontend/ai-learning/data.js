export const ROUTES = [
  { key: "home", label: "首页", href: "/" },
  { key: "learning-path", label: "学习路线", href: "/learning-path/" },
  { key: "courses", label: "课程", href: "/courses/" },
  { key: "projects", label: "项目实战", href: "/projects/" },
  { key: "playground", label: "Playground", href: "/playground/" },
  { key: "dashboard", label: "Dashboard", href: "/dashboard/" }
];

export const FACTS = [
  { value: "10", label: "门课程章节", icon: "book" },
  { value: "57", label: "核心知识节点", icon: "brain" },
  { value: "41", label: "动手实践任务", icon: "code" },
  { value: "12", label: "交互式实验", icon: "flask" }
];

export const FEATURES = [
  {
    title: "系统学习路线",
    description: "从模型原理到 Agent 工程，沿着清晰路径逐步进阶。",
    icon: "route",
    tone: "cyan",
    tags: ["基础入门", "核心技能", "项目实战", "能力进阶"],
    visual: "steps"
  },
  {
    title: "真实项目实战",
    description: "把知识带进动手任务，在实践中理解真实 AI 应用。",
    icon: "code",
    tone: "teal",
    tags: ["Web 应用", "AI 应用", "数据分析", "企业项目"],
    visual: "project"
  },
  {
    title: "AI 导师答疑",
    description: "在学习过程中提问，获得解释、思路和下一步建议。",
    icon: "sparkles",
    tone: "purple",
    tags: ["即时答疑", "概念讲解", "代码思路"],
    visual: "mentor"
  },
  {
    title: "在线 Playground",
    description: "在安全的演示环境里编写 Prompt，体验输出优化过程。",
    icon: "play",
    tone: "blue",
    tags: ["提示词模板", "交互示例", "历史记录"],
    visual: "playground"
  },
  {
    title: "学习进度追踪",
    description: "用章节、知识节点与任务进度，看见自己的学习轨迹。",
    icon: "chart",
    tone: "teal",
    tags: ["已学课程", "学习时长", "完成项目"],
    visual: "progress"
  },
  {
    title: "优质学习社区",
    description: "通过项目展示与资源入口，和学习者分享实践成果。",
    icon: "users",
    tone: "purple",
    tags: ["学习交流", "资源分享", "项目展示"],
    visual: "community"
  }
];

export const LEARNING_LOOP = [
  { title: "了解 AI", description: "认识 AI 的基础概念", icon: "brain", tone: "cyan", href: "/courses/" },
  { title: "学习路线", description: "找到清晰的进阶方向", icon: "route", tone: "blue", href: "/learning-path/" },
  { title: "知识学习", description: "系统掌握核心知识", icon: "book", tone: "blue", href: "/courses/" },
  { title: "动手实践", description: "在项目中应用所学", icon: "code", tone: "purple", href: "/hands-on/" },
  { title: "AI 反馈", description: "获得及时指导与建议", icon: "message", tone: "pink", href: "/ai-review/" },
  { title: "进阶成长", description: "继续探索更深的应用", icon: "chart", tone: "purple", href: "/projects/" }
];

export const STAGES = [
  {
    id: 1, title: "AI 基础认知", tone: "cyan",
    description: "了解大模型的基本概念、技术原理与应用场景。",
    chapters: [1, 2], chapterIds: [1], icon: "brain", progress: 90,
    lessons: [
      "什么是大语言模型（LLM）？", "LLM 的核心能力与局限性",
      "Token 与 Tokenization 算法（BPE）", "预训练与微调",
      "缩放定律（Scaling Laws）", "RLHF 与人类对齐"
    ]
  },
  {
    id: 2, title: "Prompt Engineering", tone: "blue",
    description: "掌握提示词的编写方法，让 AI 按需输出高质量结果。",
    chapters: [3], chapterIds: [3], icon: "message",
    progress: 75, lessons: [
      "什么是提示词工程？", "提示词编写核心原则", "角色扮演提示法",
      "Zero-shot / Few-shot / Many-shot", "Prompt 模式系统性分类",
      "复杂约束工程与输出控制"
    ]
  },
  {
    id: 3, title: "AI 工具", tone: "purple",
    description: "熟悉主流 AI 工具与开发环境，选择适合任务的工具。",
    chapters: [5, 7], chapterIds: [5], icon: "wrench",
    progress: 60, lessons: [
      "Claude Code 安装与首次配置", "核心命令与斜杠指令",
      "Hooks 系统：事件驱动的自动化", "Skills 开发：自定义技能体系",
      "MCP 协议：连接外部工具与数据", "Claude Code 项目实战全流程"
    ]
  },
  {
    id: 4, title: "AI 工作流", tone: "cyan",
    description: "组织模型、工具与数据，构建可复用的自动化流程。",
    chapters: [4, 6], chapterIds: [4, 6], icon: "workflow",
    progress: 40, lessons: [
      "LangChain 核心：Chain 与 Prompt 模板",
      "LlamaIndex：数据连接与 RAG 框架",
      "AI Agent 架构：感知—决策—执行循环",
      "工具调用（Function Calling）深度实践",
      "多 Agent 协作与通信机制",
      "生产级框架选型与工程化落地"
    ]
  },
  {
    id: 5, title: "AI Agent", tone: "purple",
    description: "理解智能体的组成、工具调用方式和安全边界。",
    chapters: [10], chapterIds: [10], icon: "bot",
    progress: 30, lessons: [
      "AI Agent 的基本概念与组成",
      "工具调用与函数执行",
      "多智能体协作与安全边界"
    ]
  },
  {
    id: 6, title: "AI 项目", tone: "orange",
    description: "从需求出发，结合模型与工程方法完成应用实践。",
    chapters: [8, 9], chapterIds: [9], icon: "cube",
    progress: 0, lessons: [
      "构建 RAG 问答系统", "AI Agent 开发", "多工具编排",
      "评估驱动开发（EDD）", "Prompt 缓存与成本优化",
      "生产级部署架构"
    ]
  }
];

export const COURSES = [
  { id: 1, title: "大模型基础原理", description: "深入理解大语言模型的核心概念、工作原理与能力边界。", points: 6, href: "/static/llm_intro.html", stage: "AI 基础认知" },
  { id: 2, title: "Transformer 架构详解", description: "从自注意力、多头注意力到位置编码与推理优化。", points: 6, href: "/static/transformer_cg.html", stage: "AI 基础认知" },
  { id: 3, title: "提示词工程基础", description: "掌握提示词工程的核心概念、系统化原则与常用范式。", points: 6, href: "/static/prompt_cg_starlab/index.html", stage: "Prompt Engineering" },
  { id: 4, title: "驾驭框架与智能体概念", description: "理解 LLM 开发框架、Agent 架构和多智能体协作。", points: 6, href: "/static/agentic_cg/index.html", stage: "AI 工作流" },
  { id: 5, title: "Claude Code 入门细致讲解", description: "从命令与 Hooks 到 Skills、MCP 和项目实践。", points: 6, href: "/static/claude_cg/index.html", stage: "AI 工具" },
  { id: 6, title: "RAG 技术详解", description: "学习检索增强生成、向量数据库、评估与质量保障。", points: 6, href: "/static/rag_cg/index.html", stage: "AI 工作流" },
  { id: 7, title: "阿里云 ACP 大模型认证（上）", description: "了解模型服务、百炼平台、PAI 与模型评估。", points: 6, href: "/chapter/7/", stage: "AI 工具" },
  { id: 8, title: "阿里云 ACP 大模型认证（下）", description: "覆盖模型部署优化、RAG、安全与合规评测。", points: 6, href: "/chapter/8/", stage: "AI 项目" },
  { id: 9, title: "大模型应用实战", description: "用 RAG、Agent、多工具编排与评估方法构建应用。", points: 6, href: "/chapter/9/", stage: "AI 项目" },
  { id: 10, title: "AI Agent 原理与安全", description: "理解智能体组成、工具调用、多智能体协作和安全边界。", points: 3, href: "/chapter/10/", stage: "AI Agent" }
];

export const DEMO_METRICS = [
  { label: "今日任务", value: "3/5", icon: "checklist", tone: "teal", progress: 60 },
  { label: "连续学习天数", value: "28", suffix: "天", icon: "flame", tone: "orange", progress: 78 },
  { label: "学习时长", value: "36.5", suffix: "小时", icon: "clock", tone: "blue", progress: 72 },
  { label: "完成课程", value: "12", icon: "graduation", tone: "purple", progress: 68 },
  { label: "完成项目", value: "3", icon: "folder", tone: "pink", progress: 54 }
];

export const LEARNING_PROGRESS = [
  { label: "AI 基础认知", value: 90, tone: "teal", icon: "brain" },
  { label: "Prompt Engineering", value: 75, tone: "blue", icon: "message" },
  { label: "AI 工具", value: 60, tone: "purple", icon: "wrench" },
  { label: "AI 工作流", value: 40, tone: "orange", icon: "workflow" },
  { label: "AI Agent", value: 30, tone: "pink", icon: "bot" },
  { label: "AI 项目", value: 0, tone: "pink", icon: "cube" }
];

export const PLAYGROUND_INITIAL_PROMPT =
  "请帮我写一篇关于人工智能在教育领域应用的科普文章。\n\n要求：通俗易懂，结构清晰，包含实际案例和未来展望，适合中学生阅读。";

export const PLAYGROUND_INITIAL_RESPONSE =
  "# 人工智能让教育更智能、更公平\n\n人工智能（AI）正在改变我们的学习方式。它不仅让课堂更有趣，还能帮助每个学生找到适合自己的学习方法。\n\n## 一、什么是人工智能？\n\n人工智能是让计算机从数据中识别规律、完成特定任务的技术。在教育中，它可以辅助解释概念、整理材料和提供练习反馈。\n\n## 二、实际应用案例\n\n1. **智能作业反馈**：系统可以先标记常见错误，教师再把时间用于讲解思路。\n2. **个性化练习**：根据学习者正在练习的知识点，推荐相应难度的题目。\n3. **学习辅助**：把复杂概念拆成步骤，并提供不同例子帮助理解。\n\n## 三、使用时需要注意什么？\n\nAI 输出可能不准确，也可能遗漏背景。重要内容应核对来源，个人信息不应随意输入。\n\n## 四、未来展望\n\nAI 可以成为学习工具，但学习目标、判断和创造仍需要人参与。";

export const UPGRADE_SUGGESTIONS = [
  "优先学习 AI Agent 的基本组成与工具调用，结合安全边界做小型练习。",
  "继续巩固 AI 工作流，把数据、模型与工具连接成可检查的步骤。",
  "从小型 AI 应用入手，记录需求、评估方法和已知限制。"
];
