const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();

// لاستقبال JSON من الـ frontend
app.use(express.json());

// خدمة الملفات الثابتة (HTML, CSS, JS)
app.use(express.static(__dirname));  // مهم جداً

// جلب البيانات
app.get('/api/data', (req, res) => {
    const data = JSON.parse(fs.readFileSync('data.json', 'utf8'));
    res.json(data);
});

// حفظ البيانات
app.post('/api/update', (req, res) => {
    fs.writeFileSync('data.json', JSON.stringify(req.body, null, 2));
    res.json({ success: true, message: 'تم حفظ البيانات بنجاح' });
});

const PORT = 3000;

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`→ Local:   http://localhost:${PORT}`);
    console.log(`→ Network: http://192.168.x.x:${PORT}   (استخدم IP جهازك)`);
});
