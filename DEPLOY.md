# Fun Kids 部署说明

## 本地开发
```bash
npm install
npm start
```
访问: http://localhost:3003

## 生产部署

### 1. 环境变量设置
```bash
export BASE_PATH=/fun-kids  # 如果部署在子路径下
export PORT=3003
```

### 2. Nginx 配置示例
```nginx
server {
    listen 80;
    server_name apps.304095869.xyz;

    location /fun-kids/ {
        proxy_pass http://localhost:3003/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Prefix /fun-kids;
    }
}
```

### 3. PM2 部署
```bash
npm install -g pm2
pm2 start server.js --name fun-kids
pm2 save
pm2 startup
```

### 4. 访问地址
- 用户页面: https://apps.304095869.xyz/fun-kids/
- 管理员页面: https://apps.304095869.xyz/fun-kids/admin

## 目录结构
- `/` -> app/index.html (用户首页)
- `/admin` -> admin/index.html (管理员面板)
- `/api/*` -> API 接口
- `/uploads/*` -> 静态文件 (图片、音频)</content>
<parameter name="filePath">/root/fun-kids/DEPLOY.md