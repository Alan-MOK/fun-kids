module.exports = {
  FRONTEND_PASSWORD: 'your-frontend-password',
  ADMIN_PASSWORD: 'your-admin-password',
  JWT_SECRET: 'your-jwt-secret-key',
  PORT: 3003,

  // 百度 TTS 配置（token 有效期 30 天，过期后运行 tools/oauth2.0token.py 重新获取）
  BAIDU_TTS: {
    API_KEY: 'your-baidu-api-key',
    SECRET_KEY: 'your-baidu-secret-key',
    TOKEN: 'your-baidu-tts-token',
    PER: 3, // 默认音色：度逍遥（情感男声）
  },
};
