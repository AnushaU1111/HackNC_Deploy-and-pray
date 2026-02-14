window.addEventListener('shield_result', (e) => {
    const data = JSON.parse(e.detail);
    const { score, reason, label } = data;

    const alertDiv = document.createElement('div');
    alertDiv.className = `shield-alert ${label.toLowerCase()}`;
    alertDiv.innerHTML = `
    <strong>SHIELD: ${label} (Risk: ${score}/10)</strong><br>
    <span>${reason}</span>
  `;
    document.body.appendChild(alertDiv);

    // Auto-remove after 8 seconds
    setTimeout(() => { alertDiv.style.opacity = '0'; setTimeout(() => alertDiv.remove(), 600); }, 8000);
});