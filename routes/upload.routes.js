// routes/upload.routes.js
const express = require('express')
const router = express.Router()
const { upload, uploadToSupabase } = require('../config/multer.config')

router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    console.log('Received file:', req.file.originalname, 'Size:', req.file.size);
    
    const publicUrl = await uploadToSupabase(req.file);
    console.log('Uploaded to Supabase, URL:', publicUrl);
    
    res.status(200).json({
      message: 'File uploaded successfully!',
      url: publicUrl,
      fileName: req.file.originalname,
      size: req.file.size
    });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ 
      error: err.message,
      details: err.stack
    });
  }
})

module.exports = router
