# ⚠️ LANGUAGE RULE — MANDATORY

**ALL responses MUST be in English ONLY. Never respond in Turkish, Chinese, or any other language, regardless of the user's locale or the presence of non-English content in the codebase. This is a hard rule with no exceptions.**

---

## 📚 Zread Wiki — Check First

**Before diving into source code, check if a zread wiki exists for this project:**

```bash
# Check if wiki exists:
cat .zread/wiki/current 2>/dev/null && echo "Wiki exists" || echo "No wiki"

# If wiki exists, read the pages directly:
ls .zread/wiki/versions/$(cat .zread/wiki/current)/

# To regenerate wiki (if stale):
zread generate --stdio
```

**Why?** Zread generates comprehensive documentation from code. Reading the wiki is faster than crawling source files manually.

**Rules:**
1. **ALWAYS** check `.zread/wiki/current` before reading source files
2. If wiki exists, read the markdown pages directly — they're already indexed
3. If wiki is missing or stale, run `zread generate --stdio` to create it
4. Wiki pages live in `.zread/wiki/versions/<id>/` — read `wiki.json` for the TOC

# pi-tui

本文件补充根目录的 `AGENTS.md`，只管 `packages/pi-tui`。

本包是引入仓库的 fork，上游是 [`earendil-works/pi`](https://github.com/earendil-works/pi) 的 `packages/tui`。保持 fork 尽量小，这样同步上游的成本才低。

**从上游同步、添加本地补丁，或评审 pi-tui 的 diff 时：** 读 [UPSTREAM.md](./UPSTREAM.md)。fork 就是相对于锁定的上游提交的 diff；那个文件记录了这些 diff 存在的原因。

## 修改这个包

TUI 的产品行为放在 `apps/kimi-code/src/tui` 里（组合、子类化、现有的宿主回调）。只有公开 API 表达不了这个行为时，才修改这个包。

合入这里的补丁必须：

1. 修复库缺陷（崩溃、渲染错误），或者提供应用触及不到的扩展点（输入状态机、渲染热路径、分词器）。
2. 只做加法：可选参数、回调，或默认关闭的开关。默认行为与上游一致。
3. 在 `UPSTREAM.md` 里加一张意图卡片（intent card），并加一个没有这项改动就会失败的测试。

跳过第 3 步，改动就不算完成。不要改写渲染策略。

## 测试

这个包通过 `pnpm --filter @moonshot-ai/pi-tui test` 运行 `node --test`。仓库根目录的 vitest 运行不会执行这些测试。
