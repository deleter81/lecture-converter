const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { processLecture } = require('./lecture-converter');

const app = express();
const PORT = 3000;

// Настройка multer для загрузки файлов
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
        const allowedTypes = /mp3|wav|m4a|ogg|flac|webm|mpeg|audio/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());

        // Принимаем файл если расширение правильное ИЛИ это аудио
        if (extname || file.mimetype.startsWith('audio/')) {
            return cb(null, true);
        }
        cb(new Error('Неподдерживаемый формат файла'));
    },
    limits: { fileSize: 500 * 1024 * 1024 }
});

// Middleware
app.use(express.static('public'));
app.use(express.json());

// Главная страница
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API: Загрузка и обработка файла
app.post('/api/convert', upload.single('audio'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Файл не загружен' });
        }

        console.log(`📁 Получен файл: ${req.file.originalname}`);

        res.json({
            message: 'Обработка началась',
            jobId: req.file.filename,
            status: 'processing'
        });

        const audioPath = req.file.path;

        processLecture(audioPath)
            .then(() => {
                console.log(`✅ Обработка завершена: ${req.file.originalname}`);
            })
            .catch((error) => {
                console.error(`❌ Ошибка обработки: ${error.message}`);
            })
            .finally(async () => {
                try {
                    await fs.unlink(audioPath);
                } catch (err) {
                    console.error('Ошибка удаления файла:', err);
                }
            });

    } catch (error) {
        console.error('Ошибка:', error);
        res.status(500).json({ error: error.message });
    }
});

// API: Список готовых конспектов
app.get('/api/results', async (req, res) => {
    try {
        const outputDir = './output';
        await fs.mkdir(outputDir, { recursive: true });
        const files = await fs.readdir(outputDir);

        const results = await Promise.all(
            files
                .filter(f => f.endsWith('.txt'))
                .map(async (filename) => {
                    const filePath = path.join(outputDir, filename);
                    const stats = await fs.stat(filePath);
                    return {
                        filename,
                        size: stats.size,
                        created: stats.birthtime,
                        downloadUrl: `/api/download/${filename}`
                    };
                })
        );

        results.sort((a, b) => b.created - a.created);
        res.json(results);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// API: Скачать конспект
app.get('/api/download/:filename', async (req, res) => {
    try {
        const filename = req.params.filename;
        const filePath = path.join(__dirname, 'output', filename);

        await fs.access(filePath);
        res.download(filePath, filename);
    } catch (error) {
        res.status(404).json({ error: 'Файл не найден' });
    }
});

// Запуск сервера
app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════╗
║                                                       ║
║   🎓 Lecture Converter Web Interface                 ║
║                                                       ║
║   Сервер запущен на: http://localhost:${PORT}        ║
║                                                       ║
║   Откройте в браузере для использования              ║
║                                                       ║
╚═══════════════════════════════════════════════════════╝
  `);
});