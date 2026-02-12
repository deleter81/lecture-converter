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

// Транскрибация через Whisper (автоопределение языка)
async function transcribeAudio(audioPath) {
    console.log('🎤 Transkribiere Audio mit Whisper...');
    console.log('🌍 Язык: автоопределение');

    try {
        const whisperPath = path.join(process.env.HOME, 'whisper.cpp/build/bin/whisper-cli');
        const modelPath = path.join(process.env.HOME, 'whisper.cpp/models/ggml-base.bin');

        await fs.access(whisperPath);
        await fs.access(modelPath);
        await fs.access(audioPath);

        console.log('✅ Все файлы найдены, запускаем Whisper...');

        const outputFile = path.join(CONFIG.tempDir, 'transcript');

        // Используем auto для автоопределения языка
        await execCommand(whisperPath, [
            '-m', modelPath,
            '-f', audioPath,
            '-l', 'auto',
            '-of', outputFile,
            '-otxt'
        ]);

        await new Promise(resolve => setTimeout(resolve, 1000));

        const filesInTemp = await fs.readdir(CONFIG.tempDir);
        console.log('📁 Файлы в temp:', filesInTemp);

        const txtFile = filesInTemp.find(f => f.endsWith('.txt'));

        if (!txtFile) {
            throw new Error('Whisper не создал .txt файл');
        }

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

// Генерация конспекта на выбранном языке
async function generateSummary(transcript, summaryLanguage = 'de') {
    console.log('📝 Erstelle Mitschrift mit LLM...');
    console.log('🌍 Язык конспекта:', summaryLanguage);

    const prompts = {
        de: `Du bist ein professioneller Studienassistent. Wandle diese Transkription in eine strukturierte Mitschrift auf DEUTSCH um.
Anforderungen:
- Identifiziere die Hauptthemen und Abschnitte
- Erstelle eine Aufzählung der wichtigsten Punkte
- Behalte wichtige Definitionen und Beispiele bei
- Verwende Unterüberschriften für verschiedene Abschnitte
- Entferne Wiederholungen und Füllwörter
- Schreibe die gesamte Mitschrift auf DEUTSCH`,

        en: `You are a professional study assistant. Convert this transcription into structured study notes in ENGLISH.
Requirements:
- Identify main topics and sections
- Create bullet points of key information
- Keep important definitions and examples
- Use subheadings for different sections
- Remove repetitions and filler words
- Write the entire notes in ENGLISH`,

        uk: `Ти професійний навчальний асистент. Перетвори цю транскрипцію на структурований конспект УКРАЇНСЬКОЮ МОВОЮ.
Вимоги:
- Визнач основні теми та розділи
- Створи список ключових моментів
- Збережи важливі визначення та приклади
- Використовуй підзаголовки для різних розділів
- Видали повтори та слова-паразити
- Пиши весь конспект УКРАЇНСЬКОЮ МОВОЮ`,

        ru: `Ты профессиональный учебный ассистент. Преобразуй эту транскрипцию в структурированный конспект на РУССКОМ ЯЗЫКЕ.
Требования:
- Выдели основные темы и разделы
- Создай список ключевых моментов
- Сохрани важные определения и примеры
- Используй подзаголовки для разных разделов
- Удали повторы и слова-паразиты
- Пиши весь конспект на РУССКОМ ЯЗЫКЕ`
    };

    const prompt = `${prompts[summaryLanguage] || prompts.de}

Transkription:
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
async function processLecture(audioPath, summaryLanguage = 'de') {
    console.log('🚀 Starte Vorlesungsverarbeitung...\n');
    console.log('📝 Язык конспекта:', summaryLanguage);

    try {
        await fs.mkdir(CONFIG.tempDir, { recursive: true });
        await fs.mkdir(CONFIG.outputDir, { recursive: true });

        await cleanTempDir();
        await fs.access(audioPath);

        // 1. Конвертация
        const wavPath = await convertToWav(audioPath);

        // 2. Транскрибация (автоопределение языка)
        const transcript = await transcribeAudio(wavPath);

        // 3. Конспект на выбранном языке
        const summary = await generateSummary(transcript, summaryLanguage);

        // 4. Сохранение
        const outputPath = await saveResult(summary, path.basename(audioPath));

        // 5. Очистка
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