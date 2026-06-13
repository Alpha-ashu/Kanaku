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

  // Replace background colors but only if they are not part of hover/focus states
  content = content.replace(/(?<!hover:|focus:|active:|group-hover:|dark:)\bbg-gray-50\b/g, 'bg-white');
  content = content.replace(/(?<!hover:|focus:|active:|group-hover:|dark:)\bbg-slate-50\/50\b/g, 'bg-white');
  content = content.replace(/(?<!hover:|focus:|active:|group-hover:|dark:)\bbg-\[\#F8FAFC\]\b/g, 'bg-white');

  // Specific main wrapper cleanup
  content = content.replace(/flex flex-col h-auto lg:h-screen bg-transparent lg:overflow-hidden/g, 'flex flex-col min-h-screen bg-transparent');
  content = content.replace(/flex flex-col h-screen bg-transparent overflow-hidden/g, 'flex flex-col min-h-screen bg-transparent');
  content = content.replace(/flex flex-col min-h-screen lg:h-screen bg-transparent/g, 'flex flex-col min-h-screen bg-transparent');
  content = content.replace(/lg:overflow-hidden lg:overflow-y-auto/g, '');
  
  // Also clean up lg:overflow-hidden in main layout structures
  content = content.replace(/h-auto lg:h-screen/g, 'min-h-screen');
  content = content.replace(/lg:h-screen/g, 'min-h-screen');
  
  // Try to remove overflow-hidden from min-h-screen wrappers
  content = content.replace(/(min-h-screen[^>]*?)lg:overflow-hidden/g, '$1');
  content = content.replace(/(min-h-screen[^>]*?)overflow-hidden/g, '$1');
  
  // Fix double min-h-screen
  content = content.replace(/min-h-screen min-h-screen/g, 'min-h-screen');

  // Fix any double spaces inside classNames
  content = content.replace(/  +/g, ' ');
  content = content.replace(/className=" /g, 'className="');
  content = content.replace(/ "/g, '"');

  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated: ${filePath}`);
  }
});
