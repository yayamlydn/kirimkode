// scripts/setup.js
// One-time setup script

require('dotenv').config();
const fs = require('fs');
const path = require('path');

console.log('\n🚀 Setting up Business Verification Bot...\n');

// Create required directories
const dirs = ['data', 'logs', 'public/css', 'public/js'];
dirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`✅ Created directory: ${dir}`);
  }
});

// Copy .env.example to .env if not exists
if (!fs.existsSync('.env') && fs.existsSync('.env.example')) {
  fs.copyFileSync('.env.example', '.env');
  console.log('✅ Created .env from .env.example');
  console.log('⚠️  Please edit .env with your actual values!\n');
}

// Initialize database
const { initializeDatabase } = require('../src/database/schema');
initializeDatabase();
console.log('✅ Database initialized');

console.log('\n✅ Setup complete!\n');
console.log('Next steps:');
console.log('1. Edit .env with your BOT_TOKEN and other settings');
console.log('2. Run: npm start\n');
