// Build static portfolio site for GitHub Pages
const fs = require('fs');
const path = require('path');

console.log('🔨 生成静态网站...');

// Read data files
const projects = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'projects.json'), 'utf8'));
const settings = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'settings.json'), 'utf8'));
delete settings.password;

// Read template
let html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');

// Replace API calls with embedded data
// Replace: const API = ''; → embed data directly
const embedScript = `
// ===== EMBEDDED DATA (Generated for GitHub Pages) =====
const EMBEDDED_PROJECTS = ${JSON.stringify(projects, null, 0)};
const EMBEDDED_SETTINGS = ${JSON.stringify(settings, null, 0)};
const IS_STATIC = true;

// Override api() to use embedded data
async function api(url, opts = {}) {
    if (url === '/api/settings') return EMBEDDED_SETTINGS;
    if (url === '/api/projects') return EMBEDDED_PROJECTS;
    if (url.startsWith('/api/projects/')) {
        const id = url.split('/').pop();
        const p = EMBEDDED_PROJECTS.find(p => p.id === id);
        if (!p) throw new Error('项目不存在');
        return p;
    }
    return {};
}

// Override upload functions for static mode
async function uploadImages() { throw new Error('静态模式下不可上传，请使用本地服务器'); }
async function deleteImage() { throw new Error('静态模式下不可删除，请使用本地服务器'); }

// Disable admin
function showAdmin() {
    window.location.hash = '';
    toast('管理后台仅在本地服务器可用');
}
`;

// Replace the API constant and init
html = html.replace("const API = '';", embedScript);

// Replace isAdmin checks in API calls for static mode
html = html.replace("if (isAdmin && localStorage.getItem('admin_pwd')) headers['x-admin-password'] = localStorage.getItem('admin_pwd');", 'if (IS_STATIC) return api(url);');

// Fix hash check for admin
html = html.replace(
    "if (window.location.hash === '#admin') {",
    "if (window.location.hash === '#admin') { if (IS_STATIC) { showAdmin(); return; }"
);

// Write output
const outDir = path.join(__dirname, 'docs');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

fs.writeFileSync(path.join(outDir, 'index.html'), html);
console.log('✅ docs/index.html 已生成');

// Copy images
const imagesDir = path.join(__dirname, 'data', 'images');
const outImagesDir = path.join(outDir, 'images');
if (fs.existsSync(imagesDir)) {
    if (!fs.existsSync(outImagesDir)) fs.mkdirSync(outImagesDir, { recursive: true });
    const files = fs.readdirSync(imagesDir).filter(f => {
        const stat = fs.statSync(path.join(imagesDir, f));
        return !f.startsWith('.') && stat.isFile();
    });
    files.forEach(f => {
        fs.copyFileSync(path.join(imagesDir, f), path.join(outImagesDir, f));
    });
    console.log(`✅ ${files.length} 张图片已复制`);
}

console.log('\n🎉 静态网站生成完成！');
console.log('   输出目录: docs/');
console.log('   部署步骤: git push → GitHub Pages 自动发布');
