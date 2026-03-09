module.exports = {
  apps: [{
    name: 'fun-kids',
    script: 'server.js',
    // PM2 环境变量不影响 server.js（它读 config.js）
    // 服务器端需要在 config.js 中设置 BASE_PATH: '/fun-kids'
  }]
};