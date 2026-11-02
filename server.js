require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();

// Middlewares
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');

// MongoDB Connection
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/rhome';
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey123';

mongoose.connect(MONGO_URI)
  .then(() => console.log('MongoDB Connected Successfully'))
  .catch(err => console.error('DB Error:', err));

// Schemas
const User = mongoose.model('User', new mongoose.Schema({
  email: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  role: { type: String, default: 'admin' }
}));

const Land = mongoose.model('Land', new mongoose.Schema({
  title: { type: String, required: true },
  location: { type: String, required: true },
  price: { type: Number, required: true },
  size: { type: String, required: true },
  description: { type: String, default: 'प्रॉपर्टी से जुड़ी पूरी जानकारी के लिए नीचे दिए गए WhatsApp पर संपर्क करें।' },
  whatsapp: { type: String, required: true },
  image: { type: String, default: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=800&q=80' }
}, { timestamps: true }));

// Storage Setup (Photo upload)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = 'public/uploads/';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// Admin Auth Middleware (सिर्फ आप अंदर जा सकेंगे)
const requireAdmin = (req, res, next) => {
  const token = req.cookies.adminToken;
  if (!token) return res.redirect('/admin/login');
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.admin = decoded;
    next();
  } catch {
    res.redirect('/admin/login');
  }
};

// ================= ROUTES ================= //

// 1. HOME PAGE (कस्टमर बिना लॉगिन किए सब देख सकता है)
app.get('/', async (req, res) => {
  const lands = await Land.find().sort({ createdAt: -1 });
  const isAdmin = Boolean(req.cookies.adminToken);
  res.render('index', { lands, isAdmin });
});

// 2. PROPERTY DETAIL PAGE (कस्टमर क्लिक करके डिटेल देखेगा)
app.get('/property/:id', async (req, res) => {
  try {
    const land = await Land.findById(req.params.id);
    if (!land) return res.redirect('/');
    res.render('detail', { land });
  } catch {
    res.redirect('/');
  }
});

// 3. ADMIN SETUP / LOGIN
// पहली बार अपनी एडमिन आईडी बनाने के लिए: browser me kholiye /setup-admin
app.get('/setup-admin', async (req, res) => {
  const adminCount = await User.countDocuments();
  if (adminCount > 0) return res.send('Admin already setup hai. Seedha /admin/login par jayein.');
  res.render('setup');
});

app.post('/setup-admin', async (req, res) => {
  const { email, password } = req.body;
  const hash = await bcrypt.hash(password, 10);
  await User.create({ email, password: hash, role: 'admin' });
  res.redirect('/admin/login');
});

app.get('/admin/login', (req, res) => {
  res.render('login', { error: null });
});

app.post('/admin/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (user && await bcrypt.compare(password, user.password)) {
    const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET);
    res.cookie('adminToken', token, { httpOnly: true });
    return res.redirect('/');
  }
  res.render('login', { error: 'गलत Admin ईमेल या पासवर्ड!' });
});

app.get('/admin/logout', (req, res) => {
  res.clearCookie('adminToken').redirect('/');
});

// 4. SELL LAND (सिर्फ Admin के लिए)
app.get('/add', requireAdmin, (req, res) => {
  res.render('add');
});

app.post('/add', requireAdmin, upload.single('image'), async (req, res) => {
  const { title, location, price, size, whatsapp, description } = req.body;
  const imagePath = req.file ? `/uploads/${req.file.filename}` : undefined;

  await Land.create({
    title,
    location,
    price,
    size,
    description,
    whatsapp: whatsapp.replace(/[^0-9]/g, ''),
    image: imagePath
  });

  res.redirect('/');
});

// 5. DELETE LAND (सिर्फ Admin के लिए)
app.post('/delete/:id', requireAdmin, async (req, res) => {
  const land = await Land.findById(req.params.id);
  if (land && land.image && land.image.startsWith('/uploads/')) {
    const filePath = path.join(__dirname, 'public', land.image);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
  await Land.findByIdAndDelete(req.params.id);
  res.redirect('/');
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server live on http://localhost:${PORT}`));