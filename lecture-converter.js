#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');

// Конфигурация
const CONFIG = {
    whisperModel: 'base',
    ollamaModel: 'llama3.2',
    tempDir: './temp',
    outputDir: './output'
};

// Утилита для выполнения команд
function execCommand(command, args) {
    return new Promise((resolve, reject) => {
        console.log('🔧 Запуск команды:', command, args.join(' '));

        const process = spawn(command, args);
        let stdout = '';
        let stderr = '';

        process.stdout.on('data', (data) => {
            const text = data.toString();
            stdout += text;
            console.log('📤 stdout:', text);
        });

        process.stderr.on('data', (data) => {
            const text = data.toString();
            stderr += text;
            console.log('📤 stderr:', text);
        });

        process.on('close', (code) => {
            console.log('🏁 Код выхода:', code);

            if (code === 0) {
                resolve(stdout);
            } else {
                console.error('❌ stderr полностью:', stderr);
                reject(new Error(`Команда завершилась с кодом ${code}: ${stderr}`));
            }
        });

        process.on('error', (error) => {
            console.error('❌ Ошибка запуска:', error);
            reject(error);
        });
    });
}

// Очистка временной папки
async function cleanTempDir() {
    try {
        console.log('🧹 Очищаю папку temp...');
        const files = await fs.readdir(CONFIG.tempDir);

        for (const file of files) {
            const filePath = path.join(CONFIG.tempDir, file);
            await fs.unlink(filePath);
            console.log('🗑️  Удалён:', file);
        }

        console.log('✅ Папка temp очищена');
    } catch (error) {
        console.log('⚠️  Ошибка очистки temp (возможно папка пуста):', error.message);
    }
}

// Конвертация аудио в WAV
async function convertToWav(inputPath) {
    console.log('🔄 Konvertiere Audio in WAV-Format...');
    const outputPath = path.join(CONFIG.tempDir, 'audio.wav');

    try {
        await execCommand('ffmpeg', [
            '-i', inputPath,
            '-ar', '16000',
            '-ac', '1',
            '-c:a', 'pcm_s16le',
            '-y',
            outputPath
        ]);
        console.log('✅ Konvertierung abgeschlossen');
        return outputPath;
    } catch (error) {
        throw new Error(`Konvertierungsfehler: ${error.message}`);
    }
}

// Транскрибация через Whisper
async function transcribeAudio(audioPath) {
    console.log('🎤 Transkribiere Audio mit Whisper...');
    console.log('📂 Входной файл:', audioPath);

    try {
        const whisperPath = path.join(process.env.HOME, 'whisper.cpp/build/bin/whisper-cli');
        const modelPath = path.join(process.env.HOME, 'whisper.cpp/models/ggml-base.bin');

        console.log('🔧 Whisper путь:', whisperPath);
        console.log('🔧 Модель путь:', modelPath);

        // Проверяем что файлы существуют
        await fs.access(whisperPath);
        await fs.access(modelPath);
        await fs.access(audioPath);

        console.log('✅ Все файлы найдены, запускаем Whisper...');

        const outputFile = path.join(CONFIG.tempDir, 'transcript');

        await execCommand(whisperPath, [
            '-m', modelPath,
            '-f', audioPath,
            '-l', 'de',
            '-of', outputFile,
            '-otxt'
        ]);

        console.log('📋 Whisper завершил работу');

        // Ждём секунду (файл может создаваться с задержкой)
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Смотрим что создалось
        const filesInTemp = await fs.readdir(CONFIG.tempDir);
        console.log('📁 Файлы в temp:', filesInTemp);

        // Ищем .txt файл
        const txtFile = filesInTemp.find(f => f.endsWith('.txt'));

        if (!txtFile) {
            console.error('❌ Не найден .txt файл!');
            console.error('📁 Все файлы:', filesInTemp);
            throw new Error('Whisper не создал .txt файл');
        }

        console.log('📄 Найден файл:', txtFile);

        const outputPath = path.join(CONFIG.tempDir, txtFile);
        const transcript = await fs.readFile(outputPath, 'utf-8');

        console.log('✅ Transkription abgeschlossen');
        console.log('📏 Длина:', transcript.length, 'символов');

        return transcript;
    } catch (error) {
        console.error('❌ Полная ошибка:', error);
        throw new Error(`Ошибка транскрибации: ${error.message}`);
    }
}

// Генерация конспекта через Ollama
async function generateSummary(transcript) {
    console.log('📝 Erstelle Mitschrift mit LLM...');

    const prompt = `Du bist ein professioneller Studienassistent. Wandle diese Vorlesungstranskription in eine strukturierte Mitschrift um.

Anforderungen an die Mitschrift:
- Identifiziere die Hauptthemen und Abschnitte
- Erstelle eine Aufzählung der wichtigsten Punkte
- Behalte wichtige Definitionen, Begriffe und Beispiele bei
- Strukturiere die Information logisch
- Verwende Unterüberschriften für verschiedene Abschnitte
- Entferne Wiederholungen und Füllwörter

Vorlesungstranskription:
${transcript}

Mitschrift:`;

    try {
        const response = await fetch('http://localhost:11434/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: CONFIG.ollamaModel,
                prompt: prompt,
                stream: false
            })
        });

        if (!response.ok) {
            throw new Error(`Ollama API Fehler: ${response.statusText}`);
        }

        const data = await response.json();
        console.log('✅ Mitschrift erstellt');
        return data.response;
    } catch (error) {
        throw new Error(`Fehler beim Erstellen der Zusammenfassung: ${error.message}`);
    }
}

// Сохранение результата
async function saveResult(summary, originalName) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputPath = path.join(
        CONFIG.outputDir,
        `${path.parse(originalName).name}_mitschrift_${timestamp}.txt`
    );

    await fs.writeFile(outputPath, summary, 'utf-8');
    console.log(`💾 Mitschrift gespeichert: ${outputPath}`);
    return outputPath;
}

// Основная функция
async function processLecture(audioPath) {
    console.log('🚀 Starte Vorlesungsverarbeitung...\n');

    try {
        // Создаем необходимые директории
        await fs.mkdir(CONFIG.tempDir, { recursive: true });
        await fs.mkdir(CONFIG.outputDir, { recursive: true });

        // Очищаем temp перед началом
        await cleanTempDir();

        // Проверяем существование файла
        await fs.access(audioPath);

        // 1. Конвертация аудио
        const wavPath = await convertToWav(audioPath);

        // 2. Транскрибация
        const transcript = await transcribeAudio(wavPath);

        // 3. Генерация конспекта
        const summary = await generateSummary(transcript);

        // 4. Сохранение
        const outputPath = await saveResult(summary, path.basename(audioPath));

        // Очистка временных файлов
        console.log('🧹 Räume temporäre Dateien auf...');
        await cleanTempDir();

        console.log('\n✨ Fertig! Mitschrift erfolgreich erstellt.');
        console.log(`📄 Datei: ${outputPath}`);

    } catch (error) {
        console.error('❌ Fehler:', error.message);
        throw error;
    }
}

// CLI интерфейс
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log(`
📚 Audio-Vorlesungen zu Mitschrift Konverter

Verwendung:
  node lecture-converter.js <pfad_zur_audio_datei>

Beispiele:
  node lecture-converter.js ./vorlesung.mp3
  node lecture-converter.js /pfad/zu/vorlesung.m4a

Unterstützte Formate: mp3, m4a, wav, ogg, flac usw.
`);
        process.exit(0);
    }

    processLecture(args[0]);
}

module.exports = { processLecture };