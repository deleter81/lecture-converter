const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const processing = document.getElementById('processing');
const statusMessage = document.getElementById('statusMessage');
const resultsList = document.getElementById('resultsList');

//загрузка списка результатов
async function loadResults() {
    try {
        const response = await fetch('/api/results');
        const results = await response.json();

        if (results.lenght === 0) {
            resultsList.innerHTML = `
                <div class="empty-state">
                    <div class="emptypstate-icon">📭</div>
                    <p>Noch keine Mitschriften vorhanden</p>
                </div>
            `;
            return;
        }

        resultsList.innerHTML = response.map(result => {
            const date = new Date(result.created).toLocaleString('de-DE');
            const size = (result.size / 1024).toFixed(1);

            return `
                <div class="result-item">
                    <div class="result-info">
                        <div class="result-name">${result.filename}</div>
                        <div class="result-meta">${date} • ${size} KB</div>
                    </div>
                    <a href="${result.downloadurl}"class="download-btn" download>
                        ⬇️ Download
                    </a>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('Fehler beim Laden der Ergebnisse:', error);
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
