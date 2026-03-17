// ==============================
//  CONFIGURATION GLOBALE
// ==============================

// Référence vers le graphique Chart.js.
// On la stocke ici pour pouvoir détruire l'ancien graphique
// avant d'en recréer un nouveau à chaque simulation.
let interestChartInstance = null;

// ==============================
//  OUTILS / HELPERS
// ==============================

/**
 * Convertit une chaîne en nombre flottant.
 * Accepte les virgules ou les points comme séparateur décimal.
 *
 * Exemples :
 * "7,5" -> 7.5
 * "7.5" -> 7.5
 * "1 234,56" -> 1234.56
 *
 * @param {string|number} value
 * @returns {number}
 */
function parseLocalizedNumber(value) {
    // Si la valeur est déjà un nombre, on la retourne telle quelle.
    if (typeof value === "number") {
        return value;
    }

    // Conversion en chaîne + nettoyage :
    // - suppression des espaces
    // - remplacement des virgules par des points
    const normalizedValue = String(value)
        .trim()
        .replace(/\s/g, "")
        .replace(",", ".");

    return Number.parseFloat(normalizedValue);
}

/**
 * Formate un nombre en euro pour affichage.
 *
 * @param {number} value
 * @returns {string}
 */
function formatCurrency(value) {
    return new Intl.NumberFormat("fr-FR", {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 2
    }).format(value);
}

/**
 * Formate un nombre en pourcentage.
 *
 * @param {number} value
 * @returns {string}
 */
function formatPercent(value) {
    return new Intl.NumberFormat("fr-FR", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    }).format(value) + " %";
}

// ==============================
//  CALCUL DE LA SIMULATION
// ==============================

/**
 * Calcule l'évolution du capital mois par mois.
 *
 * Hypothèse choisie :
 * - on applique d'abord l'intérêt mensuel
 * - puis on ajoute la contribution mensuelle
 *
 * Ce n'est pas la seule convention possible,
 * mais elle est cohérente tant qu'on reste constant.
 *
 * @param {number} principal            Capital initial
 * @param {number} monthlyContribution  Versement mensuel
 * @param {number} annualRatePercent    Taux annuel en %
 * @param {number} durationYears        Durée en années
 * @returns {{
 *   labels: string[],
 *   balances: number[],
 *   contributions: number[],
 *   totalInvested: number,
 *   finalAmount: number,
 *   totalInterest: number
 * }}
 */
function calculateCompoundInterest(principal, monthlyContribution, annualRatePercent, durationYears) {
    // Conversion du taux annuel en taux mensuel
    // Exemple : 7.2% annuel -> 0.072 / 12 par mois
    const monthlyRate = annualRatePercent / 100 / 12;

    // Nombre total de mois de simulation
    const totalMonths = durationYears * 12;

    // Variables de suivi
    let currentBalance = principal;
    let totalInvested = principal;

    // Données destinées au graphique
    const labels = ["Départ"];
    const balances = [principal];
    const contributions = [principal];

    // Boucle de calcul mois par mois
    for (let month = 1; month <= totalMonths; month++) {
        // Application des intérêts mensuels
        currentBalance = currentBalance * (1 + monthlyRate);

        // Ajout du versement mensuel
        currentBalance += monthlyContribution;

        // Mise à jour du total réellement versé
        totalInvested += monthlyContribution;

        // Libellé du mois
        // Exemple : "M1", "M2", ..., "M120"
        labels.push(`M${month}`);

        // Valeur totale du portefeuille
        balances.push(currentBalance);

        // Montant total injecté par l'utilisateur
        contributions.push(totalInvested);
    }

    // Calcul des intérêts gagnés
    const totalInterest = currentBalance - totalInvested;

    return {
        labels,
        balances,
        contributions,
        totalInvested,
        finalAmount: currentBalance,
        totalInterest
    };
}

// ==============================
//  AFFICHAGE DU GRAPHIQUE
// ==============================

/**
 * Crée ou recrée le graphique Chart.js.
 *
 * @param {string[]} labels
 * @param {number[]} balances
 * @param {number[]} contributions
 */
function renderChart(labels, balances, contributions) {
    const canvas = document.getElementById("interestChart");
    const context = canvas.getContext("2d");

    // Si un ancien graphique existe, on le détruit.
    // Sinon Chart.js superpose des couches comme un millefeuille du chaos.
    if (interestChartInstance) {
        interestChartInstance.destroy();
    }

    // Création du nouveau graphique
    interestChartInstance = new Chart(context, {
        type: "line",
        data: {
            labels: labels,
            datasets: [
                {
                    label: "Capital total",
                    data: balances,
                    borderColor: "#10b981",
                    backgroundColor: "rgba(16, 185, 129, 0.15)",
                    borderWidth: 3,
                    pointRadius: 0,
                    pointHoverRadius: 5,
                    tension: 0.2,
                    fill: true
                },
                {
                    label: "Total versé",
                    data: contributions,
                    borderColor: "#38bdf8",
                    backgroundColor: "rgba(56, 189, 248, 0.08)",
                    borderWidth: 2,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    tension: 0.15,
                    fill: false,
                    borderDash: [6, 6]
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,

            interaction: {
                mode: "index",
                intersect: false
            },

            plugins: {
                legend: {
                    labels: {
                        color: "#cbd5e1",
                        font: {
                            size: 13
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            return `${context.dataset.label} : ${formatCurrency(context.parsed.y)}`;
                        }
                    }
                }
            },

            scales: {
                x: {
                    ticks: {
                        color: "#94a3b8",
                        maxTicksLimit: 12,
                        callback: function (value, index) {
                            // On évite d'afficher 600 labels illisibles sur une longue durée.
                            // Ici on privilégie un affichage plus léger.
                            const label = this.getLabelForValue(value);

                            // On affiche uniquement :
                            // - le point de départ
                            // - puis 1 label par an (M12, M24, M36, etc.)
                            if (label === "Départ") {
                                return label;
                            }

                            const monthNumber = index;
                            return monthNumber % 12 === 0 ? `A${monthNumber / 12}` : "";
                        }
                    },
                    grid: {
                        color: "rgba(148, 163, 184, 0.12)"
                    }
                },
                y: {
                    ticks: {
                        color: "#94a3b8",
                        callback: function (value) {
                            return new Intl.NumberFormat("fr-FR", {
                                notation: "compact",
                                maximumFractionDigits: 1
                            }).format(value) + " €";
                        }
                    },
                    grid: {
                        color: "rgba(148, 163, 184, 0.12)"
                    }
                }
            }
        }
    });
}

// ==============================
//  MISE À JOUR DES RÉSULTATS
// ==============================

/**
 * Met à jour les cartes de synthèse.
 *
 * @param {number} finalAmount
 * @param {number} totalInvested
 * @param {number} totalInterest
 * @param {number} rate
 * @param {number} years
 */
function updateSummary(finalAmount, totalInvested, totalInterest, rate, years) {
    document.getElementById("finalAmount").textContent = formatCurrency(finalAmount);
    document.getElementById("totalInvested").textContent = formatCurrency(totalInvested);
    document.getElementById("totalInterest").textContent = formatCurrency(totalInterest);

    document.getElementById("summaryText").textContent =
        `Simulation sur ${years} ans avec un taux annuel de ${formatPercent(rate)}.`;
}

// ==============================
//  GESTION DU FORMULAIRE
// ==============================

/**
 * Lance une simulation à partir des valeurs du formulaire.
 */
function runSimulation() {
    // Récupération des valeurs brutes
    const principal = parseLocalizedNumber(document.getElementById("principal").value);
    const monthlyContribution = parseLocalizedNumber(document.getElementById("monthlyContribution").value);
    const interestRate = parseLocalizedNumber(document.getElementById("interestRate").value);
    const duration = Number.parseInt(document.getElementById("duration").value, 10);

    // Validation simple
    if (
        Number.isNaN(principal) ||
        Number.isNaN(monthlyContribution) ||
        Number.isNaN(interestRate) ||
        Number.isNaN(duration)
    ) {
        alert("Merci de saisir des valeurs valides.");
        return;
    }

    if (principal < 0 || monthlyContribution < 0 || interestRate < 0 || duration <= 0) {
        alert("Les valeurs ne peuvent pas être négatives, et la durée doit être supérieure à 0.");
        return;
    }

    // Calcul de la simulation
    const simulation = calculateCompoundInterest(
        principal,
        monthlyContribution,
        interestRate,
        duration
    );

    // Mise à jour du résumé
    updateSummary(
        simulation.finalAmount,
        simulation.totalInvested,
        simulation.totalInterest,
        interestRate,
        duration
    );

    // Mise à jour du graphique
    renderChart(
        simulation.labels,
        simulation.balances,
        simulation.contributions
    );
}

// ==============================
//  INITIALISATION
// ==============================

document.addEventListener("DOMContentLoaded", function () {
    const form = document.getElementById("interestForm");
    const resetButton = document.getElementById("resetButton");

    // Soumission du formulaire :
    // on empêche le rechargement de la page,
    // puis on relance la simulation.
    form.addEventListener("submit", function (event) {
        event.preventDefault();
        runSimulation();
    });

    // Bouton reset :
    // on remet des valeurs par défaut
    // puis on relance directement une simulation propre.
    resetButton.addEventListener("click", function () {
        document.getElementById("principal").value = "10000";
        document.getElementById("monthlyContribution").value = "500";
        document.getElementById("interestRate").value = "7,5";
        document.getElementById("duration").value = "10";

        runSimulation();
    });

    // Simulation initiale au chargement
    runSimulation();
});
