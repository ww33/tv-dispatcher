import express, { Request, Response } from 'express';
import 'dotenv/config';
// import {position} from './position.ts
const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.text());
//position.update()


// Проверка работы туннеля из браузера (GET)
app.get(['/', '/webhook'], (req: Request, res: Response) => {
    const time = new Date().toLocaleTimeString('ru-RU');
    console.log(`[${time}] 🌐 Проверка из браузера (${req.path})`);
    res.status(200).send(`✅ Туннель работает! Локальный сервер на связи (${time})`);
});

// Приём алертов от TradingView (POST)
app.post('/webhook', (req: Request, res: Response) => {
    const time = new Date().toLocaleTimeString('ru-RU');
    console.log(`\n[${time}] 📩 Получен алерт от TradingView:`);
    console.dir(req.body, { depth: null, colors: true });

    //position.checkScore(req.body) {ticker:'BTCUSDT', score: 7.0}

    res.status(200).send('OK');
});

app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
    console.log(`📡 Жду вебхуки на эндпоинт /webhook`);


});
