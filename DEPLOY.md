# Fun Kids 部署说明

## 本地开发（首次）
```bash
git clone <repo-url>
cd fun-kids
npm install
npm run setup          # 自动从模板创建 config.js
# 编辑 config.js 设置密码等（本地 BASE_PATH 留空）
npm run dev            # 启动开发服务器（自动热重载）
```
访问: http://localhost:3003

## 本地开发（拉取更新后）
```bash
git pull
npm install            # 重建原生模块（better-sqlite3, sharp）
npm run dev
```

> **重要**: `npm install` 会自动为当前平台编译原生模块，
> 不要跳过这一步。服务器（Linux）和本地（Mac）的编译产物不通用。

## 生产部署

### 1. 首次部署
```bash
git clone <repo-url>
cd fun-kids
npm install
cp 'config sample.js' config.js
# 编辑 config.js:
#   BASE_PATH: '/fun-kids'
#   设置安全的密码和 JWT_SECRET
```

### 2. 更新部署
```bash
cd /path/to/fun-kids
git pull
npm install            # 重建原生模块
pm2 restart fun-kids
```

### 3. PM2 管理
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### 4. Nginx 配置
```nginx
location /fun-kids/ {
    proxy_pass http://localhost:3003/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Prefix /fun-kids;
}
```

## 文件说明
- `config.js` — 本机配置（gitignore，每台机器独立）
- `config sample.js` — 配置模板（git 跟踪）
- `ecosystem.config.js` — PM2 配置
- `data/pinyin-seed.js` — 种子数据（数据库为空时自动导入）
- `data/fun-kids.db` — SQLite 数据库（gitignore，每台机器独立）
- `uploads/` — 用户上传文件（gitignore，每台机器独立）

## 不同步的文件（gitignore）
以下文件不会通过 git 同步，每台机器独立维护：
- `config.js` — 配置（密码、端口、BASE_PATH）
- `data/*.db*` — 数据库
- `uploads/*` — 上传的图片和音频
- `node_modules/` — 依赖（含平台相关的原生模块）
