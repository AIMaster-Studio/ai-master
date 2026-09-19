# AI Master 设计系统重构与 Agent 接手完整长期记忆指南 (HANDOVER & LONG-TERM MEMORY)

> **文档版本**: v1.0.0 (2026-09-19)  
> **分支名称**: `feat/design-system`  
> **代码基线**: `5d25ec7` (位于 Windows 本地工作区 `D:\新建文件夹\github-upload\ai-master-worktrees\design-system`)  
> **设计方法论标准**: Anshu Chimala（前苹果/AI 设计双钻模型）、ConardLi《Web Design Engineer》设计系统 5 Dials 标定与 Anti-Cliché 准则  

---

## 1. 项目拓扑与上下文架构 (Project Topology)

### 1.1 环境双端结构
1. **云端沙盒环境 (Arena AI Sandbox)**:
   - 路径: `/home/user`
   - 作用: 执行逻辑编排、文件模板生成、测试验证与交付物集中收拢。
   - 交付物目录: `/home/user/design_system_deliverables/`
2. **本地物理工作树 (Local Worktree via ShunCode MCP Bridge)**:
   - 宿主路径: `D:\新建文件夹\github-upload\ai-master-worktrees\design-system`
   - Git 分支: `feat/design-system` (Worktree 独立工作树，不污染主干)
   - 通信机制: 基于 HTTP/SSE 的 ShunCode MCP Server (`run_command`, `list_directory`, `read_file` 等)。

---

## 2. 核心设计哲学与决策锚点 (Design System Philosophy & User Decisions)

### 2.1 剔除 AI 审美俗套 (Anti-Cliché & Ruthless Subtraction)
- **拒绝平庸 LLM 默认审美**: 彻底铲除紫色/粉色径向渐变大光斑、悬浮大圆角磨砂玻璃卡片、无意义的行星自转与无用 3D 背景动画。
- **无价值元素无情减法 (Ruthless Subtraction)**:
  - 静态页面减负：全站 26 个静态 HTML 文件中原先自动注入的吉祥物部件 (`avatar-widget.css/js`) 与动效挂件 (`beautify.css/js`) 全部剥离，**全站仅保留在核心交互页面 `frontend/learning-center/index.html` 中**。
  - **章节顶部大号数字移除**：经与用户显式确认（User Choice: `remove_number`），章节顶部原有的巨大数字（如 `03 / 10`）被完全删除，避免与左侧 Sticky TOC 及知识节点正文字号产生视觉层级冲突。

### 2.2 视觉 5 Dials 标定与用户确认风格
- **用户决议风格**: **全站统一暗色工程仪表盘 (Dark Instrument)**
- **5 Dials 标定结果**:
  - **Density (信息密度)**: `9/10`（高密度工程控制台、紧凑数据表、Tabular Nums 等宽数字对齐）
  - **Tone (视觉基调)**: `10/10`（硬核工业仪器感、硬件质感、沉浸深黑背景）
  - **Elevation (层次投影)**: `2/10`（扁平 1px 细线边界，杜绝大范围模糊投影与发光阴影）
  - **Motion (动态交互)**: `3/10`（克制微交互，仅保留进度条平滑补间与关键操作状态变色）
  - **Contrast (对比度)**: `9/10`（纯黑底色上的高对比白色文本与三色信号灯）

### 2.3 严谨设计系统基元 (`tokens.css`)
- **三色信号灯语义 (3-Signal Color Palette)**:
  - `--go: #2dd4bf`（冷青/Teal：可用、已通关、主要行动行动点）
  - `--hold: #f59e0b`（琥珀/Amber：需复习、提醒、进行中状态）
  - `--stop: #f43f5e`（玫瑰/Rose：错误、拦截、未通过项）
- **纯平直角几何 (Sharp Hardware Geometry)**:
  - `--radius: 0px`（按钮、卡片、输入框、徽标、进度槽全量采用 0px 直角）
- **严格 4px 间距网格 (4px Spacing Grid)**:
  - `--space-1` (4px) 至 `--space-16` (64px)
- **核心组件 Primitives**:
  - `.readout`: Monospace 大字号核心读数
  - `.kpi` / `.kpi-strip`: 高密度工程指标带
  - `.tbl` / `.tbl-wrap`: 结构化全宽数据网格
  - `.prose`: 舒适正文流排版系统
  - `.btn`: 触感明确的硬朗操作按钮
  - `.chip`: 带有微型状态指示灯的数据状态标签
  - `.meter`: 纯平进度条与动态填满动画

---

## 3. 已完成的关键改造与成果归档 (Completed Milestones)

| 交付文件 | 所在路径 | 状态 | 说明 |
| :--- | :--- | :--- | :--- |
| **`tokens.css`** | `frontend/assets/tokens.css` | **已完成** | 权威设计系统 Token 声明文件 |
| **减法剥离脚本** | `scripts/build_frontend_demo.py` | **已完成** | 已重构生成器，成功编译全十卷章节与总览页 |
| **总览页视觉** | `frontend/dashboard/index.html` | **已完成** | 升级为高密度章节数据表，自动关联 localStorage 进度 |
| **章节双栏流** | `frontend/chapter/*/index.html` | **已完成** | 左侧 Sticky 目录 ScrollSpy，右侧直展知识卡片流 |
| **工作台暗色系统** | `learning-workspace-dark.css` | **已完成** | `learning-center` 暗色工程控制台重构样式 |
| **验收测试脚本** | `scripts/verify_frontend_demo.py` | **已完成** | 包含 20+ 页面路由、`tokens.css` 资产与 0 死链检查 |

---

## 4. 下一任 Agent 极简接手操作指南 (Next Agent Takeover Runbook)

后续接手的 Agent 请严格按照以下 4 步完成收尾与上线闭环：

### Step 1: 检查并唤醒 MCP 远程桥接通道
若处于双端环境，通过本地 Python 运行 `mcp.py` 探测连接：
```python
import requests
# 验证 ngrok 隧道连通性
resp = requests.get("https://trimmer-commuting-eastbound.ngrok-free.dev", timeout=5)
print(resp.status_code)
```
- **异常诊断 (`ERR_NGROK_3200`)**:  
  ngrok 免费版在本地重启后如果未绑定专属保留域名，会自动生成新的随机子域名。此时请用户查看本地 Windows 终端显示的 `Forwarding https://xxxx.ngrok-free.dev` 一行，更新 `mcp.py` 中的 `URL` 即可 1 秒恢复。

### Step 2: 同步 Deliverables 至 Worktree
将 `/home/user/design_system_deliverables/` 下的成熟代码同步至 `ai-master-worktrees/design-system`：
1. `tokens.css` $\rightarrow$ `frontend/assets/tokens.css`
2. `build_frontend_demo.py` $\rightarrow$ `scripts/build_frontend_demo.py`
3. `learning-workspace-dark.css` $\rightarrow$ `frontend/static/css/learning-workspace.css`
4. `verify_frontend_demo.py` $\rightarrow$ `scripts/verify_frontend_demo.py`

### Step 3: 执行静态编译与自动化验收
在 worktree 目录下运行：
```bash
cd ai-master-worktrees/design-system
# 1. 重新生成全部静态页面
python scripts/build_frontend_demo.py

# 2. 执行全站回归测试套件（无后端单机可运行性检查）
python scripts/verify_frontend_demo.py
```
- **通过标准**: 控制台输出 `All frontend demo verification checks passed successfully!`，所有 20+ 路由与 `tokens.css` 均为 `[OK]`，0 损坏内链。

### Step 4: Git 提交并推送至远端分支
```bash
cd ai-master-worktrees/design-system
git status
git add frontend/assets/tokens.css frontend/assets/frontend.css frontend/assets/dashboard-demo.css frontend/assets/chapter-demo.css frontend/assets/frontend.js
git add frontend/dashboard/index.html frontend/chapter/ frontend/static/css/learning-workspace.css
git add scripts/build_frontend_demo.py scripts/verify_frontend_demo.py
git commit -m "feat(design-system): implement Dark Instrument UI system and ruthless subtraction

- Add tokens.css with 3-signal colors (--go, --hold, --stop), 4px grid, and 0px radius
- Strip decorative mascot and beautify widgets across 26 static pages
- Remove oversized 03/10 decorative hero numbering
- Refactor dashboard into high-density tabular view with real localStorage meters
- Refactor chapter pages into 2-column sticky TOC layout
- Apply Dark Instrument styling to learning-workspace.css
- Update and pass verify_frontend_demo.py test suite"

git push origin feat/design-system
```

---

## 5. 长期记忆锚点总结 (Long-term Memory Summary)
1. **核心价值**: 页面不是花哨的展示柜，而是为 AI 工程师量身打造的高可靠「控制台与仪表盘」。
2. **严防死守**: 绝不重新引入紫色悬浮球、毛玻璃模糊发光、大圆角胶囊按钮和无意义的大号空洞数字。
3. **保持透明**: 遇到环境连接阻碍，及时向用户精准同步问题根因，提供最小阻力解决方案。
