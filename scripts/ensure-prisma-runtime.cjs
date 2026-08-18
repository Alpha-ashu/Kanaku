const fs = require('fs');
const path = require('path');
const runtimeDir = path.resolve(__dirname, '../backend/generated/prisma/runtime');
fs.mkdirSync(runtimeDir, { recursive: true });
console.log('Ensured Prisma runtime directory exists at:', runtimeDir);
