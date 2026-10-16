# KAZAM 音乐播放器代码逻辑与功能审计报告

审计日期：2026-08-31  
审计原则：只把可读取源码、实际响应和可复现实验视为证据，不把页面文案当作“已实现”证明。

## 1. 审计范围与限制

当前工作区 `D:\Develop\claude\hotai` 不包含 KAZAM 播放器仓库或后端源码，只包含将
KAZAM 作为视觉参考的文档。可实际取得并审计的实现为公开部署返回的原始前端文件：

- `index.html`：195 行；
- `app.js?v=20260823osc5`：77,491 bytes、2,546 行；
- `app.js` SHA-256：
  `4DA97C7A649041193FAB9AA3CC459FB4ECB8E58A73E7D32FC3FD4B28C9319064`；
- HTTP `Last-Modified`：2026-08-23 16:27:35 GMT；
- 未提供 source map；未定位到公开后端仓库。

因此本报告能够对客户端状态机、播放队列、搜索、歌词、导入导出、管理员 UI 和公开
API 契约做源码级审计；不能仅凭前端证明后端缓存真实性、无损音质、上游切换、认证
强度、额度原子性、SSRF 防护、Range 流媒体实现或密钥保护。

## 2. 源码能够确认的真实功能

| 功能 | 源码结论 | 说明 |
|---|---|---|
| 浅色/暗色主题 | 已实现 | 使用 `localStorage`，同步 `theme-color` 和按钮标签 |
| 搜索 | 客户端已接线 | 调用 `/api/search`；后端检索质量不在当前源码内 |
| 歌曲 ID/链接解析 | 客户端已接线 | 调用 `/api/parse`，结果写入自选列表 |
| 网易云歌单加载 | 客户端已接线 | 调用 `/api/playlist/{id}`，当前实现直接覆盖自选列表 |
| 自选列表与今日电台 | 已实现两份本地状态 | 两个数组分别持久化，但切换、导入和播放状态存在缺陷 |
| 播放模式 | 已实现 | 列表循环、随机、单曲循环；手动切歌语义不一致 |
| 音质选择 | 已实现请求参数 | 切换会重新加载并从头播放；真实音质需后端源码证明 |
| 歌词与翻译 | 已实现基础 LRC | 多时间标签、offset 和近似时间对齐不正确 |
| 下载、分享、M3U/JSON/TXT | 已实现 | M3U 未保留音质，部分 URL 未编码 |
| 本地持久化 | 已实现 | 无 schema、容量和损坏恢复策略 |
| 管理员登录/缓存/上游/额度 | 客户端已接线 | 认证与缓存核心在后端；客户端会保留过期管理员状态 |
| 服务端曲库 | API 实际可匿名读取 | UI 标为管理员功能，但 `/api/library` 无 token 返回 200 |

## 3. 严重问题

### KZ-H01 播放失败分支调用了当前作用域中不存在的函数

严重度：高；已复现。

- `loadAndPlay()` 在约第 1350 行调用 `skipToNextOnFail()`；
- `skipToNextOnFail()` 却在约第 2295 行、后续 `try { ... }` 块内部声明；
- 文件启用了严格模式，块内函数不会进入外层作用域；
- ESLint `no-undef` 直接报告第 1350 行错误；
- 模拟 `/api/song` 返回失败时，实际未捕获异常为：
  `skipToNextOnFail is not defined`。

影响：上游临时失败时，承诺的“自动跳过下一首”不会执行，播放流程以未处理 Promise
拒绝结束。

修复：把失败恢复函数和相关状态移到 `loadAndPlay` 同一模块作用域；不要用一个巨大的
`try` 块包裹函数声明。为歌曲不可用、HTTP 500、JSON 损坏和超时分别增加回归测试。

### KZ-H02 播放请求没有取消或版本号，旧响应会覆盖新歌曲

严重度：高；已复现。

`loadAndPlay()` 先写全局 `curTrack`，随后依次等待 `/api/song/{id}` 和
`/api/lyric/{id}`。快速点击 A、B 两首时，没有 `AbortController`、请求序号或当前歌曲
校验。实验令 B 先返回、A 后返回，最终得到：

- 当前列表高亮：B；
- Now Playing 标题：A；
- `<audio src>`：A。

歌词请求也有同样问题，会出现“歌曲 B + 歌词 A”。音质快速切换、自动跳歌和 URL
自动播放都会进入相同竞态。

修复：维护单调递增 `playRequestId`，新请求取消旧请求；每次写 UI、音频源、歌词和
列表元数据前验证 request id 与 track id。歌曲元数据和歌词可并行请求，但必须共用
同一生命周期令牌。

### KZ-H03 通用 API 层没有状态、格式、超时和异常处理

严重度：高；已复现。

约第 348–350 行的 `api()` 只有：`fetch()` 后直接 `r.json()`。它没有：

- `response.ok` 检查；
- Content-Type/空响应兼容；
- 超时和取消；
- 统一错误对象；
- 网络异常恢复。

`doSearch()`、`resolveAndFill()`、`loadNeteasePlaylist()` 和 `loadAndPlay()` 多数也没有
外围 `try/catch/finally`。模拟断网后产生未处理拒绝，搜索面板永久停在“搜索中”。

修复：建立 `fetchJson(url, {signal, timeoutMs})`，统一处理 HTTP、JSON、超时、取消和
业务错误；所有按钮恢复、loading 状态和错误提示放入 `finally`。

### KZ-H04 HTML 字符串渲染未转义 id 和内部 cover URL

严重度：高风险；属性注入已复现，完整利用取决于后端数据来源。

`cardHTML()` 把 `t.id` 直接拼进 `data-id`，并把 `coverSrc()` 的返回值直接拼进 `src`。
当 API 返回包含引号的值时，测试成功向 `.card` 和 `<img>` 注入了额外属性。当前首页
响应又没有 CSP，因此不能依赖浏览器策略阻断内联事件。

修复：停止用 `innerHTML` 拼卡片，使用 `createElement`、`textContent`、`dataset` 和
属性赋值；在统一 `normalizeTrack()` 中限制歌曲 ID 格式，并只允许经过验证的
same-origin 路径或 `https:` 封面 URL。后端同样必须验证上游数据。

### KZ-H05 管理员 UI、曲库 API 和过期会话的权限语义不一致

严重度：中高；已复现。

- 曲库 tab 和刷新按钮被标记为 `admin-only`；
- `loadLibrary()` 请求 `/api/library` 时没有发送管理员 token；
- 实际匿名 GET `/api/library` 返回 200 和完整缓存曲目元数据；
- 管理员 token 只要存在于 `sessionStorage`，客户端就先进入管理员模式；
- `/api/admin/chksz/usage` 返回 401 时只清空额度文字，不清理 token 或 UI；
- 启动时会重复请求两次额度，并持续每 30 秒轮询过期 token。

修复必须二选一：若曲库应公开，移除管理员伪门禁并明确产品语义；若曲库应受限，前后端
都要求 token。任何管理员 API 返回 401/403 时统一执行静默退出、停止轮询并清理状态。

## 4. 中等问题

### KZ-M01 搜索结果存在同类竞态

快速搜索 `first` 后搜索 `second`，若旧请求最后返回，页面会在输入框仍为 `second` 时
展示 `first` 的结果。应为搜索请求增加序号/取消，并只接受最后一次请求。

### KZ-M02 “清空电台”按钮永远不可达

启动时第 110 行附近将 `btnClearRadio` 隐藏；`setActiveTab()` 在电台页只显示
`btnReloadRadio`，没有重新显示清空按钮。事件处理器虽然存在，但用户无法触发。

### KZ-M03 全局快捷键破坏聚焦控件的正常键盘操作

`document.onkeydown` 只排除 `INPUT` 和 `SELECT`。当主题、tab、删除或导出按钮获得焦点
时按 Space，事件会被全局处理器阻止并转而点击播放按钮。离线 DOM 实验确认：焦点在
主题按钮时，主题没有变化，播放按钮却收到一次 click。

修复：若目标位于 `button,a,input,select,textarea,[contenteditable]` 内，跳过全局快捷
键；播放列表行单独实现 Enter/Space；在帮助界面公开快捷键。

### KZ-M04 清空或删除当前曲目后进度 UI 保留旧值

`resetNowPlaying()` 没有重置 `timeCur`、`timeTot`、`progFill` 和歌词滚动。实验删除当前
歌曲后，标题已回到 KAZAM，但时间仍为 `2:34 / 3:45`、进度仍为 75%。

### KZ-M05 歌单覆盖后旧歌曲继续播放，列表与播放器分裂

`loadNeteasePlaylist()` 直接 `playlist = r.data`、`curIdx = -1`，却不停止或重新关联
当前歌曲。实验中列表已只剩 B，播放器仍播放已不在列表中的 A，且没有任何 active 行。

修复：按 track id 保留当前项；如果新列表不包含当前项，则明确选择“停止”或“保留为
临时 Now Playing”，不能留下无定义状态。

### KZ-M06 LRC 多时间标签解析错误

正则每次只识别一组时间标签。输入 `[00:01.00][00:02.00]Echo` 得到一行歌词，正文
错误地变成 `[00:02.00]Echo`。同时未处理 `[offset:...]`，翻译只按完全相同毫秒对齐。

修复：按行提取所有时间标签，为每个时间生成记录；应用 offset；翻译采用可配置的小
窗口匹配并保留无对应翻译的原文。

### KZ-M07 浏览器测得的真实时长没有同步回列表和持久化

`ondurationchange` 只更新 `curTrack.duration`。实验中总时长已显示 2:03，保存后的
playlist duration 仍为 0，导致列表、JSON/M3U 导出和下次启动继续缺失时长。

### KZ-M08 本地状态和导入文件没有 schema、容量或条数边界

`loadState()` 与 `importPlaylist()` 只检查数组和 `id` truthy。对象类型 cover 可在播放时
触发 `url.indexOf is not a function` 的未处理拒绝。超大文件/歌单还可能阻塞主线程并使
`localStorage.setItem` 超额；保存失败只写 console，用户会误以为数据已持久化。

修复：版本化 schema、逐项 normalize、最大文件大小、最大曲目数、最大字段长度；存储
失败必须提示用户并提供导出恢复入口。

### KZ-M09 手动切歌与播放模式语义不一致

- 单曲循环时点“下一首”只把当前歌曲重置到 0 秒，而“上一首”却切到上一首；
- 随机模式手动下一首可再次抽中当前曲目，自动下一首却会规避；
- 单曲列表的列表循环会在每次结束时重新请求 song/stream，可能重复消耗上游额度。

应明确区分“自动 ended 策略”和“用户明确点击上一首/下一首”的策略，并为随机模式维护
历史或至少排除当前项。

### KZ-M10 切换音质会从头强制播放，并继承所有竞态问题

音质 select 变化后无论当前是播放还是暂停，都调用 `loadAndPlay(curTrack)`；当前进度和
暂停状态丢失。应保存 `currentTime` 与 wasPlaying，仅在新流加载完成后恢复，并沿用播放
请求取消机制。

### KZ-M11 URL 和导出契约不完整

- M3U 使用 `/api/stream/{id}`，没有带用户选择的 `level`；
- 多处路径和分享 URL 未对 `track.id` 做 `encodeURIComponent`；
- `downloadText()` 在 click 后立即 revoke object URL，部分浏览器可能取消下载；
- FileReader 没有 `onerror`；歌单 URL 解析只支持有限的 `?id=` 形式。

### KZ-M12 URL 启动参数会并发执行，结果没有明确优先级

页面同时存在 `q`、`parse` 和 `play` 时，启动代码会并发调用三个异步流程，最终搜索
结果、列表和播放歌曲取决于网络返回顺序。应定义唯一优先级，并串行 await。

## 5. 低优先级与维护性问题

- 单个 2,546 行 IIFE 同时负责 API、状态、DOM、播放器、歌词和管理后台；ESLint 给整个
  函数复杂度 40，多处核心函数复杂度 16–34。
- `listByView()`、`isSingleLoop()` 是死代码。
- 大量 `catch (e) {}` 吞掉原因，生产问题无法定位。
- UI 每次通过 `innerHTML` 全量重建并重新绑定事件，增加焦点丢失、竞态和维护成本。
- `role="tablist"` 下的按钮没有 tab/aria-selected 语义；播放器进度不可键盘操作；管理
  modal 没有 `aria-modal`、焦点圈定和关闭后焦点恢复。
- viewport 使用 `maximum-scale=1`，限制移动端放大。
- 没有可见的源码测试、构建信息或 source map，部署 bundle 无法追溯到具体 commit。

## 6. 已完成的可复现实验

使用 exact bundle 和 jsdom 模拟 MediaElement/API，得到以下结果：

| 实验 | 实际结果 |
|---|---|
| song API 失败 | `skipToNextOnFail is not defined` |
| 先点 A 再点 B，B 先返回 | B 行高亮，但标题和音频源变成 A |
| 先搜 first 再搜 second，first 后返回 | 输入为 second，结果展示 First |
| 搜索断网 | 未处理拒绝，页面永久“搜索中” |
| 焦点在主题按钮按 Space | 主题不变，播放按钮收到 click |
| 切到电台页 | 刷新按钮可见，清空按钮仍为 `display:none` |
| 删除当前曲目 | 标题重置，旧时间和 75% 进度残留 |
| 多时间标签 LRC | 只生成一行，正文含第二个标签 |
| durationchange 后保存 | 页面显示 2:03，存储 duration 仍为 0 |
| 导入新歌单 | 新列表为 B，旧歌曲 A 继续播放且无 active 行 |
| 过期管理员 token + 401 | admin-mode 和 token 保留，启动重复请求两次额度 |
| 异常 API 字段 | 可注入额外 HTML 属性 |

静态门禁结果：

- `node --check app.js`：通过；
- ESLint：1 个 error、34 个 warning；核心 error 即 KZ-H01；
- 未发现公开 source map；
- 首页无 CSP 等关键安全响应头。

## 7. 建议修复顺序

### Phase 0：当天止血

1. 修复 `skipToNextOnFail` 作用域错误并增加失败回归测试；
2. 为播放和搜索增加 request id + AbortController；
3. 建立统一 `fetchJson`，保证 loading 必定在 `finally` 退出；
4. 修复电台清空按钮、进度重置和全局快捷键目标过滤；
5. 401/403 统一清理管理员会话，消除重复额度请求；
6. 明确 `/api/library` 是公开还是管理员资源。

### Phase 1：状态与输入可信化

1. 引入 `normalizeTrack()` 和版本化持久化 schema；
2. 用 track id 而不是仅靠可变索引关联当前歌曲；
3. 统一导入、歌单覆盖、删除、重排时的播放器状态迁移；
4. 替换字符串 HTML 渲染并部署严格 CSP；
5. 修正 LRC、多时间标签、offset、时长持久化和导出 level。

### Phase 2：结构重构与发布门禁

拆分为 `api-client`、`player-controller`、`queue-store`、`lyric-parser`、`admin-client` 和
视图组件；采用 reducer/有限状态机表达 `idle/loading/playing/paused/error`。建立：

- 单元测试：队列增删重排、模式、歌词、state migration；
- 集成测试：慢响应乱序、取消、HTTP/JSON/超时、401；
- 浏览器测试：键盘、移动端、下载、导入导出、自动播放限制；
- 后端测试：认证、限流、SSRF、Range、缓存原子性、音质与额度一致性。

## 8. 后端源码补充审计清单

取得 KAZAM 后端仓库后仍必须继续审查：

1. `/api/cover-proxy` 和自定义 upstream endpoint 的 SSRF、重定向与 DNS rebinding；
2. 管理员密码哈希、登录限流、token 熵/过期/撤销和日志脱敏；
3. `/api/cache/{id}` 的并发写、临时文件、路径穿越、磁盘上限和失败回滚；
4. `/api/stream` 的 Range/HEAD、断流、缓存命中、上游 URL 过期和额度扣减原子性；
5. 搜索/解析/歌单/歌词响应 schema 与最大响应大小；
6. 自定义上游增删是否可访问内网、metadata service 或本机文件；
7. “无损/Hi-Res/臻品母带”标签是否由实际 codec、bit depth、sample rate 验证；
8. 日志、缓存和配置文件中是否保存上游密钥、管理员 token 或用户查询。

## 9. 最终结论

KAZAM 前端的功能覆盖面是真实的，不是纯页面壳：搜索、解析、双列表、播放、歌词、导出、
音质和管理员操作均存在实际调用链。但当前播放核心不是可靠状态机，失败恢复存在确定的
作用域错误，多个异步链路可被旧响应覆盖；输入、持久化和 HTML 渲染也缺少统一边界。

发布优先级应先解决 KZ-H01～KZ-H05，再修状态一致性和歌词/导出细节。后端源码未提供
前，不应声称管理员认证、服务器缓存、上游安全或真实音质已经通过代码审计。
