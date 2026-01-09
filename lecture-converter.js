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
