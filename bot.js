const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');

if (!process.env.TELEGRAM_TOKEN) throw new Error('TELEGRAM_TOKEN wajib diisi');
if (!process.env.SERVER_URL) throw new Error('SERVER_URL wajib diisi');

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const SERVER_URL = process.env.SERVER_URL;

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const sessions = new Map();

function helpText() {
    return `🏦 PRISMEX DIGITAL GOLD BANK\n\n` +
        `💳 Account\n` +
        `/register - Create account\n` +
        `/login - Login\n` +
        `/balance - Check balance\n` +
        `/statement - History\n\n` +
        `💸 Payments\n` +
        `/transfer <user_id> <amount> - Send PRX\n` +
        `/pay <merchant_id> <amount> - Pay merchant\n\n` +
        `🥇 Gold\n` +
        `/gold - Live gold price\n` +
        `/reserve - Reserve coverage\n\n` +
        `📈 Yield\n` +
        `/stake <amount> - Stake PRX\n` +
        `/unstake <amount> - Unstake PRX\n` +
        `/yield - Check yield\n\n` +
        `🏪 Merchant\n` +
        `/merchant - Register merchant\n\n` +
        `🖥️ Operator\n` +
        `/operator - Become operator`;
}

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, `👋 Welcome!\n\n${helpText()}`);
});

bot.onText(/\/help/, (msg) => {
    bot.sendMessage(msg.chat.id, helpText());
});

// ========== REGISTER ==========
bot.onText(/\/register/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, '📝 Send your secret password (min 8 characters):');
    bot.once('message', async (secretMsg) => {
        const secret = secretMsg.text.trim();
        const userId = `user-${chatId}`;

        try {
            const res = await axios.post(`${SERVER_URL}/api/auth/register`, {
                user_id: userId,
                telegram_id: chatId,
                secret
            });

            if (res.data.success) {
                sessions.set(chatId, {
                    user_id: userId,
                    auth_token: res.data.auth_token
                });
                bot.sendMessage(chatId, `✅ Account created!\n\nUser ID: ${userId}\nAuth Token: ${res.data.auth_token}\n\n⚠️ SAVE THIS TOKEN!`);
            } else {
                bot.sendMessage(chatId, `❌ ${res.data.error}`);
            }
        } catch (err) {
            bot.sendMessage(chatId, '❌ Registration failed.');
        }
    });
});

// ========== LOGIN ==========
bot.onText(/\/login/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, '🔑 Send your secret password:');
    bot.once('message', async (secretMsg) => {
        const secret = secretMsg.text.trim();
        const userId = `user-${chatId}`;

        try {
            const res = await axios.post(`${SERVER_URL}/api/auth/login`, {
                user_id: userId,
                secret
            });

            if (res.data.success) {
                sessions.set(chatId, {
                    user_id: userId,
                    auth_token: res.data.auth_token
                });
                bot.sendMessage(chatId, `✅ Login successful!`);
            } else {
                bot.sendMessage(chatId, `❌ ${res.data.error}`);
            }
        } catch (err) {
            bot.sendMessage(chatId, '❌ Login failed.');
        }
    });
});

// ========== LOGOUT ==========
bot.onText(/\/logout/, (msg) => {
    sessions.delete(msg.chat.id);
    bot.sendMessage(msg.chat.id, '✅ Logged out.');
});

// ========== BALANCE ==========
bot.onText(/\/balance/, async (msg) => {
    const session = sessions.get(msg.chat.id);
    if (!session) return bot.sendMessage(msg.chat.id, '⚠️ Please /login first.');

    try {
        const res = await axios.get(`${SERVER_URL}/api/wallet/balance`, {
            headers: { 'x-user-id': session.user_id, 'x-auth-token': session.auth_token }
        });
        const balances = res.data.balances || [];
        if (balances.length === 0) return bot.sendMessage(msg.chat.id, '💰 Your balance is empty.');
        let text = '💰 YOUR BALANCE\n\n';
        balances.forEach(b => text += `${b.protocol}: ${b.amount}\n`);
        bot.sendMessage(msg.chat.id, text);
    } catch (err) {
        bot.sendMessage(msg.chat.id, '❌ Failed to load balance.');
    }
});

// ========== STATEMENT ==========
bot.onText(/\/statement/, async (msg) => {
    const session = sessions.get(msg.chat.id);
    if (!session) return bot.sendMessage(msg.chat.id, '⚠️ Please /login first.');

    try {
        const res = await axios.get(`${SERVER_URL}/api/wallet/statement`, {
            headers: { 'x-user-id': session.user_id, 'x-auth-token': session.auth_token }
        });
        const txs = res.data.transactions || [];
        if (txs.length === 0) return bot.sendMessage(msg.chat.id, '📄 No transactions.');
        let text = '📄 LAST TRANSACTIONS\n\n';
        txs.slice(0, 10).forEach(tx => text += `#${tx.tx_id} ${tx.amount} ${tx.protocol}\n`);
        bot.sendMessage(msg.chat.id, text);
    } catch (err) {
        bot.sendMessage(msg.chat.id, '❌ Failed to load statement.');
    }
});

// ========== TRANSFER ==========
bot.onText(/\/transfer (\S+) (\d+)/, async (msg, match) => {
    const session = sessions.get(msg.chat.id);
    if (!session) return bot.sendMessage(msg.chat.id, '⚠️ Please /login first.');

    const receiver = match[1];
    const amount = parseFloat(match[2]);

    try {
        const res = await axios.post(`${SERVER_URL}/api/transfer/p2p`, {
            receiver_user_id: receiver,
            amount,
            protocol: 'PRX'
        }, {
            headers: { 'x-user-id': session.user_id, 'x-auth-token': session.auth_token }
        });

        if (res.data.success) {
            bot.sendMessage(msg.chat.id, `✅ Sent ${res.data.amount} PRX to ${receiver}\nFee: ${res.data.fee_total} PRX`);
        } else {
            bot.sendMessage(msg.chat.id, `❌ ${res.data.error}`);
        }
    } catch (err) {
        bot.sendMessage(msg.chat.id, '❌ Transfer failed.');
    }
});

// ========== GOLD ==========
bot.onText(/\/gold/, async (msg) => {
    try {
        const res = await axios.get(`${SERVER_URL}/api/gold/price`);
        const d = res.data;
        bot.sendMessage(msg.chat.id, `🥇 Gold: $${d.gold_per_ounce}/oz\nGram: $${d.gold_per_gram}\nPRX: $${d.prx_usd}`);
    } catch (err) {
        bot.sendMessage(msg.chat.id, '❌ Failed to fetch gold price.');
    }
});

// ========== RESERVE ==========
bot.onText(/\/reserve/, async (msg) => {
    try {
        const res = await axios.get(`${SERVER_URL}/api/reserve`);
        const d = res.data;
        bot.sendMessage(msg.chat.id, `🏦 Reserve: ${d.gold_grams} grams\nCirculating: ${d.circulating_prx} PRX\nCoverage: ${d.coverage}`);
    } catch (err) {
        bot.sendMessage(msg.chat.id, '❌ Failed to load reserve.');
    }
});

// ========== STAKE ==========
bot.onText(/\/stake (\d+)/, async (msg, match) => {
    const session = sessions.get(msg.chat.id);
    if (!session) return bot.sendMessage(msg.chat.id, '⚠️ Please /login first.');

    try {
        const res = await axios.post(`${SERVER_URL}/api/staking/stake`, {
            protocol: 'PRX',
            amount: parseFloat(match[1])
        }, {
            headers: { 'x-user-id': session.user_id, 'x-auth-token': session.auth_token }
        });
        bot.sendMessage(msg.chat.id, res.data.success ? `✅ Staked ${match[1]} PRX` : `❌ ${res.data.error}`);
    } catch (err) {
        bot.sendMessage(msg.chat.id, '❌ Staking failed.');
    }
});

// ========== UNSTAKE ==========
bot.onText(/\/unstake (\d+)/, async (msg, match) => {
    const session = sessions.get(msg.chat.id);
    if (!session) return bot.sendMessage(msg.chat.id, '⚠️ Please /login first.');

    try {
        const res = await axios.post(`${SERVER_URL}/api/staking/unstake`, {
            protocol: 'PRX',
            amount: parseFloat(match[1])
        }, {
            headers: { 'x-user-id': session.user_id, 'x-auth-token': session.auth_token }
        });
        bot.sendMessage(msg.chat.id, res.data.success ? `✅ Unstaked ${match[1]} PRX` : `❌ ${res.data.error}`);
    } catch (err) {
        bot.sendMessage(msg.chat.id, '❌ Unstaking failed.');
    }
});

// ========== YIELD ==========
bot.onText(/\/yield/, async (msg) => {
    const session = sessions.get(msg.chat.id);
    if (!session) return bot.sendMessage(msg.chat.id, '⚠️ Please /login first.');

    try {
        const res = await axios.get(`${SERVER_URL}/api/staking/yield`, {
            headers: { 'x-user-id': session.user_id, 'x-auth-token': session.auth_token }
        });
        const d = res.data;
        bot.sendMessage(msg.chat.id, `📈 Staked: ${d.total_staked} PRX\nYearly: ${d.yearly_yield} PRX\nDaily: ${d.daily_yield} PRX`);
    } catch (err) {
        bot.sendMessage(msg.chat.id, '❌ Failed to load yield.');
    }
});

// ========== MERCHANT ==========
bot.onText(/\/merchant/, (msg) => {
    bot.sendMessage(msg.chat.id, `🏪 Merchant Registration\n\nSend:\nName:\nBusiness type:\nCity:`);
});

// ========== OPERATOR ==========
bot.onText(/\/operator/, (msg) => {
    bot.sendMessage(msg.chat.id, `🖥️ Operator Registration\n\nSend:\nName/ID:\nDevice:\nRAM:\nInternet speed:\nOnline hours/day:\nWallet address:`);
});

console.log('🤖 Prismex Digital Gold Bank Bot running...');
