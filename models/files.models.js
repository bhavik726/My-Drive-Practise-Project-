const mongoose = require('mongoose');

const fileSchema = new mongoose.Schema({
    path: {
        type: String,
        required: [true, 'File path in Supabase is required']
    },
    publicUrl: {
        type: String,
        required: [true, 'Public URL is required']
    },
    originalname: {
        type: String,
        required: [true, 'Original file name is required']
    },
    mimetype: {
        type: String,
        required: [true, 'File mime type is required']
    },
    size: {
        type: Number,
        required: [true, 'File size is required']
    },
    user: {
        type: String,  // Changed to String to support both ObjectId and 'anonymous'
        required: [true, 'Associated user is required']
    }
}, {
    timestamps: true  // Add timestamps
});

const File = mongoose.model('File', fileSchema);
module.exports = File;