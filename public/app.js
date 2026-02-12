const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const processing = document.getElementById('processing');
const statusMessage = document.getElementById('statusMessage');
const resultsList = document.getElementById('resultsList');
const generateBtn = document.getElementById('generateBtn');

// Текущий выбранный файл
let selectedFile = null;

// Загрузка списка результатов
async function loadResults() {
    try {
        const response = await fetch('/api/results');

        if (!response.ok) {
            throw new Error('Fehler beim Laden');
        }

        const results = await response.json();

        if (!results || results.length === 0) {
            resultsList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📭</div>
                    <p>Noch keine Mitschriften vorhanden</p>
                </div>
            `;
            return;
        }

        resultsList.innerHTML = results.map(result => {
            const date = new Date(result.created).toLocaleString('de-DE');
            const size = (result.size / 1024).toFixed(1);

            return `
                <div class="result-item" id="item-${result.filename}">
                    <div class="result-info">
                        <div class="result-name">${result.filename}</div>
                        <div class="result-meta">${date} • ${size} KB</div>
                    </div>
                    <div class="result-actions">
                        <a href="${result.downloadUrl}" class="download-btn" download>
                            ⬇️ Download
                        </a>
                        <button class="delete-btn" onclick="deleteFile('${result.filename}')">
                            🗑️
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('Fehler beim Laden der Ergebnisse:', error);
    }
}

// Показать сообщение
function showMessage(text, type = 'success') {
    statusMessage.textContent = text;
    statusMessage.className = `status-message ${type}`;
    setTimeout(() => {
        statusMessage.className = 'status-message';
    }, 5000);
}

// Удаление файла
async function deleteFile(filename) {
    if (!confirm(`Möchten Sie "${filename}" wirklich löschen?`)) {
        return;
    }

    try {
        const response = await fetch(`/api/delete/${encodeURIComponent(filename)}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (response.ok) {
            showMessage('🗑️ Datei erfolgreich gelöscht!', 'success');
            loadResults();
        } else {
            showMessage('❌ Fehler: ' + data.error, 'error');
        }
    } catch (error) {
        showMessage('❌ Verbindungsfehler: ' + error.message, 'error');
    }
}

// Выбор файла (только сохраняем, не запускаем)
function selectFile(file) {
    if (!file) return;

    if (file.size > 500 * 1024 * 1024) {
        showMessage('Datei zu groß! Maximum 500MB.', 'error');
        return;
    }

    // Сохраняем файл
    selectedFile = file;

    // Обновляем область загрузки
    uploadArea.innerHTML = `
        <div class="upload-icon">✅</div>
        <div class="upload-text">${file.name}</div>
        <div class="upload-hint">${(file.size / 1024 / 1024).toFixed(1)} MB • Klicken um andere Datei auszuwählen</div>
        <input type="file" id="fileInput" accept="audio/*">
    `;

    // Вешаем обработчик на новый input
    document.getElementById('fileInput').addEventListener('change', (e) => {
        selectFile(e.target.files[0]);
    });

    // Активируем кнопку Generate
    generateBtn.disabled = false;
    generateBtn.classList.add('ready');

    showMessage(`✅ Datei ausgewählt: ${file.name}`, 'success');
}

// Запуск обработки по кнопке Generate
async function startProcessing() {
    if (!selectedFile) {
        showMessage('❌ Bitte zuerst eine Datei auswählen!', 'error');
        return;
    }

    const summaryLanguage = document.getElementById('summaryLanguage').value;

    const formData = new FormData();
    formData.append('audio', selectedFile);
    formData.append('summaryLanguage', summaryLanguage);

    // Блокируем кнопку во время обработки
    generateBtn.disabled = true;
    generateBtn.classList.remove('ready');
    generateBtn.textContent = '⏳ Processing...';

    uploadArea.style.display = 'none';
    processing.classList.add('active');

    try {
        const response = await fetch('/api/convert', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (response.ok) {
            showMessage('✅ Verarbeitung gestartet! Die Mitschrift erscheint in wenigen Minuten unten.', 'success');

            // Сбрасываем состояние
            selectedFile = null;
            generateBtn.textContent = '▶️ Generate';

            // Обновляем список результатов каждые 5 секунд
            const interval = setInterval(loadResults, 5000);
            setTimeout(() => clearInterval(interval), 120000);
        } else {
            showMessage('❌ Fehler: ' + data.error, 'error');
            generateBtn.disabled = false;
            generateBtn.textContent = '▶️ Generate';
        }
    } catch (error) {
        showMessage('❌ Verbindungsfehler: ' + error.message, 'error');
        generateBtn.disabled = false;
        generateBtn.textContent = '▶️ Generate';
    } finally {
        processing.classList.remove('active');
        uploadArea.style.display = 'block';
    }
}

// Drag & Drop
uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('dragover');
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    selectFile(e.dataTransfer.files[0]);
});

// Click to upload
uploadArea.addEventListener('click', () => {
    document.getElementById('fileInput').click();
});

document.getElementById('fileInput').addEventListener('change', (e) => {
    selectFile(e.target.files[0]);
});

// Кнопка Generate
generateBtn.addEventListener('click', startProcessing);

// Загрузка результатов при старте
loadResults();

// Автообновление каждые 10 секунд
setInterval(loadResults, 10000);