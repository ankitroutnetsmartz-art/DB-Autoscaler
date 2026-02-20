// Function to render the Topology on a Canvas element
export function renderTopology(activeCount) {
    const canvas = document.getElementById('topologyCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = 80;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Draw Primary Node (Center)
    drawNode(ctx, centerX, centerY, "PRIMARY", "#00ff88", true);

    // 2. Draw Replicas (Orbiting)
    const replicaCount = activeCount - 1;
    for (let i = 0; i < replicaCount; i++) {
        const angle = (i * 2 * Math.PI) / replicaCount;
        const x = centerX + radius * Math.cos(angle);
        const y = centerY + radius * Math.sin(angle);

        // Draw Connection Line
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(x, y);
        ctx.strokeStyle = "#444";
        ctx.setLineDash([5, 5]);
        ctx.stroke();

        drawNode(ctx, x, y, `R${i+1}`, "#00d1ff", false);
    }
}

function drawNode(ctx, x, y, label, color, isMaster) {
    ctx.beginPath();
    ctx.arc(x, y, isMaster ? 15 : 10, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.shadowBlur = 15;
    ctx.shadowColor = color;
    ctx.fill();
    ctx.shadowBlur = 0; // Reset shadow for text
    
    ctx.fillStyle = "white";
    ctx.font = "10px Arial";
    ctx.textAlign = "center";
    ctx.fillText(label, x, y + 25);
}