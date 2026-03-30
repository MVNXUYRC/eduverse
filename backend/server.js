const express = require('express');
const cors = require('cors');
const path = require('path');
const careersRouter = require('./routes/careers');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static frontend files
app.use(express.static(path.join(__dirname, '../frontend')));

// API Routes
app.use('/api/careers', careersRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString(), version: '1.0.0' });
});

// SPA fallback - serve index.html for all non-API routes
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
  }
});

app.listen(PORT, () => {
  console.log(`\n🎓 EduVerse API running on http://localhost:${PORT}`);
  console.log(`📚 Careers endpoint: http://localhost:${PORT}/api/careers`);
  console.log(`❤️  Health check: http://localhost:${PORT}/api/health\n`);
});

module.exports = app;
