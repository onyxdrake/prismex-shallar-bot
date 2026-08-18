const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

// ========== CONFIGURATION ==========
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || '';
const SERVER_URL = 'https://prismex-shallar-server-production.up.railway.app';

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// ========== COMMAND /start ==========
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const text = `👋 Welcome to Prismex!\n\n` +
        `Available commands:\n` +
        `/register - Create account\n` +
        `/balance - Check balance\n` +
        `/transfer <user_id> <amount> - Send PRX\n` +
        `/operator - Become operator`;
    bot.sendMessage(chatId, text);
});

// ========== COMMAND /register ==========
bot.onText(/\/register/, (msg) => {
    const chatId = msg.chat.id;
    const user_id = `user-${chatId}`;
    bot.sendMessage(chatId, `✅ Account created!\nUser ID: ${user_id}`);
});

// ========== COMMAND /balance ==========
bot.onText(/\/balance/, async (msg) => {
    const chatId = msg.chat.id;
    const user_id = `user-${chatId}`;

    try {
        const response = await axios.get(`${SERVER_URL}/api/balance/${user_id}`);
        const balances = response.data.balances || [];
        if (balances.length === 0) {
            bot.sendMessage(chatId, '💰 Your balance is empty.');
        } else {
            let text = '💰 Your balance:\n';
            balances.forEach(b => {
                text += `${b.protocol}: ${b.amount}\n`;
            });
            bot.sendMessage(chatId, text);
        }
    } catch (err) {
        bot.sendMessage(chatId, '❌ Failed to check balance. Try again later.');
    }
});

// ========== COMMAND /transfer ==========
bot.onText(/\/transfer (\S+) (\d+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const receiver = match[1];
    const amount = parseFloat(match[2]);
    const sender = `user-${chatId}`;

    if (!receiver || !amount) {
        bot.sendMessage(chatId, '⚠️ Format: /transfer <user_id> <amount>');
        return;
    }

    const tx_id = `tx-${Date.now()}`;

    try {
        const response = await axios.post(`${SERVER_URL}/api/transact`, {
            tx_id,
            protocol: 'PRX',
            sender_user_id: sender,
            receiver_user_id: receiver,
            amount,
            operator_id: 'op-onyx-solo'
        });

        if (response.data.success) {
            bot.sendMessage(chatId, `✅ Transfer successful!\nAmount: ${response.data.netAmount} PRX\nTo: ${receiver}`);
        } else {
            bot.sendMessage(chatId, `❌ Failed: ${response.data.error}`);
        }
    } catch (err) {
        bot.sendMessage(chatId, '❌ Something went wrong. Try again later.');
    }
});

// ========== COMMAND /operator ==========
bot.onText(/\/operator/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, '📝 To register as operator, send:\n\nName/ID:\nDevice:\nRAM:\nInternet:\nOnline hours/day:\nWallet address:');
});

console.log('🤖 Prismex Telegram Bot is running...');