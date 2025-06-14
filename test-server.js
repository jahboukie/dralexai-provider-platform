console.log('='.repeat(80));
console.log('🧪 TEST SERVER - DR. ALEX AI PLATFORM');
console.log('='.repeat(80));
console.log('📁 Current directory:', __dirname);
console.log('📄 Current file:', __filename);
console.log('🔍 Process working directory:', process.cwd());
console.log('='.repeat(80));

const express = require('express');
const app = express();
const PORT = 8888;

app.get('/', (req, res) => {
  res.json({
    message: 'This is the Dr. Alex AI test server',
    directory: __dirname,
    file: __filename,
    cwd: process.cwd()
  });
});

app.listen(PORT, () => {
  console.log('🚀 TEST SERVER RUNNING ON PORT', PORT);
  console.log('✅ This confirms we are in the Dr. Alex AI directory');
  console.log('='.repeat(80));
});
