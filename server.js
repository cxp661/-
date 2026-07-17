const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = 3456;
const DATA_DIR = path.join(__dirname, 'data');
const IMAGES_DIR = path.join(DATA_DIR, 'images');
const PROJECTS_FILE = path.join(DATA_DIR, 'projects.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const THUMB_DIR = path.join(IMAGES_DIR, 'thumbs');

// Ensure directories
[DATA_DIR, IMAGES_DIR, THUMB_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

// Init data files
if (!fs.existsSync(PROJECTS_FILE)) fs.writeFileSync(PROJECTS_FILE, JSON.stringify([], null, 2));
if (!fs.existsSync(SETTINGS_FILE)) {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify({
        name: '室内设计师',
        title: '空间美学设计工作室',
        about: '专注于高端住宅与商业空间设计，用设计语言诠释生活美学。每一个空间都是一次独特的叙事。',
        contact: { email: '', phone: '', wechat: '', address: '' },
        theme: 'dark',
        password: 'admin123'
    }, null, 2));
}

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use('/images', express.static(IMAGES_DIR));
app.use(express.static(path.join(__dirname, 'public')));

// Multer config
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, IMAGES_DIR),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname) || '.jpg';
        cb(null, Date.now() + '-' + crypto.randomBytes(4).toString('hex') + ext);
    }
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 }, fileFilter: (req, file, cb) => {
    const allowed = ['.jpg','.jpeg','.png','.webp','.bmp'];
    cb(null, allowed.includes(path.extname(file.originalname).toLowerCase()));
}});

// ==================== AUTH ====================
function getSettings() { return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')); }
function checkAuth(req, res, next) {
    const pwd = req.headers['x-admin-password'] || req.query.pwd || '';
    if (pwd === getSettings().password) return next();
    res.status(401).json({ error: '密码错误' });
}

// ==================== API: Settings ====================
app.get('/api/settings', (req, res) => {
    const s = getSettings();
    delete s.password;
    res.json(s);
});

app.put('/api/settings', checkAuth, (req, res) => {
    const current = getSettings();
    const updated = { ...current, ...req.body, password: current.password };
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(updated, null, 2));
    res.json({ ok: true });
});

app.put('/api/settings/password', checkAuth, (req, res) => {
    const current = getSettings();
    current.password = req.body.newPassword || current.password;
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(current, null, 2));
    res.json({ ok: true });
});

app.post('/api/login', (req, res) => {
    if (req.body.password === getSettings().password) {
        res.json({ ok: true, token: getSettings().password });
    } else {
        res.status(401).json({ error: '密码错误' });
    }
});

// ==================== API: Projects ====================
app.get('/api/projects', (req, res) => {
    const projects = JSON.parse(fs.readFileSync(PROJECTS_FILE, 'utf8'));
    res.json(projects.sort((a, b) => (b.order || 0) - (a.order || 0)));
});

app.get('/api/projects/:id', (req, res) => {
    const projects = JSON.parse(fs.readFileSync(PROJECTS_FILE, 'utf8'));
    const p = projects.find(p => p.id === req.params.id);
    if (!p) return res.status(404).json({ error: '项目不存在' });
    res.json(p);
});

app.post('/api/projects', checkAuth, (req, res) => {
    const projects = JSON.parse(fs.readFileSync(PROJECTS_FILE, 'utf8'));
    const project = {
        id: crypto.randomBytes(8).toString('hex'),
        title: req.body.title || '未命名项目',
        category: req.body.category || '住宅设计',
        description: req.body.description || '',
        location: req.body.location || '',
        area: req.body.area || '',
        style: req.body.style || '',
        year: req.body.year || new Date().getFullYear(),
        featured: req.body.featured || false,
        order: projects.length + 1,
        images: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    projects.push(project);
    fs.writeFileSync(PROJECTS_FILE, JSON.stringify(projects, null, 2));
    res.json(project);
});

app.put('/api/projects/:id', checkAuth, (req, res) => {
    const projects = JSON.parse(fs.readFileSync(PROJECTS_FILE, 'utf8'));
    const idx = projects.findIndex(p => p.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: '项目不存在' });
    projects[idx] = { ...projects[idx], ...req.body, id: projects[idx].id, updatedAt: new Date().toISOString() };
    fs.writeFileSync(PROJECTS_FILE, JSON.stringify(projects, null, 2));
    res.json(projects[idx]);
});

app.delete('/api/projects/:id', checkAuth, (req, res) => {
    let projects = JSON.parse(fs.readFileSync(PROJECTS_FILE, 'utf8'));
    const p = projects.find(p => p.id === req.params.id);
    if (!p) return res.status(404).json({ error: '项目不存在' });
    // Delete images
    p.images.forEach(img => {
        const fp = path.join(IMAGES_DIR, img);
        const tp = path.join(THUMB_DIR, img);
        try { fs.unlinkSync(fp); } catch(e) {}
        try { fs.unlinkSync(tp); } catch(e) {}
    });
    projects = projects.filter(p => p.id !== req.params.id);
    fs.writeFileSync(PROJECTS_FILE, JSON.stringify(projects, null, 2));
    res.json({ ok: true });
});

// ==================== API: Upload ====================
app.post('/api/upload', checkAuth, upload.array('images', 20), async (req, res) => {
    const projectId = req.body.projectId;
    if (!projectId) return res.status(400).json({ error: '需要 projectId' });
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: '没有上传文件' });

    const projects = JSON.parse(fs.readFileSync(PROJECTS_FILE, 'utf8'));
    const idx = projects.findIndex(p => p.id === projectId);
    if (idx === -1) return res.status(404).json({ error: '项目不存在' });

    const uploaded = [];
    for (const file of req.files) {
        // Generate thumbnail
        const thumbName = 'thumb-' + file.filename;
        try {
            await sharp(file.path)
                .resize(800, 600, { fit: 'cover', position: 'center' })
                .jpeg({ quality: 80 })
                .toFile(path.join(THUMB_DIR, file.filename));
        } catch(e) {
            // If sharp fails, just copy
            fs.copyFileSync(file.path, path.join(THUMB_DIR, file.filename));
        }
        uploaded.push(file.filename);
    }

    projects[idx].images = [...projects[idx].images, ...uploaded];
    projects[idx].updatedAt = new Date().toISOString();
    fs.writeFileSync(PROJECTS_FILE, JSON.stringify(projects, null, 2));
    res.json({ ok: true, images: uploaded, project: projects[idx] });
});

app.delete('/api/projects/:id/images/:filename', checkAuth, (req, res) => {
    const projects = JSON.parse(fs.readFileSync(PROJECTS_FILE, 'utf8'));
    const idx = projects.findIndex(p => p.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: '项目不存在' });
    projects[idx].images = projects[idx].images.filter(f => f !== req.params.filename);
    projects[idx].updatedAt = new Date().toISOString();
    fs.writeFileSync(PROJECTS_FILE, JSON.stringify(projects, null, 2));
    try { fs.unlinkSync(path.join(IMAGES_DIR, req.params.filename)); } catch(e) {}
    try { fs.unlinkSync(path.join(THUMB_DIR, req.params.filename)); } catch(e) {}
    res.json({ ok: true });
});

// ==================== Serve SPA ====================
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`\n🎨 设计师作品集网站已启动！`);
    console.log(`   前台页面: http://localhost:${PORT}`);
    console.log(`   管理后台: http://localhost:${PORT}#admin`);
    console.log(`   默认密码: admin123`);
    console.log(`   请在管理后台修改密码！\n`);
});
