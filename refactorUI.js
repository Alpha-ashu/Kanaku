import fs from 'fs';
import path from 'path';

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walkDir(dirPath, callback) : callback(dirPath);
  });
}

const targetDir = path.join(process.cwd(), 'frontend', 'src', 'app', 'components');

walkDir(targetDir, (filePath) => {
  if (!filePath.endsWith('.tsx')) return;
  
  let content = fs.readFileSync(filePath, 'utf8');
  let originalContent = content;

  // 1. Remove background colors (replace with bg-white or transparent as appropriate, or just strip)
  content = content.replace(/\bbg-gray-50\b/g, 'bg-white');
  content = content.replace(/\bbg-slate-50\/50\b/g, 'bg-white');
  content = content.replace(/\bbg-\[\#F8FAFC\]\b/g, 'bg-white');
  content = content.replace(/\bbg-gray-100\b/g, ''); // maybe too aggressive? Let's keep it minimal

  // 2. Remove problematic layout constraints requested by user for the MAIN page wrappers
  // We'll target div classNames that look like page wrappers.
  
  // Replace `flex flex-col h-auto lg:h-screen bg-transparent lg:overflow-hidden`
  content = content.replace(/flex flex-col h-auto lg:h-screen bg-transparent lg:overflow-hidden/g, 'flex flex-col min-h-screen bg-transparent');
  content = content.replace(/flex flex-col h-screen bg-transparent overflow-hidden/g, 'flex flex-col min-h-screen bg-transparent');
  content = content.replace(/flex flex-col min-h-screen lg:h-screen bg-transparent/g, 'flex flex-col min-h-screen bg-transparent');
  
  // Replace `lg:overflow-hidden lg:overflow-y-auto`
  content = content.replace(/lg:overflow-hidden lg:overflow-y-auto/g, '');
  
  // Also fix individual occurences in these wrappers
  content = content.replace(/h-auto lg:h-screen/g, 'min-h-screen');
  content = content.replace(/lg:overflow-hidden/g, '');
  
  // Clean up any double spaces left behind
  content = content.replace(/  +/g, ' ');
  content = content.replace(/className=" /g, 'className="');
  content = content.replace(/ "/g, '"');

  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated: ${filePath}`);
  }
});
