// config/multer.config.js
const multer = require('multer')
const { supabase, bucket } = require('./supabase.config')

// Note: dotenv is loaded in supabase.config. We reuse the singleton supabase client
// exported from there so we don't risk creating multiple clients with differing config.

// Memory storage for multer (keeps file in memory as a buffer)
const storage = multer.memoryStorage()

// Multer middleware
const upload = multer({ 
    storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    }
})

// Function to upload file buffer to Supabase Storage
async function uploadToSupabase(file) {
  if (!file) throw new Error('No file provided');
  const BUCKET = bucket || process.env.SUPABASE_BUCKET || 'uploads';
  try {
    // Clean filename and ensure it's URL-safe
    const safeFileName = encodeURIComponent(file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_'));
    const fileName = `${Date.now()}_${safeFileName}`;  // Removed 'uploads/' prefix

    console.log('Attempting to upload:', fileName);
    console.log('File type:', file.mimetype);
    console.log('File size:', file.size);

    const { data, error } = await supabase.storage
      .from(BUCKET)
      .upload(fileName, file.buffer, {
        contentType: file.mimetype,
        upsert: false  // Changed to false to test
      });

    if (error) {
      console.error('Supabase upload error:', {
        message: error.message,
        details: error.details,
        statusCode: error.statusCode,
        name: error.name
      });
      throw new Error(`Upload failed: ${error.message} (${error.statusCode})`);
    }

    console.log('Upload successful:', fileName);
    // Return both the fileName (for storage path) and the public URL
    return {
      fileName,
      publicUrl: supabase.storage.from(BUCKET).getPublicUrl(fileName).data.publicUrl
    };
  } catch (err) {
    console.error('Upload to Supabase failed:', err);
    throw err;
  }
}

module.exports = { upload, uploadToSupabase }
