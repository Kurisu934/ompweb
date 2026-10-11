# ompweb

[![npm version](https://img.shields.io/npm/v/@kahme247/ompweb.svg?logo=npm&color=e05d44)](https://www.npmjs.com/package/@kahme247/ompweb)
[![node version](https://img.shields.io/node/v/@kahme247/ompweb.svg?logo=node.js&color=44cc11)](https://nodejs.org)
[![license](https://img.shields.io/github/license/kahme247/ompweb.svg?color=44cc11)](./LICENSE)
[![npm downloads](https://img.shields.io/npm/dm/@kahme247/ompweb.svg?color=44cc11)](https://www.npmjs.com/package/@kahme247/ompweb)
[![GitHub stars](https://img.shields.io/github/stars/kahme247/ompweb.svg?logo=github)](https://github.com/kahme247/ompweb/stargazers)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/kahme247/ompweb/pulls)

[English](./README.md) | [简体中文](./README.zh-CN.md) | [日本語](./README.ja.md)

社区：[加入 OMPWEB Discord](https://discord.gg/evqgGzRfM5)

[oh-my-pi (omp)](https://github.com/can1357/oh-my-pi) 编程智能体的现代 Web UI。它读取本地的 omp 会话，在浏览器中提供实时对话、项目会话浏览、配置管理和文件预览等功能。

## 本分支增强

[hsiatein/ompweb](https://github.com/hsiatein/ompweb) 基于
[kahme247/ompweb](https://github.com/kahme247/ompweb)，增加本地壁纸、毛玻璃界面、
壁纸配色与桌宠。上方 npm 徽章属于**上游包**，不是本分支的独立发行版；
要使用下列功能，请按本文的源码方式安装。

| 新增功能 | 具体内容 |
| --- | --- |
| 本地壁纸 | 原文件图片、视频播放，支持本地文件夹和 Steam 壁纸库发现；可调播放、音量、亮度及拖动裁剪位置。 |
| 浏览器原生场景 | 使用 Three.js/WebGL 在浏览器 GPU 上渲染支持的 Wallpaper Engine 场景资源，不截取桌面、不串流画面；已支持部分特效、粒子、视差、动画、音频与沙箱 SceneScript。 |
| 毛玻璃工作区 | 默认仅消息和控件背后模糊，也可切换全透明、全毛玻璃并调节不透明度；覆盖聊天、表格、代码、工具/思考/状态块、侧边栏、用量与输入区控件。 |
| 壁纸生成界面配色 | 通过 Material Color Utilities 协调强调色、选中项、边框与进度条；普通文字统一采用固定颜色、自动黑白或 Material 配色，不再逐字变色，代码/差异/状态语义色仍保留。 |
| 动画桌宠 | 导入兼容 Codex v1/v2 的精灵图，支持动画预览、跟随指针与当前会话活动联动，不额外调用模型。 |
| Charm Hyper 余额 | 展示接口返回的剩余额度；总量未知时明确标注 **250 点参考估算**，不把它当作已验证的订阅上限。 |
| 工作区细节 | 自适应顶栏、弹出面板与文件预览的玻璃样式，以及 `xd://open_file` 结果关联和路径解析修复。 |
| 运行中会话 | Web 已管理或附着的会话执行任务时，在工作区列表上方单列显示所属路径并可直接切换；不受项目折叠影响，工作区列表独立滚动，不会挤掉运行中条目。运行结束后自动移出，全部空闲时隐藏此区域；这不是当前选中会话的常驻置顶，原项目树保持不变。 |
| 工作区快捷新建 | 每个 workspace 行常驻“＋”按钮，直接在该工作区根目录打开新会话输入框；折叠时也可使用，首次发送才启动 OMP。原会话、未发送草稿、顶部新建按钮及工作树选择逻辑保持不变；手机端点击后收起侧栏并聚焦输入框。 |
| 运行中输入 | 同时提供“立即发送”“引导”和“排队”；立即发送调用原生 `abort_and_prompt` 中断当前执行后处理新输入，不撤销已完成操作。高亮按钮与桌面回车遵循已有偏好；不支持中断替换的终端/TG 附着会话明确报错并保留草稿。 |
| 对话回退（Rewind） | 点击历史 prompt 或对应回复下方的“回退”，分叉到该 prompt 之前并恢复文字、图片至输入框，修改后可重发；支持首条 prompt，保留原会话与未发送草稿，不撤销文件修改或已执行命令。运行中需先停止；终端/TG 附着会话仍受禁止远端切换原进程会话的保护。 |

**兼容性边界：**场景渲染属于部分兼容，不是 Wallpaper Engine 的完整替代，也不保证逐像素一致。
部分特效、3D 格式和脚本 API 仍不支持，且受 GPU 和浏览器媒体策略限制。
仓库**不包含** Wallpaper Engine、Steam 壁纸素材、Codex 桌宠素材、凭据或 ASR 模型权重。

详细说明：[壁纸与场景兼容范围](docs/local-wallpapers.md)、[桌宠格式和操作](docs/PETS.md)、
[部署与隐私](docs/CUSTOMIZATIONS.md)。

### 功能展示

以下为本分支的真实浏览器截图，使用**虚构会话、示例账户和原创程序绘制壁纸**，不包含个人数据。
图中展示的是图片壁纸模式，不代表场景已经完全兼容。

![毛玻璃聊天、壁纸配色与示例用量](docs/showcase/workspace.png)

<details>
<summary>壁纸配色、文字模式与裁剪设置</summary>

![Material 配色与壁纸裁剪设置](docs/showcase/wallpaper-settings.png)

</details>

<details>
<summary>手机界面</summary>

<img src="docs/showcase/mobile.png" alt="手机上的毛玻璃聊天与自适应控件" width="360" />

</details>

[截图生成方式与素材来源](docs/showcase/README.md)。

### 最近同步的上游功能

2026-10-11 已整合至 [`7a3f76c`](https://github.com/kahme247/ompweb/commit/7a3f76c)：
原生多问题 Ask、通知中心、多账号管理、`/btw`、Slow 模式、运行中附件及会话恢复等上游改进。
保留本地壁纸、毛玻璃、桌宠、运行中会话单列、三种发送动作和 Rewind 语义。
原生 Ask 与 Telegram 镜像使用各自的回答协议；Host Tools 复用全局事件流，避免两个
HTTP/1.1 聊天标签占满连接后无法提交回答。源码整合不代表现用服务已重建或重启。

![上游录音面板与本分支毛玻璃输入区](docs/showcase/dictation.png)

语音输入使用已有的 OpenAI 兼容转写接口。本地 Qwen3-ASR 服务只要提供该协议即可接入，
在服务端配置 `OMP_WEB_STT_ENDPOINT`、`OMP_WEB_STT_MODEL`，需要鉴权时再设置 `OMP_WEB_STT_KEY`。
ASR 服务需要独立部署；浏览器录音要求 localhost 或 HTTPS，并取得麦克风权限。
回复朗读使用浏览器/操作系统提供的声音，不经过 ASR 模型，可用声音因设备而异。

<details>
<summary>上游原始演示和截图（浅色 / 深色主题）</summary>

![ompweb 上游演示](docs/demo.gif)

![ompweb — 浅色主题](docs/screenshot-light.png)

![ompweb — 深色主题](docs/screenshot-dark.png)

</details>

## 环境要求

- 已安装 [omp](https://github.com/can1357/oh-my-pi) 且在 `PATH` 中（或通过 `OMP_WEB_OMP_BIN` 指定路径）
- Node.js `>= 22.19.0`

将排队的后续消息转为 **Steer** 需要 omp 运行时支持 `promote_queued_message` RPC 命令（omp 18.1.16 尚不支持）。旧版运行时会返回错误，消息仍作为后续消息排队；ompweb 不会重复发送一条引导消息。

队列中的 **Delete** 和 **Edit** 还需要支持 `remove_queued_message`。只有 OMP 确认取消后才会移除消息；编辑时也必须先取消成功，再将文本恢复到输入框。运行时不支持该命令或消息已不在队列中时，界面保留队列并显示提示。

队列面板显示 omp 自身的队列（`get_state` 中的 `queuedMessages` 和 `queue_update` 事件，需 omp 18.4.4 或更高版本），因此查看同一会话的所有设备都会看到相同的排队消息。**Stop** 会将仍在队列中等待的消息文本放回输入框，而不是让智能体运行它们；但模型已通过实时引导接收的引导消息仍会运行。更早版本的 omp 不显示队列面板，Stop 也无法取回排队消息。

## 快速开始

**从源码安装本分支：**

```bash
git clone https://github.com/hsiatein/ompweb.git
cd ompweb
npm ci
npm run build
node bin/omp-web.js --no-open
```

服务器或容器内仍需单独安装 OMP，并将其 agent 数据目录与源码分开持久化。
私有配置使用环境变量或已忽略的 `.env.local`，不要提交到 Git。
已有实例运行任务时，请在另一个源码目录构建，不要覆盖正在使用的 `.next`。

打开 [http://127.0.0.1:30177](http://127.0.0.1:30177)。源码运行时，
下方命令中的 `ompweb` 替换为 `node bin/omp-web.js`。

<details>
<summary>改为安装上游版本（不含本分支增强）</summary>

**免安装直接运行：**

```bash
npx @kahme247/ompweb@latest
```

**或全局安装：**

```bash
npm install -g @kahme247/ompweb
ompweb
```

在浏览器中打开 [http://127.0.0.1:30177](http://127.0.0.1:30177)。

</details>

### CLI 选项

```bash
ompweb --port 8080                         # 自定义端口
ompweb --hostname 0.0.0.0                  # 监听网络地址
ompweb hash-password                      # 输出 OMP_WEB_PASSWORD_HASH 的值
ompweb --no-open                           # 不自动打开浏览器
```

### 密码保护

omp-web **绝不把明文密码交给服务器**：每个 `omp` 会话都会继承服务器的环境变量，
智能体只要运行 `env` 就会把密码写入会话文件并发送给模型提供商。使用
`--password` 会导致启动被拒绝。`OMP_WEB_PASSWORD` 暂时仍可使用：`ompweb`
会在启动时将其哈希、使其不进入服务器的环境变量，并在日志中输出警告，附上应设置为
`OMP_WEB_PASSWORD_HASH` 的哈希值。请尽快切换：智能体仍能从 `ompweb` 启动器进程中
读取明文，而且每次启动都会生成新的哈希，每次重启都会让所有浏览器退出登录。
同时设置两个变量会导致启动被拒绝，请删除 `OMP_WEB_PASSWORD`。

请改用哈希：

```bash
ompweb hash-password                       # 输入两次，内容不回显
echo "a-long-random-password" | ompweb hash-password   # 也可通过管道输入

OMP_WEB_PASSWORD_HASH='scrypt$15$8$1$…' ompweb
```

`ompweb hash-password` 从标准输入读取密码（绝不作为命令行参数），因此不会
留在 shell 历史或 `ps` 输出中。哈希使用 scrypt（N = 2^15、r = 8、p = 1）
与 16 字节随机盐，输出格式为 `scrypt$<ln>$<r>$<p>$<salt>$<digest>`。
即使读到哈希也无法用它登录，更无法还原出密码。

会话签名不使用密码哈希。首次启动时会生成随机签名密钥并保存到
`~/.omp/agent/omp-web/web-auth-secret.json`（权限 `0600`），再与哈希混合得到
签名密钥：修改密码会让已有会话失效，而仅凭保存的哈希无法伪造会话。

服务安装脚本（`ompweb systemd install`、`ompweb-launchd install`、Linux 托盘、
Windows 服务）仍在安装时接受 `OMP_WEB_PASSWORD`，但在写入配置前会先做哈希，
最终只保存哈希。

## 功能特性

- **实时对话**：与本地 `omp` 智能体进行低延迟流式交互。
- **本地单实例共享**：加载本地维护的 `omp-telegram` 插件后，打开正在运行的终端会话会通过私有 Unix socket 接入原 OMP 进程，不再启动第二个会话写入者。两端须使用相同的 `PI_CODING_AGENT_DIR`（默认 `~/.omp/agent`）；关闭网页只断开连接，不终止终端进程。不支持的附着会话操作会明确报错。
- **三端问答竞争**：终端、Telegram 与 Web 共用同一提问，最先回答的一端生效，其余端自动关闭；网页重连可恢复待答问题。升级后须重载/重启原 OMP 与 ompweb。Telegram `/wake` 可恢复 topic 或私聊原绑定的休眠会话，已运行的实例不会重启；Telegram daemon 必须仍在运行。
- **队列删除确认**：取消 OMP 中排队的后续消息或引导消息前，先预览内容并确认。需要原生支持 `remove_queued_message`；已发送的消息无法撤回。
- **会话管理**：按项目浏览历史会话，支持会话分叉与分支回溯。
- **草稿恢复**：未发送的文本按会话或新会话的工作区分别保存；浏览器存储可用时，在同一标签页后退、前进或重新加载后可恢复（最多 50 份草稿）。图片和文件附件仅保留在内存中。
- **实时任务与子智能体**：可折叠面板实时展示任务清单（todo）与子智能体进度，并支持查看完整转录。
- **文件管理与预览**：与对话并排浏览文件，支持代码、Markdown、图片、音频及 PDF 预览。
- **Git Worktree 支持**：直接在侧边栏切换与管理 Git 工作树。
- **可视化设置**：在 Web 界面中直接配置模型、API 密钥、MCP 服务器、技能、插件及 OMP 原生设置。
- **快捷指令与命令面板**：内置常用指令（`/plan`、`/review`、`/fix`、`/test` 等）及 `⌘K` / `Ctrl+K` 全局面板。
- **主题与多语言**：温暖纸感深浅主题，完整支持英语、简体中文及日本語。

## 环境变量

| 变量 | 说明 | 默认值 |
| --- | --- | --- |
| `PORT` | 服务端口 | `30177` |
| `OMP_WEB_HOSTNAME` | 绑定主机名 | `127.0.0.1` |
| `OMP_WEB_PASSWORD_HASH` | Web 登录密码的 scrypt 哈希（由 `ompweb hash-password` 生成）。绑定非回环地址时必须设置 | _无（未启用验证）_ |
| `OMP_WEB_TRUSTED_HEADER_SHA256` | 受信任的反向代理在 `X-Omp-Web-Auth` 请求头中发送的密钥的 SHA-256 摘要（十六进制）；请求头哈希匹配的请求无需密码。omp-web 不保存密钥本身。生成方法和 nginx 配置示例见英文 README 的 “Skipping the password on trusted networks” 一节 | _无（未启用）_ |
| `OMP_WEB_NO_OPEN` | 设为 `1` 时禁止自动打开浏览器 | `0` |
| `OMP_WEB_DISABLE_AUTOUPDATE` | 设为 `1` 时禁用更新检查和应用内更新；修改后需重启 | `0` |
| `OMP_WEB_NAME` | 浏览器标签页和已安装应用中显示的名称。设为 `url`、`host` 或 `domain`（不区分大小写）时使用浏览器所连接的主机名（不含端口），localhost 和 IP 地址仍显示 `omp web`；其他值按原样使用。修改后需重启 | `omp web` |
| `OMP_WEB_OMP_BIN` | `omp` 二进制路径（未在 PATH 时使用） | _自动检测_ |
| `PI_CODING_AGENT_DIR` | 自定义 omp agent 目录 | `~/.omp/agent` |
| `OMP_WEB_STT_ENDPOINT` | OpenAI 兼容的语音转文字接口 URL | _无（默认禁用）_ |
| `OMP_WEB_STT_KEY` | STT 接口对应的 API Key | _无_ |
| `OMP_WEB_STT_MODEL` | STT 接口的模型名称 | _无_ |

**`OMP_WEB_NAME` 与已安装应用。** 已安装应用（PWA）通常以安装时所在页面的名称命名。如果之后修改了 `OMP_WEB_NAME`，或在 `OMP_WEB_NAME` 为 `url`、`host` 或 `domain` 时通过其他地址访问 omp-web，操作系统可能也会重命名已安装的应用。建议将 `OMP_WEB_NAME` 留空，或设置一个无论通过哪个域名或地址访问都能识别这台 omp-web 服务器的名称。

## 本地开发

```bash
git clone https://github.com/hsiatein/ompweb.git
cd ompweb
npm install
npm run dev
```

本地开发服务器运行在 [http://127.0.0.1:30178](http://127.0.0.1:30178)。

### 代码检查

```bash
npm run typecheck   # TypeScript 类型检查
npm run lint        # ESLint 检查
npm test            # 运行测试套件
```

> **注意**：本地开发期间请勿运行 `npm run build`，以免污染 `.next/` 导致开发服务器异常。

## 致谢与许可证

- 本分支基于 [kahme247/ompweb](https://github.com/kahme247/ompweb)，保留并同步其上游工作。
- 分叉自 [agegr/pi-web](https://github.com/agegr/pi-web)（MIT），针对 [can1357/oh-my-pi](https://github.com/can1357/oh-my-pi) 进行适配。
- 采用 [MIT 许可证](./LICENSE) 开源。
