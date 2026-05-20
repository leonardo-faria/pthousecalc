const {
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
    getBuyers,
    setBuyers,
} = require('./calculator');

describe('formatCurrency', () => {
    test('formata valores positivos em EUR', () => {
        const result = formatCurrency(1000);
        expect(result).toMatch(/1.?000/);
        expect(result).toMatch(/€/);
    });

    test('formata valores grandes com separador de milhares', () => {
        const result = formatCurrency(250000);
        expect(result).toMatch(/250[\s.]000/);
    });

    test('arredonda decimais', () => {
        const result = formatCurrency(1234.56);
        expect(result).toMatch(/1.?235/);
    });

    test('formata zero', () => {
        const result = formatCurrency(0);
        expect(result).toMatch(/0/);
        expect(result).toMatch(/€/);
    });
});

describe('calculateIMT', () => {
    describe('Habitação Própria Permanente', () => {
        test('isento até 101.917€', () => {
            expect(calculateIMT(100000, true)).toBe(0);
            expect(calculateIMT(101917, true)).toBe(0);
        });

        test('taxa 2% entre 101.917 e 139.412€', () => {
            const imt = calculateIMT(120000, true);
            expect(imt).toBeCloseTo(120000 * 0.02 - 2038.34, 2);
        });

        test('taxa 5% entre 139.412 e 190.086€', () => {
            const imt = calculateIMT(150000, true);
            expect(imt).toBeCloseTo(150000 * 0.05 - 6220.70, 2);
        });

        test('taxa 7% entre 190.086 e 316.772€', () => {
            const imt = calculateIMT(250000, true);
            expect(imt).toBeCloseTo(250000 * 0.07 - 10022.42, 2);
        });

        test('taxa 8% entre 316.772 e 633.453€', () => {
            const imt = calculateIMT(400000, true);
            expect(imt).toBeCloseTo(400000 * 0.08 - 13189.14, 2);
        });

        test('taxa única 6% entre 633.453 e 1.102.920€', () => {
            const imt = calculateIMT(800000, true);
            expect(imt).toBeCloseTo(800000 * 0.06, 2);
        });

        test('taxa única 7.5% acima de 1.102.920€', () => {
            const imt = calculateIMT(1500000, true);
            expect(imt).toBeCloseTo(1500000 * 0.075, 2);
        });
    });

    describe('Segunda Habitação', () => {
        test('taxa 1% até 101.917€', () => {
            const imt = calculateIMT(100000, false);
            expect(imt).toBeCloseTo(100000 * 0.01, 2);
        });

        test('sem isenção para segunda habitação', () => {
            expect(calculateIMT(50000, false)).toBeGreaterThan(0);
        });

        test('segunda habitação é mais cara que HPP', () => {
            const imtHPP = calculateIMT(200000, true);
            const imt2a = calculateIMT(200000, false);
            expect(imt2a).toBeGreaterThan(imtHPP);
        });
    });
});

describe('calculateImpostoSeloEscritura', () => {
    test('calcula 0.8% sobre o valor', () => {
        expect(calculateImpostoSeloEscritura(250000)).toBe(2000);
        expect(calculateImpostoSeloEscritura(100000)).toBe(800);
    });

    test('retorna 0 para valor 0', () => {
        expect(calculateImpostoSeloEscritura(0)).toBe(0);
    });
});

describe('calculateImpostoSeloCredito', () => {
    test('calcula 0.6% para prazo > 5 anos', () => {
        expect(calculateImpostoSeloCredito(200000, 30)).toBe(1200);
        expect(calculateImpostoSeloCredito(200000, 10)).toBe(1200);
    });

    test('calcula 0.5% para prazo <= 5 anos', () => {
        expect(calculateImpostoSeloCredito(200000, 5)).toBe(1000);
        expect(calculateImpostoSeloCredito(200000, 3)).toBe(1000);
    });
});

describe('calculateMaisValias', () => {
    test('retorna 0 se não houver mais-valia', () => {
        // Vende por menos do que comprou (atualizado)
        expect(calculateMaisValias(100000, 120000, 5, 0, 0)).toBe(0);
    });

    test('calcula 50% da mais-valia para tributação', () => {
        // Comprou a 100k, vende a 200k, 0 anos (sem atualização)
        const result = calculateMaisValias(200000, 100000, 0, 0, 0);
        // maisValia = 200000 - 100000 = 100000
        // 50% = 50000
        expect(result).toBe(50000);
    });

    test('aplica coeficiente de atualização', () => {
        // Comprou a 100k há 10 anos
        // Valor atualizado = 100000 * 1.02^10 = ~121899
        // maisValia = 200000 - 121899 = 78101
        // 50% = ~39050
        const result = calculateMaisValias(200000, 100000, 10, 0, 0);
        expect(result).toBeCloseTo(39050, -2);
    });

    test('deduz custos de aquisição e obras', () => {
        const result = calculateMaisValias(200000, 100000, 0, 10000, 5000);
        // maisValia = 200000 - 100000 - 5000 - 10000 = 85000
        // 50% = 42500
        expect(result).toBe(42500);
    });
});

describe('calculateComissaoImobiliaria', () => {
    test('calcula comissão com IVA 23%', () => {
        // 5% de 200000 = 10000, + 23% IVA = 12300
        expect(calculateComissaoImobiliaria(200000, 5)).toBeCloseTo(12300, 2);
    });

    test('calcula 3% + IVA', () => {
        // 3% de 300000 = 9000, + 23% IVA = 11070
        expect(calculateComissaoImobiliaria(300000, 3)).toBeCloseTo(11070, 2);
    });

    test('retorna 0 para preço 0', () => {
        expect(calculateComissaoImobiliaria(0, 5)).toBe(0);
    });
});

describe('calculateAmortizacaoAntecipada', () => {
    test('0.52% para taxa variável (0.5% + 4% IS)', () => {
        expect(calculateAmortizacaoAntecipada(100000, false)).toBe(520);
        expect(calculateAmortizacaoAntecipada(50000, false)).toBe(260);
    });

    test('2.08% para taxa fixa (2% + 4% IS)', () => {
        expect(calculateAmortizacaoAntecipada(100000, true)).toBe(2080);
        expect(calculateAmortizacaoAntecipada(50000, true)).toBe(1040);
    });

    test('retorna 0 para capital 0', () => {
        expect(calculateAmortizacaoAntecipada(0, false)).toBe(0);
        expect(calculateAmortizacaoAntecipada(0, true)).toBe(0);
    });
});

describe('calculateIMI', () => {
    test('calcula IMI anual com taxa 0.35%', () => {
        // VPT 175000, taxa 0.35%
        expect(calculateIMI(175000, 0.35)).toBeCloseTo(612.5, 1);
    });

    test('calcula com taxa mínima 0.3%', () => {
        expect(calculateIMI(200000, 0.3)).toBeCloseTo(600, 1);
    });

    test('calcula com taxa máxima 0.45%', () => {
        expect(calculateIMI(200000, 0.45)).toBeCloseTo(900, 1);
    });
});

describe('calculateMortgage', () => {
    test('calcula prestação a 30 anos com 3.5%', () => {
        // 225000€ a 3.5% por 30 anos
        const payment = calculateMortgage(225000, 3.5, 30);
        expect(payment).toBeCloseTo(1010, -1);
    });

    test('taxa 0% divide capital uniformemente', () => {
        const payment = calculateMortgage(240000, 0, 30);
        expect(payment).toBeCloseTo(666.67, 0);
    });

    test('prazo mais curto = prestação mais alta', () => {
        const p30 = calculateMortgage(200000, 3.5, 30);
        const p20 = calculateMortgage(200000, 3.5, 20);
        expect(p20).toBeGreaterThan(p30);
    });

    test('prazo mais curto = menos juros totais', () => {
        const p30 = calculateMortgage(200000, 3.5, 30);
        const p20 = calculateMortgage(200000, 3.5, 20);
        expect(p20 * 20 * 12).toBeLessThan(p30 * 30 * 12);
    });
});

describe('calculateBuyerHouseProceeds', () => {
    test('retorna 0 para comprador sem imóveis', () => {
        expect(calculateBuyerHouseProceeds({ housesToSell: [] })).toBe(0);
        expect(calculateBuyerHouseProceeds({})).toBe(0);
    });

    test('comissão a 0% não reseta para 5%', () => {
        const buyer = {
            housesToSell: [{
                salePrice: 200000,
                currentBalance: 0,
                comissaoPercent: 0,
                anosDetencao: 0,
                valorAquisicao: 200000 // sem mais-valia
            }]
        };
        const proceeds = calculateBuyerHouseProceeds(buyer);
        // Com 0% comissão e sem mais-valia: net = 200000
        expect(proceeds).toBe(200000);
    });

    test('anos de posse a 0 funciona corretamente', () => {
        const buyer = {
            irsRate: 30,
            housesToSell: [{
                salePrice: 200000,
                currentBalance: 0,
                comissaoPercent: 0,
                anosDetencao: 0,
                valorAquisicao: 150000,
                isHPP: false
            }]
        };
        const proceeds = calculateBuyerHouseProceeds(buyer);
        // Mais-valia: 200000 - 150000 = 50000, tributável 50% = 25000, imposto 30% = 7500
        // Net = 200000 - 0 (comissão) - 7500 = 192500
        expect(proceeds).toBe(192500);
    });

    test('calcula líquido de venda com todos os custos', () => {
        const buyer = {
            housesToSell: [{
                salePrice: 200000,
                currentBalance: 0,
                comissaoPercent: 5,
                anosDetencao: 5,
                valorAquisicao: 140000,
                isHPP: false
            }]
        };
        const proceeds = calculateBuyerHouseProceeds(buyer);
        
        // Comissão: 200000 * 5% * 1.23 = 12300
        // Mais-valia: valor_atualizado = 140000 * 1.02^5 = ~154571
        //   mais-valia = 200000 - 154571 - 12300 (comissão dedutível Art.º 51-A) = 33129
        //   tributável (50%) = 16565
        //   imposto (28.5%) = 4721
        // Net = 200000 - 12300 - 4721 ≈ 182979
        expect(proceeds).toBeGreaterThan(175000);
        expect(proceeds).toBeLessThan(190000);
    });

    test('desconta crédito em dívida + custos amortização', () => {
        const buyer = {
            housesToSell: [{
                salePrice: 200000,
                currentBalance: 100000,
                comissaoPercent: 5,
                anosDetencao: 5,
                valorAquisicao: 140000,
                isHPP: false
            }]
        };
        const proceeds = calculateBuyerHouseProceeds(buyer);
        
        // Should be ~100670 less than without mortgage (100000 balance + 520 amortization + 150 distrate)
        const buyerNoMortgage = {
            housesToSell: [{
                salePrice: 200000,
                currentBalance: 0,
                comissaoPercent: 5,
                anosDetencao: 5,
                valorAquisicao: 140000,
                isHPP: false
            }]
        };
        const proceedsNoMortgage = calculateBuyerHouseProceeds(buyerNoMortgage);
        
        expect(proceedsNoMortgage - proceeds).toBeCloseTo(100670, -2); // 100000 + 520 + 150
    });

    test('retorna 0 se custos excedem preço de venda', () => {
        const buyer = {
            housesToSell: [{
                salePrice: 50000,
                currentBalance: 200000, // underwater
                comissaoPercent: 5,
                anosDetencao: 1,
                valorAquisicao: 250000
            }]
        };
        expect(calculateBuyerHouseProceeds(buyer)).toBe(0);
    });

    test('soma líquido de múltiplos imóveis', () => {
        const buyer = {
            housesToSell: [
                { salePrice: 200000, currentBalance: 0, comissaoPercent: 5, anosDetencao: 5, valorAquisicao: 140000, isHPP: false },
                { salePrice: 150000, currentBalance: 50000, comissaoPercent: 5, anosDetencao: 3, valorAquisicao: 100000, isHPP: false }
            ]
        };
        const proceeds = calculateBuyerHouseProceeds(buyer);
        expect(proceeds).toBeGreaterThan(200000);
    });

    test('HPP com reinvestimento isenta mais-valias', () => {
        const buyerHPP = {
            irsRate: 30,
            housesToSell: [{
                salePrice: 200000, currentBalance: 0, comissaoPercent: 0,
                anosDetencao: 0, valorAquisicao: 150000, isHPP: true
            }]
        };
        const buyerNonHPP = {
            irsRate: 30,
            housesToSell: [{
                salePrice: 200000, currentBalance: 0, comissaoPercent: 0,
                anosDetencao: 0, valorAquisicao: 150000, isHPP: false
            }]
        };
        const proceedsHPP = calculateBuyerHouseProceeds(buyerHPP);
        const proceedsNonHPP = calculateBuyerHouseProceeds(buyerNonHPP);
        // HPP is exempt: net = 200000
        expect(proceedsHPP).toBe(200000);
        // Non-HPP: imposto = 50000 * 0.5 * 0.30 = 7500, net = 192500
        expect(proceedsNonHPP).toBe(192500);
        expect(proceedsHPP).toBeGreaterThan(proceedsNonHPP);
    });

    test('usa taxa marginal IRS do comprador para mais-valias', () => {
        const buyer48 = {
            irsRate: 48,
            housesToSell: [{
                salePrice: 200000, currentBalance: 0, comissaoPercent: 0,
                anosDetencao: 0, valorAquisicao: 150000, isHPP: false
            }]
        };
        const buyer14 = {
            irsRate: 14.5,
            housesToSell: [{
                salePrice: 200000, currentBalance: 0, comissaoPercent: 0,
                anosDetencao: 0, valorAquisicao: 150000, isHPP: false
            }]
        };
        const proceeds48 = calculateBuyerHouseProceeds(buyer48);
        const proceeds14 = calculateBuyerHouseProceeds(buyer14);
        // Higher tax rate = lower proceeds
        expect(proceeds14).toBeGreaterThan(proceeds48);
        // Mais-valia = 50000, tributável 50% = 25000
        // At 48%: imposto = 12000, net = 188000
        // At 14.5%: imposto = 3625, net = 196375
        expect(proceeds48).toBe(188000);
        expect(proceeds14).toBe(196375);
    });
});

describe('calculateTotalPoolValues', () => {
    beforeEach(() => {
        setBuyers([]);
    });

    test('retorna zeros sem compradores', () => {
        const pool = calculateTotalPoolValues();
        expect(pool.totalAvailableCash).toBe(0);
        expect(pool.totalContributing).toBe(0);
        expect(pool.totalReserve).toBe(0);
    });

    test('calcula pool para comprador com poupanças', () => {
        setBuyers([{
            id: 1,
            startingCash: 50000,
            housesToSell: [],
            contributionAmount: 40000
        }]);
        
        const pool = calculateTotalPoolValues();
        expect(pool.totalAvailableCash).toBe(50000);
        expect(pool.totalContributing).toBe(40000);
        expect(pool.totalReserve).toBe(10000);
    });

    test('desconta crédito em dívida via imóveis a vender', () => {
        setBuyers([{
            id: 1,
            startingCash: 50000,
            housesToSell: [{
                salePrice: 200000,
                currentBalance: 100000,
                comissaoPercent: 5,
                anosDetencao: 5,
                valorAquisicao: 140000
            }],
            contributionAmount: 25000
        }]);
        
        const pool = calculateTotalPoolValues();
        // startingCash + houseProceeds (which already subtracts mortgage)
        expect(pool.totalAvailableCash).toBeGreaterThan(50000);
        expect(pool.totalContributing).toBe(25000);
    });

    test('agrega múltiplos compradores', () => {
        setBuyers([
            { id: 1, startingCash: 30000, housesToSell: [], contributionAmount: 25000 },
            { id: 2, startingCash: 40000, housesToSell: [], contributionAmount: 30000 }
        ]);
        
        const pool = calculateTotalPoolValues();
        expect(pool.totalAvailableCash).toBe(70000); // 30000 + 40000
        expect(pool.totalContributing).toBe(55000);
        expect(pool.totalReserve).toBe(15000);
    });
});

describe('cenários integrados Portugal', () => {
    test('compra típica HPP 250k€ - custos iniciais', () => {
        const homePrice = 250000;
        const imt = calculateIMT(homePrice, true);
        const isEscritura = calculateImpostoSeloEscritura(homePrice);
        const loanAmount = 225000;
        const isCredito = calculateImpostoSeloCredito(loanAmount, 30);
        
        // IMT: 250000 * 0.07 - 10022.42 = 7477.58
        expect(imt).toBeCloseTo(7477.58, 2);
        // IS escritura: 250000 * 0.008 = 2000
        expect(isEscritura).toBe(2000);
        // IS crédito: 225000 * 0.006 = 1350
        expect(isCredito).toBe(1350);
        
        const totalImpostos = imt + isEscritura + isCredito + 700; // + registo
        expect(totalImpostos).toBeCloseTo(11527.58, 0);
    });

    test('isento de IMT para imóveis baratos em HPP', () => {
        expect(calculateIMT(90000, true)).toBe(0);
        expect(calculateIMT(101917, true)).toBe(0);
    });

    test('custo total mensal típico', () => {
        const loanAmount = 225000;
        const prestacao = calculateMortgage(loanAmount, 3.5, 30);
        const imi = calculateIMI(175000, 0.35) / 12;
        const seguroVida = 30;
        const seguroMultirriscos = 20;
        const totalMensal = prestacao + imi + seguroVida + seguroMultirriscos;
        
        expect(totalMensal).toBeGreaterThan(1050);
        expect(totalMensal).toBeLessThan(1150);
    });
});
