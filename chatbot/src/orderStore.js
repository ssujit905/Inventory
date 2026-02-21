const fs = require('fs/promises');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');

async function ensureStore() {
    await fs.mkdir(DATA_DIR, { recursive: true });
    try {
        await fs.access(ORDERS_FILE);
    } catch {
        await fs.writeFile(ORDERS_FILE, '[]', 'utf8');
    }
}

async function readOrders() {
    await ensureStore();
    const raw = await fs.readFile(ORDERS_FILE, 'utf8');
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

async function saveOrder(order) {
    try {
        const orders = await readOrders();
        orders.push({
            id: `${Date.now()}-${Math.floor(Math.random() * 100000)}`,
            ...order
        });
        await fs.writeFile(ORDERS_FILE, JSON.stringify(orders, null, 2), 'utf8');
        return true;
    } catch (err) {
        console.error('Error saving local order:', err);
        return false;
    }
}

module.exports = { saveOrder };
