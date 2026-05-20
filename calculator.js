// State
let charts = {};
let buyers = [];
let nextBuyerId = 1;
let housesToSell = [];
let nextHouseId = 1;

function formatCurrency(value) {
    return new Intl.NumberFormat('pt-PT', {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(value);
}

// IMT CALCULATION (Habitação Própria Permanente - Continente)
function calculateIMT(value, isPermanentResidence) {
    if (isPermanentResidence) {
        if (value <= 101917) return 0;
        if (value <= 139412) return value * 0.02 - 2038.34;
        if (value <= 190086) return value * 0.05 - 6220.70;
        if (value <= 316772) return value * 0.07 - 10022.42;
        if (value <= 633453) return value * 0.08 - 13189.14;
        if (value <= 1102920) return value * 0.06;
        return value * 0.075;
    } else {
        // Segunda habitação / investimento
        if (value <= 101917) return value * 0.01;
        if (value <= 139412) return value * 0.02 - 1019.17;
        if (value <= 190086) return value * 0.05 - 5201.53;
        if (value <= 316772) return value * 0.07 - 9003.25;
        if (value <= 607528) return value * 0.08 - 12170.02;
        if (value <= 1102920) return value * 0.06;
        return value * 0.075;
    }
}

// Imposto de Selo sobre escritura (0.8%)
function calculateImpostoSeloEscritura(value) {
    return value * 0.008;
}

// Imposto de Selo sobre crédito (0.6% para prazo > 5 anos)
function calculateImpostoSeloCredito(loanAmount, termYears) {
    if (termYears > 5) return loanAmount * 0.006;
    return loanAmount * 0.005;
}

// Mais-valias na venda
function calculateMaisValias(salePrice, acquisitionPrice, yearsOwned, improvementCosts, acquisitionCosts) {
    // Coeficiente de atualização simplificado (aprox. 2% ao ano)
    const coeficiente = Math.pow(1.02, yearsOwned);
    const valorAquisicaoAtualizado = acquisitionPrice * coeficiente;
    
    const maisValia = salePrice - valorAquisicaoAtualizado - acquisitionCosts - improvementCosts;
    
    if (maisValia <= 0) return 0;
    
    // 50% tributada (HPP)
    return maisValia * 0.5;
}

// Comissão imobiliária (tipicamente 5% + IVA 23%)
function calculateComissaoImobiliaria(salePrice, percentagem) {
    const comissao = salePrice * (percentagem / 100);
    return comissao * 1.23; // + IVA 23%
}

// Amortização antecipada (comissão + 4% Imposto de Selo sobre a comissão)
// Taxa variável: 0.5% × 1.04 = 0.52%  |  Taxa fixa: 2% × 1.04 = 2.08%
function calculateAmortizacaoAntecipada(capitalReembolsado, isFixedRate) {
    if (isFixedRate) return capitalReembolsado * 0.0208;
    return capitalReembolsado * 0.0052;
}

// IMI anual
function calculateIMI(vpt, taxaIMI) {
    return vpt * (taxaIMI / 100);
}

// BUYER MANAGEMENT
function addBuyer() {
    const buyerId = nextBuyerId++;
    buyers.push({
        id: buyerId,
        name: `Comprador ${buyerId}`,
        startingCash: 30000,
        irsRate: 28.5,
        housesToSell: [],
        contributionAmount: 0
    });
    renderBuyers();
    updateCalculations();
}

function removeBuyer(buyerId) {
    buyers = buyers.filter(b => b.id !== buyerId);
    renderBuyers();
    updateCalculations();
}

function updateBuyerField(buyerId, field, value) {
    const buyer = buyers.find(b => b.id === buyerId);
    if (buyer) {
        buyer[field] = value;
        renderBuyers();
        updateCalculations();
    }
}

function renderBuyers() {
    const container = document.getElementById('buyersContainer');
    
    if (buyers.length === 0) {
        container.innerHTML = '<p style="color: #999; font-style: italic; padding: 20px;">Ainda não foram adicionados compradores. Clique em "Adicionar Comprador" para começar.</p>';
        document.getElementById('moneyPoolSection').style.display = 'none';
        const existingSection = container.parentElement.querySelector('[data-contribution-section="true"]');
        if (existingSection) {
            existingSection.remove();
        }
        return;
    }
    
    document.getElementById('moneyPoolSection').style.display = 'block';
    
    container.innerHTML = buyers.map((buyer, index) => {
        const startingCash = parseFloat(buyer.startingCash) || 0;
        const houseProceeds = calculateBuyerHouseProceeds(buyer);
        const availableCash = startingCash + houseProceeds;
        
        if (!buyer.contributionAmount || buyer.contributionAmount === 0) {
            buyer.contributionAmount = availableCash;
        }
        const contribution = parseFloat(buyer.contributionAmount) || availableCash;
        
        return `
            <div class="buyer-card">
                <div class="buyer-card-header">
                    <div>
                        <div class="buyer-card-title">
                            <input type="text" value="${buyer.name}" 
                                   style="border: 1px solid #ccc; padding: 5px 10px; border-radius: 4px; font-weight: 700; font-size: 1.1em;"
                                   onchange="updateBuyerField(${buyer.id}, 'name', this.value)">
                        </div>
                        <div style="color: #999; font-size: 0.9em; margin-top: 5px;">Comprador #${index + 1}</div>
                    </div>
                    ${buyers.length > 1 ? `<button class="remove-buyer-btn" onclick="removeBuyer(${buyer.id})">Remover</button>` : ''}
                </div>
                
                <div class="input-group">
                    <label for="startingCash_${buyer.id}">Poupanças (€)</label>
                    <input type="number" id="startingCash_${buyer.id}" value="${buyer.startingCash}" min="0" step="5000" 
                           onchange="updateBuyerField(${buyer.id}, 'startingCash', this.value)">
                    <div class="input-helper">Dinheiro disponível em conta</div>
                </div>
                
                <div class="input-group">
                    <label for="irsRate_${buyer.id}">Taxa Marginal IRS (%) <span class="tooltip-icon" data-tooltip="Escalão de IRS: 14.5%, 21%, 26.5%, 28.5%, 35%, 37%, 43.5%, 45%, 48%">?</span></label>
                    <input type="number" id="irsRate_${buyer.id}" value="${buyer.irsRate || 28.5}" min="0" max="48" step="0.5" 
                           onchange="updateBuyerField(${buyer.id}, 'irsRate', this.value)">
                    <div class="input-helper">Escalão em que se enquadra (para mais-valias)</div>
                </div>
                
                <div style="background: #e8f4f8; padding: 15px; border-radius: 6px; margin-top: 15px;">
                    <div style="font-weight: 600; margin-bottom: 10px; color: #333;">Imóveis para Vender</div>
                    <div id="housesToSell_${buyer.id}" style="margin-bottom: 10px;">
                    </div>
                    <button class="add-house-btn" style="background: #4facfe; margin-top: 10px;" onclick="addHouseToBuyerSell(${buyer.id})">+ Adicionar Imóvel</button>
                </div>
                
                <div class="buyer-summary-grid">
                    <div class="buyer-summary-item">
                        <div class="buyer-summary-label">Da Venda de Imóveis</div>
                        <div class="buyer-summary-value" style="color: #4facfe;">${formatCurrency(houseProceeds)}</div>
                    </div>
                    <div class="buyer-summary-item">
                        <div class="buyer-summary-label">Total Disponível</div>
                        <div class="buyer-summary-value" style="color: #28a745;">${formatCurrency(Math.max(0, availableCash))}</div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    buyers.forEach(buyer => {
        renderBuyerHouses(buyer.id);
    });
    
    const existingSection = container.parentElement.querySelector('[data-contribution-section="true"]');
    if (existingSection) {
        existingSection.remove();
    }
    
    const contributionSection = document.createElement('div');
    contributionSection.setAttribute('data-contribution-section', 'true');
    contributionSection.style.cssText = 'margin-top: 40px; padding: 30px; background: #f0f7ff; border-radius: 8px; border-top: 3px solid #667eea;';
    contributionSection.innerHTML = `
        <h3 style="margin-bottom: 25px; color: #333; font-size: 1.2em;">💰 Quanto Cada Comprador Contribui?</h3>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px;">
            ${buyers.map(buyer => {
                const startingCash = parseFloat(buyer.startingCash) || 0;
                const houseProceeds = calculateBuyerHouseProceeds(buyer);
                const availableCash = startingCash + houseProceeds;
                
                if (!buyer.contributionAmount || buyer.contributionAmount === 0) {
                    buyer.contributionAmount = availableCash;
                }
                const contribution = parseFloat(buyer.contributionAmount) || availableCash;
                
                return `
                    <div style="background: white; padding: 20px; border-radius: 8px; border-left: 4px solid #667eea; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                        <div style="font-weight: 700; color: #333; margin-bottom: 15px; font-size: 1.1em;">${buyer.name}</div>
                        <div style="margin-bottom: 12px;">
                            <div style="font-size: 0.85em; color: #999; margin-bottom: 3px;">Total Disponível</div>
                            <div style="font-size: 1.4em; font-weight: 700; color: #28a745;">${formatCurrency(Math.max(0, availableCash))}</div>
                        </div>
                        <div class="input-group" style="margin-top: 15px;">
                            <label for="contribution_${buyer.id}" style="font-size: 0.9em;">Contribuição (€)</label>
                            <div style="display: flex; gap: 8px; align-items: center;">
                                <input type="number" id="contribution_${buyer.id}" value="${contribution}" min="0" max="${Math.max(0, availableCash)}" step="5000" 
                                       class="contribution-input" style="flex: 1;"
                                       onchange="updateBuyerField(${buyer.id}, 'contributionAmount', this.value)">
                                <button onclick="updateBuyerField(${buyer.id}, 'contributionAmount', ${Math.max(0, availableCash)})" 
                                        style="padding: 8px 12px; background: #667eea; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.8em; white-space: nowrap;">Usar Total</button>
                            </div>
                            <div class="input-helper" style="margin-top: 5px;">Reserva: ${formatCurrency(Math.max(0, availableCash - contribution))}</div>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
    
    container.parentElement.appendChild(contributionSection);
}

function calculateBuyerHouseProceeds(buyer) {
    const irsRate = (parseFloat(buyer.irsRate) || 28.5) / 100;
    return (buyer.housesToSell || []).reduce((total, house) => {
        const salePrice = parseFloat(house.salePrice) || 0;
        const currentBalance = parseFloat(house.currentBalance) || 0;
        const comissaoPercent = house.comissaoPercent != null ? parseFloat(house.comissaoPercent) : 5;
        const anosDetencao = house.anosDetencao != null ? parseFloat(house.anosDetencao) : 5;
        const valorAquisicao = parseFloat(house.valorAquisicao) || salePrice * 0.7;
        const isHPP = house.isHPP !== false;
        
        // Comissão imobiliária (% + IVA 23%)
        const comissao = calculateComissaoImobiliaria(salePrice, comissaoPercent);
        
        // Mais-valias (50% tributável) — comissão é encargo de alienação dedutível (Art.º 51-A CIRS)
        const maisValiaTributavel = calculateMaisValias(salePrice, valorAquisicao, anosDetencao, 0, comissao);
        
        // HPP reinvestment exemption (proportional)
        let impostoMaisValias = 0;
        if (maisValiaTributavel > 0) {
            if (isHPP) {
                const reinvestmentRatio = calculateHPPReinvestmentRatio(buyer, salePrice, currentBalance);
                impostoMaisValias = maisValiaTributavel * irsRate * (1 - reinvestmentRatio);
            } else {
                impostoMaisValias = maisValiaTributavel * irsRate;
            }
        }
        
        // Amortização antecipada do crédito (0.52% taxa variável, inclui 4% IS)
        const custoAmortizacao = calculateAmortizacaoAntecipada(currentBalance, false);
        
        // Distrate
        const distrate = currentBalance > 0 ? 150 : 0;
        
        const netProceeds = salePrice - comissao - impostoMaisValias - currentBalance - custoAmortizacao - distrate;
        
        return total + Math.max(0, netProceeds);
    }, 0);
}

// Calculate HPP reinvestment exemption ratio (Art.º 10, n.º 5 CIRS)
// Valor a reinvestir = Preço Venda − Crédito em Dívida
// Exemption = min(1, reinvestedAmount / (salePrice − currentBalance))
function calculateHPPReinvestmentRatio(buyer, hppSalePrice, currentBalance) {
    if (typeof document === 'undefined') return 1; // test environment fallback
    
    const isPermanentResidence = document.getElementById('isPermanentResidence')?.checked;
    if (!isPermanentResidence) return 0; // new house is not HPP → no exemption
    
    const homePrice = parseFloat(document.getElementById('homePrice')?.value) || 0;
    const valorRealização = hppSalePrice - (currentBalance || 0);
    if (homePrice === 0 || valorRealização <= 0) return 1;
    
    // Buyer's actual contribution (what they reinvest from their own funds)
    const buyerContribution = parseFloat(buyer.contributionAmount) || 0;
    
    return Math.min(1, buyerContribution / valorRealização);
}

function addHouseToBuyerSell(buyerId) {
    const buyer = buyers.find(b => b.id === buyerId);
    if (buyer) {
        const houseId = nextHouseId++;
        if (!buyer.housesToSell) buyer.housesToSell = [];
        buyer.housesToSell.push({
            id: houseId,
            salePrice: 200000,
            currentBalance: 0,
            comissaoPercent: 5,
            anosDetencao: 5,
            valorAquisicao: 140000,
            isHPP: true
        });
        renderBuyers();
        updateCalculations();
    }
}

function removeHouseFromBuyerSell(buyerId, houseId) {
    const buyer = buyers.find(b => b.id === buyerId);
    if (buyer) {
        buyer.housesToSell = buyer.housesToSell.filter(h => h.id !== houseId);
        renderBuyers();
        updateCalculations();
    }
}

function updateBuyerHouse(buyerId, houseId, field, value) {
    const buyer = buyers.find(b => b.id === buyerId);
    if (buyer) {
        const house = buyer.housesToSell.find(h => h.id === houseId);
        if (house) {
            house[field] = value;
            renderBuyers();
            updateCalculations();
        }
    }
}

function renderBuyerHouses(buyerId) {
    const buyer = buyers.find(b => b.id === buyerId);
    if (!buyer || !buyer.housesToSell || buyer.housesToSell.length === 0) return;
    
    const container = document.getElementById(`housesToSell_${buyerId}`);
    if (!container) return;
    
    const irsRate = (parseFloat(buyer.irsRate) || 28.5) / 100;
    
    container.innerHTML = buyer.housesToSell.map((house, idx) => {
        const salePrice = parseFloat(house.salePrice) || 0;
        const currentBalance = parseFloat(house.currentBalance) || 0;
        const comissaoPercent = house.comissaoPercent != null ? parseFloat(house.comissaoPercent) : 5;
        const valorAquisicao = parseFloat(house.valorAquisicao) || salePrice * 0.7;
        const anosDetencao = house.anosDetencao != null ? parseFloat(house.anosDetencao) : 5;
        const isHPP = house.isHPP !== false;
        
        const comissao = calculateComissaoImobiliaria(salePrice, comissaoPercent);
        const comissaoBase = salePrice * (comissaoPercent / 100);
        const comissaoIVA = comissaoBase * 0.23;
        const maisValiaTributavel = calculateMaisValias(salePrice, valorAquisicao, anosDetencao, 0, comissao);
        const reinvestmentRatio = isHPP ? calculateHPPReinvestmentRatio(buyer, salePrice, currentBalance) : 0;
        const impostoMaisValias = isHPP ? maisValiaTributavel * irsRate * (1 - reinvestmentRatio) : maisValiaTributavel * irsRate;
        const custoAmortizacao = calculateAmortizacaoAntecipada(currentBalance, false);
        const penalizacao = currentBalance * 0.005;
        const isAmortizacao = currentBalance * 0.0002;
        const distrate = currentBalance > 0 ? 150 : 0;
        const netProceeds = salePrice - comissao - impostoMaisValias - currentBalance - custoAmortizacao - distrate;
        
        // Mais-valias breakdown
        const coeficiente = Math.pow(1.02, anosDetencao);
        const valorAquisicaoAtualizado = valorAquisicao * coeficiente;
        const maisValiaTotal = salePrice - valorAquisicaoAtualizado - comissao;
        
        return `
            <div style="background: white; padding: 12px; border-radius: 6px; margin-bottom: 10px; border: 1px solid #e0e0e0;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <div style="font-weight: 600; color: #333;">Imóvel #${idx + 1}</div>
                    <button class="remove-house-btn" style="padding: 4px 10px; font-size: 0.8em;" onclick="removeHouseFromBuyerSell(${buyerId}, ${house.id})">Remover</button>
                </div>
                <div style="margin-bottom: 10px;">
                    <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 0.85em; font-weight: 500; color: #333;">
                        <input type="checkbox" ${isHPP ? 'checked' : ''} style="width: auto;"
                               onchange="updateBuyerHouse(${buyerId}, ${house.id}, 'isHPP', this.checked)">
                        Habitação Própria Permanente (HPP)
                        <span class="tooltip-icon" data-tooltip="Se HPP e reinvestir em nova HPP dentro de 36 meses: isenção de mais-valias. Se não for HPP: 50% tributado à taxa marginal.">?</span>
                    </label>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px;">
                    <div>
                        <label style="display: block; font-size: 0.8em; color: #666; margin-bottom: 4px; font-weight: 500;">Preço de Venda (€)</label>
                        <input type="number" value="${house.salePrice}" min="0" step="5000" 
                               style="padding: 8px; border: 1px solid #e0e0e0; border-radius: 4px; width: 100%;"
                               onchange="updateBuyerHouse(${buyerId}, ${house.id}, 'salePrice', this.value)">
                    </div>
                    <div>
                        <label style="display: block; font-size: 0.8em; color: #666; margin-bottom: 4px; font-weight: 500;">Crédito em Dívida (€)</label>
                        <input type="number" value="${house.currentBalance}" min="0" step="5000" 
                               style="padding: 8px; border: 1px solid #e0e0e0; border-radius: 4px; width: 100%;"
                               onchange="updateBuyerHouse(${buyerId}, ${house.id}, 'currentBalance', this.value)">
                    </div>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-bottom: 10px;">
                    <div>
                        <label style="display: block; font-size: 0.8em; color: #666; margin-bottom: 4px; font-weight: 500;">Valor Aquisição (€)</label>
                        <input type="number" value="${house.valorAquisicao}" min="0" step="5000" 
                               style="padding: 8px; border: 1px solid #e0e0e0; border-radius: 4px; width: 100%;"
                               onchange="updateBuyerHouse(${buyerId}, ${house.id}, 'valorAquisicao', this.value)">
                    </div>
                    <div>
                        <label style="display: block; font-size: 0.8em; color: #666; margin-bottom: 4px; font-weight: 500;">Anos de Posse</label>
                        <input type="number" value="${house.anosDetencao}" min="0" step="1" 
                               style="padding: 8px; border: 1px solid #e0e0e0; border-radius: 4px; width: 100%;"
                               onchange="updateBuyerHouse(${buyerId}, ${house.id}, 'anosDetencao', this.value)">
                    </div>
                    <div>
                        <label style="display: block; font-size: 0.8em; color: #666; margin-bottom: 4px; font-weight: 500;">Comissão (%)</label>
                        <input type="number" value="${house.comissaoPercent}" min="0" max="10" step="0.5" 
                               style="padding: 8px; border: 1px solid #e0e0e0; border-radius: 4px; width: 100%;"
                               onchange="updateBuyerHouse(${buyerId}, ${house.id}, 'comissaoPercent', this.value)">
                    </div>
                </div>
                <div style="font-size: 0.8em; color: #666; margin-top: 8px; padding: 10px; background: #f8f8f8; border-radius: 4px;">
                    <div style="font-weight: 600; margin-bottom: 6px; color: #555;">Custos da Venda:</div>
                    <div style="display: flex; justify-content: space-between;"><span>Comissão: ${formatCurrency(salePrice)} × ${comissaoPercent}% = ${formatCurrency(comissaoBase)}</span><span></span></div>
                    <div style="display: flex; justify-content: space-between;"><span>+ IVA 23%: ${formatCurrency(comissaoBase)} × 23% = ${formatCurrency(comissaoIVA)}</span><span></span></div>
                    <div style="display: flex; justify-content: space-between; font-weight: 600;"><span>= Comissão total</span><span>-${formatCurrency(comissao)}</span></div>
                    <div style="margin-top: 6px; display: flex; justify-content: space-between;">
                        <span>Mais-Valias${isHPP ? (reinvestmentRatio >= 1 ? ' (isento — reinv. HPP 100%)' : reinvestmentRatio > 0 ? ' (parcial — reinv. ' + (reinvestmentRatio * 100).toFixed(0) + '%)' : ' (sem isenção — nova casa não é HPP)') : ' (50% × taxa ' + (irsRate * 100).toFixed(1) + '%)'}:</span>
                        <span>${impostoMaisValias === 0 ? '<span style="color: #28a745;">isento</span>' : '-' + formatCurrency(impostoMaisValias)}</span>
                    </div>
                    ${currentBalance > 0 ? `
                    <div style="margin-top: 6px; display: flex; justify-content: space-between;"><span>Liquidação crédito em dívida:</span><span>-${formatCurrency(currentBalance)}</span></div>
                    <div style="display: flex; justify-content: space-between;"><span>Penaliz. amortiz. antecipada: ${formatCurrency(currentBalance)} × 0,5%</span><span>-${formatCurrency(penalizacao)}</span></div>
                    <div style="display: flex; justify-content: space-between;"><span>+ IS 4% sobre penalização: ${formatCurrency(penalizacao)} × 4%</span><span>-${formatCurrency(isAmortizacao)}</span></div>
                    <div style="display: flex; justify-content: space-between; font-weight: 600;"><span>= Total amortização (0,52%)</span><span>-${formatCurrency(custoAmortizacao)}</span></div>
                    <div style="display: flex; justify-content: space-between;"><span>Distrate (cancelamento hipoteca)</span><span>-${formatCurrency(distrate)}</span></div>
                    ` : ''}
                </div>
                <div style="font-size: 0.9em; color: #333; margin-top: 8px; font-weight: 600;">Líquido: <span style="color: #28a745;">${formatCurrency(Math.max(0, netProceeds))}</span></div>
            </div>
        `;
    }).join('');
}


function calculateMortgage(principal, annualRate, years) {
    const monthlyRate = annualRate / 100 / 12;
    const numberOfPayments = years * 12;
    
    if (monthlyRate === 0) {
        return principal / numberOfPayments;
    }
    
    return principal * (monthlyRate * Math.pow(1 + monthlyRate, numberOfPayments)) / 
           (Math.pow(1 + monthlyRate, numberOfPayments) - 1);
}

function getInputValues() {
    return {
        homePrice: parseFloat(document.getElementById('homePrice').value) || 0,
        interestRate: parseFloat(document.getElementById('interestRate').value) || 0,
        loanTerm: parseFloat(document.getElementById('loanTerm').value) || 30,
        isPermanentResidence: document.getElementById('isPermanentResidence').checked,
        vpt: parseFloat(document.getElementById('vpt').value) || 0,
        taxaIMI: parseFloat(document.getElementById('taxaIMI').value) || 0.35,
        seguroVida: parseFloat(document.getElementById('seguroVida').value) || 0,
        seguroMultirriscos: parseFloat(document.getElementById('seguroMultirriscos').value) || 0,
    };
}

function calculateTotalPoolValues() {
    const totalAvailableCash = buyers.reduce((sum, buyer) => {
        const startingCash = parseFloat(buyer.startingCash) || 0;
        const houseProceeds = calculateBuyerHouseProceeds(buyer);
        return sum + Math.max(0, startingCash + houseProceeds);
    }, 0);
    
    const totalContributing = buyers.reduce((sum, buyer) => {
        return sum + (parseFloat(buyer.contributionAmount) || 0);
    }, 0);
    
    const totalReserve = totalAvailableCash - totalContributing;
    
    return {
        totalAvailableCash,
        totalContributing: Math.max(0, totalContributing),
        totalReserve: Math.max(0, totalReserve)
    };
}

function updateMoneyPool() {
    if (buyers.length === 0) {
        document.getElementById('moneyPoolSection').style.display = 'none';
        return;
    }
    
    const pool = calculateTotalPoolValues();
    
    document.getElementById('poolTotalValue').textContent = formatCurrency(pool.totalContributing);
    document.getElementById('poolAvailableCash').textContent = formatCurrency(pool.totalAvailableCash);
    document.getElementById('poolContributing').textContent = formatCurrency(pool.totalContributing);
    document.getElementById('poolReserve').textContent = formatCurrency(pool.totalReserve);
}

function renderIRSSection() {
    const container = document.getElementById('irsSection');
    if (!container) return;
    
    const buyersWithHouses = buyers.filter(b => (b.housesToSell || []).length > 0);
    
    if (buyersWithHouses.length === 0) {
        container.innerHTML = '<p style="color: #999; font-style: italic;">Nenhum comprador tem imóveis para vender — não há mais-valias a declarar.</p>';
        return;
    }
    
    container.innerHTML = buyersWithHouses.map(buyer => {
        const irsRate = (parseFloat(buyer.irsRate) || 28.5) / 100;
        const isPermanentResidence = document.getElementById('isPermanentResidence')?.checked;
        
        const housesHtml = (buyer.housesToSell || []).map((house, idx) => {
            const salePrice = parseFloat(house.salePrice) || 0;
            const currentBalance = parseFloat(house.currentBalance) || 0;
            const comissaoPercent = house.comissaoPercent != null ? parseFloat(house.comissaoPercent) : 5;
            const anosDetencao = house.anosDetencao != null ? parseFloat(house.anosDetencao) : 5;
            const valorAquisicao = parseFloat(house.valorAquisicao) || salePrice * 0.7;
            const isHPP = house.isHPP !== false;
            
            // Other costs (calculated first — comissão is deductible from mais-valia)
            const comissao = calculateComissaoImobiliaria(salePrice, comissaoPercent);
            const comissaoBase = salePrice * (comissaoPercent / 100);
            const comissaoIVA = comissaoBase * 0.23;
            
            // Mais-valias calculation breakdown — comissão deduzida como encargo de alienação (Art.º 51-A)
            const coeficiente = Math.pow(1.02, anosDetencao);
            const valorAquisicaoAtualizado = valorAquisicao * coeficiente;
            const maisValiaTotal = salePrice - valorAquisicaoAtualizado - comissao;
            const maisValiaTributavel = maisValiaTotal > 0 ? maisValiaTotal * 0.5 : 0;
            
            // HPP reinvestment calculation (Art.º 10, n.º 5 — denominator = salePrice − currentBalance)
            const valorRealizacaoLiquido = salePrice - currentBalance;
            const reinvestedAmount = parseFloat(buyer.contributionAmount) || 0;
            const reinvestmentRatio = isHPP ? calculateHPPReinvestmentRatio(buyer, salePrice, currentBalance) : 0;
            const impostoSemIsencao = maisValiaTributavel * irsRate;
            const impostoMaisValias = isHPP ? impostoSemIsencao * (1 - reinvestmentRatio) : impostoSemIsencao;
            
            const custoAmortizacao = calculateAmortizacaoAntecipada(currentBalance, false);
            const penalizacao = currentBalance * 0.005;
            const isAmortizacao = currentBalance * 0.0002;
            const distrate = currentBalance > 0 ? 150 : 0;
            const netProceeds = Math.max(0, salePrice - comissao - impostoMaisValias - currentBalance - custoAmortizacao - distrate);
            
            return `
                <div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 15px; border-left: 4px solid ${isHPP ? '#4caf50' : '#f093fb'};">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                        <div style="font-weight: 700; color: #333;">Imóvel ${idx + 1} — Venda por ${formatCurrency(salePrice)}</div>
                        <span style="font-size: 0.8em; padding: 3px 8px; border-radius: 4px; background: ${isHPP ? '#e8f5e9' : '#fce4ec'}; color: ${isHPP ? '#2e7d32' : '#c62828'};">
                            ${isHPP ? '🏠 HPP' : '🏘️ Segunda Habitação'}
                        </span>
                    </div>
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 0.9em;">
                        <div style="padding: 8px; background: #f8f9fa; border-radius: 4px;">
                            <div style="color: #666;">Valor de Aquisição</div>
                            <div style="font-weight: 600;">${formatCurrency(valorAquisicao)}</div>
                            <div style="color: #999; font-size: 0.8em;">Preço pago na compra original</div>
                        </div>
                        <div style="padding: 8px; background: #f8f9fa; border-radius: 4px;">
                            <div style="color: #666;">Coef. Atualização (${anosDetencao} anos)</div>
                            <div style="font-weight: 600;">${coeficiente.toFixed(4)}</div>
                            <div style="color: #999; font-size: 0.8em;">≈ 2%/ano (inflação, Art.º 50 CIRS)</div>
                        </div>
                        <div style="padding: 8px; background: #f8f9fa; border-radius: 4px;">
                            <div style="color: #666;">Valor Aquisição Atualizado</div>
                            <div style="font-weight: 600;">${formatCurrency(valorAquisicaoAtualizado)}</div>
                            <div style="color: #999; font-size: 0.8em;">${formatCurrency(valorAquisicao)} × ${coeficiente.toFixed(4)}</div>
                        </div>
                        <div style="padding: 8px; background: ${maisValiaTotal > 0 ? '#fff3cd' : '#d4edda'}; border-radius: 4px;">
                            <div style="color: #666;">Mais-Valia Bruta</div>
                            <div style="font-weight: 600; color: ${maisValiaTotal > 0 ? '#856404' : '#155724'};">${formatCurrency(Math.max(0, maisValiaTotal))}</div>
                            <div style="color: #999; font-size: 0.8em;">${formatCurrency(salePrice)} − ${formatCurrency(valorAquisicaoAtualizado)} − ${formatCurrency(comissao)} (comissão)</div>
                        </div>
                    </div>
                    
                    ${maisValiaTotal > 0 ? `
                    <div style="margin-top: 15px; padding: 15px; background: ${isHPP ? (reinvestmentRatio >= 1 ? '#e8f5e9' : '#fff8e1') : '#fff8e1'}; border-radius: 6px; border: 1px solid ${isHPP ? (reinvestmentRatio >= 1 ? '#a5d6a7' : '#ffe082') : '#ffe082'};">
                        <div style="font-weight: 600; margin-bottom: 10px; color: ${isHPP ? (reinvestmentRatio >= 1 ? '#2e7d32' : '#f57f17') : '#f57f17'};">📊 Cálculo IRS — Mais-Valias</div>
                        <div style="display: grid; gap: 6px; font-size: 0.88em;">
                            <div style="display: flex; justify-content: space-between;">
                                <span>Preço de venda</span>
                                <span style="font-weight: 600;">${formatCurrency(salePrice)}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between;">
                                <span>− Valor aquisição atualizado (${formatCurrency(valorAquisicao)} × ${coeficiente.toFixed(4)})</span>
                                <span style="font-weight: 600;">− ${formatCurrency(valorAquisicaoAtualizado)}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between;">
                                <span>− Encargos de alienação (comissão, Art.º 51-A CIRS)</span>
                                <span style="font-weight: 600;">− ${formatCurrency(comissao)}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; font-weight: 600; padding-top: 4px; border-top: 1px dashed #ccc;">
                                <span>= Mais-valia bruta</span>
                                <span>${formatCurrency(maisValiaTotal)}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between;">
                                <span>Tributação a 50% (Art.º 43 CIRS — englobamento): ${formatCurrency(maisValiaTotal)} × 50%</span>
                                <span style="font-weight: 600;">${formatCurrency(maisValiaTributavel)}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between;">
                                <span>Taxa marginal IRS do escalão do comprador</span>
                                <span style="font-weight: 600;">${(irsRate * 100).toFixed(1)}%</span>
                            </div>
                            <div style="display: flex; justify-content: space-between;">
                                <span>Imposto bruto: ${formatCurrency(maisValiaTributavel)} × ${(irsRate * 100).toFixed(1)}%</span>
                                <span style="font-weight: 600;">${formatCurrency(impostoSemIsencao)}</span>
                            </div>
                            ${isHPP ? `
                            <div style="padding-top: 10px; border-top: 1px solid ${reinvestmentRatio >= 1 ? '#a5d6a7' : '#ffe082'};">
                                <div style="font-weight: 600; margin-bottom: 6px; color: #333;">🏠 Reinvestimento HPP (Art.º 10 CIRS)</div>
                                <div style="display: grid; gap: 4px;">
                                    <div style="display: flex; justify-content: space-between;">
                                        <span>Valor de realização (venda)</span>
                                        <span style="font-weight: 600;">${formatCurrency(salePrice)}</span>
                                    </div>
                                    ${currentBalance > 0 ? `
                                    <div style="display: flex; justify-content: space-between;">
                                        <span>− Amortização do empréstimo (Art.º 10, n.º 5)</span>
                                        <span style="font-weight: 600;">− ${formatCurrency(currentBalance)}</span>
                                    </div>
                                    <div style="display: flex; justify-content: space-between; font-weight: 600; padding-top: 2px; border-top: 1px dashed #ccc;">
                                        <span>= Valor a reinvestir</span>
                                        <span>${formatCurrency(valorRealizacaoLiquido)}</span>
                                    </div>
                                    ` : ''}
                                    <div style="display: flex; justify-content: space-between;">
                                        <span>Valor reinvestido (contribuição do comprador)</span>
                                        <span style="font-weight: 600;">${formatCurrency(reinvestedAmount)}</span>
                                    </div>
                                    <div style="display: flex; justify-content: space-between;">
                                        <span>Rácio: min(1, ${formatCurrency(reinvestedAmount)} ÷ ${formatCurrency(valorRealizacaoLiquido)})</span>
                                        <span style="font-weight: 600;">${(reinvestmentRatio * 100).toFixed(1)}%</span>
                                    </div>
                                    ${!isPermanentResidence ? `
                                    <div style="display: flex; justify-content: space-between; padding: 8px; margin-top: 6px; background: #ffcdd2; border-radius: 4px; font-weight: 700; color: #c62828;">
                                        <span>⚠️ Nova casa NÃO é HPP — sem isenção por reinvestimento</span>
                                        <span></span>
                                    </div>
                                    ` : reinvestmentRatio >= 1 ? `
                                    <div style="display: flex; justify-content: space-between; padding: 8px; margin-top: 6px; background: #c8e6c9; border-radius: 4px; font-weight: 700; color: #1b5e20;">
                                        <span>✅ Isenção total — reinvestimento ≥ 100%</span>
                                        <span>0 €</span>
                                    </div>
                                    ` : `
                                    <div style="display: flex; justify-content: space-between;">
                                        <span>Isenção proporcional: ${formatCurrency(impostoSemIsencao)} × ${(reinvestmentRatio * 100).toFixed(1)}%</span>
                                        <span style="font-weight: 600; color: #2e7d32;">-${formatCurrency(impostoSemIsencao * reinvestmentRatio)}</span>
                                    </div>
                                    <div style="display: flex; justify-content: space-between; padding: 8px; margin-top: 6px; background: #fff3cd; border-radius: 4px; font-weight: 700; color: #e65100;">
                                        <span>⚠️ Isenção parcial (${(reinvestmentRatio * 100).toFixed(0)}%) — imposto a pagar</span>
                                        <span>${formatCurrency(impostoMaisValias)}</span>
                                    </div>
                                    `}
                                </div>
                            </div>
                            <div style="margin-top: 8px; font-size: 0.85em; color: #555; line-height: 1.4;">
                                <strong>Art.º 10, n.º 5 CIRS:</strong> Reinvestimento em nova HPP (até 36 meses). 
                                Valor a reinvestir = Preço de venda${currentBalance > 0 ? ' − crédito em dívida (' + formatCurrency(valorRealizacaoLiquido) + ')' : ' (' + formatCurrency(salePrice) + ')'}. 
                                Isenção proporcional: <em>Mais-valia × (Valor reinvestido ÷ Valor a reinvestir)</em>.
                                ${!isPermanentResidence ? ' <strong>A nova casa deve ser marcada como HPP.</strong>' : ''}
                            </div>
                            ` : `
                            <div style="display: flex; justify-content: space-between; padding-top: 8px; border-top: 1px solid #ffe082; font-weight: 700; color: #e65100;">
                                <span>Imposto a Pagar (mais-valias)</span>
                                <span>${formatCurrency(impostoMaisValias)}</span>
                            </div>
                            <div style="margin-top: 8px; font-size: 0.85em; color: #555; line-height: 1.4;">
                                <strong>Art.º 10/43 CIRS:</strong> Imóvel não é HPP — não é possível beneficiar da isenção por reinvestimento. 
                                50% da mais-valia é englobada aos restantes rendimentos e tributada à taxa marginal (${(irsRate * 100).toFixed(1)}%).
                            </div>
                            `}
                        </div>
                    </div>
                    ` : `
                    <div style="margin-top: 15px; padding: 12px; background: #d4edda; border-radius: 6px; color: #155724; font-size: 0.9em;">
                        ✅ Sem mais-valias tributáveis — valor de venda (${formatCurrency(salePrice)}) ≤ valor de aquisição atualizado (${formatCurrency(valorAquisicaoAtualizado)}).
                    </div>
                    `}
                    
                    <div style="margin-top: 15px; padding: 15px; background: #e8f5e9; border-radius: 6px; border: 1px solid #a5d6a7;">
                        <div style="font-weight: 600; margin-bottom: 8px; color: #2e7d32;">💰 Resumo de Custos da Venda</div>
                        <div style="display: grid; gap: 4px; font-size: 0.88em;">
                            <div style="display: flex; justify-content: space-between;">
                                <span>Comissão: ${formatCurrency(salePrice)} × ${comissaoPercent}% × 1,23 (IVA)</span>
                                <span>${formatCurrency(comissao)}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between;">
                                <span>Imposto mais-valias${isHPP ? ' (após isenção reinv. ' + (reinvestmentRatio * 100).toFixed(0) + '%)' : ''}</span>
                                <span>${formatCurrency(impostoMaisValias)}</span>
                            </div>
                            ${currentBalance > 0 ? `
                            <div style="display: flex; justify-content: space-between;">
                                <span>Liquidação crédito em dívida</span>
                                <span>${formatCurrency(currentBalance)}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between;">
                                <span>Penaliz. amortização: ${formatCurrency(currentBalance)} × 0,5% + 4% IS</span>
                                <span>${formatCurrency(custoAmortizacao)}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between;">
                                <span>Distrate (cancelamento hipoteca)</span>
                                <span>${formatCurrency(distrate)}</span>
                            </div>
                            ` : ''}
                            <div style="display: flex; justify-content: space-between; padding-top: 8px; border-top: 1px solid #a5d6a7; font-weight: 700; color: #1b5e20;">
                                <span>Líquido da Venda</span>
                                <span>${formatCurrency(netProceeds)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
        // Total IRS for this buyer (with partial reinvestment)
        const totalImposto = (buyer.housesToSell || []).reduce((sum, house) => {
            const salePrice = parseFloat(house.salePrice) || 0;
            const currentBalance = parseFloat(house.currentBalance) || 0;
            const comissaoPercent = house.comissaoPercent != null ? parseFloat(house.comissaoPercent) : 5;
            const anosDetencao = house.anosDetencao != null ? parseFloat(house.anosDetencao) : 5;
            const valorAquisicao = parseFloat(house.valorAquisicao) || salePrice * 0.7;
            const isHPP = house.isHPP !== false;
            const comissao = calculateComissaoImobiliaria(salePrice, comissaoPercent);
            const maisValiaTributavel = calculateMaisValias(salePrice, valorAquisicao, anosDetencao, 0, comissao);
            const imposto = maisValiaTributavel * irsRate;
            if (isHPP) {
                const ratio = calculateHPPReinvestmentRatio(buyer, salePrice, currentBalance);
                return sum + imposto * (1 - ratio);
            }
            return sum + imposto;
        }, 0);
        
        return `
            <div style="background: #fafafa; padding: 25px; border-radius: 10px; margin-bottom: 20px; border: 1px solid #e0e0e0;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <div>
                        <div style="font-weight: 700; font-size: 1.15em; color: #333;">${buyer.name}</div>
                        <div style="color: #666; font-size: 0.9em;">Taxa marginal: ${(irsRate * 100).toFixed(1)}%</div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-size: 0.85em; color: #666;">Total IRS (mais-valias)</div>
                        <div style="font-size: 1.4em; font-weight: 700; color: ${totalImposto > 0 ? '#e65100' : '#2e7d32'};">${formatCurrency(totalImposto)}</div>
                    </div>
                </div>
                ${housesHtml}
            </div>
        `;
    }).join('');
}

function updateCalculations() {
    const {
        homePrice, interestRate, loanTerm,
        isPermanentResidence, vpt, taxaIMI, seguroVida, seguroMultirriscos
    } = getInputValues();
    
    updateMoneyPool();
    const pool = calculateTotalPoolValues();
    
    const totalInvestment = pool.totalContributing;
    
    // Portuguese taxes (fixed costs that don't depend on loan)
    const imt = calculateIMT(homePrice, isPermanentResidence);
    const impostoSeloEscritura = calculateImpostoSeloEscritura(homePrice);
    const registoEscritura = 700;
    
    // Solve circular dependency: IS crédito depends on loan, loan depends on entrada, entrada depends on IS crédito
    // loanAmount = (homePrice - totalInvestment + imt + IS_escritura + registo) / (1 - isRate)
    const isRate = loanTerm > 5 ? 0.006 : 0.005;
    const fixedCosts = imt + impostoSeloEscritura + registoEscritura;
    const loanAmount = Math.max(0, (homePrice - totalInvestment + fixedCosts) / (1 - isRate));
    const impostoSeloCredito = loanAmount * isRate;
    
    // Entrada = o que sobra depois de pagar impostos e custos
    const totalImpostos = fixedCosts + impostoSeloCredito;
    const entrada = Math.max(0, totalInvestment - totalImpostos);
    const totalUpfront = totalInvestment; // contribuições = total custos iniciais
    
    document.getElementById('downPaymentDisplay').textContent = formatCurrency(entrada);
    
    const monthlyMortgage = calculateMortgage(loanAmount, interestRate, loanTerm);
    const monthlyIMI = calculateIMI(vpt || homePrice * 0.7, taxaIMI) / 12;
    const monthlySeguroVida = seguroVida;
    const monthlySeguroMultirriscos = seguroMultirriscos;
    const totalMonthly = monthlyMortgage + monthlyIMI + monthlySeguroVida + monthlySeguroMultirriscos;
    
    const totalPaid = monthlyMortgage * loanTerm * 12;
    const totalInterest = totalPaid - loanAmount;
    
    document.getElementById('loanAmount').textContent = formatCurrency(loanAmount);
    document.getElementById('monthlyMortgage').textContent = formatCurrency(monthlyMortgage);
    document.getElementById('monthlyIMI').textContent = formatCurrency(monthlyIMI);
    document.getElementById('monthlySeguroVida').textContent = formatCurrency(monthlySeguroVida);
    document.getElementById('monthlySeguroMultirriscos').textContent = formatCurrency(monthlySeguroMultirriscos);
    document.getElementById('totalMonthly').textContent = formatCurrency(totalMonthly);
    
    document.getElementById('breakdownDown').textContent = formatCurrency(entrada);
    document.getElementById('breakdownIMT').textContent = formatCurrency(imt);
    document.getElementById('breakdownIS').textContent = formatCurrency(impostoSeloEscritura + impostoSeloCredito);
    document.getElementById('breakdownRegisto').textContent = formatCurrency(registoEscritura);
    document.getElementById('breakdownUpfront').textContent = formatCurrency(totalUpfront);
    
    document.getElementById('totalInterest').textContent = formatCurrency(totalInterest);
    document.getElementById('totalPaid').textContent = formatCurrency(totalPaid);
    
    document.getElementById('formulaMonthlyPayment').textContent = formatCurrency(monthlyMortgage);
    document.getElementById('formulaNumPayments').textContent = (loanTerm * 12) + ' meses';
    document.getElementById('formulaTotalPaid').textContent = formatCurrency(totalPaid);
    document.getElementById('formulaTotalInterest').textContent = formatCurrency(totalInterest);
    
    document.getElementById('totalLifeIMI').textContent = formatCurrency(monthlyIMI * 12 * loanTerm);
    document.getElementById('totalLifeSeguroVida').textContent = formatCurrency(monthlySeguroVida * 12 * loanTerm);
    document.getElementById('totalLifeSeguroMultirriscos').textContent = formatCurrency(monthlySeguroMultirriscos * 12 * loanTerm);
    
    // Formula breakdowns
    const vptUsado = vpt || homePrice * 0.7;
    const ltv = homePrice > 0 ? ((loanAmount / homePrice) * 100).toFixed(1) : 0;
    
    document.getElementById('formulaLoanAmount').innerHTML = `
        <div style="margin-bottom: 6px; font-weight: 600; color: #333;">Como é calculado:</div>
        <div class="formula-item"><span>Preço do Imóvel</span><span>${formatCurrency(homePrice)}</span></div>
        <div class="formula-item"><span>− Entrada (contribuições − custos)</span><span>− ${formatCurrency(entrada)}</span></div>
        <div class="formula-item"><span>= Montante do Crédito (LTV: ${ltv}%)</span><span>${formatCurrency(loanAmount)}</span></div>
    `;
    
    const monthlyRate = interestRate / 100 / 12;
    document.getElementById('formulaMortgage').innerHTML = `
        <div style="margin-bottom: 6px; font-weight: 600; color: #333;">Como é calculado:</div>
        <div class="formula-item"><span>Capital</span><span>${formatCurrency(loanAmount)}</span></div>
        <div class="formula-item"><span>Taxa anual / 12 meses</span><span>${interestRate}% ÷ 12 = ${(monthlyRate * 100).toFixed(4)}%</span></div>
        <div class="formula-item"><span>Prazo</span><span>${loanTerm} anos × 12 = ${loanTerm * 12} meses</span></div>
        <div class="formula-item"><span>Fórmula: M = C × [r(1+r)^n] / [(1+r)^n − 1]</span><span>${formatCurrency(monthlyMortgage)}</span></div>
    `;
    
    document.getElementById('formulaIMI').innerHTML = `
        <div style="margin-bottom: 6px; font-weight: 600; color: #333;">Como é calculado:</div>
        <div class="formula-item"><span>VPT (Valor Patrimonial Tributário)</span><span>${formatCurrency(vptUsado)}</span></div>
        <div class="formula-item"><span>× Taxa IMI</span><span>${taxaIMI}%</span></div>
        <div class="formula-item"><span>= IMI Anual</span><span>${formatCurrency(monthlyIMI * 12)}</span></div>
        <div class="formula-item"><span>÷ 12 meses</span><span>${formatCurrency(monthlyIMI)}/mês</span></div>
    `;
    
    document.getElementById('formulaTotalMonthly').innerHTML = `
        <div style="margin-bottom: 6px; font-weight: 600; color: #333;">Como é calculado:</div>
        <div class="formula-item"><span>Prestação</span><span>${formatCurrency(monthlyMortgage)}</span></div>
        <div class="formula-item"><span>+ IMI mensal</span><span>${formatCurrency(monthlyIMI)}</span></div>
        <div class="formula-item"><span>+ Seguro Vida</span><span>${formatCurrency(monthlySeguroVida)}</span></div>
        <div class="formula-item"><span>+ Seguro Multirriscos</span><span>${formatCurrency(monthlySeguroMultirriscos)}</span></div>
        <div class="formula-item"><span>= Total Mensal</span><span>${formatCurrency(totalMonthly)}</span></div>
    `;
    
    // IMT formula
    let imtFormula = '';
    if (isPermanentResidence && homePrice <= 101917) {
        imtFormula = `<div class="formula-item"><span>HPP até 101.917€ → Isento</span><span>0 €</span></div>`;
    } else {
        const imtTaxa = isPermanentResidence ? 
            (homePrice <= 139412 ? '2%' : homePrice <= 190086 ? '5%' : homePrice <= 316772 ? '7%' : homePrice <= 633453 ? '8%' : homePrice <= 1102920 ? '6% (única)' : '7,5% (única)') :
            (homePrice <= 101917 ? '1%' : homePrice <= 139412 ? '2%' : homePrice <= 190086 ? '5%' : homePrice <= 316772 ? '7%' : homePrice <= 607528 ? '8%' : homePrice <= 1102920 ? '6% (única)' : '7,5% (única)');
        imtFormula = `
            <div class="formula-item"><span>Valor do Imóvel</span><span>${formatCurrency(homePrice)}</span></div>
            <div class="formula-item"><span>Tipo: ${isPermanentResidence ? 'HPP' : 'Segunda Habitação'}</span><span>Escalão: ${imtTaxa}</span></div>
            <div class="formula-item"><span>= IMT (por escalões)</span><span>${formatCurrency(imt)}</span></div>
        `;
    }
    document.getElementById('formulaIMT').innerHTML = `
        <div style="margin-bottom: 6px; font-weight: 600; color: #333;">Como é calculado:</div>
        ${imtFormula}
    `;
    
    document.getElementById('formulaIS').innerHTML = `
        <div style="margin-bottom: 6px; font-weight: 600; color: #333;">Como é calculado:</div>
        <div class="formula-item"><span>Selo Escritura: ${formatCurrency(homePrice)} × 0,8%</span><span>${formatCurrency(impostoSeloEscritura)}</span></div>
        <div class="formula-item"><span>Selo Crédito: ${formatCurrency(loanAmount)} × ${loanTerm > 5 ? '0,6%' : '0,5%'} (prazo ${loanTerm > 5 ? '> 5 anos' : '≤ 5 anos'})</span><span>${formatCurrency(impostoSeloCredito)}</span></div>
        <div class="formula-item"><span>= Total Imposto de Selo</span><span>${formatCurrency(impostoSeloEscritura + impostoSeloCredito)}</span></div>
    `;
    
    document.getElementById('formulaUpfront').innerHTML = `
        <div style="margin-bottom: 6px; font-weight: 600; color: #333;">Como é calculado:</div>
        <div class="formula-item"><span>Contribuições dos compradores</span><span>${formatCurrency(totalInvestment)}</span></div>
        <div class="formula-item"><span>− IMT</span><span>− ${formatCurrency(imt)}</span></div>
        <div class="formula-item"><span>− Imposto de Selo</span><span>− ${formatCurrency(impostoSeloEscritura + impostoSeloCredito)}</span></div>
        <div class="formula-item"><span>− Registo e Escritura</span><span>− ${formatCurrency(registoEscritura)}</span></div>
        <div class="formula-item"><span>= Entrada efetiva no imóvel</span><span>${formatCurrency(entrada)}</span></div>
    `;
    
    updateCharts(loanAmount, interestRate, loanTerm, totalInterest, monthlyMortgage, monthlyIMI, monthlySeguroVida, monthlySeguroMultirriscos);
    updateAmortizationTables(loanAmount, interestRate, loanTerm);
    renderIRSSection();
    renderCashFlowDiagram(totalInvestment, entrada, imt, impostoSeloEscritura + impostoSeloCredito, registoEscritura, loanAmount, homePrice, monthlyMortgage, monthlyIMI, monthlySeguroVida, monthlySeguroMultirriscos);
}

function updateCharts(loanAmount, interestRate, loanTerm, totalInterest, monthlyMortgage, monthlyIMI, monthlySeguroVida, monthlySeguroMultirriscos) {
    if (charts.costBreakdown) charts.costBreakdown.destroy();
    charts.costBreakdown = new Chart(document.getElementById('costBreakdownChart'), {
        type: 'doughnut',
        data: {
            labels: ['Capital', 'Juros', 'IMI', 'Seguro Vida', 'Seguro Multirriscos'],
            datasets: [{
                data: [
                    loanAmount,
                    totalInterest,
                    monthlyIMI * 12 * loanTerm,
                    monthlySeguroVida * 12 * loanTerm,
                    monthlySeguroMultirriscos * 12 * loanTerm
                ],
                backgroundColor: ['#667eea', '#764ba2', '#f093fb', '#4facfe', '#00f2fe'],
                borderColor: 'white',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom' },
                title: { display: true, text: `Custos Totais em ${loanTerm} Anos` }
            }
        }
    });
    
    if (charts.monthlyBreakdown) charts.monthlyBreakdown.destroy();
    charts.monthlyBreakdown = new Chart(document.getElementById('monthlyBreakdownChart'), {
        type: 'bar',
        data: {
            labels: ['Prestação', 'IMI', 'Seguro Vida', 'Seg. Multirriscos'],
            datasets: [{
                label: 'Valor Mensal (€)',
                data: [monthlyMortgage, monthlyIMI, monthlySeguroVida, monthlySeguroMultirriscos],
                backgroundColor: ['#667eea', '#f093fb', '#4facfe', '#00f2fe']
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            plugins: {
                legend: { display: false },
                title: { display: true, text: 'Encargos Mensais' }
            },
            scales: { x: { beginAtZero: true } }
        }
    });
    
    const monthlyRate = interestRate / 100 / 12;
    const numberOfPayments = loanTerm * 12;
    let balance = loanAmount;
    const principalByMonth = [];
    const interestByMonth = [];
    
    for (let i = 0; i < numberOfPayments; i++) {
        const interestPayment = balance * monthlyRate;
        const principalPayment = monthlyMortgage - interestPayment;
        principalByMonth.push(principalPayment);
        interestByMonth.push(interestPayment);
        balance -= principalPayment;
    }
    
    const chartData = [];
    const chartLabels = [];
    for (let i = 0; i < Math.min(numberOfPayments, 360); i += 12) {
        chartLabels.push(`Ano ${Math.floor(i / 12) + 1}`);
        chartData.push({
            principal: principalByMonth.slice(i, i + 12).reduce((a, b) => a + b, 0),
            interest: interestByMonth.slice(i, i + 12).reduce((a, b) => a + b, 0)
        });
    }
    
    if (charts.principalInterest) charts.principalInterest.destroy();
    charts.principalInterest = new Chart(document.getElementById('principalInterestChart'), {
        type: 'bar',
        data: {
            labels: chartLabels,
            datasets: [
                { label: 'Capital', data: chartData.map(d => d.principal), backgroundColor: '#667eea' },
                { label: 'Juros', data: chartData.map(d => d.interest), backgroundColor: '#764ba2' }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { x: { stacked: true }, y: { stacked: true } },
            plugins: { title: { display: true, text: 'Capital vs Juros por Ano' } }
        }
    });
}

function updateAmortizationTables(loanAmount, interestRate, loanTerm) {
    const monthlyRate = interestRate / 100 / 12;
    const numberOfPayments = loanTerm * 12;
    const monthlyPayment = calculateMortgage(loanAmount, interestRate, loanTerm);
    
    let balance = loanAmount;
    let monthlyData = [];
    let yearlyData = [];
    
    for (let month = 1; month <= numberOfPayments; month++) {
        const interestPayment = balance * monthlyRate;
        const principalPayment = monthlyPayment - interestPayment;
        balance -= principalPayment;
        
        monthlyData.push({
            month,
            beginBalance: balance + principalPayment,
            payment: monthlyPayment,
            principal: principalPayment,
            interest: interestPayment,
            endBalance: Math.max(0, balance)
        });
    }
    
    balance = loanAmount;
    for (let year = 1; year <= loanTerm; year++) {
        let yearPrincipal = 0;
        let yearInterest = 0;
        const beginBalance = balance;
        
        for (let month = 1; month <= 12; month++) {
            const data = monthlyData[(year - 1) * 12 + month - 1];
            if (data) {
                yearPrincipal += data.principal;
                yearInterest += data.interest;
            }
        }
        
        balance -= yearPrincipal;
        yearlyData.push({
            year,
            beginBalance,
            payment: monthlyPayment * 12,
            principal: yearPrincipal,
            interest: yearInterest,
            endBalance: Math.max(0, balance)
        });
    }
    
    const yearlyBody = document.getElementById('yearlyBody');
    yearlyBody.innerHTML = yearlyData.map(row => `
        <tr>
            <td>${row.year}</td>
            <td>${formatCurrency(row.beginBalance)}</td>
            <td>${formatCurrency(row.payment)}</td>
            <td>${formatCurrency(row.principal)}</td>
            <td>${formatCurrency(row.interest)}</td>
            <td>${formatCurrency(row.endBalance)}</td>
        </tr>
    `).join('');
    
    const monthlyBody = document.getElementById('monthlyBody');
    monthlyBody.innerHTML = monthlyData.slice(0, 12).map(row => `
        <tr>
            <td>${row.month}</td>
            <td>${formatCurrency(row.beginBalance)}</td>
            <td>${formatCurrency(row.payment)}</td>
            <td>${formatCurrency(row.principal)}</td>
            <td>${formatCurrency(row.interest)}</td>
            <td>${formatCurrency(row.endBalance)}</td>
        </tr>
    `).join('');
}

function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    document.getElementById(tabName).classList.add('active');
    event.target.classList.add('active');
}

function resetCalculator() {
    document.getElementById('homePrice').value = 250000;
    document.getElementById('interestRate').value = 3.5;
    document.getElementById('loanTerm').value = 30;
    document.getElementById('isPermanentResidence').checked = true;
    document.getElementById('vpt').value = 175000;
    document.getElementById('taxaIMI').value = 0.35;
    document.getElementById('seguroVida').value = 30;
    document.getElementById('seguroMultirriscos').value = 20;
    
    buyers = [];
    nextBuyerId = 1;
    addBuyer();
    updateCalculations();
}

function initCalculator() {
    document.querySelectorAll('input, select').forEach(input => {
        input.addEventListener('input', updateCalculations);
        input.addEventListener('change', updateCalculations);
    });
    
    addBuyer();
    updateCalculations();
}

function renderCashFlowDiagram(totalInvestment, entrada, imt, impostoSelo, registo, loanAmount, homePrice, monthlyMortgage, monthlyIMI, monthlySeguroVida, monthlySeguroMultirriscos) {
    const container = document.getElementById('cashFlowDiagram');
    if (!container) return;
    
    const totalMonthly = monthlyMortgage + monthlyIMI + monthlySeguroVida + monthlySeguroMultirriscos;
    
    // Buyer sources
    const buyerSources = buyers.map(buyer => {
        const startingCash = parseFloat(buyer.startingCash) || 0;
        const houseProceeds = calculateBuyerHouseProceeds(buyer);
        const contribution = parseFloat(buyer.contributionAmount) || 0;
        return { name: buyer.name, startingCash, houseProceeds, contribution };
    });
    
    container.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 0; font-size: 0.9em;">
            
            <!-- SOURCES -->
            <div style="background: #e8f5e9; border: 2px solid #4caf50; border-radius: 10px; padding: 25px;">
                <div style="font-weight: 700; font-size: 1.1em; color: #2e7d32; margin-bottom: 15px; text-align: center;">📥 ENTRADAS DE DINHEIRO</div>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
                    ${buyerSources.map(s => `
                        <div style="background: white; padding: 12px; border-radius: 6px; border-left: 3px solid #4caf50;">
                            <div style="font-weight: 600; margin-bottom: 5px;">${s.name}</div>
                            <div style="font-size: 0.85em; color: #666;">Poupanças: ${formatCurrency(s.startingCash)}</div>
                            ${s.houseProceeds > 0 ? `<div style="font-size: 0.85em; color: #666;">Venda imóveis: ${formatCurrency(s.houseProceeds)}</div>` : ''}
                            <div style="font-weight: 600; color: #2e7d32; margin-top: 5px;">Contribui: ${formatCurrency(s.contribution)}</div>
                        </div>
                    `).join('')}
                    ${loanAmount > 0 ? `
                    <div style="background: white; padding: 12px; border-radius: 6px; border-left: 3px solid #1565c0;">
                        <div style="font-weight: 600; margin-bottom: 5px;">🏦 Banco</div>
                        <div style="font-size: 0.85em; color: #666;">Crédito Habitação</div>
                        <div style="font-weight: 600; color: #1565c0; margin-top: 5px;">${formatCurrency(loanAmount)}</div>
                    </div>
                    ` : ''}
                </div>
                <div style="text-align: center; margin-top: 15px; font-weight: 700; font-size: 1.2em; color: #1b5e20;">
                    Total: ${formatCurrency(totalInvestment + loanAmount)}
                </div>
            </div>
            
            <!-- ARROW DOWN -->
            <div style="text-align: center; font-size: 2em; color: #666; line-height: 1;">▼</div>
            
            <!-- TRANSACTION -->
            <div style="background: #fff3e0; border: 2px solid #ff9800; border-radius: 10px; padding: 25px;">
                <div style="font-weight: 700; font-size: 1.1em; color: #e65100; margin-bottom: 15px; text-align: center;">🔄 TRANSAÇÃO (DIA DA ESCRITURA)</div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                    <div>
                        <div style="font-weight: 600; margin-bottom: 10px; color: #333;">Capitais Próprios (${formatCurrency(totalInvestment)})</div>
                        <div style="display: grid; gap: 6px; font-size: 0.88em;">
                            <div style="display: flex; justify-content: space-between; padding: 6px 10px; background: #fff8e1; border-radius: 4px;">
                                <span>→ Entrada no imóvel</span>
                                <span style="font-weight: 600;">${formatCurrency(entrada)}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; padding: 6px 10px; background: #ffebee; border-radius: 4px;">
                                <span>→ IMT</span>
                                <span style="font-weight: 600;">${formatCurrency(imt)}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; padding: 6px 10px; background: #ffebee; border-radius: 4px;">
                                <span>→ Imposto de Selo</span>
                                <span style="font-weight: 600;">${formatCurrency(impostoSelo)}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; padding: 6px 10px; background: #ffebee; border-radius: 4px;">
                                <span>→ Registo e Escritura</span>
                                <span style="font-weight: 600;">${formatCurrency(registo)}</span>
                            </div>
                        </div>
                    </div>
                    <div>
                        <div style="font-weight: 600; margin-bottom: 10px; color: #333;">Crédito Banco (${formatCurrency(loanAmount)})</div>
                        <div style="display: grid; gap: 6px; font-size: 0.88em;">
                            <div style="display: flex; justify-content: space-between; padding: 6px 10px; background: #e3f2fd; border-radius: 4px;">
                                <span>→ Restante do imóvel</span>
                                <span style="font-weight: 600;">${formatCurrency(loanAmount)}</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div style="text-align: center; margin-top: 15px; padding: 10px; background: #fff; border-radius: 6px; border: 2px dashed #ff9800;">
                    <div style="font-size: 0.85em; color: #666;">Valor do Imóvel</div>
                    <div style="font-size: 1.5em; font-weight: 700; color: #e65100;">${formatCurrency(homePrice)}</div>
                    <div style="font-size: 0.8em; color: #999;">${formatCurrency(entrada)} (entrada) + ${formatCurrency(loanAmount)} (crédito)</div>
                </div>
            </div>
            
            <!-- ARROW DOWN -->
            <div style="text-align: center; font-size: 2em; color: #666; line-height: 1;">▼</div>
            
            <!-- ONGOING COSTS -->
            <div style="background: #fce4ec; border: 2px solid #e91e63; border-radius: 10px; padding: 25px;">
                <div style="font-weight: 700; font-size: 1.1em; color: #880e4f; margin-bottom: 15px; text-align: center;">📤 CUSTOS MENSAIS RECORRENTES</div>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px;">
                    <div style="background: white; padding: 12px; border-radius: 6px; text-align: center;">
                        <div style="font-size: 0.8em; color: #666;">Prestação</div>
                        <div style="font-weight: 700; color: #c62828; font-size: 1.1em;">${formatCurrency(monthlyMortgage)}</div>
                    </div>
                    <div style="background: white; padding: 12px; border-radius: 6px; text-align: center;">
                        <div style="font-size: 0.8em; color: #666;">IMI</div>
                        <div style="font-weight: 700; color: #c62828; font-size: 1.1em;">${formatCurrency(monthlyIMI)}</div>
                    </div>
                    <div style="background: white; padding: 12px; border-radius: 6px; text-align: center;">
                        <div style="font-size: 0.8em; color: #666;">Seguro Vida</div>
                        <div style="font-weight: 700; color: #c62828; font-size: 1.1em;">${formatCurrency(monthlySeguroVida)}</div>
                    </div>
                    <div style="background: white; padding: 12px; border-radius: 6px; text-align: center;">
                        <div style="font-size: 0.8em; color: #666;">Seguro Multirriscos</div>
                        <div style="font-weight: 700; color: #c62828; font-size: 1.1em;">${formatCurrency(monthlySeguroMultirriscos)}</div>
                    </div>
                </div>
                <div style="text-align: center; margin-top: 15px; font-weight: 700; font-size: 1.2em; color: #880e4f;">
                    Total Mensal: ${formatCurrency(totalMonthly)}
                </div>
            </div>
        </div>
    `;
}

function saveSimulation() {
    const inputs = {
        homePrice: document.getElementById('homePrice').value,
        interestRate: document.getElementById('interestRate').value,
        loanTerm: document.getElementById('loanTerm').value,
        isPermanentResidence: document.getElementById('isPermanentResidence').checked,
        vpt: document.getElementById('vpt').value,
        taxaIMI: document.getElementById('taxaIMI').value,
        seguroVida: document.getElementById('seguroVida').value,
        seguroMultirriscos: document.getElementById('seguroMultirriscos').value,
    };
    
    const state = {
        version: 1,
        savedAt: new Date().toISOString(),
        inputs,
        buyers,
        nextBuyerId,
        nextHouseId,
    };
    
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `simulacao-casa-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

function loadSimulation(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const state = JSON.parse(e.target.result);
            
            if (!state.version || !state.inputs || !state.buyers) {
                alert('Ficheiro inválido — não é uma simulação guardada.');
                return;
            }
            
            // Restore inputs
            document.getElementById('homePrice').value = state.inputs.homePrice;
            document.getElementById('interestRate').value = state.inputs.interestRate;
            document.getElementById('loanTerm').value = state.inputs.loanTerm;
            document.getElementById('isPermanentResidence').checked = state.inputs.isPermanentResidence;
            document.getElementById('vpt').value = state.inputs.vpt;
            document.getElementById('taxaIMI').value = state.inputs.taxaIMI;
            document.getElementById('seguroVida').value = state.inputs.seguroVida;
            document.getElementById('seguroMultirriscos').value = state.inputs.seguroMultirriscos;
            
            // Restore state
            buyers = state.buyers;
            nextBuyerId = state.nextBuyerId || (buyers.length > 0 ? Math.max(...buyers.map(b => b.id)) + 1 : 1);
            nextHouseId = state.nextHouseId || 1;
            
            renderBuyers();
            updateCalculations();
        } catch (err) {
            alert('Erro ao carregar ficheiro: ' + err.message);
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

// Export for testing (Node.js / CommonJS)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        formatCurrency,
        calculateMortgage,
        calculateIMT,
        calculateImpostoSeloEscritura,
        calculateImpostoSeloCredito,
        calculateMaisValias,
        calculateComissaoImobiliaria,
        calculateAmortizacaoAntecipada,
        calculateIMI,
        calculateBuyerHouseProceeds,
        calculateTotalPoolValues,
        getBuyers: () => buyers,
        setBuyers: (b) => { buyers = b; },
        setNextBuyerId: (id) => { nextBuyerId = id; },
        setNextHouseId: (id) => { nextHouseId = id; },
    };
}
