const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');

// ========== CONFIGURATION (TANPA FALLBACK) ==========
if (!process.env.TELEGRAM_TOKEN) throw new Error('TELEGRAM_TOKEN wajib diisi');
if (!process.env.SERVER_URL) throw new Error('SERVER_URL wajib diisi');

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const SERVER_URL = process.env.SERVER_URL;

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// ========== SESSION STORAGE ==========
const sessions = new Map();

function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

function getSession(chatId) {
    return sessions.get(chatId) || null;
}

function setSession(chatId, data) {
    sessions.set(chatId, data);
}

function clearSession(chatId) {
    sessions.delete(chatId);
}

// ========== HELP ==========
function helpText() {
    return `🏦 PRISMEX DIGITAL GOLD CURRENCY\n\n` +
        `💳 Account\n` +
        `/register - Create account\n` +
        `/login - Login to account\n` +
        `/logout - Logout\n` +
        `/balance - Check balance\n` +
        `/statement - Transaction history\n\n` +
        `💸 Payments\n` +
        `/transfer <user_id> <amount> - Send PRX\n` +
        `/pay <merchant_id> <amount> - Pay merchant\n\n` +
        `🥇 Gold & Market\n` +
        `/gold - Live gold price\n` +
        `/reserve - Reserve coverage\n\n` +
        `📈 Yield\n` +
        `/stake <amount> - Stake PRX\n` +
        `/unstake <amount> - Unstake PRX\n` +
        `/yield - Check your yield\n\n` +
        `🏪 Merchant\n` +
        `/merchant - Register as merchant\n\n` +
        `🖥️ Operator\n` +
        `/operator - Become operator`;
}

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, `👋 Welcome to Prismex!\n\n${helpText()}`);
});

bot.onText(/\/help/, (msg) => {
    bot.sendMessage(msg.chat.id, helpText());
});

// ========== REGISTER ==========
bot.onText(/\/register/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, '📝 Send your desired secret password:\n\nExample: `mysecret123`');
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
                setSession(chatId, {
                    user_id: userId,
                    auth_token: res.data.auth_token,
                    account_number: res.data.account_number
                });

                bot.sendMessage(chatId, `✅ Account created!\n\n` +
                    `User ID: ${userId}\n` +
                    `Account Number: ${res.data.account_number}\n` +
                    `Auth Token: ${res.data.auth_token}\n\n` +
                    `⚠️ SAVE THIS TOKEN! You need it for /login`);
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
                setSession(chatId, {
                    user_id: userId,
                    auth_token: res.data.auth_token,
                    account_number: res.data.account_number
                });
                bot.sendMessage(chatId, `✅ Login successful!\n\nAccount: ${res.data.account_number}`);
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
    const chatId = msg.chat.id;
    clearSession(chatId);
    bot.sendMessage(chatId, '✅ Logged out.');
});

// ========== BALANCE ==========
bot.onText(/\/balance/, async (msg) => {
    const chatId = msg.chat.id;
    const session = getSession(chatId);

    if (!session) {
        return bot.sendMessage(chatId, '⚠️ Please /login first.');
    }

    try {
        const res = await axios.get(`${SERVER_URL}/api/wallet/balance`, {
            headers: {
                'x-user-id': session.user_id,
                'x-auth-token': session.auth_token
            }
        });

        const balances = res.data.balances || [];
        if (balances.length === 0) {
            bot.sendMessage(chatId, '💰 Your balance is empty.');
        } else {
            let text = '💰 YOUR BALANCE\n\n';
            balances.forEach(b => {
                text += `${b.protocol}: ${b.amount}\n`;
            });
            bot.sendMessage(chatId, text);
        }
    } catch (err) {
        bot.sendMessage(chatId, '❌ Failed to load balance.');
    }
});

// ========== STATEMENT ==========
bot.onText(/\/statement/, async (msg) => {
    const chatId = msg.chat.id;
    const session = getSession(chatId);

    if (!session) {
        return bot.sendMessage(chatId, '⚠️ Please /login first.');
    }

    try {
        const res = await axios.get(`${SERVER_URL}/api/wallet/statement`, {
            headers: {
                'x-user-id': session.user_id,
                'x-auth-token': session.auth_token
            }
        });

        const txs = res.data.transactions || [];
        if (txs.length === 0) {
            bot.sendMessage(chatId, '📄 No transactions yet.');
        } else {
            let text = '📄 LAST TRANSACTIONS\n\n';
            txs.slice(0, 10).forEach(tx => {
                text += `#${tx.tx_id} ${tx.amount} ${tx.protocol}\n`;
            });
            bot.sendMessage(chatId, text);
        }
    } catch (err) {
        bot.sendMessage(chatId, '❌ Failed to load statement.');
    }
});

// ========== TRANSFER ==========
bot.onText(/\/transfer (\S+) (\d+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const session = getSession(chatId);

    if (!session) {
        return bot.sendMessage(chatId, '⚠️ Please /login first.');
    }

    const receiver = match[1];
    const amount = parseFloat(match[2]);

    if (amount <= 0) {
        return bot.sendMessage(chatId, '⚠️ Format: /transfer <user_id> <amount>');
    }

    try {
        const res = await axios.post(`${SERVER_URL}/api/transfer/p2p`, {
            receiver_user_id: receiver,
            amount,
            protocol: 'PRX'
        }, {
            headers: {
                'x-user-id': session.user_id,
                'x-auth-token': session.auth_token
            }
        });

        if (res.data.success) {
            bot.sendMessage(chatId, `✅ Transfer successful!\n\n` +
                `Amount: ${res.data.amount} PRX\n` +
                `Net: ${res.data.net_amount} PRX\n` +
                `Fee: ${res.data.fee_total} PRX`);
        } else {
            bot.sendMessage(chatId, `❌ ${res.data.error}`);
        }
    } catch (err) {
        bot.sendMessage(chatId, '❌ Transfer failed.');
    }
});

// ========== GOLD PRICE ==========
bot.onText(/\/gold/, async (msg) => {
    const chatId = msg.chat.id;

    try {
        const res = await axios.get(`${SERVER_URL}/api/gold/price`);
        const d = res.data;
        bot.sendMessage(chatId, `🥇 GOLD PRICE\n\n` +
            `Per ounce: $${d.gold_per_ounce}\n` +
            `Per gram: $${d.gold_per_gram}\n` +
            `PRX value: $${d.prx_usd}`);
    } catch (err) {
        bot.sendMessage(chatId, '❌ Failed to fetch gold price.');
    }
});

// ========== RESERVE ==========
bot.onText(/\/reserve/, async (msg) => {
    const chatId = msg.chat.id;

    try {
        const res = await axios.get(`${SERVER_URL}/api/reserve`);
        const d = res.data;
        bot.sendMessage(chatId, `🏦 RESERVE COVERAGE\n\n` +
            `Gold: ${d.gold_grams} grams\n` +
            `Circulating: ${d.circulating_prx} PRX\n` +
            `Coverage: ${d.coverage}`);
    } catch (err) {
        bot.sendMessage(chatId, '❌ Failed to load reserve.');
    }
});

// ========== STAKE ==========
bot.onText(/\/stake (\d+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const session = getSession(chatId);

    if (!session) {
        return bot.sendMessage(chatId, '⚠️ Please /login first.');
    }

    const amount = parseFloat(match[1]);

    try {
        const res = await axios.post(`${SERVER_URL}/api/staking/stake`, {
            protocol: 'PRX',
            amount
        }, {
            headers: {
                'x-user-id': session.user_id,
                'x-auth-token': session.auth_token
            }
        });

        if (res.data.success) {
            bot.sendMessage(chatId, `✅ Staked ${amount} PRX successfully!`);
        } else {
            bot.sendMessage(chatId, `❌ ${res.data.error}`);
        }
    } catch (err) {
        bot.sendMessage(chatId, '❌ Staking failed.');
    }
});

// ========== UNSTAKE ==========
bot.onText(/\/unstake (\d+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const session = getSession(chatId);

    if (!session) {
        return bot.sendMessage(chatId, '⚠️ Please /login first.');
    }

    const amount = parseFloat(match[1]);

    try {
        const res = await axios.post(`${SERVER_URL}/api/staking/unstake`, {
            protocol: 'PRX',
            amount
        }, {
            headers: {
                'x-user-id': session.user_id,
                'x-auth-token': session.auth_token
            }
        });

        if (res.data.success) {
            bot.sendMessage(chatId, `✅ Unstaked ${amount} PRX successfully!`);
        } else {
            bot.sendMessage(chatId, `❌ ${res.data.error}`);
        }
    } catch (err) {
        bot.sendMessage(chatId, '❌ Unstaking failed.');
    }
});

// ========== YIELD ==========
bot.onText(/\/yield/, async (msg) => {
    const chatId = msg.chat.id;
    const session = getSession(chatId);

    if (!session) {
        return bot.sendMessage(chatId, '⚠️ Please /login first.');
    }

    try {
        const res = await axios.get(`${SERVER_URL}/api/staking/yield`, {
            headers: {
                'x-user-id': session.user_id,
                'x-auth-token': session.auth_token
            }
        });

        const d = res.data;
        bot.sendMessage(chatId, `📈 YOUR YIELD\n\n` +
            `Staked: ${d.total_staked} PRX\n` +
            `Yearly: ${d.yearly_yield} PRX\n` +
            `Daily: ${d.daily_yield} PRX\n` +
            `APY: ${d.apy}`);
    } catch (err) {
        bot.sendMessage(chatId, '❌ Failed to load yield.');
    }
});

// ========== MERCHANT ==========
bot.onText(/\/merchant/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, `🏪 Merchant Registration\n\nSend:\nName:\nBusiness type:\nCity:`);
});

// ========== OPERATOR ==========
bot.onText(/\/operator/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, `🖥️ Operator Registration\n\nSend:\nName/ID:\nDevice:\nRAM:\nInternet speed:\nOnline hours/day:\nWallet address:`);
});

console.log('🤖 Prismex Bot anti-bajak running...');