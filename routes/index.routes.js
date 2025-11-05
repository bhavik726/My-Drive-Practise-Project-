const express = require('express');
const router = express.Router();
const FileModel = require('../models/files.models');  // Fixed model path
const authMiddleware = require('../middlewares/authe');  // Fixed middleware path
const { upload, uploadToSupabase } = require('../config/multer.config');
const { supabase, bucket } = require('../config/supabase.config');
// Root route redirects to home
router.get('/', (req, res) => {
    res.redirect('/home');
});

// Home page route - list recent files (public)
router.get('/home', async (req, res) => {
    try {
        // First, get all files from Supabase bucket
        const { data: bucketFiles, error: bucketError } = await supabase.storage
            .from(bucket)
            .list();

        if (bucketError) {
            console.error('Error fetching bucket files:', bucketError);
            throw bucketError;
        }

        // Create a Set of valid filenames in the bucket for quick lookup
        const validFiles = new Set(bucketFiles.map(f => f.name));

        // Get files from MongoDB
        const files = await FileModel.find({})
            .select('originalname path publicUrl createdAt user size')
            .sort({ createdAt: -1 })
            .lean();

        // Filter and clean up files
        const existingFiles = [];
        const deletionPromises = [];

        for (const file of files) {
            // Extract the filename from the path
            const fileName = file.path;

            if (validFiles.has(fileName)) {
                // File exists in Supabase, keep it
                existingFiles.push({
                    ...file,
                    createdAt: file.createdAt.toLocaleString(),
                    size: file.size || 'N/A',
                    downloadUrl: `/download/${file._id}`
                });
            } else {
                // File doesn't exist in Supabase, queue it for removal from MongoDB
                console.log(`Removing non-existent file from DB: ${fileName}`);
                deletionPromises.push(FileModel.findByIdAndDelete(file._id));
            }
        }

        // Execute all deletion promises in parallel
        if (deletionPromises.length > 0) {
            await Promise.all(deletionPromises);
            console.log(`Cleaned up ${deletionPromises.length} deleted files from database`);
        }

        return res.render('home', {
            files: existingFiles,
            error: req.query.error
        });
    } catch (err) {
        console.error('Error loading home page:', err);
        return res.status(500).render('error', { 
            message: 'Failed to load home', 
            stack: process.env.NODE_ENV === 'development' ? err.stack : '' 
        });
    }
});

// File upload route
router.post('/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file provided' });
        }

        // Validate file type if needed
        const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf', 'text/plain'];
        if (!allowedTypes.includes(req.file.mimetype)) {
            return res.status(400).json({ 
                error: 'Invalid file type',
                message: 'Only JPEG, PNG, PDF and TXT files are allowed'
            });
        }

        // Upload to Supabase first
        console.log('Uploading file to Supabase:', req.file.originalname);
        const { fileName, publicUrl } = await uploadToSupabase(req.file);
        console.log('Upload successful. File name:', fileName);
        console.log('Public URL:', publicUrl);

        // Create file record in MongoDB
        console.log('Creating MongoDB record...');
        const newFile = await FileModel.create({
            path: fileName, // Store just the filename for Supabase operations
            publicUrl: publicUrl, // Store the public URL separately
            originalname: req.file.originalname,
            mimetype: req.file.mimetype,
            size: req.file.size,
            user: req.user?.userId || 'anonymous', // Make user optional for now
            createdAt: new Date()
        });

        res.status(200).json({
            message: 'File uploaded successfully',
            file: {
                url: publicUrl,
                name: req.file.originalname,
                id: newFile._id,
                size: req.file.size,
                type: req.file.mimetype
            }
        });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({
            error: 'File upload failed',
            details: error.message
        });
    }
});


router.get('/download/:fileId', authMiddleware, async (req, res) => {
    try {
        const loguserID = req.user.userId;
        const fileId = req.params.fileId;

        // 1. Find the file record
        const file = await FileModel.findById(fileId)
            .select('path originalname mimetype user');

        if (!file) {
            return res.status(404).json({ message: 'File not found' });
        }

        // 2. Check access - allow if file is anonymous or belongs to user
        if (file.user !== 'anonymous' && file.user !== loguserID) {
            return res.status(403).json({ message: 'Access denied' });
        }

        if (!file) {
            return res.status(404).json({ message: 'File not found or access denied' });
        }

        // 2. Generate a Supabase Signed URL
        // The file.path contains the full path to the file in the Supabase bucket
        // e.g., 'user-uploads/12345-my-image.png'

        // Set an expiration time for the signed URL (e.g., 60 seconds)
        const EXPIRATION_SECONDS = 60; 

        const { data, error } = await supabase.storage
            .from(bucket)
            .createSignedUrl(file.path, EXPIRATION_SECONDS);

        if (error) {
            console.error('Supabase Signed URL error:', error);
            return res.status(500).json({ message: 'Failed to generate download link', details: error.message });
        }

        const signedUrl = data.signedUrl;

        // Set security headers
        res.set({
            'Content-Security-Policy': "default-src 'self'",
            'X-Content-Type-Options': 'nosniff',
            'Cache-Control': 'private, no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
        });

        // 3. Redirect the user to the signed URL for download
        res.redirect(signedUrl);
        
    } catch (error) {
        console.error('Download route error:', error);
        if (error.message.includes('not found')) {
            return res.status(404).json({ message: 'File not found' });
        }
        if (error.message.includes('access denied')) {
            return res.status(403).json({ message: 'Access denied' });
        }
        res.status(500).json({ 
            message: 'Server error during download process', 
            details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});

// Delete file route - removes from both Supabase and MongoDB
router.delete('/files/:fileId', authMiddleware, async (req, res) => {
    try {
        const fileId = req.params.fileId;
        
        // Find the file in MongoDB first
        const file = await FileModel.findById(fileId);
        if (!file) {
            return res.status(404).json({ message: 'File not found' });
        }

        // Check if user has permission (owner or anonymous file)
        if (file.user !== 'anonymous' && file.user !== req.user.userId) {
            return res.status(403).json({ message: 'Access denied' });
        }

        // Delete from Supabase first
        const { error: supabaseError } = await supabase.storage
            .from(bucket)
            .remove([file.path]);

        if (supabaseError) {
            console.error('Supabase delete error:', supabaseError);
            return res.status(500).json({ 
                message: 'Failed to delete file from storage',
                error: supabaseError.message
            });
        }

        // Then delete from MongoDB
        await FileModel.findByIdAndDelete(fileId);

        res.json({ message: 'File deleted successfully' });
    } catch (error) {
        console.error('Delete error:', error);
        res.status(500).json({
            message: 'Failed to delete file',
            error: error.message
        });
    }
});

module.exports = router;