const fs = require('fs');
const path = require('path');

const SENSITIVE_PATTERNS = [
  { name: 'IPv4 Address', pattern: /\b(?!(?:127\.0\.0\.1|0\.0\.0\.0))\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g },
  { name: 'Database Password', pattern: /DB_PASSWORD=([^\s]+)/gi },
  { name: 'JWT Secret', pattern: /JWT_SECRET=([^\s]+)/gi },
  { name: 'API Key', pattern: /API_KEY=([^\s]+)/gi },
  { name: 'Generic Password', pattern: /password:\s*['"][^'"]+['"]/gi }
];

const IGNORE_DIRS = ['node_modules', 'dist', '.git'];

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const findings = [];

  SENSITIVE_PATTERNS.forEach(({ name, pattern }) => {
    const matches = content.match(pattern);
    if (matches) {
      findings.push({ name, count: matches.length });
    }
  });

  return findings;
}

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    const dirPath = path.join(dir, f);
    if (IGNORE_DIRS.some(ignore => dirPath.includes(ignore))) return;
    
    const isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walkDir(dirPath, callback) : callback(dirPath);
  });
}

console.log('--- 启动敏感信息安全扫描 ---');
let totalFindings = 0;

walkDir(path.join(__dirname, '..'), (filePath) => {
  // 只扫描代码和配置文件
  if (!/\.(ts|tsx|js|jsx|json|env|md)$/.test(filePath)) return;
  if (filePath.includes('security-scan.js')) return;

  const findings = scanFile(filePath);
  if (findings.length > 0) {
    console.warn(`[!] 发现潜在敏感信息: ${path.relative(path.join(__dirname, '..'), filePath)}`);
    findings.forEach(f => {
      console.warn(`    - ${f.name}: 发现 ${f.count} 处`);
      totalFindings += f.count;
    });
  }
});

if (totalFindings === 0) {
  console.log('--- 扫描完成：未发现明显敏感信息 ---');
  process.exit(0);
} else {
  console.error(`--- 扫描完成：发现 ${totalFindings} 个潜在安全风险，请及时清理！ ---`);
  // 在 CI/CD 中可以设为 exit 1
  process.exit(0); 
}
