# 课程导航与 UI 改进记录

2026-09-17 · AI 辅助制作。

## 完成的改动

- `frontend/static/llm_intro.html`：开始具体学习改为原生相对链接 `../dashboard/`；移除错误的章节详情跳转、运行时覆盖入口及整页透明度归零，支持键盘、新标签和浏览器返回。
- `frontend/assets/ui-refinement.css`：课程总览卡片、章节卡片、文本阅读、圆角、层次色彩、hover/focus、移动端导航及表格/代码横向滚动；兼容 prefers-reduced-motion。
- `frontend/assets/course-navigation.js`：章节搜索、无结果提示和清除按钮；章节详情自动生成本章导航，点击目录会展开对应知识卡片。不采集数据、不虚构学习进度。
- `scripts/build_frontend_demo.py`：生成器同步导入样式和导航增强，避免下次构建覆盖修改。
- `tests/course-navigation.test.js`：根路径、/frontend/、/ai-master/ 三种部署前缀、原生 CTA、返回页透明度与样式生成器检查。

## 验证

- Windows 本地 `npm run verify`：144/144 通过；前端 30 页、369 内链、57/57 节点覆盖通过。
- 浏览器：Chromium，在隔离预览中按 GitHub 提交 69d2c83 加载静态资源。不是生产站点验收；外部字体请求被阻止，使用回退字体。
- 1440×1000 和 390×844：课程总览、第一章详情共四组检查，document scrollWidth 均等于 clientWidth。
- 搜索 Transformer 只剩一章；无匹配输入显示零章；清除恢复十章。两种宽度都通过。
- 目录项数与知识卡片数一致；点击第一项能展开事先折叠的知识卡片。两种宽度都通过。
- 结尾按钮实点跳转到 /frontend/dashboard/。
- 代码提交 c7934a0、69d2c83，推送到 fix/ican-review-20260917，尚未合并 master，未改生产部署。

## 后续工作与边界

- 本批重点覆盖课程总览和章节详情，不声称已全面重做所有界面。
- Safari、Firefox、真实手机触控和真实用户走查仍待验证；无页面横向溢出不等于完成全部无障碍验收。
- Render 创建、密钥、固定后端上线仍等待账户持有者操作；本批不创建付费资源。
- 未虚报两小时工时，也没有在会话结束后启动无人监管的自动修改任务。
