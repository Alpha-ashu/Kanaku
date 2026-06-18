const fs = require('fs');
const path = require('path');

const walk = function (dir, done) {
  let results = [];
  fs.readdir(dir, function (err, list) {
    if (err) return done(err);
    let pending = list.length;
    if (!pending) return done(null, results);
    list.forEach(function (file) {
      file = path.resolve(dir, file);
      fs.stat(file, function (err, stat) {
        if (stat && stat.isDirectory()) {
          walk(file, function (err, res) {
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

const replacements = {
  '•': '-',
  '—': '-',
  '–': '-',
  '’': "'",
  '‘': "'",
  '“': '"',
  '”': '"',
  '…': '...',
  '✓': 'x',
  '✕': 'x',
  '₹': 'INR',
  '': 'EUR',
  '£': 'GBP',
};

walk('./src', function (err, results) {
  if (err) throw err;

  const files = results.filter(f => f.endsWith('.tsx') || f.endsWith('.ts'));

  files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    let newContent = '';
    let changed = false;

    for (let i = 0; i < content.length; i++) {
      const char = content[i];
      const code = char.charCodeAt(0);

      if (code <= 127) {
        newContent += char;
      } else {
        changed = true;
        if (replacements[char]) {
          newContent += replacements[char];
        } else {
          // If it's a surrogate pair, skip the next character too
          if (code >= 0xD800 && code <= 0xDBFF) {
            i++; // skip low surrogate
          }
        }
      }
    }

    if (changed && content !== newContent) {
      fs.writeFileSync(file, newContent, 'utf8');
      console.log('Cleaned:', file);
    }
  });
});
