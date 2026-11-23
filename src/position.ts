import { RestClientV5 } from 'bybit-api';
import { Table } from 'console-table-printer';

export interface TrackedPosition {
    ticker: string;
    side: string;
    contracts: number;
    usdValue: number;
    pnl?: number;
    score: number;
}

interface ScorePayload {
    ticker?: string;
    side?: string;
    score?: number | string;
}

const client = new RestClientV5({
    key: process.env.BYBIT_API_KEY,
    secret: process.env.BYBIT_API_SECRET,
    testnet: false,
});

class PositionManager {
    private positions: TrackedPosition[] = [];
    private isScheduled = false;

    public getAll(): TrackedPosition[] {
        return this.positions;
    }

    /**
     * Выводит текущие позиции в консоль в виде цветной таблицы
     */
    public printTable(label?: string): void {
        const time = new Date().toLocaleTimeString('ru-RU');

        if (this.positions.length === 0) {
            console.log(`[${time}] 📭 Открытых позиций нет`);
            return;
        }

        const table = new Table({
            title: label ? `${label} (${time})` : `Открытые позиции (${time})`,
            columns: [
                { name: 'ticker', title: 'Тикер', alignment: 'left' },
                { name: 'side', title: 'Сторона', alignment: 'center' },
                { name: 'contracts', title: 'Контракты', alignment: 'right' },
                { name: 'usdValue', title: 'Объём ($)', alignment: 'right' },
                { name: 'pnl', title: 'PnL ($)', alignment: 'right' },
                { name: 'score', title: 'Score', alignment: 'center' },
            ],
        });

        for (const pos of this.positions) {
            // Красим строку по PnL: зелёный >= 0, красный < 0
            let rowColor: 'green' | 'red' | 'white' = 'white';
            if (pos.pnl !== undefined) {
                rowColor = pos.pnl >= 0 ? 'green' : 'red';
            }

            table.addRow(
                {
                    ticker: pos.ticker,
                    side: pos.side,
                    contracts: pos.contracts,
                    usdValue: pos.usdValue.toFixed(2),
                    pnl: pos.pnl !== undefined ? pos.pnl.toFixed(2) : '—',
                    score: pos.score,
                },
                { color: rowColor }
            );
        }

        table.printTable();
    }

    public checkScore(rawBody: unknown): void {
        let data: ScorePayload;

        if (typeof rawBody === 'string') {
            try {
                data = JSON.parse(rawBody);
            } catch {
                console.warn('⚠️ Не удалось распарсить тело вебхука как JSON:', rawBody);
                return;
            }
        } else if (typeof rawBody === 'object' && rawBody !== null) {
            data = rawBody as ScorePayload;
        } else {
            return;
        }

        const ticker = data.ticker?.trim().toUpperCase();
        const side = data.side?.trim();
        const newScore = Number(data.score);

        if (!ticker || Number.isNaN(newScore)) {
            console.warn('⚠️ В вебхуке отсутствуют корректные ticker или score:', data);
            return;
        }

        const existing = this.positions.find(
            (p) => p.ticker === ticker && (!side || p.side.toLowerCase() === side.toLowerCase())
        );

        if (existing) {
            existing.score = newScore;
            console.log(`🎯 Обновлён score для ${ticker} (${existing.side}): ${existing.score}`);
            this.printTable('Обновление Score');
        } else {
            console.log(`ℹ️ Алерт по ${ticker} (score: ${newScore}) проигнорирован — позиция не открыта`);
        }
    }

    public update(): void {
        if (this.isScheduled) return;
        this.isScheduled = true;

        const now = new Date();
        const msUntilNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
        const secondsLeft = Math.ceil(msUntilNextMinute / 1000);

        console.log(`⏳ До обновления позиций ${secondsLeft} секунд`);

        setTimeout(() => {
            this.syncWithExchange();

            setInterval(() => {
                this.syncWithExchange();
            }, 60_000);
        }, msUntilNextMinute);
    }

    private async syncWithExchange(): Promise<void> {
        const time = new Date().toLocaleTimeString('ru-RU');

        try {
            const response = await client.getPositionInfo({
                category: 'linear',
                settleCoin: 'USDT',
                limit: 200,
            });

            if (response.retCode !== 0) {
                console.error(`[${time}] ❌ Ошибка Bybit API (${response.retCode}): ${response.retMsg}`);
                return;
            }

            const remotePositions = response.result.list.filter(
                (item) => Number(item.size) > 0
            );

            const remoteKeys = new Set(
                remotePositions.map((item) => `${item.symbol}_${item.side}`)
            );

            for (let i = this.positions.length - 1; i >= 0; i--) {
                const localPos = this.positions[i];
                const localKey = `${localPos.ticker}_${localPos.side}`;

                if (!remoteKeys.has(localKey)) {
                    console.log(`[${time}] 🗑️ ${localPos.ticker} (${localPos.side}): позиция не существует на бирже`);
                    this.positions.splice(i, 1);
                }
            }

            for (const remote of remotePositions) {
                const ticker = remote.symbol;
                const side = remote.side;
                const contracts = Number(remote.size);
                const usdValue = Number(remote.positionValue);
                const hasPnl = remote.unrealisedPnl !== undefined && remote.unrealisedPnl !== '';
                const parsedPnl = hasPnl ? Number(remote.unrealisedPnl) : undefined;

                const existing = this.positions.find(
                    (p) => p.ticker === ticker && p.side === side
                );

                if (existing) {
                    if (existing.contracts !== contracts) existing.contracts = contracts;
                    if (existing.usdValue !== usdValue) existing.usdValue = usdValue;
                    if (hasPnl && existing.pnl !== parsedPnl) {
                        existing.pnl = parsedPnl;
                    }
                } else {
                    const newPosition: TrackedPosition = {
                        ticker,
                        side,
                        contracts,
                        usdValue,
                        score: 0,
                    };

                    if (hasPnl) {
                        newPosition.pnl = parsedPnl;
                    }

                    this.positions.push(newPosition);
                }
            }

            this.printTable('Синхронизация с Bybit');
        } catch (error) {
            console.error(`[${time}] ❌ Сетевая ошибка при запросе позиций:`, error);
        }
    }
}

export const position = new PositionManager();
