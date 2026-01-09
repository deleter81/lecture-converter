const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');


// конфигурация
const CONFIG = {
    whisperModel: 'base',
    ollamaModel: 'llama3.2',
    tempDir: './temp',
    outputDir: './output'
};


//утилита для выполнения команд
function execCommand(command, args) {
    return new Promise((resolve, reject) => {
        const process = spawn(command, args);
        let stdout = '';
        let stderr = '';

        process.stdout.on('data', (data) => {
            stdout += data.toString();
            console.log(data.toString());
        });

        process.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        process.on('close', (code) => {
            if (code === 0) {
                resolve(stdout);
            } else {
                reject(new Error(`Команда завершилась с кодом ${code}: ${stderr}`));
            }
        });
    });
}


// конвертация аудио в WAV
async function convertToWav(inputPath) {
    console.log('Konvertieren Audio in WAV-Format...');
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
        console.log('Kovertirung abgeschlossen');
        return outputPath;
    } catch (error) {
        throw new Error(`Konvertierungsfehler: ${error.message}`);
    }
}


// транскрибация через Whisper
async function transcribeAudio(audioPath) {
    console.log('Transkribiere Audio mit Whisper...');
    const outputPath = path.join(CONFIG.tempDir, 'transcript.txt');

    try {
        await execCommand('whisper', [
            audioPath,
            '--model', CONFIG.whisperModel,
            '--language', 'de',
            '--output-dir', CONFIG.tempDir,
            '--output-txt'
        ]);

        const transcript = await fs.readFile(outputPath, 'utf-8');
        console.log('Transkription abgeschlossen');
        return transcript;
    } catch (error) {
        throw new Error(`Transkriptionsfehler: ${error.message}`);
    }
}


//генерация конспекта через ollama
async function generateSummary(transcript) {
    console.log('Erstelle Mitschrift mit LLM...');

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


//сохранение результата
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


// 