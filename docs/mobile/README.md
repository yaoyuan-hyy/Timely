# Timely 移动客户端（第一阶段）

2026-09-14：已接入 Capacitor 8，生成 iOS/Android 工程，完成共享 React 客户端构建。**尚未生成签名安装包、尚未完成真机验收、尚未部署 API。** 语音保持禁用，下一阶段实现。

## 架构与范围

- `mobile/main.tsx` 直接使用同一 `TimelyApp` 和 lib，不复制界面或 AI workflow。
- Vite 仅用于移动客户端打包；Next 继续运行网页和服务端 API，不把 Next server 或 DeepSeek 密钥打进 App。
- `capacitor.config.ts` 指向 `mobile/dist`，无远程页面 server.url；内置静态页面离线可打开，AI 解析需要联网。
- 原生端用 Preferences（iOS UserDefaults / Android SharedPreferences）保存现有 JSON 状态；Web 仍用 localStorage。保存串行执行，失败可重试；读取失败禁止自动写 fallback。它是小规模原型存储，不是数据库事务，也不承诺卸载后保留。
- 原浏览器数据不会自动出现在 App。既有 JSON 备份模型不变；原生端文件导入/导出尚待实机验证，不承诺 Web 下载按钮在所有 WebView 中可用。
- CORS 按服务端明确配置的来源允许 POST/OPTIONS；它不是身份认证。当前未新增公网部署或账号体系。

## 配置

服务端 `.env.local` 保持 DeepSeek 配置，额外设置：

```dotenv
MOBILE_ALLOWED_ORIGINS=capacitor://localhost,https://localhost
```

移动构建必须提供实际 HTTPS 后端来源，不包含路径、凭据或 query：

```bash
NEXT_PUBLIC_API_BASE_URL=https://YOUR_BACKEND_HOST npm run mobile:build
./node_modules/.bin/cap sync
npm run mobile:ios
npm run mobile:android
```

也可将 `NEXT_PUBLIC_API_BASE_URL` 放入 `.env.local`，再执行 `npm run mobile:sync`。`NEXT_PUBLIC_` 是公开配置；**绝不能将 API token 放进这个变量**。手机中的 localhost 是手机自身，不能填电脑的 localhost。后端地址需在实际设备上可达。

`appId=com.timely.records` 是开发用默认值；正式签名前根据自己的发布标识调整，不代表已注册或可在商店使用。平台源码已生成并应版本控制，`cap sync` 更新资源和插件，不需重复 `cap add`。

## 当前开发环境缺项

检查结果：Node v23.10.0；当前 `xcode-select` 指向 CommandLineTools；Java 17；默认 `~/Library/Android/sdk` 不存在。未检测到可用完整移动编译环境，因此没有声称完成 IPA/APK 构建。

Capacitor 8 官方要求 Node 22+、Xcode 26+、Android Studio 2025.2.1+；Android 工程当前 target/compile SDK 36。建议使用受依赖支持的 Node LTS，安装 Android Studio 的配套 JDK/SDK。安装 Xcode 后选择完整 Developer 路径并在 IDE 完成初始化。签名及商店账号由项目作者配置。

官方：[环境要求](https://capacitorjs.com/docs/getting-started/environment-setup)、[Preferences](https://capacitorjs.com/docs/apis/preferences)。iOS 工程已包含 UserDefaults 用途声明。

## 已验证

- `npm run mobile:build` 成功（使用 `https://api.example.com` 占位，仅构建验证，不是可联网后端）。
- `cap add ios` / `cap add android` 成功，Preferences 插件同步成功。
- 构建产物在独立浏览器来源实际打开，显示共享 Timely UI；这不是原生 WebView 验收。
- API 来源校验、串行存储及 CORS 测试；全量测试、typecheck、lint、Next build。
- iOS project 与隐私 plist 语法检查。

构建有共享组件 `use client` 指令被 Vite 忽略及 bundle 大小警告；不影响构建结果。npm 安装报告现有/传递依赖漏洞，未做跨版本强制升级。

## 完成内测前的验收清单

在真实 HTTPS 后端和两端设备具备后逐项填写，不以浏览器通过代替：

- [ ] iPhone / Android 安装、启动，记录→纠正→确认→查回。
- [ ] 关闭应用、系统回收、重启后记录一致；读取/写入失败不会覆盖旧记录。
- [ ] 刘海、安全区、键盘弹起时输入和确认按钮可用。
- [ ] Android 返回键、弹窗关闭、前后台中断与在途请求行为。
- [ ] 原生备份导入导出（必要时接 Filesystem/Share 插件）。
- [ ] 断网反馈与恢复，HTTPS API 实际调用成功。
- [ ] 清除开发默认图标/启动图并配置内测签名。

下一阶段在此基础上接原生录音→转写→输入框，不绕过现有预览确认。
