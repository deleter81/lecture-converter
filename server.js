const express = require('express');
const multer = requiere('multer');
const path = require('path');
const fs = require('fs').promises;
const { processLecture } = require('./lecture-converter');

const app = express();
const PORT = 3000;


//настройка multer для загрузки файлов
const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        const uploadDir = './uploads';
        await fs.mkdir(uploadDir, { recursive: true });
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}-${file.originalname}`;
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        const alloweTypes = /mp3|wav|m4a|ogg|flac|webm /;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);

        if (extname && mimetype) {
            returncb(null, true);
        }
        cb(new Error('Неподдерживаемый формат файла'));
    },
    limits: { fileSize: 500 * 1024 * 1024 }
});


//Middleware