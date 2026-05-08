# 小宝贝日记 (BabyTime)

一款面向新手父母的婴儿日常记录工具微信小程序，帮助父母快速记录宝宝的吃喝拉撒睡等日常数据。

## 技术栈

### 前端（微信小程序）
- **框架**: Taro 3.x (React)
- **样式**: TailwindCSS
- **状态管理**: Zustand
- **数据请求**: Axios + @tanstack/react-query
- **语言**: TypeScript

### 后端
- **框架**: NestJS (TypeScript)
- **数据库**: MySQL 8.x
- **ORM**: TypeORM
- **认证**: JWT + 微信小程序登录

## 项目结构

```
baby-time/
├── apps/
│   ├── client/          # Taro 前端项目
│   │   ├── src/
│   │   │   ├── pages/   # 页面
│   │   │   ├── stores/  # Zustand 状态管理
│   │   │   ├── hooks/   # 自定义 Hooks
│   │   │   └── utils/   # 工具函数
│   │   └── config/      # Taro 配置
│   └── server/          # NestJS 后端项目
│       └── src/
│           ├── modules/ # 业务模块
│           ├── common/  # 公共模块
│           └── config/  # 配置
├── packages/
│   └── shared/          # 共享类型和常量
├── pnpm-workspace.yaml  # Monorepo 配置
└── package.json         # 根配置
```

## 快速开始

### 环境要求

- Node.js >= 18.0.0
- pnpm >= 8.0.0
- MySQL 8.x

### 安装依赖

```bash
pnpm install
```

### 启动开发服务

```bash
# 同时启动前端和后端
pnpm dev

# 或者分别启动
pnpm dev:client    # 启动前端
pnpm dev:server    # 启动后端
```

### 构建

```bash
# 构建全部
pnpm build

# 或者分别构建
pnpm build:client  # 构建前端
pnpm build:server  # 构建后端
```

## 部署

项目提供两个自动化部署脚本，均在服务器上执行。

### 环境要求

- Node.js >= 18.0.0
- pnpm（脚本会自动安装）
- pm2（脚本会自动安装）

### 环境变量

服务端和小程序端共用根目录下的 `.env` 文件，首次部署前需配置：

```bash
cp .env.example .env
vim .env
```

### 服务端部署（start.sh）

使用 PM2 管理 NestJS 服务，自动完成代码拉取、依赖安装、构建和启动。

```bash
chmod +x start.sh
bash start.sh
```

脚本执行流程：
1. 检查并安装缺失的依赖（pnpm、pm2）
2. `git pull` 拉取最新代码
3. `pnpm install` 安装依赖
4. `npm run build:server` 构建服务端
5. PM2 启动服务（进程名 `baby-time-server`，内存限制 512M）
6. `pm2 save` 保存进程列表

```bash
# 常用命令
pm2 logs baby-time-server   # 查看日志
pm2 status                  # 查看状态
pm2 restart baby-time-server  # 重启服务
```

> 服务器重启后自动恢复进程，首次部署后执行一次 `pm2 startup` 即可。

### 小程序端部署（mini.sh）

使用 `miniprogram-ci` 自动构建并上传代码到微信后台。

**前置准备：**

1. 在微信公众平台 → 开发管理 → 开发设置 → 小程序代码上传密钥，下载密钥文件
2. 将密钥文件放到项目根目录，命名为 `.miniprogram.key`
3. 确保根目录 `.env` 中已配置 `WECHAT_APP_ID`（与服务端共用同一份 `.env`）

```bash
chmod +x mini.sh

# 上传（指定版本号和描述）
bash mini.sh 1.0.0 "修复登录bug"

# 默认版本号 1.0.0
bash mini.sh
```

脚本执行流程：
1. 检查 appid 和密钥文件配置
2. 检查并安装 `miniprogram-ci`
3. `git pull` 拉取最新代码
4. `pnpm install` 安装依赖
5. `npm run build` 构建小程序
6. `miniprogram-ci` 上传到微信后台

上传成功后，前往微信公众平台 → 版本管理 → 开发版本，提交审核即可。

> `.env` 和 `.miniprogram.key` 均已加入 `.gitignore`，不会被提交到仓库。

## 数据库配置

1. 创建 MySQL 数据库：
```sql
CREATE DATABASE baby_time CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

2. 复制环境变量文件：
```bash
cp .env.example .env
```

3. 修改 `.env` 中的数据库配置

## 核心功能

- 3秒快速记录宝宝日常
- 支持多种记录类型（喂奶、换尿布、睡觉等）
- 数据统计和趋势分析
- 多宝宝管理
- 微信登录

## 开发规范

- 使用 TypeScript 严格模式
- 前端组件使用 React 函数组件 + Hooks
- API 请求统一通过 react-query 管理
- 后端使用 NestJS Module-Controller-Service 分层
- 统一响应格式：`{ code, message, data }`

## License

MIT
