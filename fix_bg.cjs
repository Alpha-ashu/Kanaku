const fs = require('fs');
const path = require('path');

function walk(dir) {
  fs.readdirSync(dir).forEach(f => {
    let p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) {
      walk(p);
    } else if (p.endsWith('.tsx')) {
      let c = fs.readFileSync(p, 'utf8');
      let o = c;
      
      // The issue was escaping in the command line. This string replacement will work.
      c = c.replace(/bg-\[#F8FAFC\]/g, 'bg-white');
      c = c.replace(/flex flex-col h-screen bg-white overflow-hidden/g, 'flex flex-col min-h-screen bg-white');
      
      if (c !== o) {
        fs.writeFileSync(p, c);
        console.log('Updated ' + p);
      }
    }
  });
}

walk('frontend/src/app/components');
