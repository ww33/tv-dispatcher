import 'dotenv/config'; // Загружаем .env до инициализации других модулей
import express, { Request, Response } from 'express';
import { position } from './position';

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.text());

position.update();

// Проверка работы туннеля из браузера (GET)
app.get(['/', '/webhook'], (req: Request, res: Response) => {
    const time = new Date().toLocaleTimeString('ru-RU');
    console.log(`[${time}] 🌐 Проверка из браузера (${req.path})`);
    res.status(200).send(`✅ Туннель работает! Локальный сервер на связи (${time})`);
});

// Просмотр текущих отслеживаемых позиций и их score (GET)
app.get('/positions', (req: Request, res: Response) => {
    const currentPositions = position.getAll();
    res.status(200).json({
        count: currentPositions.length,
        updatedAt: new Date().toLocaleTimeString('ru-RU'),
        positions: currentPositions,
    });
});

// Приём алертов от TradingView (POST)
app.post('/webhook', (req: Request, res: Response) => {
    const time = new Date().toLocaleTimeString('ru-RU');
    console.log(`\n[${time}] 📩 Получен алерт от TradingView:`);
    console.dir(req.body, { depth: null, colors: true });

    position.checkScore(req.body);

    res.status(200).send('OK');
});

app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
    console.log(`📡 Жду вебхуки на эндпоинт /webhook`);
    console.log(`📊 Список позиций доступен на http://localhost:${PORT}/positions`);
});
