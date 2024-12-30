const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { Movie, Scene } = require('json2video-sdk');
const cloudinary = require('cloudinary').v2;
const app = express();

// Configure Cloudinary
cloudinary.config({ 
  cloud_name: 'YOU_CLOUD_NAME', 
  api_key: 'YOUR_API_KEY', 
  api_secret: 'YOUR_API_SECRET_KEY' 
});

// Configure multer
const storage = multer.diskStorage({
    destination: './uploads/',
    filename: function(req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 100 * 1024 * 1024, // 100MB limit
    },
    fileFilter: function(req, file, cb) {
        if(file.mimetype !== 'video/mp4') {
            return cb(new Error('Only MP4 files are allowed!'));
        }
        cb(null, true);
    }
});

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Function to upload to Cloudinary
async function uploadToCloudinary(filePath) {
    try {
        console.log('Uploading to Cloudinary...');
        const result = await cloudinary.uploader.upload(filePath, {
            resource_type: 'video',
            timeout: 120000 // 2 minutes timeout
        });
        console.log('Upload successful:', result.secure_url);
        return result.secure_url;
    } catch (error) {
        console.error('Cloudinary upload failed:', error);
        throw error;
    }
}

async function createVideo(filePath) {
    console.log("Processing video from path:", filePath);
    
    // Get public URL from Cloudinary
    const publicUrl = await uploadToCloudinary(filePath);
    console.log("Video available at:", publicUrl);
    
    const movie = new Movie();
    movie.setAPIKey('YOUR_JSON2SK_API_KEY');
    movie.set("width", 1080);
    movie.set("height", 1920);
    movie.set("quality", "low");
    movie.set("resolution", "custom");

    const scene1 = new Scene();
    scene1.addElement({
        "type": "video",
        "src": publicUrl
    });
    movie.addScene(scene1);
    
    console.log("Starting render...");
    try {
        const render = await movie.render();
        console.log("Render started:", render);
        
        const result = await movie.waitToFinish();
        console.log("Render completed, result:", result);
        return result;
    } catch (error) {
        console.error("Render error:", error);
        throw error;
    } finally {
        // Optionally cleanup the temporary file
        try {
            fs.unlinkSync(filePath);
        } catch (err) {
            console.error('Error cleaning up file:', err);
        }
    }
}

app.post('/upload', upload.single('video'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    try {
        const filePath = req.file.path;
        console.log('File uploaded locally to:', filePath);
        console.log('File size:', req.file.size, 'bytes');
        
        const result = await createVideo(filePath);
        console.log('Processing result:', result);
        
        if (!result || !result.movie || result.movie.success === false) {
            throw new Error(result?.movie?.message || 'Video processing failed');
        }
        
        res.json({
            message: 'Video processed successfully',
            processed_video: result.movie.url
        });
    } catch (error) {
        console.error('Error processing video:', error);
        res.status(500).json({
            error: 'Error processing video',
            details: error.message
        });
    }
});

app.use((error, req, res, next) => {
    console.error('Global error:', error);
    res.status(500).json({
        error: 'Server error',
        details: error.message
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Upload limit set to ${upload.limits.fileSize / (1024 * 1024)}MB`);
});