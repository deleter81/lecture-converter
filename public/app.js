const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const processing = document.getElementById('processing');
const statusMessage = document.getElementById('statusMessage');
const resultsList = document.getElementById('resultsList');

// Загрузка списка результатов
async function loadResults() {
    try {
        const response = await fetch('/api/results');

        if (!response.ok) {
            throw new Error('Fehler beim Laden');
        }

        const results = await response.json();

        console.log('Результаты:', results); // Для отладки

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
                <div class="result-item">
                    <div class="result-info">
                        <div class="result-name">${result.filename}</div>
                        <div class="result-meta">${date} • ${size} KB</div>
                    </div>
                    <a href="${result.downloadUrl}" class="download-btn" download>
                        ⬇️ Download
                    </a>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('Fehler beim Laden der Ergebnisse:', error);
        resultsList.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">❌</div>
                <p>Fehler beim Laden: ${error.message}</p>
            </div>
        `;
    }
}

//показать сообщение
function showMessage(text, type = 'success') {
    statusMessage.textContent = text;
    statusMessage.className = `status-message ${type}`;
    setTimeout(() => {
        statusMessage.className = 'status-message';
    }, 5000);
}

//обработка загрузки файла
async function handleFile(file) {
    if (!file) return;

    //проверяем размер
    if (file.size > 500 * 1024 * 1024) {
        showMessage('Datei zu groß! Maximum 500mb.', error);
        return;
    }

    const formData = new FormData();
    formData.append('audio', file);

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

            //обновляем список результатов каждые 5 секунд
            const interval = setInterval(loadResults, 5000);

            //останавливаем обновление через 2 минуты
            setTimeout(() => clearInterval(interval), 120000);
        } else {
            showMessage('❌ Fehler: ' + data.error, 'error');
        }
    } catch (error) {
        showMessage('❌ Verbindungsfehler: ' + error.message, 'error');
    } finally {
        processing.classList.remove('active');
        uploadArea.style.display = 'black';
    }
}

// drag & drop
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
    const file = e.dataTransfer.files[0];
    handleFile(file);
});

//click to upload
uploadArea.addEventListener('click', () => {
    fileInput.click();
});

fileInput.addEventListener('change', (e) => {
    handleFile(e.target.files[0]);
});

//загрузка результатов при старте
loadResults();

//автообновление каждые 10 секунд
setInterval(loadResults, 10000);