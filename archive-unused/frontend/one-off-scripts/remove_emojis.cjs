const fs = require('fs');
const path = require('path');

const walk = function(dir, done) {
  let results = [];
  fs.readdir(dir, function(err, list) {
    if (err) return done(err);
    let pending = list.length;
    if (!pending) return done(null, results);
    list.forEach(function(file) {
      file = path.resolve(dir, file);
      fs.stat(file, function(err, stat) {
        if (stat && stat.isDirectory()) {
          walk(file, function(err, res) {
            results = results.concat(res);
            if (!--pending) done(null, results);
          });
        } else {
          results.push(file);
          if (!--pending) done(null, results);
        }
      });
    });
  });
};

const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2300}-\u{23FF}\u{2B50}\u{200D}\u{FE0F}]/gu;

const replaceMap = {
  '•': '-',
  '₹': 'INR', // if hardcoded
  '—': '-',
  '–': '-'
};

walk('./src', function(err, results) {
  if (err) throw err;
  
  const files = results.filter(f => f.endsWith('.tsx') || f.endsWith('.ts'));
  
  files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    let newContent = content;
    
    // Remove emojis
    newContent = newContent.replace(emojiRegex, '');
    
    // Replace mapped symbols
    for (const [key, value] of Object.entries(replaceMap)) {
      newContent = newContent.split(key).join(value);
    }

    if (content !== newContent) {
      fs.writeFileSync(file, newContent, 'utf8');
      console.log('Cleaned:', file);
    }
  });
});
