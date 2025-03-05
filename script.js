document.getElementById('interestForm').addEventListener('submit', function(event) {
    event.preventDefault();

    const principal = parseFloat(document.getElementById('principal').value);
    const monthlyContribution = parseFloat(document.getElementById('monthlyContribution').value);
    const interestRate = parseFloat(document.getElementById('interestRate').value) / 100;
    const duration = parseInt(document.getElementById('duration').value);

    const labels = [];
    const data = [];
    let total = principal;

    for (let year = 0; year < duration; year++) {
        labels.push(`Année ${year + 1}`);
        total = (total + monthlyContribution * 12) * (1 + interestRate);
        data.push(total.toFixed(2));
    }

    const ctx = document.getElementById('interestChart').getContext('2d');
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Valeur totale',
                color:'rgba(75, 192, 192, 1)',
                data: data,
                fill: true,
                borderColor: 'rgba(75, 192, 192, 1)',
                backgroundColor: 'rgba(75, 192, 192, 0.2)',
                tension: 0.1
            }]
        },
        options: {
            scales: {
                x: {
                    ticks: {
                        color: 'rgba(75, 192, 192, 1)'
                    }
                },
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: 'rgba(75, 192, 192, 1)'
                    }
                }
            },
            plugins: {
                legend: {
                    labels: {
                        color: 'rgba(75, 192, 192, 1)'
                    }
                }
            }
        }
    });
});
