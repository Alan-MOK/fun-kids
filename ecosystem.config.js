module.exports = {
  apps: [{
    name: 'fun-kids',
    script: 'server.js',
    env: {
      PORT: 3003,
      BASE_PATH: '/fun-kids'
    }
  }]
};