// ==============================
//  CONFIGURATION GLOBALE
// ==============================

// Référence du graphique Chart.js.
// On la garde en mémoire afin de le détruire avant chaque nouvelle simulation.
let interestChartInstance = null;

// ==============================
//  OUTILS / HELPERS
// ==============================

/**
 * Convertit une valeur texte en nombre flottant.
 * Gère les virgules et les points.
 *
 * Exemples :
 * "7,5" => 7.5
 * "7.5" => 7.5
 * "1 234,56" => 1234.56
 *
 * @param {string|number} value
 * @returns {number}
 */
function parseLocalizedNumber(value) {
    if (typeof value === "number") {
        return value;
    }

    const normalizedValue = String(value)
        .trim()
        .replace(/\s/g, "")
        .replace(",", ".");

    return Number.parseFloat(normalizedValue);
}

/**
 * Formate un nombre en euros.
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
 * Calcule l'évolution du capital mois par mois, avec :
 * - capital initial
 * - versement mensuel
 * - intérêts composés
 * - retrait fixe mensuel
 * - retrait d'un pourcentage des intérêts mensuels
 *
 * Convention choisie pour chaque mois :
 * 1. calcul des intérêts du mois
 * 2. ajout du versement mensuel
 * 3. retrait d'un % des intérêts du mois
 * 4. retrait fixe mensuel
 *
 * IMPORTANT :
 * - le retrait sur intérêts s'applique uniquement aux intérêts du mois
 * - le retrait fixe peut consommer les intérêts restants puis le capital si besoin
 * - le retrait total d'un mois ne peut jamais dépasser le capital disponible
 *
 * @param {number} principal
 * @param {number} monthlyContribution
 * @param {number} annualRatePercent
 * @param {number} durationYears
 * @param {number} monthlyWithdrawalFixed
 * @param {number} interestWithdrawalPercent
 * @returns {{
 *   labels: string[],
 *   balances: number[],
 *   contributions: number[],
 *   withdrawnSeries: number[],
 *   totalInvested: number,
 *   totalWithdrawn: number,
 *   grossInterest: number,
 *   totalInterestWithdrawn: number,
 *   capitalConsumedByWithdrawals: number,
 *   netInterest: number,
 *   finalAmount: number
 * }}
 */
function calculateCompoundInterestWithWithdrawals(
    principal,
    monthlyContribution,
    annualRatePercent,
    durationYears,
    monthlyWithdrawalFixed,
    interestWithdrawalPercent
) {
    // Taux mensuel
    const monthlyRate = annualRatePercent / 100 / 12;

    // Nombre total de mois
    const totalMonths = durationYears * 12;

    // Variables de suivi global
    let currentBalance = principal;
    let totalInvested = principal;
    let totalWithdrawn = 0;
    let grossInterest = 0;

    // IMPORTANT :
    // totalInterestWithdrawn = part des intérêts effectivement sortie du portefeuille
    let totalInterestWithdrawn = 0;

    // capitalConsumedByWithdrawals = part des retraits qui a mangé le capital
    let capitalConsumedByWithdrawals = 0;

    // Données du graphique
    const labels = ["Départ"];
    const balances = [principal];
    const contributions = [principal];
    const withdrawnSeries = [0];

    // Boucle mensuelle
    for (let month = 1; month <= totalMonths; month++) {
        // ==============================
        // 0. État avant le mois
        // ==============================
        const balanceBeforeMonth = currentBalance;

        // ==============================
        // 1. Intérêts du mois
        // ==============================
        const interestGeneratedThisMonth = currentBalance * monthlyRate;

        // On cumule les intérêts bruts générés
        grossInterest += interestGeneratedThisMonth;

        // On ajoute ces intérêts au capital
        currentBalance += interestGeneratedThisMonth;

        // ==============================
        // 2. Versement mensuel
        // ==============================
        currentBalance += monthlyContribution;
        totalInvested += monthlyContribution;

        // ==============================
        // 3. Retrait sur intérêts du mois
        // ==============================

        // Part théorique à retirer depuis les intérêts du mois uniquement
        const plannedInterestWithdrawal =
            interestGeneratedThisMonth * (interestWithdrawalPercent / 100);

        // Par sécurité, on ne retire jamais plus que les intérêts générés du mois
        const actualInterestWithdrawal = Math.min(
            plannedInterestWithdrawal,
            interestGeneratedThisMonth,
            currentBalance
        );

        // On retire cette part du portefeuille
        currentBalance -= actualInterestWithdrawal;

        // On cumule la part d'intérêts sortie
        totalInterestWithdrawn += actualInterestWithdrawal;
        totalWithdrawn += actualInterestWithdrawal;

        // ==============================
        // 4. Retrait fixe mensuel
        // ==============================

        // Retrait fixe réellement possible ce mois-ci
        const actualFixedWithdrawal = Math.min(monthlyWithdrawalFixed, currentBalance);

        // Pour savoir si ce retrait fixe mange du capital, on regarde
        // combien d'intérêts "restent" encore disponibles après le retrait
        // sur intérêts du mois.
        const remainingInterestThisMonth =
            Math.max(interestGeneratedThisMonth - actualInterestWithdrawal, 0);

        // La part du retrait fixe qui peut encore être couverte par les intérêts du mois
        const fixedWithdrawalCoveredByInterest = Math.min(
            actualFixedWithdrawal,
            remainingInterestThisMonth
        );

        // Le reste du retrait fixe vient forcément du capital
        const fixedWithdrawalCoveredByCapital =
            actualFixedWithdrawal - fixedWithdrawalCoveredByInterest;

        // Application du retrait fixe
        currentBalance -= actualFixedWithdrawal;

        // Tracking des retraits
        totalWithdrawn += actualFixedWithdrawal;
        totalInterestWithdrawn += fixedWithdrawalCoveredByInterest;
        capitalConsumedByWithdrawals += fixedWithdrawalCoveredByCapital;

        // ==============================
        // 5. Stockage des données
        // ==============================
        labels.push(`M${month}`);
        balances.push(currentBalance);
        contributions.push(totalInvested);
        withdrawnSeries.push(totalWithdrawn);
    }

    // ==============================
    // 6. Calcul des intérêts conservés
    // ==============================

    // Intérêts nets réellement conservés dans le portefeuille
    // = intérêts générés - part des intérêts retirée
    const netInterest = grossInterest - totalInterestWithdrawn;

    return {
        labels,
        balances,
        contributions,
        withdrawnSeries,
        totalInvested,
        totalWithdrawn,
        grossInterest,
        totalInterestWithdrawn,
        capitalConsumedByWithdrawals,
        netInterest,
        finalAmount: currentBalance
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
 * @param {number[]} withdrawnSeries
 */
function renderChart(labels, balances, contributions, withdrawnSeries) {
    const canvas = document.getElementById("interestChart");
    const context = canvas.getContext("2d");

    // Destruction de l'ancien graphique avant recréation
    if (interestChartInstance) {
        interestChartInstance.destroy();
    }

    interestChartInstance = new Chart(context, {
        type: "line",
        data: {
            labels: labels,
            datasets: [
                {
                    label: "Capital net",
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
                },
                {
                    label: "Total retiré",
                    data: withdrawnSeries,
                    borderColor: "#f59e0b",
                    backgroundColor: "rgba(245, 158, 11, 0.08)",
                    borderWidth: 2,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    tension: 0.15,
                    fill: false,
                    borderDash: [10, 4]
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
                            const label = this.getLabelForValue(value);

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
 * @param {object} data
 * @param {number} annualRatePercent
 * @param {number} durationYears
 * @param {number} monthlyWithdrawalFixed
 * @param {number} interestWithdrawalPercent
 */
function updateSummary(
    data,
    annualRatePercent,
    durationYears,
    monthlyWithdrawalFixed,
    interestWithdrawalPercent
) {
    document.getElementById("finalAmount").textContent = formatCurrency(data.finalAmount);
    document.getElementById("totalInvested").textContent = formatCurrency(data.totalInvested);
    document.getElementById("totalWithdrawn").textContent = formatCurrency(data.totalWithdrawn);
    document.getElementById("grossInterest").textContent = formatCurrency(data.grossInterest);
    document.getElementById("netInterest").textContent = formatCurrency(data.netInterest);

    document.getElementById("summaryText").textContent =
        `Simulation sur ${durationYears} ans • taux ${formatPercent(annualRatePercent)} • retrait fixe ${formatCurrency(monthlyWithdrawalFixed)} • retrait sur intérêts ${formatPercent(interestWithdrawalPercent)}.`;
}

// ==============================
//  GESTION DU FORMULAIRE
// ==============================

/**
 * Lance une simulation à partir des valeurs du formulaire.
 */
function runSimulation() {
    // ==============================
    // Récupération des valeurs
    // ==============================
    const principal = parseLocalizedNumber(document.getElementById("principal").value);
    const monthlyContribution = parseLocalizedNumber(document.getElementById("monthlyContribution").value);
    const interestRate = parseLocalizedNumber(document.getElementById("interestRate").value);
    const duration = Number.parseInt(document.getElementById("duration").value, 10);

    const monthlyWithdrawalFixed = parseLocalizedNumber(
        document.getElementById("monthlyWithdrawalFixed").value || "0"
    );

    const interestWithdrawalPercent = parseLocalizedNumber(
        document.getElementById("interestWithdrawalPercent").value || "0"
    );

    // ==============================
    // Validation
    // ==============================
    if (
        Number.isNaN(principal) ||
        Number.isNaN(monthlyContribution) ||
        Number.isNaN(interestRate) ||
        Number.isNaN(duration) ||
        Number.isNaN(monthlyWithdrawalFixed) ||
        Number.isNaN(interestWithdrawalPercent)
    ) {
        alert("Merci de saisir des valeurs valides.");
        return;
    }

    if (
        principal < 0 ||
        monthlyContribution < 0 ||
        interestRate < 0 ||
        duration <= 0 ||
        monthlyWithdrawalFixed < 0 ||
        interestWithdrawalPercent < 0
    ) {
        alert("Les valeurs ne peuvent pas être négatives, et la durée doit être supérieure à 0.");
        return;
    }

    if (interestWithdrawalPercent > 100) {
        alert("Le pourcentage de retrait sur les intérêts ne peut pas dépasser 100 %.");
        return;
    }

    // ==============================
    // Calcul
    // ==============================
    const simulation = calculateCompoundInterestWithWithdrawals(
        principal,
        monthlyContribution,
        interestRate,
        duration,
        monthlyWithdrawalFixed,
        interestWithdrawalPercent
    );

    // ==============================
    // Mise à jour UI
    // ==============================
    updateSummary(
        simulation,
        interestRate,
        duration,
        monthlyWithdrawalFixed,
        interestWithdrawalPercent
    );

    renderChart(
        simulation.labels,
        simulation.balances,
        simulation.contributions,
        simulation.withdrawnSeries
    );
}

// ==============================
//  INITIALISATION
// ==============================

document.addEventListener("DOMContentLoaded", function () {
    const form = document.getElementById("interestForm");
    const resetButton = document.getElementById("resetButton");

    // Soumission du formulaire
    form.addEventListener("submit", function (event) {
        // Empêche le rechargement de la page
        event.preventDefault();

        // Lance une nouvelle simulation
        runSimulation();
    });

    // Bouton reset
    resetButton.addEventListener("click", function () {
        document.getElementById("principal").value = "10000";
        document.getElementById("monthlyContribution").value = "500";
        document.getElementById("interestRate").value = "7,5";
        document.getElementById("duration").value = "10";
        document.getElementById("monthlyWithdrawalFixed").value = "500";
        document.getElementById("interestWithdrawalPercent").value = "0";

        runSimulation();
    });

    // Simulation initiale
    runSimulation();
});