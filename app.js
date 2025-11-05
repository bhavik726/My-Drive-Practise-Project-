const express = require('express')
const userRouter = require('./routes/user.routes');
const dotenv = require('dotenv');
dotenv.config();
const cookieParser = require('cookie-parser');
const indexRouter = require('./routes/index.routes');

const connectDB = require('./config/db');
connectDB();
const app = express()

// View engine setup
app.set('view engine', 'ejs');

// Middleware setup
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Static files setup (if you have any)
app.use(express.static('public'));

// Routes setup
app.use('/', indexRouter);
app.use('/user', userRouter);

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err && err.stack ? err.stack : err);

    // If the client expects JSON (AJAX / fetch), return detailed JSON
    const wantsJson = req.xhr || (req.headers.accept && req.headers.accept.indexOf('application/json') !== -1);
    if (wantsJson) {
        return res.status(500).json({
            error: err.message || 'Internal Server Error',
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
        });
    }

    // Otherwise render a simple error page if views are available
    res.status(500);
    if (req.accepts('html') && app.get('view engine')) {
        return res.render('error', { message: err.message || 'Something broke!', stack: process.env.NODE_ENV === 'development' ? err.stack : '' });
    }

    // Fallback plain text
    return res.type('txt').send(`Something broke! ${err.message || ''}`);
});

// Start server
app.listen(3000, () => {
    console.log('Server is running on http://localhost:3000');
});
