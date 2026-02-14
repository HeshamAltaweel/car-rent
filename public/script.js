// متغيرات عامة
let financialChart = null;
let selectedCarForRental = null;

let CARS_DATA = [];
let FINANCIAL_TRANSACTIONS = [];
let BOOKINGS_HISTORY = [];

// تهيئة الصفحة عند التحميل
document.addEventListener('DOMContentLoaded', function() {
    // عرض التاريخ والوقت الحالي
    updateDateTime();
    setInterval(updateDateTime, 1000);
    
    // تحميل البيانات من السيرفر أولاً
    loadDataFromServer().then(() => {
        // بعد تحميل البيانات، عرض لوحة التحكم
        loadDashboardData();
        
        // إعداد المودالز
        setupModals();
        
        // إعداد التقارير
        setupCharts();
        
        // إعداد معالجات الأحداث
        setupEventListeners();
    });
    
    // فحص الإيجارات المنتهية دوريًا كل دقيقة
    setInterval(checkExpiredRentals, 60000);
});

// تحديث التاريخ والوقت
function updateDateTime() {
    const now = new Date();
    const options = { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    };
    
    const dateTimeElement = document.getElementById('currentDateTime');
    if (dateTimeElement) {
        dateTimeElement.textContent = now.toLocaleDateString('ar-SA', options);
    }
}

// تحميل وعرض بيانات لوحة التحكم
function loadDashboardData() {
    // فحص الإيجارات المنتهية أولاً
    checkExpiredRentals();
    
    // تحديث الإحصائيات
    updateStats();
    
    // عرض السيارات المتوفرة
    displayAvailableCars();
    
    // عرض السيارات المؤجرة
    displayRentedCars();
    
    // عرض الحركات المالية الأخيرة
    displayRecentTransactions();
    
    // تحديث الرسم البياني
    updateChart();
}

// فحص الإيجارات المنتهية وإعادتها تلقائيًا
function checkExpiredRentals() {
    if (!CARS_DATA || CARS_DATA.length === 0) return;
    
    const now = new Date();
    let changesMade = false;

    CARS_DATA.forEach(car => {
        if (car && !car.available && car.currentRental) {
            try {
                const endDateTime = new Date(`${car.currentRental.endDate}T${car.currentRental.endTime || '00:00'}`);
                
                if (!isNaN(endDateTime.getTime()) && now > endDateTime) {
                    // تسجيل المبلغ المتبقي كقبض إذا كان موجودًا
                    if (car.currentRental.remainingAmount && car.currentRental.remainingAmount > 0) {
                        const transaction = {
                            id: generateId(),
                            type: 'قبض',
                            amount: car.currentRental.remainingAmount,
                            carId: car.id,
                            carName: car.name,
                            customerName: car.currentRental.customerName,
                            description: 'دفعة متبقية تلقائية عند انتهاء الإيجار',
                            category: 'إيجار',
                            date: new Date().toISOString().split('T')[0],
                            time: new Date().toTimeString().split(' ')[0].substring(0, 5)
                        };
                        addTransaction(transaction, false);
                    }

                    // حفظ التأجير في السجل قبل حذفه
                    if (car.currentRental) {
                        const completedBooking = {
                            id: car.currentRental.id || generateId(),
                            carId: car.id,
                            carName: car.name,
                            ...car.currentRental,
                            status: 'مكتمل',
                            returnDate: new Date().toISOString().split('T')[0],
                            returnTime: new Date().toTimeString().split(' ')[0].substring(0, 5)
                        };
                        BOOKINGS_HISTORY.push(completedBooking);
                    }

                    // تحديث إجمالي إيرادات السيارة
                    car.totalRevenue = (car.totalRevenue || 0) + (car.currentRental.totalAmount || 0);

                    // إعادة السيارة إلى المتاحة
                    car.available = true;
                    car.currentRental = null;

                    changesMade = true;
                }
            } catch (e) {
                console.error('خطأ في فحص الإيجار المنتهي:', e);
            }
        }
    });

    if (changesMade) {
        saveDataToServer(true);
    }
}

// تحديث الإحصائيات
function updateStats() {
    const availableCars = getAvailableCars();
    const rentedCars = getRentedCars();
    const totalIncome = calculateTotalIncome();
    const totalExpenses = calculateTotalExpenses();
    const netProfit = totalIncome - totalExpenses;
    
    const availableEl = document.getElementById('availableCarsCount');
    const rentedEl = document.getElementById('rentedCarsCount');
    const incomeEl = document.getElementById('totalIncome');
    const profitEl = document.getElementById('netProfit');
    
    if (availableEl) availableEl.textContent = availableCars.length;
    if (rentedEl) rentedEl.textContent = rentedCars.length;
    if (incomeEl) incomeEl.textContent = `${totalIncome.toLocaleString()} ل.س`;
    if (profitEl) profitEl.textContent = `${netProfit.toLocaleString()} ل.س`;
}

// الحصول على السيارات المتوفرة
function getAvailableCars() {
    return CARS_DATA.filter(car => car && car.available === true);
}

// الحصول على السيارات المؤجرة
function getRentedCars() {
    return CARS_DATA.filter(car => car && car.available === false && car.currentRental);
}

// حساب إجمالي المدخولات
function calculateTotalIncome() {
    return FINANCIAL_TRANSACTIONS
        .filter(t => t && t.type === 'قبض')
        .reduce((sum, t) => sum + (t.amount || 0), 0);
}

// حساب إجمالي المدفوعات
function calculateTotalExpenses() {
    return FINANCIAL_TRANSACTIONS
        .filter(t => t && t.type === 'دفع')
        .reduce((sum, t) => sum + (t.amount || 0), 0);
}

// عرض السيارات المتوفرة
function displayAvailableCars() {
    const availableCars = getAvailableCars();
    const container = document.getElementById('availableCarsList');
    
    if (!container) return;
    
    if (availableCars.length === 0) {
        container.innerHTML = `
            <div class="message warning">
                <i class="fas fa-info-circle"></i>
                <p>لا توجد سيارات متوفرة حالياً</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = availableCars.map(car => `
        <div class="car-card available">
            <div class="car-header">
                <h3 class="car-title">${escapeHtml(car.name || '')}</h3>
                <span class="car-plate">${escapeHtml(car.plate || '')}</span>
            </div>
            
            <div class="car-details">
                <span class="car-detail">
                    <i class="fas fa-car-side"></i> ${escapeHtml(car.type || '')}
                </span>
                <span class="car-detail">
                    <i class="fas fa-palette"></i> ${escapeHtml(car.color || '')}
                </span>
                <span class="car-detail">
                    <i class="fas fa-calendar"></i> ${car.year || ''}
                </span>
                <span class="car-detail">
                    <i class="fas fa-tachometer-alt"></i> ${(car.mileage || 0).toLocaleString()} كم
                </span>
            </div>
            
            ${car.features && car.features.length > 0 ? `
                <div class="car-features">
                    ${car.features.map(feature => `
                        <span class="feature-tag">${escapeHtml(feature)}</span>
                    `).join('')}
                </div>
            ` : ''}
            
            <div class="car-actions">
                <button class="btn btn-sm btn-success" onclick="rentCar(${car.id})">
                    <i class="fas fa-calendar-plus"></i> تأجير
                </button>
                <button class="btn btn-sm btn-info" onclick="showCarDetails(${car.id})">
                    <i class="fas fa-info-circle"></i> تفاصيل
                </button>
            </div>
        </div>
    `).join('');
}

// عرض السيارات المؤجرة
function displayRentedCars() {
    const rentedCars = getRentedCars();
    const container = document.getElementById('rentedCarsList');
    
    if (!container) return;
    
    if (rentedCars.length === 0) {
        container.innerHTML = `
            <div class="message success">
                <i class="fas fa-check-circle"></i>
                <p>جميع السيارات متوفرة حالياً</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = rentedCars.map(car => {
        const rental = car.currentRental;
        if (!rental) return '';
        
        const now = new Date();
        const endDate = new Date(`${rental.endDate || ''}T${rental.endTime || '00:00'}`);
        const timeLeft = !isNaN(endDate.getTime()) ? Math.max(0, Math.ceil((endDate - now) / (1000 * 60 * 60))) : 0;
        
        return `
            <div class="car-card rented">
                <div class="car-header">
                    <h3 class="car-title">${escapeHtml(car.name || '')}</h3>
                    <span class="status-badge status-rented">
                        <i class="fas fa-clock"></i> مستأجرة
                    </span>
                </div>
                
                <div class="car-details">
                    <span class="car-detail">
                        <i class="fas fa-car-side"></i> ${escapeHtml(car.type || '')}
                    </span>
                    <span class="car-detail">
                        <i class="fas fa-palette"></i> ${escapeHtml(car.color || '')}
                    </span>
                    <span class="car-detail">
                        <i class="fas fa-tag"></i> ${escapeHtml(car.plate || '')}
                    </span>
                </div>
                
                <div class="rental-info">
                    <div class="rental-customer">
                        <i class="fas fa-user"></i>
                        ${escapeHtml(rental.customerName || '')} - ${escapeHtml(rental.customerPhone || '')}
                    </div>
                    
                    <div class="rental-period">
                        <div class="rental-time">
                            <i class="fas fa-calendar-alt"></i>
                            ${formatDate(rental.startDate)} ${rental.startTime || ''}
                            <i class="fas fa-arrow-left"></i>
                            ${formatDate(rental.endDate)} ${rental.endTime || ''}
                        </div>
                        <span class="rental-type">${escapeHtml(rental.type || '')}</span>
                    </div>
                    
                    <div class="rental-payment">
                        <div class="payment-status ${rental.remainingAmount === 0 ? 'paid' : 'pending'}">
                            <i class="fas ${rental.remainingAmount === 0 ? 'fa-check-circle' : 'fa-clock'}"></i>
                            ${rental.remainingAmount === 0 ? 'مدفوع بالكامل' : `متبقي: ${(rental.remainingAmount || 0).toLocaleString()} ل.س`}
                        </div>
                        <div class="time-left">
                            <i class="fas fa-hourglass-half"></i>
                            ${rental.type === 'ساعات' ? `${(rental.totalHours || 0) - timeLeft}/${rental.totalHours || 0} ساعة` : `${timeLeft} ساعة متبقية`}
                        </div>
                    </div>
                    
                    ${timeLeft <= 24 && timeLeft > 0 ? `
                        <div class="time-progress">
                            <div class="time-progress-bar" style="width: ${(1 - (timeLeft / 24)) * 100}%"></div>
                        </div>
                    ` : ''}
                </div>
                
                <div class="car-actions">
                    <button class="btn btn-sm btn-warning" onclick="returnCar(${car.id})">
                        <i class="fas fa-undo"></i> إعادة
                    </button>
                    <button class="btn btn-sm btn-info" onclick="showRentalDetails(${car.id})">
                        <i class="fas fa-file-invoice"></i> فاتورة
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// عرض الحركات المالية الأخيرة
function displayRecentTransactions() {
    const container = document.getElementById('recentTransactions');
    if (!container) return;
    
    const recentTransactions = [...FINANCIAL_TRANSACTIONS]
        .sort((a, b) => {
            const dateA = new Date(`${a.date || ''}T${a.time || '00:00'}`);
            const dateB = new Date(`${b.date || ''}T${b.time || '00:00'}`);
            return dateB - dateA;
        })
        .slice(0, 10);
    
    if (recentTransactions.length === 0) {
        container.innerHTML = `
            <tr>
                <td colspan="7" class="text-center">
                    <div class="message info">
                        <i class="fas fa-info-circle"></i>
                        <p>لا توجد حركات مالية سابقة</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }
    
    container.innerHTML = recentTransactions.map(trans => `
        <tr class="${trans.type === 'قبض' ? 'income-row' : 'expense-row'}">
            <td>${trans.date || ''}<br><small>${trans.time || ''}</small></td>
            <td>
                <span class="status-badge ${trans.type === 'قبض' ? 'status-available' : 'status-rented'}">
                    ${trans.type === 'قبض' ? 'قبض' : 'دفع'}
                </span>
            </td>
            <td class="${trans.type === 'قبض' ? 'income-color' : 'expense-color'}">
                <strong>${(trans.amount || 0).toLocaleString()} ل.س</strong>
            </td>
            <td>${escapeHtml(trans.carName || '-')}</td>
            <td>${escapeHtml(trans.customerName || '-')}</td>
            <td>${escapeHtml(trans.description || '')}</td>
            <td class="table-actions">
                <button class="action-icon" title="تعديل" onclick="editTransaction(${trans.id})">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="action-icon" title="حذف" onclick="deleteTransaction(${trans.id})">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

// إعداد المودالز
function setupModals() {
    // إعداد اختيار السيارة للتأجير
    const carSelect = document.getElementById('rentCarSelect');
    if (carSelect) {
        const availableCars = getAvailableCars();
        
        carSelect.innerHTML = '<option value="">اختر سيارة</option>' +
            availableCars.map(car => `
                <option value="${car.id}" data-price-day="${car.pricePerDay || 0}" data-price-hour="${car.pricePerHour || 0}">
                    ${escapeHtml(car.name)} (${escapeHtml(car.plate)})
                </option>
            `).join('');
    }
    
    // إعداد اختيار السيارة للحركات المالية
    const transactionCarSelect = document.getElementById('transactionCar');
    if (transactionCarSelect) {
        transactionCarSelect.innerHTML = '<option value="">اختر سيارة</option>' +
            CARS_DATA.map(car => `
                <option value="${car.id}">${escapeHtml(car.name)} (${escapeHtml(car.plate)})</option>
            `).join('');
    }
    
    // تعيين التواريخ الافتراضية
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');
    const startDateInput2 = document.getElementById('startDateInput');
    const endDateInput2 = document.getElementById('endDateInput');
    
    if (startDateInput) startDateInput.value = today;
    if (endDateInput) endDateInput.value = today;
    if (startDateInput2) startDateInput2.value = today;
    if (endDateInput2) endDateInput2.value = tomorrow;
    
    // تعيين تاريخ ووقت البدء والانتهاء
    const now = new Date();
    const currentHours = now.getHours().toString().padStart(2, '0');
    const currentMinutes = now.getMinutes().toString().padStart(2, '0');
    const currentTimeFormatted = `${currentHours}:${currentMinutes}`;
    const currentDate = now.toISOString().split('T')[0];
    
    const startDateTimeInput = document.getElementById('startDateTime');
    const endDateTimeInput = document.getElementById('endDateTime');
    
    if (startDateTimeInput) {
        startDateTimeInput.value = `${currentDate}T${currentTimeFormatted}`;
    }
    
    if (endDateTimeInput) {
        const endDate = new Date(now.getTime() + 43200000); // 12 ساعة
        const endYear = endDate.getFullYear();
        const endMonth = (endDate.getMonth() + 1).toString().padStart(2, '0');
        const endDay = endDate.getDate().toString().padStart(2, '0');
        const endHours = endDate.getHours().toString().padStart(2, '0');
        const endMinutes = endDate.getMinutes().toString().padStart(2, '0');
        endDateTimeInput.value = `${endYear}-${endMonth}-${endDay}T${endHours}:${endMinutes}`;
    }
    
    // إضافة مستمع حدث لتحديث وقت الانتهاء
    if (startDateTimeInput && endDateTimeInput) {
        startDateTimeInput.addEventListener('change', function() {
            const startDate = new Date(this.value);
            if (!isNaN(startDate.getTime())) {
                const endDate = new Date(startDate.getTime() + 43200000);
                const endYear = endDate.getFullYear();
                const endMonth = (endDate.getMonth() + 1).toString().padStart(2, '0');
                const endDay = endDate.getDate().toString().padStart(2, '0');
                const endHours = endDate.getHours().toString().padStart(2, '0');
                const endMinutes = endDate.getMinutes().toString().padStart(2, '0');
                endDateTimeInput.value = `${endYear}-${endMonth}-${endDay}T${endHours}:${endMinutes}`;
            }
        });
    }
}

// إعداد الرسم البياني
function setupCharts() {
    const canvas = document.getElementById('financialChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    financialChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['المدخولات', 'المدفوعات', 'صافي الأرباح'],
            datasets: [{
                label: 'المبلغ (ل.س)',
                data: [0, 0, 0],
                backgroundColor: [
                    'rgba(39, 174, 96, 0.7)',
                    'rgba(231, 76, 60, 0.7)',
                    'rgba(52, 152, 219, 0.7)'
                ],
                borderColor: [
                    'rgb(39, 174, 96)',
                    'rgb(231, 76, 60)',
                    'rgb(52, 152, 219)'
                ],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return context.label + ': ' + context.parsed.y.toLocaleString() + ' ل.س';
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return value.toLocaleString() + ' ل.س';
                        }
                    }
                }
            }
        }
    });
}

// تحديث الرسم البياني
function updateChart(startDate = null, endDate = null) {
    let filteredTransactions = FINANCIAL_TRANSACTIONS;
    
    if (startDate && endDate) {
        filteredTransactions = FINANCIAL_TRANSACTIONS.filter(trans => {
            if (!trans || !trans.date) return false;
            const transDate = new Date(trans.date);
            return transDate >= new Date(startDate) && transDate <= new Date(endDate);
        });
    }
    
    const income = filteredTransactions
        .filter(t => t && t.type === 'قبض')
        .reduce((sum, t) => sum + (t.amount || 0), 0);
    
    const expenses = filteredTransactions
        .filter(t => t && t.type === 'دفع')
        .reduce((sum, t) => sum + (t.amount || 0), 0);
    
    const profit = income - expenses;
    
    if (financialChart) {
        financialChart.data.datasets[0].data = [income, expenses, profit];
        financialChart.update();
    }
    
    const filteredIncomeEl = document.getElementById('filteredIncome');
    const filteredExpensesEl = document.getElementById('filteredExpenses');
    const filteredProfitEl = document.getElementById('filteredProfit');
    
    if (filteredIncomeEl) filteredIncomeEl.textContent = income.toLocaleString() + ' ل.س';
    if (filteredExpensesEl) filteredExpensesEl.textContent = expenses.toLocaleString() + ' ل.س';
    if (filteredProfitEl) filteredProfitEl.textContent = profit.toLocaleString() + ' ل.س';
}

// إعداد معالجات الأحداث
function setupEventListeners() {
    const startDate = document.getElementById('startDate');
    const endDate = document.getElementById('endDate');
    
    if (startDate) startDate.addEventListener('change', applyDateFilter);
    if (endDate) endDate.addEventListener('change', applyDateFilter);
}

// تطبيق فلترة التاريخ
function applyDateFilter() {
    const startDate = document.getElementById('startDate')?.value;
    const endDate = document.getElementById('endDate')?.value;
    
    if (startDate && endDate) {
        updateChart(startDate, endDate);
    }
}

// وظائف المودال
function showRentCarModal() {
    const modal = document.getElementById('rentCarModal');
    if (modal) {
        modal.style.display = 'flex';
        setupModals();
    }
}

function showAddTransactionModal() {
    const modal = document.getElementById('addTransactionModal');
    if (modal) {
        modal.style.display = 'flex';
        setupModals();
    }
}

function showAddCarModal() {
    const modal = document.getElementById('addCarModal');
    if (modal) {
        modal.style.display = 'flex';
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
    }
    
    // تنظيف الـ chart عند إغلاق modal التقرير المالي
    if (modalId === 'carFinancialModal' && carFinancialChart) {
        carFinancialChart.destroy();
        carFinancialChart = null;
    }
}

// تبديل نوع التأجير
function toggleRentalType() {
    const hoursSection = document.getElementById('hoursRentalSection');
    const daysSection = document.getElementById('daysRentalSection');
    const rentalType = document.querySelector('input[name="rentalType"]:checked')?.value;
    
    if (hoursSection && daysSection) {
        if (rentalType === 'ساعات') {
            hoursSection.style.display = 'block';
            daysSection.style.display = 'none';
        } else {
            hoursSection.style.display = 'none';
            daysSection.style.display = 'block';
        }
    }
}

// تحديث سعر التأجير
function updateRentalPrice() {
    const rentalType = document.querySelector('input[name="rentalType"]:checked')?.value;
    if (rentalType === 'ساعات') {
        calculateHoursPrice();
    } else {
        calculateDaysPrice();
    }
}

// حساب سعر التأجير بالساعات
function calculateHoursPrice() {
    const carId = document.getElementById('rentCarSelect')?.value;
    const startDateTime = document.getElementById('startDateTime')?.value;
    const endDateTime = document.getElementById('endDateTime')?.value;
    
    if (!carId || !startDateTime || !endDateTime) return;
    
    const car = CARS_DATA.find(c => c.id == carId);
    if (!car) return;
    
    const start = new Date(startDateTime);
    const end = new Date(endDateTime);
    
    if (end <= start) {
        alert('وقت الانتهاء يجب أن يكون بعد وقت البدء');
        document.getElementById('endDateTime').value = '';
        return;
    }
    
    // حساب الفرق بالساعات (مع التقريب للأعلى)
    const hoursDiff = Math.ceil((end - start) / (1000 * 60 * 60));
    const totalAmount = hoursDiff * (car.pricePerHour || 0);
    
    // عرض عدد الساعات
    const hoursDisplay = document.getElementById('hoursDisplay');
    if (hoursDisplay) {
        hoursDisplay.textContent = `${hoursDiff} ساعة`;
    }
    
    const totalAmountInput = document.getElementById('totalAmountInput');
    if (totalAmountInput) {
        totalAmountInput.value = totalAmount;
    }
    
    updateRemainingAmount();
}

// حساب سعر التأجير بالأيام
function calculateDaysPrice() {
    const carId = document.getElementById('rentCarSelect')?.value;
    const startDate = document.getElementById('startDateInput')?.value;
    const endDate = document.getElementById('endDateInput')?.value;
    
    if (!carId || !startDate || !endDate) return;
    
    const car = CARS_DATA.find(c => c.id == carId);
    if (!car) return;
    
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (end <= start) {
        alert('تاريخ الانتهاء يجب أن يكون بعد تاريخ البدء');
        return;
    }
    
    const daysDiff = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
    const totalAmount = daysDiff * (car.pricePerDay || 0);
    
    const totalAmountInput = document.getElementById('totalAmountInput');
    const daysCountInput = document.getElementById('daysCount');
    
    if (totalAmountInput) {
        totalAmountInput.value = totalAmount;
    }
    
    if (daysCountInput) {
        daysCountInput.value = daysDiff;
    }
    
    updateRemainingAmount();
}

// تحديث المبلغ المتبقي
function updateRemainingAmount() {
    const totalAmountInput = document.getElementById('totalAmountInput');
    const paidInput = document.getElementById('paidUpfront');
    const remainingEl = document.getElementById('remainingAmount');

    if (!totalAmountInput || !paidInput || !remainingEl) return;

    const totalAmount = parseInt(totalAmountInput.value) || 0;
    const paidUpfront = parseInt(paidInput.value) || 0;
    const remaining = Math.max(0, totalAmount - paidUpfront);

    remainingEl.textContent = remaining.toLocaleString() + ' ل.س';
    remainingEl.style.color = remaining > 0 ? '#e74c3c' : '#27ae60';
}

// تأجير سيارة
function rentCar(carId) {
    selectedCarForRental = carId;
    showRentCarModal();
    
    const carSelect = document.getElementById('rentCarSelect');
    if (carSelect) {
        carSelect.value = carId;
    }
    
    updateRentalPrice();
}

// إرسال نموذج التأجير
function submitRentalForm(event) {
    event.preventDefault();
    
    const carId = document.getElementById('rentCarSelect')?.value;
    const customerName = document.getElementById('customerName')?.value;
    const customerPhone = document.getElementById('customerPhone')?.value;
    const rentalType = document.querySelector('input[name="rentalType"]:checked')?.value;
    const totalAmount = parseInt(document.getElementById('totalAmountInput')?.value) || 0;
    const paidUpfront = parseInt(document.getElementById('paidUpfront')?.value) || 0;
    const notes = document.getElementById('rentalNotes')?.value || '';
    
    if (!carId || !customerName || !customerPhone || !rentalType || totalAmount <= 0) {
        alert('الرجاء ملء جميع الحقول المطلوبة');
        return;
    }
    
    const car = CARS_DATA.find(c => c.id == carId);
    if (!car) {
        alert('الرجاء اختيار سيارة صالحة');
        return;
    }
    
    let rentalData;
    
    if (rentalType === 'ساعات') {
        const startDateTime = document.getElementById('startDateTime')?.value;
        const endDateTime = document.getElementById('endDateTime')?.value;
        
        if (!startDateTime || !endDateTime) {
            alert('الرجاء تحديد تاريخ ووقت البدء والانتهاء');
            return;
        }
        
        const start = new Date(startDateTime);
        const end = new Date(endDateTime);
        const hoursDiff = Math.ceil((end - start) / (1000 * 60 * 60));
        
        rentalData = {
            id: generateId(),
            customerName,
            customerPhone,
            startDate: startDateTime.split('T')[0],
            endDate: endDateTime.split('T')[0],
            startTime: startDateTime.split('T')[1] || '00:00',
            endTime: endDateTime.split('T')[1] || '00:00',
            type: 'ساعات',
            totalHours: hoursDiff,
            totalAmount: totalAmount,
            paidUpfront: paidUpfront,
            remainingAmount: Math.max(0, totalAmount - paidUpfront),
            notes
        };
    } else {
        const startDate = document.getElementById('startDateInput')?.value;
        const endDate = document.getElementById('endDateInput')?.value;
        const daysCount = parseInt(document.getElementById('daysCount')?.value) || 1;
        
        if (!startDate || !endDate) {
            alert('الرجاء تحديد تاريخ البدء والانتهاء');
            return;
        }
        
        rentalData = {
            id: generateId(),
            customerName,
            customerPhone,
            startDate,
            endDate,
            startTime: '09:00',
            endTime: '18:00',
            type: 'أيام',
            duration: daysCount,
            totalAmount: totalAmount,
            paidUpfront: paidUpfront,
            remainingAmount: Math.max(0, totalAmount - paidUpfront),
            notes
        };
    }
    
    // تحديث حالة السيارة
    car.available = false;
    car.currentRental = rentalData;
    
    // تسجيل الحركة المالية إذا كان هناك دفعة
    if (paidUpfront > 0) {
        const transaction = {
            id: generateId(),
            type: 'قبض',
            amount: paidUpfront,
            carId: car.id,
            carName: car.name,
            customerName: customerName,
            description: `دفعة مقدمة لتأجير ${rentalData.type}`,
            category: 'إيجار',
            date: new Date().toISOString().split('T')[0],
            time: new Date().toTimeString().split(' ')[0].substring(0, 5)
        };
        FINANCIAL_TRANSACTIONS.push(transaction);
    }
    
    // حفظ التأجير في currentRental فقط (سيتم نقله للـ history عند الإرجاع)
    car.available = false;
    car.currentRental = rentalData;
    
    alert(`تم تأجير ${car.name} بنجاح!\nالمبلغ الإجمالي: ${totalAmount.toLocaleString()} ل.س\nالمبلغ المدفوع: ${paidUpfront.toLocaleString()} ل.س`);
    
    closeModal('rentCarModal');
    loadDashboardData();
    saveDataToServer();
}

// إرسال نموذج الحركة المالية
function submitTransactionForm(event) {
    event.preventDefault();
    
    const type = document.querySelector('input[name="transactionType"]:checked')?.value;
    const amount = parseInt(document.getElementById('transactionAmount')?.value);
    const category = document.getElementById('transactionCategory')?.value || 'أخرى';
    const carId = document.getElementById('transactionCar')?.value || null;
    const customerName = document.getElementById('transactionCustomer')?.value || null;
    const description = document.getElementById('transactionDescription')?.value;
    
    if (!type || !amount || amount <= 0 || !description) {
        alert('الرجاء ملء جميع الحقول المطلوبة');
        return;
    }
    
    const car = carId ? CARS_DATA.find(c => c.id == carId) : null;
    
    const transaction = {
        id: generateId(),
        type,
        amount,
        carId: carId || null,
        carName: car ? car.name : null,
        customerName,
        description,
        category,
        date: new Date().toISOString().split('T')[0],
        time: new Date().toTimeString().split(' ')[0].substring(0, 5)
    };
    
    FINANCIAL_TRANSACTIONS.push(transaction);
    
    // إذا كانت حركة قبض مرتبطة بسيارة مؤجرة، تحديث المبلغ المتبقي
    if (type === 'قبض' && carId && car && !car.available && car.currentRental) {
        car.currentRental.paidUpfront = (car.currentRental.paidUpfront || 0) + amount;
        car.currentRental.remainingAmount = Math.max(0, (car.currentRental.totalAmount || 0) - car.currentRental.paidUpfront);
    }
    
    alert('تم إضافة الحركة المالية بنجاح');
    closeModal('addTransactionModal');
    loadDashboardData();
    saveDataToServer();
}

// إرسال نموذج إضافة سيارة
function submitCarForm(event) {
    event.preventDefault();
    
    const name = document.getElementById('newCarName')?.value;
    const plate = document.getElementById('newCarPlate')?.value;
    const type = document.getElementById('newCarType')?.value;
    const color = document.getElementById('newCarColor')?.value;
    const year = parseInt(document.getElementById('newCarYear')?.value);
    const mileage = parseInt(document.getElementById('newCarMileage')?.value);
    const features = document.getElementById('newCarFeatures')?.value;
    
    if (!name || !plate || !type || !color || !year || !mileage) {
        alert('الرجاء ملء جميع الحقول المطلوبة');
        return;
    }
    
    const newCar = {
        id: generateId(),
        name: name,
        plate: plate,
        type: type,
        color: color,
        year: year,
        mileage: mileage,
        features: features ? features.split(',').map(f => f.trim()).filter(f => f) : [],
        available: true,
        pricePerDay: 50000, // سعر افتراضي
        pricePerHour: 5000,  // سعر افتراضي
        totalRevenue: 0
    };
    
    CARS_DATA.push(newCar);
    saveDataToServer();
    
    alert('تم إضافة السيارة بنجاح');
    closeModal('addCarModal');
    loadDashboardData();
}

// إعادة سيارة
function returnCar(carId) {
    const car = CARS_DATA.find(c => c.id == carId);
    if (!car || car.available) {
        alert('هذه السيارة ليست مستأجرة');
        return;
    }
    
    if (confirm(`هل تريد إعادة السيارة ${car.name}؟\nالمبلغ المتبقي: ${car.currentRental?.remainingAmount || 0} ل.س`)) {
        // إذا كان هناك مبلغ متبقي، تسجيله كدفعة
        if (car.currentRental?.remainingAmount > 0) {
            const transaction = {
                id: generateId(),
                type: 'قبض',
                amount: car.currentRental.remainingAmount,
                carId: car.id,
                carName: car.name,
                customerName: car.currentRental.customerName,
                description: 'دفعة متبقية عند إعادة السيارة',
                category: 'إيجار',
                date: new Date().toISOString().split('T')[0],
                time: new Date().toTimeString().split(' ')[0].substring(0, 5)
            };
            FINANCIAL_TRANSACTIONS.push(transaction);
        }
        
        // حفظ التأجير في السجل قبل حذفه
        if (car.currentRental) {
            const completedBooking = {
                id: car.currentRental.id || generateId(),
                carId: car.id,
                carName: car.name,
                ...car.currentRental,
                status: 'مكتمل',
                returnDate: new Date().toISOString().split('T')[0],
                returnTime: new Date().toTimeString().split(' ')[0].substring(0, 5)
            };
            BOOKINGS_HISTORY.push(completedBooking);
        }
        
        // تحديث إجمالي إيرادات السيارة
        car.totalRevenue = (car.totalRevenue || 0) + (car.currentRental?.totalAmount || 0);
        
        // تحديث حالة السيارة
        car.available = true;
        car.currentRental = null;
        
        alert('تم إعادة السيارة بنجاح');
        loadDashboardData();
        saveDataToServer();
    }
}

// عرض تفاصيل السيارة
function showCarDetails(carId) {
    const car = CARS_DATA.find(c => c.id == carId);
    if (!car) return;
    
    const modalTitle = document.getElementById('modalCarTitle');
    const content = document.getElementById('carDetailsContent');
    
    if (modalTitle) {
        modalTitle.innerHTML = `<i class="fas fa-car"></i> تفاصيل ${escapeHtml(car.name)}`;
    }
    
    if (content) {
        content.innerHTML = `
            <div class="car-details-modal">
                <div class="car-header">
                    <h3>${escapeHtml(car.name)}</h3>
                    <span class="car-plate">${escapeHtml(car.plate)}</span>
                </div>
                
                <div class="details-grid">
                    <div class="detail-item">
                        <strong><i class="fas fa-car-side"></i> النوع:</strong>
                        <span>${escapeHtml(car.type || '')}</span>
                    </div>
                    <div class="detail-item">
                        <strong><i class="fas fa-palette"></i> اللون:</strong>
                        <span>${escapeHtml(car.color || '')}</span>
                    </div>
                    <div class="detail-item">
                        <strong><i class="fas fa-calendar"></i> السنة:</strong>
                        <span>${car.year || ''}</span>
                    </div>
                    <div class="detail-item">
                        <strong><i class="fas fa-tachometer-alt"></i> العداد:</strong>
                        <span>${(car.mileage || 0).toLocaleString()} كم</span>
                    </div>
                </div>
                
                ${car.features && car.features.length > 0 ? `
                    <div class="features-section">
                        <h4><i class="fas fa-cogs"></i> المميزات</h4>
                        <div class="features-list">
                            ${car.features.map(feature => `
                                <span class="feature-tag">${escapeHtml(feature)}</span>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}
                
                <div class="revenue-section">
                    <h4><i class="fas fa-chart-line"></i> الإحصائيات</h4>
                    <div class="revenue-details">
                        <div class="revenue-item">
                            <span>إجمالي الإيرادات:</span>
                            <span class="revenue">${(car.totalRevenue || 0).toLocaleString()} ل.س</span>
                        </div>
                        <div class="revenue-item">
                            <span>الحالة:</span>
                            <span class="status-badge ${car.available ? 'status-available' : 'status-rented'}">
                                ${car.available ? 'متاحة' : 'مستأجرة'}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    const modal = document.getElementById('carDetailsModal');
    if (modal) {
        modal.style.display = 'flex';
    }
}

// عرض تفاصيل التأجير
function showRentalDetails(carId) {
    const car = CARS_DATA.find(c => c.id == carId);
    if (!car || !car.currentRental) return;
    
    const rental = car.currentRental;
    
    const modalTitle = document.getElementById('modalCarTitle');
    const content = document.getElementById('carDetailsContent');
    
    if (modalTitle) {
        modalTitle.innerHTML = `<i class="fas fa-file-invoice"></i> فاتورة تأجير - ${escapeHtml(car.name)}`;
    }
    
    if (content) {
        content.innerHTML = `
            <div class="invoice-details">
                <div class="invoice-header">
                    <div class="invoice-info">
                        <h4>فاتورة تأجير سيارة</h4>
                        <p>رقم الفاتورة: ${Date.now()}</p>
                        <p>التاريخ: ${new Date().toLocaleDateString('ar-SA')}</p>
                    </div>
                    <div class="invoice-logo">
                        <i class="fas fa-car fa-3x"></i>
                    </div>
                </div>
                
                <div class="invoice-section">
                    <h5>معلومات السيارة</h5>
                    <div class="invoice-grid">
                        <div class="invoice-item">
                            <strong>اسم السيارة:</strong>
                            <span>${escapeHtml(car.name)}</span>
                        </div>
                        <div class="invoice-item">
                            <strong>رقم اللوحة:</strong>
                            <span>${escapeHtml(car.plate)}</span>
                        </div>
                        <div class="invoice-item">
                            <strong>النوع:</strong>
                            <span>${escapeHtml(car.type || '')}</span>
                        </div>
                        <div class="invoice-item">
                            <strong>اللون:</strong>
                            <span>${escapeHtml(car.color || '')}</span>
                        </div>
                    </div>
                </div>
                
                <div class="invoice-section">
                    <h5>معلومات العميل</h5>
                    <div class="invoice-grid">
                        <div class="invoice-item">
                            <strong>اسم العميل:</strong>
                            <span>${escapeHtml(rental.customerName || '')}</span>
                        </div>
                        <div class="invoice-item">
                            <strong>رقم الهاتف:</strong>
                            <span>${escapeHtml(rental.customerPhone || '')}</span>
                        </div>
                    </div>
                </div>
                
                <div class="invoice-section">
                    <h5>تفاصيل التأجير</h5>
                    <div class="invoice-grid">
                        <div class="invoice-item">
                            <strong>فترة التأجير:</strong>
                            <span>من ${formatDate(rental.startDate)} ${rental.startTime || ''} إلى ${formatDate(rental.endDate)} ${rental.endTime || ''}</span>
                        </div>
                        <div class="invoice-item">
                            <strong>نوع التأجير:</strong>
                            <span>${escapeHtml(rental.type || '')}</span>
                        </div>
                        <div class="invoice-item">
                            <strong>المدة:</strong>
                            <span>${rental.type === 'ساعات' ? `${rental.totalHours || 0} ساعة` : `${rental.duration || 0} يوم`}</span>
                        </div>
                    </div>
                </div>
                
                <div class="invoice-section">
                    <h5>تفاصيل الدفع</h5>
                    <table class="invoice-table">
                        <tr>
                            <td>المبلغ الإجمالي:</td>
                            <td class="text-right">${(rental.totalAmount || 0).toLocaleString()} ل.س</td>
                        </tr>
                        <tr>
                            <td>المبلغ المدفوع:</td>
                            <td class="text-right">${(rental.paidUpfront || 0).toLocaleString()} ل.س</td>
                        </tr>
                        <tr class="total-row">
                            <td>المبلغ المتبقي:</td>
                            <td class="text-right">${(rental.remainingAmount || 0).toLocaleString()} ل.س</td>
                        </tr>
                    </table>
                </div>
                
                ${rental.notes ? `
                    <div class="invoice-section">
                        <h5>ملاحظات</h5>
                        <p>${escapeHtml(rental.notes)}</p>
                    </div>
                ` : ''}
                
                <div class="invoice-actions">
                    <button class="btn btn-primary" onclick="printInvoice()">
                        <i class="fas fa-print"></i> طباعة الفاتورة
                    </button>
                </div>
            </div>
        `;
    }
    
    const modal = document.getElementById('carDetailsModal');
    if (modal) {
        modal.style.display = 'flex';
    }
}

// طباعة الفاتورة
function printInvoice() {
    window.print();
}

// وظائف مساعدة
function formatDate(dateString) {
    if (!dateString) return '';
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('ar-SA');
    } catch (e) {
        return dateString;
    }
}

function formatCurrency(amount) {
    return (amount || 0).toLocaleString() + ' ل.س';
}

function refreshData() {
    loadDataFromServer().then(() => {
        loadDashboardData();
        alert('تم تحديث البيانات');
    });
}

// توليد ID فريد
function generateId() {
    return Date.now() + Math.floor(Math.random() * 1000);
}

// دالة لحماية من XSS
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// إضافة حركة مالية
function addTransaction(transaction, save = true) {
    if (!transaction.id) {
        transaction.id = generateId();
    }
    FINANCIAL_TRANSACTIONS.push(transaction);
    if (save) {
        saveDataToServer();
    }
}

// إضافة حجز
function addBooking(booking) {
    if (!booking.id) {
        booking.id = generateId();
    }
    BOOKINGS_HISTORY.push(booking);
}

// تعديل حركة مالية
function editTransaction(transactionId) {
    const transaction = FINANCIAL_TRANSACTIONS.find(t => t.id === transactionId);
    if (!transaction) return;
    
    const newAmount = prompt('أدخل المبلغ الجديد:', transaction.amount);
    if (newAmount && !isNaN(newAmount) && parseInt(newAmount) > 0) {
        transaction.amount = parseInt(newAmount);
        alert('تم تعديل الحركة المالية');
        loadDashboardData();
        saveDataToServer();
    }
}

// حذف حركة مالية
function deleteTransaction(transactionId) {
    if (confirm('هل أنت متأكد من حذف هذه الحركة المالية؟')) {
        const index = FINANCIAL_TRANSACTIONS.findIndex(t => t.id === transactionId);
        if (index !== -1) {
            FINANCIAL_TRANSACTIONS.splice(index, 1);
            alert('تم حذف الحركة المالية');
            loadDashboardData();
            saveDataToServer();
        }
    }
}

// عرض جميع التأجيرات
function showAllRentals() {
    const rentedCars = getRentedCars();
    if (rentedCars.length === 0) {
        alert('لا توجد سيارات مؤجرة حالياً');
        return;
    }
    
    let message = 'السيارات المؤجرة حالياً:\n\n';
    rentedCars.forEach((car, index) => {
        const rental = car.currentRental;
        message += `${index + 1}. ${car.name} (${car.plate})\n`;
        message += `   العميل: ${rental.customerName}\n`;
        message += `   الفترة: ${formatDate(rental.startDate)} ${rental.startTime || ''} - ${formatDate(rental.endDate)} ${rental.endTime || ''}\n`;
        message += `   المبلغ: ${(rental.totalAmount || 0).toLocaleString()} ل.س (مدفوع: ${(rental.paidUpfront || 0).toLocaleString()} ل.س)\n\n`;
    });
    
    alert(message);
}

// عرض جميع الحركات المالية
function showAllTransactions() {
    if (FINANCIAL_TRANSACTIONS.length === 0) {
        alert('لا توجد حركات مالية سابقة');
        return;
    }
    
    let message = 'كشف الحساب الكامل:\n\n';
    let totalIncome = 0;
    let totalExpenses = 0;
    
    [...FINANCIAL_TRANSACTIONS]
        .sort((a, b) => {
            const dateA = new Date(`${a.date || ''}T${a.time || '00:00'}`);
            const dateB = new Date(`${b.date || ''}T${b.time || '00:00'}`);
            return dateB - dateA;
        })
        .forEach((trans, index) => {
            const sign = trans.type === 'قبض' ? '+' : '-';
            if (trans.type === 'قبض') totalIncome += trans.amount || 0;
            else totalExpenses += trans.amount || 0;
            
            message += `${index + 1}. ${trans.date || ''} ${trans.time || ''}\n`;
            message += `   ${trans.type === 'قبض' ? 'قبض' : 'دفع'}: ${sign}${(trans.amount || 0).toLocaleString()} ل.س\n`;
            message += `   الوصف: ${trans.description || ''}\n`;
            if (trans.carName) message += `   السيارة: ${trans.carName}\n`;
            message += '\n';
        });
    
    const profit = totalIncome - totalExpenses;
    message += '═══════════════════════════════\n';
    message += `إجمالي المدخولات: ${totalIncome.toLocaleString()} ل.س\n`;
    message += `إجمالي المدفوعات: ${totalExpenses.toLocaleString()} ل.س\n`;
    message += `صافي الأرباح: ${profit.toLocaleString()} ل.س`;
    
    alert(message);
}

// جلب البيانات من السيرفر
async function loadDataFromServer() {
    try {
        const response = await fetch('/api/data');
        if (!response.ok) {
            throw new Error(`فشل جلب البيانات - ${response.status}`);
        }
        const data = await response.json();

        CARS_DATA = Array.isArray(data.cars) ? data.cars : [];
        FINANCIAL_TRANSACTIONS = Array.isArray(data.transactions) ? data.transactions : [];
        BOOKINGS_HISTORY = Array.isArray(data.bookingsHistory) ? data.bookingsHistory : [];

        return true;
    } catch (err) {
        console.error('خطأ في جلب البيانات:', err);
        
        // بيانات افتراضية للتجربة
        if (CARS_DATA.length === 0) {
            CARS_DATA = [
                {
                    id: 1,
                    name: 'تويوتا كورولا 2024',
                    plate: 'ABC-123',
                    type: 'سيدان',
                    color: 'أبيض',
                    year: 2024,
                    mileage: 15000,
                    features: ['مكيف', 'أوتوماتيك', 'بلوتوث'],
                    available: true,
                    pricePerDay: 50000,
                    pricePerHour: 5000,
                    totalRevenue: 0
                },
                {
                    id: 2,
                    name: 'هيونداي النترا 2023',
                    plate: 'XYZ-789',
                    type: 'سيدان',
                    color: 'فضي',
                    year: 2023,
                    mileage: 25000,
                    features: ['مكيف', 'أوتوماتيك', 'كاميرا خلفية'],
                    available: true,
                    pricePerDay: 45000,
                    pricePerHour: 4500,
                    totalRevenue: 0
                }
            ];
        }
        
        return false;
    }
}

// حفظ البيانات إلى السيرفر
async function saveDataToServer(silent = false) {
    const payload = {
        cars: CARS_DATA,
        transactions: FINANCIAL_TRANSACTIONS,
        bookingsHistory: BOOKINGS_HISTORY
    };

    try {
        const response = await fetch('/api/update', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`فشل الحفظ - ${response.status}`);
        }

        if (!silent) {
            console.log('تم حفظ البيانات بنجاح');
        }
    } catch (err) {
        console.error('خطأ في حفظ البيانات:', err);
    }
}

// إغلاق المودال عند الضغط خارجها
window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
        event.target.style.display = 'none';
    }
};

// ========================================
// وظائف التقرير المالي للسيارة
// ========================================

let carFinancialChart = null;
let currentCarInvoiceData = null; // بيانات الفاتورة الحالية

// فتح modal التقرير المالي للسيارة
function showCarFinancialModal() {
    // تعبئة قائمة السيارات
    const select = document.getElementById('carFinancialSelect');
    if (select) {
        select.innerHTML = '<option value="">-- اختر سيارة --</option>';
        CARS_DATA.forEach(car => {
            const option = document.createElement('option');
            option.value = car.id;
            option.textContent = `${car.name} - ${car.plate}`;
            select.appendChild(option);
        });
    }
    
    // تنظيف الـ chart القديم
    if (carFinancialChart) {
        carFinancialChart.destroy();
        carFinancialChart = null;
    }
    
    // إعادة تعيين المحتوى
    const content = document.getElementById('carFinancialReportContent');
    if (content) {
        content.innerHTML = `
            <div style="text-align: center; padding: 60px; color: #94a3b8;">
                <i class="fas fa-car-side" style="font-size: 4rem; opacity: 0.3; margin-bottom: 20px;"></i>
                <p style="font-size: 1.1rem;">اختر سيارة لعرض التقرير المالي المفصّل</p>
            </div>
        `;
    }
    
    // إظهار الـ modal
    const modal = document.getElementById('carFinancialModal');
    if (modal) {
        modal.style.display = 'flex';
    }
}

// تحميل التقرير المالي للسيارة المختارة
function loadCarFinancialReport(startDate = null, endDate = null) {
    const select = document.getElementById('carFinancialSelect');
    const carId = select?.value;
    
    // إخفاء/إظهار قسم فلتر التاريخ
    const dateFilterSection = document.getElementById('carDateFilterSection');
    
    if (!carId) {
        if (dateFilterSection) dateFilterSection.style.display = 'none';
        const content = document.getElementById('carFinancialReportContent');
        if (content) {
            content.innerHTML = `
                <div style="text-align: center; padding: 60px; color: #94a3b8;">
                    <i class="fas fa-car-side" style="font-size: 4rem; opacity: 0.3; margin-bottom: 20px;"></i>
                    <p style="font-size: 1.1rem;">اختر سيارة لعرض التقرير المالي المفصّل</p>
                </div>
            `;
        }
        return;
    }
    
    // إظهار فلتر التاريخ
    if (dateFilterSection) dateFilterSection.style.display = 'block';
    
    const car = CARS_DATA.find(c => c.id == carId);
    if (!car) return;
    
    // جلب جميع المعاملات المالية للسيارة (استخدام == للمقارنة لأن carId قد يكون string)
    let carTransactions = FINANCIAL_TRANSACTIONS.filter(t => t.carId == carId);
    
    // تطبيق فلتر التاريخ إذا كان موجود
    let dateFilterText = '';
    if (startDate && endDate) {
        carTransactions = carTransactions.filter(t => {
            if (!t || !t.date) return false;
            const transDate = new Date(t.date);
            return transDate >= new Date(startDate) && transDate <= new Date(endDate);
        });
        dateFilterText = `<span style="color: #00e0ff; margin-right: 12px;"><i class="fas fa-filter"></i> الفترة: ${formatDate(startDate)} - ${formatDate(endDate)}</span>`;
    }
    
    // حساب الإحصائيات
    const income = carTransactions
        .filter(t => t.type === 'قبض')
        .reduce((sum, t) => sum + (t.amount || 0), 0);
    
    const expenses = carTransactions
        .filter(t => t.type === 'دفع')
        .reduce((sum, t) => sum + (t.amount || 0), 0);
    
    const profit = income - expenses;
    
    // جلب تاريخ التأجيرات
    const carRentals = BOOKINGS_HISTORY.filter(b => b.carId == carId);
    const activeRental = car.currentRental;
    
    // حفظ بيانات الفاتورة الحالية
    currentCarInvoiceData = {
        carId: carId,
        car: car,
        income: income,
        expenses: expenses,
        profit: profit,
        transactions: carTransactions,
        rentals: carRentals,
        activeRental: activeRental,
        startDate: startDate,
        endDate: endDate
    };
    
    // بناء المحتوى
    const content = document.getElementById('carFinancialReportContent');
    if (!content) return;
    
    content.innerHTML = `
        <div class="car-financial-report">
            <!-- معلومات السيارة -->
            <div style="background: linear-gradient(145deg, rgba(0, 224, 255, 0.1), rgba(0, 153, 255, 0.05)); padding: 24px; border-radius: 16px; margin-bottom: 30px; border: 1px solid rgba(0, 224, 255, 0.3);">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px;">
                    <div>
                        <h3 style="font-size: 1.8rem; color: #00e0ff; margin-bottom: 8px;">
                            <i class="fas fa-car"></i> ${escapeHtml(car.name)}
                        </h3>
                        <p style="color: #94a3b8; font-size: 1rem;">
                            <i class="fas fa-hashtag"></i> لوحة: ${escapeHtml(car.plate)} | 
                            <i class="fas fa-car-side"></i> ${escapeHtml(car.type || 'غير محدد')} | 
                            <i class="fas fa-palette"></i> ${escapeHtml(car.color || 'غير محدد')}
                            ${dateFilterText}
                        </p>
                    </div>
                    <div>
                        <span class="status-badge ${car.available ? 'status-available' : 'status-rented'}">
                            ${car.available ? '✓ متاحة' : '⏱ مستأجرة'}
                        </span>
                    </div>
                </div>
            </div>
            
            <!-- الملخص المالي -->
            <div class="car-financial-summary">
                <div class="financial-stat-card income">
                    <h4><i class="fas fa-arrow-down"></i> إجمالي المدخولات</h4>
                    <p class="amount">${income.toLocaleString()}<span style="font-size: 1rem; margin-right: 6px;">ل.س</span></p>
                    <p style="font-size: 0.85rem; color: #64748b; margin-top: 8px;">
                        ${carTransactions.filter(t => t.type === 'قبض').length} عملية قبض
                    </p>
                </div>
                
                <div class="financial-stat-card expense">
                    <h4><i class="fas fa-arrow-up"></i> إجمالي المدفوعات</h4>
                    <p class="amount">${expenses.toLocaleString()}<span style="font-size: 1rem; margin-right: 6px;">ل.س</span></p>
                    <p style="font-size: 0.85rem; color: #64748b; margin-top: 8px;">
                        ${carTransactions.filter(t => t.type === 'دفع').length} عملية دفع
                    </p>
                </div>
                
                <div class="financial-stat-card profit">
                    <h4><i class="fas fa-chart-line"></i> صافي الأرباح</h4>
                    <p class="amount">${profit.toLocaleString()}<span style="font-size: 1rem; margin-right: 6px;">ل.س</span></p>
                    <p style="font-size: 0.85rem; color: #64748b; margin-top: 8px;">
                        ${carTransactions.length} عملية إجمالية
                    </p>
                </div>
            </div>
            
            <!-- أزرار الإجراءات -->
            <div style="display: flex; gap: 12px; margin: 24px 0; flex-wrap: wrap; justify-content: center;">
                <button class="btn btn-primary" onclick="printCurrentCarInvoice()">
                    <i class="fas fa-print"></i>
                    طباعة فاتورة السيارة
                </button>
            </div>
            
            <!-- الرسم البياني -->
            <div class="car-chart-container">
                <h4 style="font-size: 1.2rem; color: #00e0ff; margin-bottom: 20px; text-align: center;">
                    <i class="fas fa-chart-bar"></i> التوزيع المالي
                </h4>
                <div class="car-chart-wrapper">
                    <canvas id="carFinancialChart"></canvas>
                </div>
            </div>
            
            <!-- تفاصيل الحركات المالية -->
            ${carTransactions.length > 0 ? `
                <div class="transactions-details">
                    <h4><i class="fas fa-money-bill-wave"></i> تفاصيل الحركات المالية (${carTransactions.length})</h4>
                    ${carTransactions.sort((a, b) => {
                        const dateA = new Date(a.date + ' ' + (a.time || '00:00'));
                        const dateB = new Date(b.date + ' ' + (b.time || '00:00'));
                        return dateB - dateA;
                    }).map(transaction => `
                        <div class="transaction-item">
                            <div class="transaction-info">
                                <span class="transaction-type ${transaction.type === 'قبض' ? 'income' : 'expense'}">
                                    ${transaction.type === 'قبض' ? '💰 قبض' : '💸 دفع'}
                                </span>
                                <p class="transaction-desc">
                                    <strong>${escapeHtml(transaction.description || 'بدون وصف')}</strong>
                                    ${transaction.category ? `<span style="margin-right: 12px; color: #64748b;">• ${escapeHtml(transaction.category)}</span>` : ''}
                                    ${transaction.customerName ? `<span style="margin-right: 12px; color: #64748b;">• ${escapeHtml(transaction.customerName)}</span>` : ''}
                                </p>
                                <p class="transaction-date">
                                    <i class="fas fa-calendar"></i> ${formatDate(transaction.date)}
                                    ${transaction.time ? `<i class="fas fa-clock" style="margin-right: 12px;"></i> ${transaction.time}` : ''}
                                </p>
                            </div>
                            <div class="transaction-amount ${transaction.type === 'قبض' ? 'income' : 'expense'}">
                                ${transaction.type === 'قبض' ? '+' : '-'}${transaction.amount.toLocaleString()} ل.س
                            </div>
                        </div>
                    `).join('')}
                </div>
            ` : `
                <div class="no-data-message">
                    <i class="fas fa-inbox"></i>
                    <p>لا توجد حركات مالية لهذه السيارة بعد</p>
                </div>
            `}
            
            <!-- تاريخ التأجيرات -->
            ${(carRentals.length > 0 || activeRental) ? `
                <div class="rentals-section">
                    <h4><i class="fas fa-history"></i> تاريخ التأجيرات (${carRentals.length + (activeRental ? 1 : 0)})</h4>
                    
                    ${activeRental ? `
                        <div class="rental-history-item">
                            <div class="rental-history-header">
                                <h5 class="rental-customer-name">
                                    <i class="fas fa-user"></i> ${escapeHtml(activeRental.customerName || 'غير محدد')}
                                </h5>
                                <span class="rental-status active">⏱ نشط حالياً</span>
                            </div>
                            <div class="rental-details-grid">
                                <div class="rental-detail">
                                    <span class="rental-detail-label">فترة التأجير</span>
                                    <span class="rental-detail-value">
                                        ${activeRental.type === 'ساعات' 
                                            ? `${formatDate(activeRental.startDate)} من ${activeRental.startTime || '00:00'} إلى ${activeRental.endTime || '23:59'}` 
                                            : `${formatDate(activeRental.startDate)} - ${formatDate(activeRental.endDate)}`
                                        }
                                    </span>
                                </div>
                                <div class="rental-detail">
                                    <span class="rental-detail-label">نوع التأجير</span>
                                    <span class="rental-detail-value">
                                        ${escapeHtml(activeRental.type || 'غير محدد')}
                                        ${activeRental.type === 'ساعات' && activeRental.totalHours 
                                            ? ` (${activeRental.totalHours} ساعة)` 
                                            : activeRental.duration ? ` (${activeRental.duration} يوم)` : ''
                                        }
                                    </span>
                                </div>
                                <div class="rental-detail">
                                    <span class="rental-detail-label">المبلغ الإجمالي</span>
                                    <span class="rental-detail-value" style="color: #00e6a0;">${(activeRental.totalAmount || 0).toLocaleString()} ل.س</span>
                                </div>
                                <div class="rental-detail">
                                    <span class="rental-detail-label">المبلغ المتبقي</span>
                                    <span class="rental-detail-value" style="color: #ff4d4d;">${(activeRental.remainingAmount || 0).toLocaleString()} ل.س</span>
                                </div>
                                ${activeRental.customerPhone ? `
                                    <div class="rental-detail">
                                        <span class="rental-detail-label">رقم الهاتف</span>
                                        <span class="rental-detail-value">${escapeHtml(activeRental.customerPhone)}</span>
                                    </div>
                                ` : ''}
                            </div>
                        </div>
                    ` : ''}
                    
                    ${carRentals.map(rental => `
                        <div class="rental-history-item">
                            <div class="rental-history-header">
                                <h5 class="rental-customer-name">
                                    <i class="fas fa-user"></i> ${escapeHtml(rental.customerName || 'غير محدد')}
                                </h5>
                                <span class="rental-status completed">✓ مكتمل</span>
                            </div>
                            <div class="rental-details-grid">
                                <div class="rental-detail">
                                    <span class="rental-detail-label">فترة التأجير</span>
                                    <span class="rental-detail-value">
                                        ${rental.type === 'ساعات' 
                                            ? `${formatDate(rental.startDate)} من ${rental.startTime || '00:00'} إلى ${rental.endTime || '23:59'}` 
                                            : `${formatDate(rental.startDate)} - ${formatDate(rental.endDate)}`
                                        }
                                    </span>
                                </div>
                                <div class="rental-detail">
                                    <span class="rental-detail-label">نوع التأجير</span>
                                    <span class="rental-detail-value">
                                        ${escapeHtml(rental.type || 'غير محدد')}
                                        ${rental.type === 'ساعات' && rental.totalHours 
                                            ? ` (${rental.totalHours} ساعة)` 
                                            : rental.duration ? ` (${rental.duration} يوم)` : ''
                                        }
                                    </span>
                                </div>
                                <div class="rental-detail">
                                    <span class="rental-detail-label">المبلغ الإجمالي</span>
                                    <span class="rental-detail-value" style="color: #00e6a0;">${(rental.totalAmount || 0).toLocaleString()} ل.س</span>
                                </div>
                                ${rental.customerPhone ? `
                                    <div class="rental-detail">
                                        <span class="rental-detail-label">رقم الهاتف</span>
                                        <span class="rental-detail-value">${escapeHtml(rental.customerPhone)}</span>
                                    </div>
                                ` : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>
            ` : `
                <div class="rentals-section">
                    <h4><i class="fas fa-history"></i> تاريخ التأجيرات</h4>
                    <div class="no-data-message">
                        <i class="fas fa-calendar-times"></i>
                        <p>لا يوجد تاريخ تأجيرات لهذه السيارة</p>
                    </div>
                </div>
            `}
        </div>
    `;
    
    // رسم الـ chart
    setTimeout(() => {
        renderCarFinancialChart(income, expenses, profit);
    }, 100);
}

// رسم الرسم البياني للسيارة
function renderCarFinancialChart(income, expenses, profit) {
    const canvas = document.getElementById('carFinancialChart');
    if (!canvas) return;
    
    // تدمير الـ chart السابق إذا كان موجود
    if (carFinancialChart) {
        carFinancialChart.destroy();
        carFinancialChart = null;
    }
    
    const ctx = canvas.getContext('2d');
    
    carFinancialChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['المدخولات', 'المدفوعات', 'صافي الأرباح'],
            datasets: [{
                label: 'المبلغ (ل.س)',
                data: [income, expenses, profit],
                backgroundColor: [
                    'rgba(0, 230, 160, 0.7)',
                    'rgba(255, 77, 77, 0.7)',
                    'rgba(0, 224, 255, 0.7)'
                ],
                borderColor: [
                    'rgb(0, 230, 160)',
                    'rgb(255, 77, 77)',
                    'rgb(0, 224, 255)'
                ],
                borderWidth: 2,
                borderRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.95)',
                    titleColor: '#00e0ff',
                    bodyColor: '#e2e8f0',
                    borderColor: 'rgba(0, 224, 255, 0.3)',
                    borderWidth: 1,
                    padding: 12,
                    displayColors: false,
                    callbacks: {
                        label: function(context) {
                            return context.label + ': ' + context.parsed.y.toLocaleString() + ' ل.س';
                        }
                    },
                    titleFont: {
                        size: 13
                    },
                    bodyFont: {
                        size: 12
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)',
                        drawBorder: false
                    },
                    ticks: {
                        color: '#94a3b8',
                        font: {
                            size: 11
                        },
                        callback: function(value) {
                            if (value >= 1000000) {
                                return (value / 1000000).toFixed(1) + 'M';
                            } else if (value >= 1000) {
                                return (value / 1000).toFixed(0) + 'K';
                            }
                            return value.toLocaleString();
                        }
                    }
                },
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        color: '#cbd5e1',
                        font: {
                            size: window.innerWidth < 480 ? 10 : 13,
                            weight: 'bold'
                        },
                        maxRotation: 0,
                        minRotation: 0
                    }
                }
            }
        }
    });
}

// تطبيق فلتر التاريخ على التقرير المالي للسيارة
function applyCarDateFilter() {
    const startDate = document.getElementById('carStartDate')?.value;
    const endDate = document.getElementById('carEndDate')?.value;
    
    if (!startDate || !endDate) {
        alert('الرجاء اختيار تاريخ البداية والنهاية');
        return;
    }
    
    if (new Date(startDate) > new Date(endDate)) {
        alert('تاريخ البداية يجب أن يكون قبل تاريخ النهاية');
        return;
    }
    
    loadCarFinancialReport(startDate, endDate);
}

// إلغاء فلتر التاريخ
function clearCarDateFilter() {
    document.getElementById('carStartDate').value = '';
    document.getElementById('carEndDate').value = '';
    loadCarFinancialReport();
}

// طباعة فاتورة السيارة الحالية
function printCurrentCarInvoice() {
    if (!currentCarInvoiceData) {
        alert('الرجاء اختيار سيارة أولاً');
        return;
    }
    
    printCarInvoice(
        currentCarInvoiceData.carId,
        currentCarInvoiceData.car.name,
        currentCarInvoiceData.income,
        currentCarInvoiceData.expenses,
        currentCarInvoiceData.profit,
        currentCarInvoiceData.transactions,
        currentCarInvoiceData.rentals,
        currentCarInvoiceData.activeRental,
        currentCarInvoiceData.startDate,
        currentCarInvoiceData.endDate
    );
}

// طباعة فاتورة السيارة
function printCarInvoice(carId, carName, income, expenses, profit, transactions, rentals, activeRental, startDate = null, endDate = null) {
    const car = CARS_DATA.find(c => c.id == carId);
    if (!car) return;
    
    const now = new Date();
    const invoiceNumber = 'INV-' + Date.now();
    const currentDate = now.toLocaleDateString('ar-SA', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    });
    const currentTime = now.toLocaleTimeString('ar-SA', { 
        hour: '2-digit', 
        minute: '2-digit' 
    });
    
    // إعداد نص الفترة الزمنية
    let periodText = '';
    if (startDate && endDate) {
        periodText = `
            <div class="invoice-info-row">
                <span><strong>الفترة:</strong></span>
                <span>${formatDate(startDate)} - ${formatDate(endDate)}</span>
            </div>
        `;
    }
    
    // إنشاء نافذة طباعة جديدة
    const printWindow = window.open('', '', 'width=800,height=600');
    
    printWindow.document.write(`
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>فاتورة ${carName}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Arial', sans-serif;
            background: white;
            color: #000;
            padding: 20px;
            font-size: 12px;
        }
        
        .invoice-container {
            max-width: 80mm;
            margin: 0 auto;
            background: white;
        }
        
        .invoice-header {
            text-align: center;
            border-bottom: 2px dashed #000;
            padding-bottom: 15px;
            margin-bottom: 15px;
        }
        
        .invoice-header h1 {
            font-size: 18px;
            margin-bottom: 5px;
        }
        
        .invoice-header p {
            font-size: 11px;
            color: #555;
        }
        
        .invoice-info {
            margin-bottom: 15px;
            font-size: 11px;
        }
        
        .invoice-info-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 4px;
        }
        
        .section-title {
            font-weight: bold;
            font-size: 13px;
            margin: 15px 0 8px 0;
            padding-bottom: 5px;
            border-bottom: 1px solid #ddd;
        }
        
        .summary-box {
            background: #f5f5f5;
            padding: 10px;
            margin-bottom: 15px;
            border-radius: 5px;
        }
        
        .summary-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 6px;
            font-size: 12px;
        }
        
        .summary-row.total {
            font-weight: bold;
            font-size: 14px;
            padding-top: 6px;
            border-top: 1px solid #000;
            margin-top: 6px;
        }
        
        .transaction-item {
            padding: 8px 0;
            border-bottom: 1px dashed #ddd;
        }
        
        .transaction-item:last-child {
            border-bottom: none;
        }
        
        .transaction-header {
            display: flex;
            justify-content: space-between;
            margin-bottom: 3px;
            font-weight: bold;
        }
        
        .transaction-desc {
            font-size: 10px;
            color: #666;
            margin-bottom: 2px;
        }
        
        .transaction-date {
            font-size: 10px;
            color: #999;
        }
        
        .rental-item {
            padding: 8px;
            margin-bottom: 8px;
            background: #f9f9f9;
            border-radius: 4px;
        }
        
        .rental-header {
            font-weight: bold;
            margin-bottom: 4px;
        }
        
        .rental-info {
            font-size: 10px;
            color: #666;
            line-height: 1.4;
        }
        
        .invoice-footer {
            text-align: center;
            margin-top: 20px;
            padding-top: 15px;
            border-top: 2px dashed #000;
            font-size: 10px;
        }
        
        .income {
            color: #16a34a;
        }
        
        .expense {
            color: #dc2626;
        }
        
        .profit {
            color: #2563eb;
        }
        
        @media print {
            body {
                padding: 0;
            }
            
            @page {
                size: 80mm auto;
                margin: 0;
            }
        }
    </style>
</head>
<body>
    <div class="invoice-container">
        <div class="invoice-header">
            <h1>🚗 نظام تأجير السيارات</h1>
            <p>فاتورة مفصّلة</p>
        </div>
        
        <div class="invoice-info">
            <div class="invoice-info-row">
                <span><strong>رقم الفاتورة:</strong></span>
                <span>${invoiceNumber}</span>
            </div>
            <div class="invoice-info-row">
                <span><strong>التاريخ:</strong></span>
                <span>${currentDate}</span>
            </div>
            <div class="invoice-info-row">
                <span><strong>الوقت:</strong></span>
                <span>${currentTime}</span>
            </div>
            ${periodText}
        </div>
        
        <div class="section-title">معلومات السيارة</div>
        <div class="invoice-info">
            <div class="invoice-info-row">
                <span><strong>السيارة:</strong></span>
                <span>${carName}</span>
            </div>
            <div class="invoice-info-row">
                <span><strong>اللوحة:</strong></span>
                <span>${car.plate}</span>
            </div>
            <div class="invoice-info-row">
                <span><strong>النوع:</strong></span>
                <span>${car.type || 'غير محدد'}</span>
            </div>
            <div class="invoice-info-row">
                <span><strong>الحالة:</strong></span>
                <span>${car.available ? 'متاحة' : 'مستأجرة'}</span>
            </div>
        </div>
        
        <div class="section-title">الملخص المالي</div>
        <div class="summary-box">
            <div class="summary-row">
                <span>💰 إجمالي المدخولات:</span>
                <span class="income">${income.toLocaleString()} ل.س</span>
            </div>
            <div class="summary-row">
                <span>💸 إجمالي المدفوعات:</span>
                <span class="expense">${expenses.toLocaleString()} ل.س</span>
            </div>
            <div class="summary-row total">
                <span>📊 صافي الأرباح:</span>
                <span class="profit">${profit.toLocaleString()} ل.س</span>
            </div>
        </div>
        
        ${transactions && transactions.length > 0 ? `
            <div class="section-title">تفاصيل الحركات المالية (${transactions.length})</div>
            ${transactions.sort((a, b) => {
                const dateA = new Date(a.date + ' ' + (a.time || '00:00'));
                const dateB = new Date(b.date + ' ' + (b.time || '00:00'));
                return dateB - dateA;
            }).map(t => `
                <div class="transaction-item">
                    <div class="transaction-header">
                        <span>${t.type === 'قبض' ? '💰 قبض' : '💸 دفع'}</span>
                        <span class="${t.type === 'قبض' ? 'income' : 'expense'}">
                            ${t.type === 'قبض' ? '+' : '-'}${t.amount.toLocaleString()} ل.س
                        </span>
                    </div>
                    <div class="transaction-desc">${t.description || 'بدون وصف'}</div>
                    ${t.category ? `<div class="transaction-desc">التصنيف: ${t.category}</div>` : ''}
                    ${t.customerName ? `<div class="transaction-desc">العميل: ${t.customerName}</div>` : ''}
                    <div class="transaction-date">📅 ${formatDate(t.date)} ${t.time ? '⏰ ' + t.time : ''}</div>
                </div>
            `).join('')}
        ` : ''}
        
        ${(rentals && rentals.length > 0) || activeRental ? `
            <div class="section-title">تاريخ التأجيرات</div>
            
            ${activeRental ? `
                <div class="rental-item" style="border: 2px solid #16a34a;">
                    <div class="rental-header">⏱ تأجير نشط - ${activeRental.customerName || 'غير محدد'}</div>
                    <div class="rental-info">
                        📞 ${activeRental.customerPhone || 'غير محدد'}<br>
                        📅 ${formatDate(activeRental.startDate)} - ${formatDate(activeRental.endDate)}<br>
                        ${activeRental.type === 'ساعات' ? `⏰ ${activeRental.totalHours || 0} ساعة` : `📆 ${activeRental.duration || 0} يوم`}<br>
                        💰 المبلغ الإجمالي: ${(activeRental.totalAmount || 0).toLocaleString()} ل.س<br>
                        💸 المبلغ المتبقي: ${(activeRental.remainingAmount || 0).toLocaleString()} ل.س
                    </div>
                </div>
            ` : ''}
            
            ${rentals && rentals.length > 0 ? rentals.map(r => `
                <div class="rental-item">
                    <div class="rental-header">✓ مكتمل - ${r.customerName || 'غير محدد'}</div>
                    <div class="rental-info">
                        📞 ${r.customerPhone || 'غير محدد'}<br>
                        📅 ${formatDate(r.startDate)} - ${formatDate(r.endDate)}<br>
                        ${r.type === 'ساعات' ? `⏰ ${r.totalHours || 0} ساعة` : `📆 ${r.duration || 0} يوم`}<br>
                        💰 المبلغ: ${(r.totalAmount || 0).toLocaleString()} ل.س
                    </div>
                </div>
            `).join('') : ''}
        ` : ''}
        
        <div class="invoice-footer">
            <p>شكراً لتعاملكم معنا</p>
            <p style="margin-top: 5px;">🚗 نظام إدارة تأجير السيارات</p>
        </div>
    </div>
    
    <script>
        window.onload = function() {
            window.print();
        };
    </script>
</body>
</html>
    `);
    
    printWindow.document.close();
}

// طباعة فاتورة شاملة لكل السيارات
function printAllCarsInvoice() {
    // الحصول على فلتر التاريخ من الصفحة الرئيسية
    const startDate = document.getElementById('startDate')?.value;
    const endDate = document.getElementById('endDate')?.value;
    
    const now = new Date();
    const invoiceNumber = 'INV-ALL-' + Date.now();
    const currentDate = now.toLocaleDateString('ar-SA', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    });
    const currentTime = now.toLocaleTimeString('ar-SA', { 
        hour: '2-digit', 
        minute: '2-digit' 
    });
    
    // فلترة الحركات المالية حسب التاريخ إذا كان محدد
    let filteredTransactions = FINANCIAL_TRANSACTIONS;
    if (startDate && endDate) {
        filteredTransactions = FINANCIAL_TRANSACTIONS.filter(t => {
            if (!t || !t.date) return false;
            const transDate = new Date(t.date);
            return transDate >= new Date(startDate) && transDate <= new Date(endDate);
        });
    }
    
    // حساب الإحصائيات الكلية
    const totalIncome = filteredTransactions
        .filter(t => t.type === 'قبض')
        .reduce((sum, t) => sum + (t.amount || 0), 0);
    
    const totalExpenses = filteredTransactions
        .filter(t => t.type === 'دفع')
        .reduce((sum, t) => sum + (t.amount || 0), 0);
    
    const totalProfit = totalIncome - totalExpenses;
    
    // إعداد نص الفترة الزمنية
    let periodText = '';
    if (startDate && endDate) {
        periodText = `
            <div class="invoice-info-row">
                <span><strong>الفترة:</strong></span>
                <span>${formatDate(startDate)} - ${formatDate(endDate)}</span>
            </div>
        `;
    }
    
    // إنشاء نافذة طباعة جديدة
    const printWindow = window.open('', '', 'width=800,height=600');
    
    printWindow.document.write(`
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>فاتورة شاملة</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Arial', sans-serif;
            background: white;
            color: #000;
            padding: 20px;
            font-size: 12px;
        }
        
        .invoice-container {
            max-width: 80mm;
            margin: 0 auto;
            background: white;
        }
        
        .invoice-header {
            text-align: center;
            border-bottom: 2px dashed #000;
            padding-bottom: 15px;
            margin-bottom: 15px;
        }
        
        .invoice-header h1 {
            font-size: 18px;
            margin-bottom: 5px;
        }
        
        .invoice-header p {
            font-size: 11px;
            color: #555;
        }
        
        .invoice-info {
            margin-bottom: 15px;
            font-size: 11px;
        }
        
        .invoice-info-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 4px;
        }
        
        .section-title {
            font-weight: bold;
            font-size: 13px;
            margin: 15px 0 8px 0;
            padding-bottom: 5px;
            border-bottom: 1px solid #ddd;
        }
        
        .summary-box {
            background: #f5f5f5;
            padding: 10px;
            margin-bottom: 15px;
            border-radius: 5px;
        }
        
        .summary-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 6px;
            font-size: 12px;
        }
        
        .summary-row.total {
            font-weight: bold;
            font-size: 14px;
            padding-top: 6px;
            border-top: 1px solid #000;
            margin-top: 6px;
        }
        
        .car-section {
            margin-bottom: 20px;
            padding-bottom: 15px;
            border-bottom: 2px dashed #ddd;
        }
        
        .car-section:last-child {
            border-bottom: none;
        }
        
        .car-header {
            background: #f0f0f0;
            padding: 8px;
            margin-bottom: 10px;
            border-radius: 4px;
            font-weight: bold;
        }
        
        .car-stats {
            font-size: 11px;
            padding: 5px 0;
        }
        
        .car-stats-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 3px;
        }
        
        .transaction-item {
            padding: 6px 0;
            border-bottom: 1px dotted #ddd;
            font-size: 10px;
        }
        
        .transaction-item:last-child {
            border-bottom: none;
        }
        
        .transaction-header {
            display: flex;
            justify-content: space-between;
            margin-bottom: 2px;
        }
        
        .invoice-footer {
            text-align: center;
            margin-top: 20px;
            padding-top: 15px;
            border-top: 2px dashed #000;
            font-size: 10px;
        }
        
        .income {
            color: #16a34a;
        }
        
        .expense {
            color: #dc2626;
        }
        
        .profit {
            color: #2563eb;
        }
        
        @media print {
            body {
                padding: 0;
            }
            
            @page {
                size: 80mm auto;
                margin: 0;
            }
        }
    </style>
</head>
<body>
    <div class="invoice-container">
        <div class="invoice-header">
            <h1>🚗 نظام تأجير السيارات</h1>
            <p>فاتورة شاملة - جميع السيارات</p>
        </div>
        
        <div class="invoice-info">
            <div class="invoice-info-row">
                <span><strong>رقم الفاتورة:</strong></span>
                <span>${invoiceNumber}</span>
            </div>
            <div class="invoice-info-row">
                <span><strong>التاريخ:</strong></span>
                <span>${currentDate}</span>
            </div>
            <div class="invoice-info-row">
                <span><strong>الوقت:</strong></span>
                <span>${currentTime}</span>
            </div>
            ${periodText}
            <div class="invoice-info-row">
                <span><strong>عدد السيارات:</strong></span>
                <span>${CARS_DATA.length} سيارة</span>
            </div>
        </div>
        
        <div class="section-title">الملخص الكلي</div>
        <div class="summary-box">
            <div class="summary-row">
                <span>💰 إجمالي المدخولات:</span>
                <span class="income">${totalIncome.toLocaleString()} ل.س</span>
            </div>
            <div class="summary-row">
                <span>💸 إجمالي المدفوعات:</span>
                <span class="expense">${totalExpenses.toLocaleString()} ل.س</span>
            </div>
            <div class="summary-row total">
                <span>📊 صافي الأرباح:</span>
                <span class="profit">${totalProfit.toLocaleString()} ل.س</span>
            </div>
        </div>
        
        <div class="section-title">تفاصيل كل سيارة</div>
        
        ${CARS_DATA.map(car => {
            const carTransactions = filteredTransactions.filter(t => t.carId == car.id);
            const carIncome = carTransactions
                .filter(t => t.type === 'قبض')
                .reduce((sum, t) => sum + (t.amount || 0), 0);
            const carExpenses = carTransactions
                .filter(t => t.type === 'دفع')
                .reduce((sum, t) => sum + (t.amount || 0), 0);
            const carProfit = carIncome - carExpenses;
            const carRentals = BOOKINGS_HISTORY.filter(b => b.carId == car.id);
            
            return `
                <div class="car-section">
                    <div class="car-header">
                        🚗 ${car.name} - ${car.plate}
                    </div>
                    
                    <div class="car-stats">
                        <div class="car-stats-row">
                            <span>الحالة:</span>
                            <span>${car.available ? '✓ متاحة' : '⏱ مستأجرة'}</span>
                        </div>
                        <div class="car-stats-row">
                            <span>المدخولات:</span>
                            <span class="income">${carIncome.toLocaleString()} ل.س</span>
                        </div>
                        <div class="car-stats-row">
                            <span>المدفوعات:</span>
                            <span class="expense">${carExpenses.toLocaleString()} ل.س</span>
                        </div>
                        <div class="car-stats-row" style="font-weight: bold;">
                            <span>الأرباح:</span>
                            <span class="profit">${carProfit.toLocaleString()} ل.س</span>
                        </div>
                        <div class="car-stats-row">
                            <span>عدد التأجيرات:</span>
                            <span>${carRentals.length + (car.currentRental ? 1 : 0)} تأجير</span>
                        </div>
                        <div class="car-stats-row">
                            <span>عدد الحركات:</span>
                            <span>${carTransactions.length} حركة</span>
                        </div>
                    </div>
                    
                    ${carTransactions.length > 0 ? `
                        <div style="margin-top: 8px; font-size: 11px; font-weight: bold; color: #666;">
                            آخر الحركات:
                        </div>
                        ${carTransactions.slice(0, 5).sort((a, b) => {
                            const dateA = new Date(a.date + ' ' + (a.time || '00:00'));
                            const dateB = new Date(b.date + ' ' + (b.time || '00:00'));
                            return dateB - dateA;
                        }).map(t => `
                            <div class="transaction-item">
                                <div class="transaction-header">
                                    <span>${t.type === 'قبض' ? '💰' : '💸'} ${t.description || 'بدون وصف'}</span>
                                    <span class="${t.type === 'قبض' ? 'income' : 'expense'}">
                                        ${t.type === 'قبض' ? '+' : '-'}${t.amount.toLocaleString()}
                                    </span>
                                </div>
                                <div style="font-size: 9px; color: #999;">
                                    ${formatDate(t.date)} ${t.time || ''}
                                </div>
                            </div>
                        `).join('')}
                    ` : '<div style="font-size: 10px; color: #999; padding: 5px 0;">لا توجد حركات</div>'}
                </div>
            `;
        }).join('')}
        
        <div class="invoice-footer">
            <p>شكراً لتعاملكم معنا</p>
            <p style="margin-top: 5px;">🚗 نظام إدارة تأجير السيارات</p>
            <p style="margin-top: 8px; font-size: 9px; color: #999;">
                تم الطباعة بتاريخ ${currentDate} - ${currentTime}
            </p>
        </div>
    </div>
    
    <script>
        window.onload = function() {
            window.print();
        };
    </script>
</body>
</html>
    `);
    
    printWindow.document.close();
}
