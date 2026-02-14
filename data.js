// إعدادات النظام
const SYSTEM_CONFIG = {
    taxRate: 0, // نسبة الضريبة (إذا وجدت)
    currency: "ل.س",
    businessName: "تأجير السيارات السريع"
};

// وظائف مساعدة
function calculateTotalIncome() {
    return FINANCIAL_TRANSACTIONS
        .filter(t => t.type === 'قبض')
        .reduce((sum, t) => sum + t.amount, 0);
}
function calculateTotalExpenses() {
    return FINANCIAL_TRANSACTIONS
        .filter(t => t.type === 'دفع')
        .reduce((sum, t) => sum + t.amount, 0);
}

function calculateNetProfit() {
    return calculateTotalIncome() - calculateTotalExpenses();
}

function getAvailableCars() {
    return CARS_DATA.filter(car => car.available);
}

function getRentedCars() {
    return CARS_DATA.filter(car => !car.available);
}

function addTransaction(transaction) {
    transaction.id = FINANCIAL_TRANSACTIONS.length + 1;
    transaction.date = new Date().toISOString().split('T')[0];
    transaction.time = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
    FINANCIAL_TRANSACTIONS.push(transaction);
    return transaction;
}

function addBooking(booking) {
    booking.id = BOOKINGS_HISTORY.length + 1001;
    BOOKINGS_HISTORY.push(booking);
    return booking;
}