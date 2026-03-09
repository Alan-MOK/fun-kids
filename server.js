const express = require('express');
const Database = require('better-sqlite3');
const multer = require('multer');
const sharp = require('sharp');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const config = require('./config');

const app = express();
// app.set('trust proxy', 1);  出问题，首先排查这里
app.use(express.json());

const BASE_PATH = (config.BASE_PATH || '').replace(/\/+$/, '');

if (BASE_PATH) {
  app.use((req, res, next) => {
    if (req.url === BASE_PATH || req.url.startsWith(`${BASE_PATH}/`)) {
      req.url = req.url.slice(BASE_PATH.length) || '/';
    }
    next();
  });
}

// ========== 目录初始化 ==========
const DATA_DIR = path.join(__dirname, 'data');
const PINYIN_IMAGE_DIR = path.join(__dirname, 'uploads', 'pinyin_image');
const VOICE_LETTER_DIR = path.join(__dirname, 'uploads', 'voice_letter');
const VOICE_ENTRY_DIR = path.join(__dirname, 'uploads', 'voice_entry');
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(PINYIN_IMAGE_DIR, { recursive: true });
fs.mkdirSync(VOICE_LETTER_DIR, { recursive: true });
fs.mkdirSync(VOICE_ENTRY_DIR, { recursive: true });

// ========== SQLite 初始化 ==========
const db = new Database(path.join(DATA_DIR, 'fun-kids.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS pinyin (
    id TEXT PRIMARY KEY,
    pinyin TEXT NOT NULL,
    initial TEXT NOT NULL,
    final TEXT NOT NULL,
    tone INTEGER NOT NULL,
    char TEXT NOT NULL,
    meaning TEXT,
    category TEXT,
    emoji TEXT,
    image TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Migration: 添加语音字段
try { db.exec('ALTER TABLE pinyin ADD COLUMN voice_char TEXT'); } catch(e) {}
try { db.exec('ALTER TABLE pinyin ADD COLUMN voice_meaning TEXT'); } catch(e) {}
// Migration: 添加整体认读音节标识
try { db.exec('ALTER TABLE pinyin ADD COLUMN is_whole_syllable INTEGER DEFAULT 0'); } catch(e) {}

// 检查是否为空，导入种子数据
const count = db.prepare('SELECT COUNT(*) AS cnt FROM pinyin').get();
if (count.cnt === 0) {
  console.log('数据库为空，导入种子数据...');
  const seedData = require('./data/pinyin-seed');
  const insert = db.prepare(`
    INSERT INTO pinyin (id, pinyin, initial, final, tone, char, meaning, category, emoji)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const tx = db.transaction(() => {
    for (const item of seedData) {
      const id = item.id || `${item.initial || '_'}-${item.final}-${item.tone}-${item.char}`;
      insert.run(id, item.pinyin, item.initial, item.final, item.tone, item.char, item.meaning, item.category, item.emoji);
    }
  });
  tx();
  console.log(`已导入 ${seedData.length} 条种子数据`);
}

// ========== 静态文件 ==========
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'app', 'index.html'));
});

app.get('/index.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'app', 'index.html'));
});

app.get('/pinyin.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'app', 'pinyin.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
});

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/voice', express.static(VOICE_LETTER_DIR));
app.use('/voice_entry', express.static(VOICE_ENTRY_DIR));
app.use(express.static(path.join(__dirname, 'public')));

// ========== Multer 文件上传配置 ==========
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('只能上传图片文件'));
    }
  },
});

// ========== JWT 认证中间件 ==========
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未登录' });
  }
  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, config.JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: '登录已过期，请重新登录' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: '需要管理员权限' });
  }
  next();
}

// ========== 认证接口 ==========
app.post('/api/auth/login', (req, res) => {
  const { password, role } = req.body;
  if (!password || !role) {
    return res.status(400).json({ error: '请输入密码' });
  }

  if (role === 'admin') {
    if (password !== config.ADMIN_PASSWORD) {
      return res.status(401).json({ error: '密码错误' });
    }
  } else {
    if (password !== config.FRONTEND_PASSWORD && password !== config.ADMIN_PASSWORD) {
      return res.status(401).json({ error: '密码错误' });
    }
    // 如果用管理员密码登录前端，仍给 user 角色
  }

  const token = jwt.sign({ role }, config.JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, role });
});

// ========== 拼音数据接口 ==========

// 获取所有分类
app.get('/api/pinyin/categories', authenticate, (req, res) => {
  const rows = db.prepare('SELECT DISTINCT category FROM pinyin WHERE category IS NOT NULL ORDER BY category').all();
  res.json(rows.map(r => r.category));
});

// 获取统计信息
app.get('/api/pinyin/stats', authenticate, (req, res) => {
  const total = db.prepare('SELECT COUNT(*) AS cnt FROM pinyin').get().cnt;
  const withImage = db.prepare("SELECT COUNT(*) AS cnt FROM pinyin WHERE image IS NOT NULL AND image != ''").get().cnt;
  res.json({ total, withImage, withoutImage: total - withImage });
});

app.get('/api/pinyin/voice-stats', authenticate, (req, res) => {
  const total = db.prepare('SELECT COUNT(*) AS cnt FROM pinyin').get().cnt;
  const withCharVoice = db.prepare("SELECT COUNT(*) AS cnt FROM pinyin WHERE voice_char IS NOT NULL AND voice_char != ''").get().cnt;
  const withMeaningVoice = db.prepare("SELECT COUNT(*) AS cnt FROM pinyin WHERE voice_meaning IS NOT NULL AND voice_meaning != ''").get().cnt;
  const voiceFiles = fs.readdirSync(VOICE_LETTER_DIR).filter(f => /\.(mp3|m4a|wav)$/i.test(f));
  const initialFiles = voiceFiles.filter(f => f.startsWith('initial-')).length;
  const finalFiles = voiceFiles.filter(f => f.startsWith('final-')).length;
  res.json({ total, withCharVoice, withMeaningVoice, initialFiles, finalFiles, totalInitials: 23, totalFinals: 34 });
});

// 导出全部数据
app.get('/api/pinyin/export', authenticate, requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM pinyin ORDER BY category, pinyin').all();
  res.json(rows);
});

// 获取全部拼音数据（支持筛选）
app.get('/api/pinyin', authenticate, (req, res) => {
  const { category, hasImage, search, initial, final: finalVal, tone } = req.query;
  let sql = 'SELECT * FROM pinyin WHERE 1=1';
  const params = [];

  if (category) {
    sql += ' AND category = ?';
    params.push(category);
  }
  if (hasImage === 'true') {
    sql += " AND image IS NOT NULL AND image != ''";
  } else if (hasImage === 'false') {
    sql += " AND (image IS NULL OR image = '')";
  }
  if (search) {
    sql += ' AND (pinyin LIKE ? OR char LIKE ? OR meaning LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s);
  }
  if (initial !== undefined) {
    sql += ' AND initial = ?';
    params.push(initial);
  }
  if (finalVal !== undefined) {
    sql += ' AND final = ?';
    params.push(finalVal);
  }
  if (tone !== undefined) {
    sql += ' AND tone = ?';
    params.push(Number(tone));
  }

  sql += ' ORDER BY category, pinyin';
  const rows = db.prepare(sql).all(...params);
  res.json(rows);
});

// ========== Voice Entry 文件审计与管理 ==========
// 注意：这些路由必须在 /api/pinyin/:id 之前，否则会被 :id 通配符拦截

// 审计：列出所有 voice_entry 文件并交叉比对数据库
app.get('/api/pinyin/voice-entry-audit', authenticate, requireAdmin, (req, res) => {
  const diskFiles = fs.readdirSync(VOICE_ENTRY_DIR).filter(f => /\.(mp3|m4a|wav)$/i.test(f));
  const fileSizes = {};
  for (const f of diskFiles) {
    try { fileSizes[f] = fs.statSync(path.join(VOICE_ENTRY_DIR, f)).size; } catch { fileSizes[f] = 0; }
  }

  const rows = db.prepare("SELECT id, pinyin, char, voice_char, voice_meaning FROM pinyin WHERE voice_char IS NOT NULL OR voice_meaning IS NOT NULL").all();
  const refMap = {};
  for (const row of rows) {
    if (row.voice_char) {
      if (!refMap[row.voice_char]) refMap[row.voice_char] = [];
      refMap[row.voice_char].push({ id: row.id, char: row.char, pinyin: row.pinyin, field: 'voice_char' });
    }
    if (row.voice_meaning) {
      if (!refMap[row.voice_meaning]) refMap[row.voice_meaning] = [];
      refMap[row.voice_meaning].push({ id: row.id, char: row.char, pinyin: row.pinyin, field: 'voice_meaning' });
    }
  }

  const diskSet = new Set(diskFiles);
  const files = diskFiles.map(f => ({
    filename: f,
    size: fileSizes[f],
    referencedBy: refMap[f] || [],
  }));

  const orphanedFiles = diskFiles.filter(f => !refMap[f]);

  const brokenRefs = [];
  for (const row of rows) {
    if (row.voice_char && !diskSet.has(row.voice_char)) {
      brokenRefs.push({ id: row.id, char: row.char, pinyin: row.pinyin, field: 'voice_char', filename: row.voice_char });
    }
    if (row.voice_meaning && !diskSet.has(row.voice_meaning)) {
      brokenRefs.push({ id: row.id, char: row.char, pinyin: row.pinyin, field: 'voice_meaning', filename: row.voice_meaning });
    }
  }

  const totalSize = diskFiles.reduce((s, f) => s + (fileSizes[f] || 0), 0);
  res.json({
    files,
    orphanedFiles,
    brokenRefs,
    summary: {
      totalFiles: diskFiles.length,
      referencedFiles: diskFiles.length - orphanedFiles.length,
      orphanedFiles: orphanedFiles.length,
      brokenRefs: brokenRefs.length,
      totalSize,
    },
  });
});

// 批量删除指定的 voice_entry 文件
app.post('/api/pinyin/voice-entry-delete', authenticate, requireAdmin, (req, res) => {
  const { filenames } = req.body;
  if (!Array.isArray(filenames) || filenames.length === 0) {
    return res.status(400).json({ error: '请提供要删除的文件列表' });
  }

  const rows = db.prepare("SELECT id, voice_char, voice_meaning FROM pinyin WHERE voice_char IS NOT NULL OR voice_meaning IS NOT NULL").all();
  const clearCharStmt = db.prepare('UPDATE pinyin SET voice_char = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
  const clearMeaningStmt = db.prepare('UPDATE pinyin SET voice_meaning = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?');

  let deleted = 0, failed = 0, refsCleared = 0;
  for (const filename of filenames) {
    if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
      failed++;
      continue;
    }
    const filePath = path.join(VOICE_ENTRY_DIR, filename);
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        deleted++;
      } else {
        failed++;
        continue;
      }
    } catch {
      failed++;
      continue;
    }
    for (const row of rows) {
      if (row.voice_char === filename) { clearCharStmt.run(row.id); refsCleared++; }
      if (row.voice_meaning === filename) { clearMeaningStmt.run(row.id); refsCleared++; }
    }
  }
  res.json({ deleted, failed, refsCleared });
});

// 修复失效引用
app.post('/api/pinyin/voice-entry-fix-refs', authenticate, requireAdmin, (req, res) => {
  const rows = db.prepare("SELECT id, voice_char, voice_meaning FROM pinyin WHERE voice_char IS NOT NULL OR voice_meaning IS NOT NULL").all();
  const clearCharStmt = db.prepare('UPDATE pinyin SET voice_char = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
  const clearMeaningStmt = db.prepare('UPDATE pinyin SET voice_meaning = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?');

  let fixed = 0;
  for (const row of rows) {
    if (row.voice_char && !fs.existsSync(path.join(VOICE_ENTRY_DIR, row.voice_char))) {
      clearCharStmt.run(row.id);
      fixed++;
    }
    if (row.voice_meaning && !fs.existsSync(path.join(VOICE_ENTRY_DIR, row.voice_meaning))) {
      clearMeaningStmt.run(row.id);
      fixed++;
    }
  }
  res.json({ fixed });
});

// ========== Pinyin Image 文件审计与管理 ==========

// 审计：列出所有 pinyin_image 文件并交叉比对数据库
app.get('/api/pinyin/image-audit', authenticate, requireAdmin, (req, res) => {
  const diskFiles = fs.readdirSync(PINYIN_IMAGE_DIR).filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f));
  const fileSizes = {};
  for (const f of diskFiles) {
    try { fileSizes[f] = fs.statSync(path.join(PINYIN_IMAGE_DIR, f)).size; } catch { fileSizes[f] = 0; }
  }

  const rows = db.prepare("SELECT id, pinyin, char, image FROM pinyin WHERE image IS NOT NULL AND image != ''").all();
  const refMap = {};
  for (const row of rows) {
    if (!refMap[row.image]) refMap[row.image] = [];
    refMap[row.image].push({ id: row.id, char: row.char, pinyin: row.pinyin });
  }

  const diskSet = new Set(diskFiles);
  const files = diskFiles.map(f => ({
    filename: f,
    size: fileSizes[f],
    referencedBy: refMap[f] || [],
  }));

  const orphanedFiles = diskFiles.filter(f => !refMap[f]);

  const brokenRefs = [];
  for (const row of rows) {
    if (row.image && !diskSet.has(row.image)) {
      brokenRefs.push({ id: row.id, char: row.char, pinyin: row.pinyin, filename: row.image });
    }
  }

  const totalSize = diskFiles.reduce((s, f) => s + (fileSizes[f] || 0), 0);
  res.json({
    files,
    orphanedFiles,
    brokenRefs,
    summary: {
      totalFiles: diskFiles.length,
      referencedFiles: diskFiles.length - orphanedFiles.length,
      orphanedFiles: orphanedFiles.length,
      brokenRefs: brokenRefs.length,
      totalSize,
    },
  });
});

// 批量删除指定的 pinyin_image 文件
app.post('/api/pinyin/image-delete', authenticate, requireAdmin, (req, res) => {
  const { filenames } = req.body;
  if (!Array.isArray(filenames) || filenames.length === 0) {
    return res.status(400).json({ error: '请提供要删除的文件列表' });
  }

  const rows = db.prepare("SELECT id, image FROM pinyin WHERE image IS NOT NULL AND image != ''").all();
  const clearImageStmt = db.prepare('UPDATE pinyin SET image = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?');

  let deleted = 0, failed = 0, refsCleared = 0;
  for (const filename of filenames) {
    if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
      failed++;
      continue;
    }
    const filePath = path.join(PINYIN_IMAGE_DIR, filename);
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        deleted++;
      } else {
        failed++;
        continue;
      }
    } catch {
      failed++;
      continue;
    }
    for (const row of rows) {
      if (row.image === filename) { clearImageStmt.run(row.id); refsCleared++; }
    }
  }
  res.json({ deleted, failed, refsCleared });
});

// 修复失效图片引用
app.post('/api/pinyin/image-fix-refs', authenticate, requireAdmin, (req, res) => {
  const rows = db.prepare("SELECT id, image FROM pinyin WHERE image IS NOT NULL AND image != ''").all();
  const clearImageStmt = db.prepare('UPDATE pinyin SET image = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?');

  let fixed = 0;
  for (const row of rows) {
    if (row.image && !fs.existsSync(path.join(PINYIN_IMAGE_DIR, row.image))) {
      clearImageStmt.run(row.id);
      fixed++;
    }
  }
  res.json({ fixed });
});

// 获取单条
app.get('/api/pinyin/:id', authenticate, (req, res) => {
  const row = db.prepare('SELECT * FROM pinyin WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: '未找到' });
  res.json(row);
});

// 新增
app.post('/api/pinyin', authenticate, requireAdmin, (req, res) => {
  const { pinyin, initial, final: finalVal, tone, char, meaning, category, emoji, is_whole_syllable } = req.body;
  if (!pinyin || initial === undefined || !finalVal || !tone || !char) {
    return res.status(400).json({ error: '缺少必要字段' });
  }
  const id = `${initial || '_'}-${finalVal}-${tone}-${char}`;
  const existing = db.prepare('SELECT id FROM pinyin WHERE id = ?').get(id);
  if (existing) {
    return res.status(409).json({ error: '该条目已存在' });
  }
  db.prepare(`
    INSERT INTO pinyin (id, pinyin, initial, final, tone, char, meaning, category, emoji, is_whole_syllable)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, pinyin, initial, finalVal, tone, char, meaning || '', category || '', emoji || '', is_whole_syllable ? 1 : 0);
  const row = db.prepare('SELECT * FROM pinyin WHERE id = ?').get(id);
  res.status(201).json(row);
});

// 修改
app.put('/api/pinyin/:id', authenticate, requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM pinyin WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: '未找到' });

  const { pinyin, initial, final: finalVal, tone, char, meaning, category, emoji, is_whole_syllable } = req.body;
  db.prepare(`
    UPDATE pinyin SET pinyin=?, initial=?, final=?, tone=?, char=?, meaning=?, category=?, emoji=?, is_whole_syllable=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(
    pinyin || existing.pinyin,
    initial !== undefined ? initial : existing.initial,
    finalVal || existing.final,
    tone || existing.tone,
    char || existing.char,
    meaning !== undefined ? meaning : existing.meaning,
    category !== undefined ? category : existing.category,
    emoji !== undefined ? emoji : existing.emoji,
    is_whole_syllable !== undefined ? (is_whole_syllable ? 1 : 0) : existing.is_whole_syllable,
    req.params.id
  );
  const row = db.prepare('SELECT * FROM pinyin WHERE id = ?').get(req.params.id);
  res.json(row);
});

// 删除
app.delete('/api/pinyin/:id', authenticate, requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM pinyin WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: '未找到' });

  // 删除关联图片
  if (existing.image) {
    const imgPath = path.join(PINYIN_IMAGE_DIR, existing.image);
    if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
  }

  db.prepare('DELETE FROM pinyin WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// 上传图片
app.post('/api/pinyin/:id/image', authenticate, requireAdmin, upload.single('image'), async (req, res) => {
  const existing = db.prepare('SELECT * FROM pinyin WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: '未找到' });

  if (!req.file) return res.status(400).json({ error: '请选择图片文件' });

  // 删除旧图片
  if (existing.image) {
    const oldPath = path.join(PINYIN_IMAGE_DIR, existing.image);
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }

  // 压缩保存
  const filename = `${req.params.id}_${Date.now()}.jpg`;
  await sharp(req.file.buffer)
    .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toFile(path.join(PINYIN_IMAGE_DIR, filename));

  db.prepare('UPDATE pinyin SET image = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(filename, req.params.id);

  const row = db.prepare('SELECT * FROM pinyin WHERE id = ?').get(req.params.id);
  res.json(row);
});

// 删除图片
app.delete('/api/pinyin/:id/image', authenticate, requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM pinyin WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: '未找到' });

  if (existing.image) {
    const imgPath = path.join(PINYIN_IMAGE_DIR, existing.image);
    if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
  }

  db.prepare('UPDATE pinyin SET image = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(req.params.id);
  res.json({ success: true });
});

// ========== 拼音条目语音上传 ==========
const voiceEntryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^audio\//.test(file.mimetype) || /\.(mp3|m4a|wav)$/i.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error('只能上传音频文件'));
    }
  },
});

// 批量上传条目语音（最多 200 个文件，每个 5MB）
const voiceBatchUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 200 },
  fileFilter: (req, file, cb) => {
    if (/^audio\//.test(file.mimetype) || /\.(mp3|m4a|wav)$/i.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error('只能上传音频文件'));
    }
  },
});

app.post('/api/pinyin/voice/batch', authenticate, requireAdmin, (req, res) => {
  voiceBatchUpload.array('files', 200)(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? '单个文件超过 5MB 限制'
        : err.code === 'LIMIT_FILE_COUNT' ? '文件数量超过 200 个限制'
        : err.message || '上传失败';
      return res.status(400).json({ error: msg });
    }
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: '没有收到文件' });
    }

    let mapping;
    try {
      mapping = JSON.parse(req.body.mapping);
    } catch {
      return res.status(400).json({ error: 'mapping 格式错误' });
    }
    if (!Array.isArray(mapping)) {
      return res.status(400).json({ error: 'mapping 必须是数组' });
    }

    const selectStmt = db.prepare('SELECT * FROM pinyin WHERE id = ?');
    const updateCharStmt = db.prepare('UPDATE pinyin SET voice_char = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
    const updateMeaningStmt = db.prepare('UPDATE pinyin SET voice_meaning = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
    const results = [];

    for (const item of mapping) {
      const { fileIndex, entryId, type } = item;
      if (!['char', 'meaning'].includes(type)) {
        results.push({ entryId, type, status: 'failed', error: '无效类型' });
        continue;
      }
      const file = req.files[fileIndex];
      if (!file) {
        results.push({ entryId, type, status: 'failed', error: '文件缺失' });
        continue;
      }
      const existing = selectStmt.get(entryId);
      if (!existing) {
        results.push({ entryId, type, status: 'failed', error: '条目不存在' });
        continue;
      }

      // 删除旧文件
      const col = type === 'char' ? 'voice_char' : 'voice_meaning';
      const oldFile = existing[col];
      if (oldFile) {
        const oldPath = path.join(VOICE_ENTRY_DIR, oldFile);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }

      // 保存新文件
      const ext = path.extname(file.originalname).toLowerCase() || '.mp3';
      const filename = `${type}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${ext}`;
      fs.writeFileSync(path.join(VOICE_ENTRY_DIR, filename), file.buffer);

      // 更新数据库
      if (type === 'char') {
        updateCharStmt.run(filename, entryId);
      } else {
        updateMeaningStmt.run(filename, entryId);
      }
      results.push({ entryId, type, status: 'success', filename });
    }

    const success = results.filter(r => r.status === 'success').length;
    const failed = results.filter(r => r.status === 'failed').length;
    res.json({ success, failed, total: mapping.length, details: results });
  });
});

// 上传拼音条目语音（char=汉字发音, meaning=释义发音）
app.post('/api/pinyin/:id/voice/:type', authenticate, requireAdmin, (req, res) => {
  const { id, type } = req.params;
  if (!['char', 'meaning'].includes(type)) {
    return res.status(400).json({ error: '类型必须是 char 或 meaning' });
  }
  voiceEntryUpload.single('file')(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? '文件超过 5MB 限制' : err.message || '上传失败';
      return res.status(400).json({ error: msg });
    }
    const existing = db.prepare('SELECT * FROM pinyin WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: '未找到' });
    if (!req.file) return res.status(400).json({ error: '请选择音频文件' });

    // 删除旧文件
    const col = type === 'char' ? 'voice_char' : 'voice_meaning';
    const oldFile = existing[col];
    if (oldFile) {
      const oldPath = path.join(VOICE_ENTRY_DIR, oldFile);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    // 保存新文件
    const ext = path.extname(req.file.originalname).toLowerCase() || '.mp3';
    const filename = `${type}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${ext}`;
    fs.writeFileSync(path.join(VOICE_ENTRY_DIR, filename), req.file.buffer);

    db.prepare(`UPDATE pinyin SET ${col} = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(filename, id);
    const row = db.prepare('SELECT * FROM pinyin WHERE id = ?').get(id);
    res.json(row);
  });
});

// 删除拼音条目语音
app.delete('/api/pinyin/:id/voice/:type', authenticate, requireAdmin, (req, res) => {
  const { id, type } = req.params;
  if (!['char', 'meaning'].includes(type)) {
    return res.status(400).json({ error: '类型必须是 char 或 meaning' });
  }
  const existing = db.prepare('SELECT * FROM pinyin WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: '未找到' });

  const col = type === 'char' ? 'voice_char' : 'voice_meaning';
  const filename = existing[col];
  if (filename) {
    const filePath = path.join(VOICE_ENTRY_DIR, filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
  db.prepare(`UPDATE pinyin SET ${col} = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .run(id);
  res.json({ success: true });
});

// 导入数据
app.post('/api/pinyin/import', authenticate, requireAdmin, (req, res) => {
  const { data, mode } = req.body; // mode: 'merge' | 'replace'
  if (!Array.isArray(data)) {
    return res.status(400).json({ error: '数据格式错误' });
  }

  const tx = db.transaction(() => {
    if (mode === 'replace') {
      db.prepare('DELETE FROM pinyin').run();
    }
    const upsert = db.prepare(`
      INSERT OR REPLACE INTO pinyin (id, pinyin, initial, final, tone, char, meaning, category, emoji, image, is_whole_syllable, voice_char, voice_meaning)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const item of data) {
      const id = item.id || `${item.initial || '_'}-${item.final}-${item.tone}-${item.char}`;
      upsert.run(id, item.pinyin, item.initial, item.final, item.tone, item.char, item.meaning || '', item.category || '', item.emoji || '', item.image || null, item.is_whole_syllable ? 1 : 0, item.voice_char || null, item.voice_meaning || null);
    }
  });
  tx();

  const total = db.prepare('SELECT COUNT(*) AS cnt FROM pinyin').get().cnt;
  res.json({ success: true, total, imported: data.length });
});

// 重置为默认数据
app.post('/api/pinyin/reset', authenticate, requireAdmin, (req, res) => {
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM pinyin').run();
    // 清除缓存并重新加载种子数据，确保获取最新的数据
    delete require.cache[require.resolve('./data/pinyin-seed')];
    const seedData = require('./data/pinyin-seed');
    const insert = db.prepare(`
      INSERT INTO pinyin (id, pinyin, initial, final, tone, char, meaning, category, emoji)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const item of seedData) {
      const id = `${item.initial || '_'}-${item.final}-${item.tone}-${item.char}`;
      insert.run(id, item.pinyin, item.initial, item.final, item.tone, item.char, item.meaning, item.category, item.emoji);
    }
  });
  tx();
  const total = db.prepare('SELECT COUNT(*) AS cnt FROM pinyin').get().cnt;
  res.json({ success: true, total });
});

// ========== 语音录音接口 ==========
const voiceUpload = multer({
  storage: multer.diskStorage({
    destination: VOICE_LETTER_DIR,
    filename: (req, file, cb) => cb(null, req.params.filename),
  }),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (/^audio\//.test(file.mimetype) || /\.(mp3|m4a|wav)$/i.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error('只能上传音频文件（MP3/M4A/WAV）'));
    }
  },
});

// 获取已上传的语音文件列表
app.get('/api/voice', (req, res) => {
  const files = fs.readdirSync(VOICE_LETTER_DIR).filter(f => /\.(mp3|m4a|wav)$/i.test(f));
  res.json(files);
});

// 上传/替换语音文件
app.post('/api/voice/:filename', authenticate, requireAdmin, (req, res, next) => {
  // 校验文件名格式
  const fn = req.params.filename;
  if (!/^(initial-[a-z]{1,2}|final-[a-zü]{1,5}-[1-4])\.(mp3|m4a|wav)$/i.test(fn)) {
    return res.status(400).json({ error: '文件名格式不正确' });
  }
  next();
}, (req, res) => {
  voiceUpload.single('file')(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? '文件超过 5MB 限制'
        : err.message || '上传失败';
      return res.status(400).json({ error: msg });
    }
    if (!req.file) return res.status(400).json({ error: '请选择 MP3 文件' });
    res.json({ success: true, filename: req.params.filename });
  });
});

// 删除语音文件
app.delete('/api/voice/:filename', authenticate, requireAdmin, (req, res) => {
  const filePath = path.join(VOICE_LETTER_DIR, req.params.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: '文件不存在' });
  fs.unlinkSync(filePath);
  res.json({ success: true });
});

// ========== 启动服务器 ==========
const PORT = config.PORT || 3003;
app.listen(PORT, () => {
  console.log(`Fun Kids 服务器已启动：http://localhost:${PORT}`);
  console.log(`前端密码: ${config.FRONTEND_PASSWORD}`);
  console.log(`管理密码: ${config.ADMIN_PASSWORD}`);
});
