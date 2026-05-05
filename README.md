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

## 数据库配置

1. 创建 MySQL 数据库：
```sql
CREATE DATABASE baby_time CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

2. 复制环境变量文件：
```bash
cp apps/server/.env.example apps/server/.env
```

3. 修改 `apps/server/.env` 中的数据库配置

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
