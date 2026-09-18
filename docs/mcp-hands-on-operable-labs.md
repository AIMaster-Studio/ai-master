# 动手实践工作台（labs）：让「从哪做」真的能做

- 分支：`feat/practice-labs`（基于 `master@5d25ec7`）
- 日期：2026-09-18
- 范围：`frontend/static/labs/`（新增）、`frontend/data/hands-on-tasks.json`（11 题）、`frontend/hands-on/index.html`（1 行）、`tests/hands-on-operable.test.js`（新增）
- 不做：不合并、不部署、不改后端。

## 1. 问题（实测）

`frontend/hands-on/` 里 11 道题的「从哪做」把学习者送到 `*_cg` 概念动画页，这些页面没有任何输入控件，无法产出题目要求的东西。

```
$ grep -c "<input\|<textarea\|<select" frontend/static/prompt_cg.html
0
$ node --test tests/hands-on-operable.test.js   # 用 master 的 hands-on-tasks.json 跑新合同
AssertionError: 以下题目的「从哪做」只指向概念动画，没有可操作入口：
  ch3-t3, ch4-t2, ch4-t3, ch4-t4, ch5-t1, ch5-t2, ch6-t4, ch8-t3
```

（ch2-t3 / ch6-t2 / ch6-t3 因同时提到 transformer_lab / rag_starlab 未被合同判为违规，但它们的题目产物同样没有落笔处，一并纳入。）

## 2. 做了什么

### 2.1 新增 `frontend/static/labs/`（零后端、零外部依赖、零 emoji）

| 文件 | 行数 | 职责 |
|---|---|---|
| `index.html` | 197 | 壳 + 全部 CSS。三栏：左题单 / 中按题目步骤分区填写 / 右常驻「产物 + 形式自检 + 导出」 |
| `engine.js` | 327 | 渲染、localStorage 自动保存、hash 路由、派生区实时更新、Markdown 导出/复制/打印 |
| `labs.js` | 410 | 11 个工作台的配置：分区、字段、产物渲染、自检规则（纯函数） |

入口：`frontend/static/labs/index.html#<题号>`，例如 `#ch3-t3`。

设计上沿用 hands-on 的 token（同一色板、同一 mono 标签词汇、150ms 边框过渡），排版做了两处「大胆」处理：72px 半透明 mono 分区编号作为结构本身；右栏 44px 数字 `5/5` 作为唯一的状态展示，不用进度条、不用图标。

### 2.2 自检规则的边界

自检只做**形式核对**，不判断内容对错。每条规则都对应题目的「预期成果」或「反作弊检查」中的一句，在页面上以 `why` 显示来源。举例：

- ch3-t3「预测里提到了被删要素的名称或其内容里的词」← 反作弊「删减预测必须对应被删的具体部分」
- ch5-t2「最后一句不是定义原文的连续片段」← 反作弊「直接抄页面定义原文只算完成了抄写」
- ch8-t3「圈出的原句确实出现在第 1 名片段里」← 预期成果「被引用的原句确实能支撑结论」
- ch5-t1 额外做密钥粗扫（`sk-…` / `api_key=` / `Bearer …`），题目要求凭据只放环境变量

中文无空格，「是否引用」用双字片段重合数 ≥ 2 判断（`overlap()`），不是分词。

### 2.3 数据与合同

- `hands-on-tasks.json`：11 题的 `whereToStart` 首选工作台链接、`tools` 首项改为工作台、`verifyState` 从「文件存在」改为「为可填写工作台（N 项形式自检）」；`*_cg` 页面保留并标注为「概念动画」。用 `.local/patch_tasks.py` 做字符串级替换，未重新 dump，diff 只有这 33 行。
- `hands-on/index.html` 的 `linkify` 正则加了 `(?:#[A-Za-z0-9_-]+)?`，否则 `#ch3-t3` 会被截掉。
- 新增 `tests/hands-on-operable.test.js`（3 条）：提到 `*_cg` 就必须同时给可操作入口；每个 `labs/#id` 在 `labs.js` 有配置且 id 一致、每条自检在空表单上必须为 false；labs 无外链脚本、无 emoji、每文件 < 1000 行。

## 3. 验证

```
$ node --test tests/*.test.js
ℹ tests 127  ℹ pass 127  ℹ fail 0
$ python scripts/verify_frontend_demo.py
Frontend verification passed: 30 pages, 8 assets, 376 internal links, 10 galaxies, 57 knowledge nodes, 41 practice tasks, 57/57 coverage.
```

浏览器验收（Playwright / Chromium headless，逐题：清空 → 填一组合格答案 → 刷新 → 故意破坏一处）：

| 题 | 空 | 填好 | 刷新后 | 破坏一处后 |
|---|---|---|---|---|
| ch2-t3 | 0/5 | 5/5 | 5/5 | 4/5（第一行改成前馈层） |
| ch3-t3 | 0/5 | 5/5 | 5/5 | 3/5（任务段改成「帮我做好」） |
| ch4-t2 | 0/4 | 4/4 | 4/4 | 3/4（位置改成「某处」） |
| ch4-t3 | 0/4 | 4/4 | 4/4 | 3/4（两次填充相同） |
| ch4-t4 | 0/4 | 4/4 | 4/4 | 3/4（问题与材料无关） |
| ch5-t1 | 0/4 | 4/4 | 4/4 | 3/4（回显里出现 sk- 密钥） |
| ch5-t2 | 0/4 | 4/4 | 4/4 | 3/4（最后一句抄定义） |
| ch6-t2 | 0/5 | 5/5 | 5/5 | 4/5（依据写「效果不好」） |
| ch6-t3 | 0/4 | 4/4 | 4/4 | 3/4（两题选同一路线） |
| ch6-t4 | 0/4 | 4/4 | 4/4 | 3/4（改写句无条件词） |
| ch8-t3 | 0/5 | 5/5 | 5/5 | 4/5（原句不在片段里） |

控制台错误 0；390px 宽度下 `scrollWidth = 390`（无横向溢出）。

合同测试的一失败一通过：新合同对 master 数据 `fail 2`（见 §1），对本分支 `pass 3`。合同还在开发中抓到两个真 bug（`[].every()` 恒 true 导致 ch4-t4 / ch6-t3 的空表单自检通过），已用 `allRows()` 修正。

## 4. 已知限制与后续开发（给接手的人）

1. **自检是形式核对，不是判卷。** 规则全是正则 / 长度 / 重合度，可以被有心人绕过，也会误伤（例如 ch3-t3 的 HOLLOW 词表很短）。要加规则改 `labs.js` 对应 `checks[]`，并在 `tests/hands-on-operable.test.js` 的「空表单必为 false」约束下运行。
2. **无跨设备同步。** 只有 localStorage（键 `ai-master-lab:<id>`），换浏览器即丢；导出 Markdown 是唯一的持久化路径。如果要接学习中心的进度系统，`engine.js` 的 `save()` / `load()` 是唯一读写点。
3. **ch5-t1 / ch6-t2 / ch4-t2 本质上是记录台**，真实动作在终端、rag_starlab、扣子上发生；工作台不能也不应替代。verifyState 已如实写明。
4. **`*_cg` 动画页未改动**，仍是「先看动画」的入口；如果以后要给 prompt_cg_starlab（Vite 产物、内容未审）建链接，先确认它有输入控件再改 `whereToStart`。
5. **文件大小预算。** `labs.js` 已 410 行；再加 3 个以上工作台建议拆成 `labs/<chapter>.js` 按章加载，`engine.js` 不需要改（只读 `window.LABS`）。
6. **验收脚本未入库。** Playwright 脚本在本地 `labs-work/accept.py`（沙箱），仓库 CI 只跑 node:test + verify_frontend_demo；若要把浏览器验收进 CI 需要装 Chromium 依赖，这是一个独立决定。
7. **linkify 只认 `#[A-Za-z0-9_-]+`**，查询串（`?x=`）不会被链接化，目前无此需求。
