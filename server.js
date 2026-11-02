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

// Render HTTPS reverse proxy support
app.set('trust proxy', 1);

// Middlewares
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

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

// Storage Setup (Uploads folder create karna)
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// Admin Auth Middleware
const requireAdmin = (req, res, next) => {
  const token = req.cookies.adminToken;
  if (!token) return res.redirect('/admin/login');
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.admin = decoded;
    next();
  } catch {
    res.clearCookie('adminToken');
    res.redirect('/admin/login');
  }
};

// ================= ROUTES ================= //

// 1. HOME PAGE
app.get('/', async (req, res) => {
  try {
    const lands = await Land.find().sort({ createdAt: -1 });
    const isAdmin = Boolean(req.cookies.adminToken);
    res.render('index', { lands, isAdmin });
  } catch (err) {
    res.status(500).send('Error loading lands');
  }
});

// 2. PROPERTY DETAIL PAGE
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
app.get('/setup-admin', async (req, res) => {
  try {
    const adminCount = await User.countDocuments();
    if (adminCount > 0) return res.send('Admin already setup hai. Seedha /admin/login par jayein.');
    res.render('setup');
  } catch (err) {
    res.status(500).send('Database Error: ' + err.message);
  }
});

app.post('/setup-admin', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.send('Email aur password dono zaroori hain.');

    const adminCount = await User.countDocuments();
    if (adminCount > 0) return res.send('Admin already setup hai.');

    const hash = await bcrypt.hash(password, 10);
    await User.create({ email, password: hash, role: 'admin' });
    res.redirect('/admin/login');
  } catch (err) {
    res.status(500).send('Setup failed: ' + err.message);
  }
});

app.get('/admin/login', (req, res) => {
  res.render('login', { error: null });
});

app.post('/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    
    if (user && await bcrypt.compare(password, user.password)) {
      const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
      
      // HTTPS aur production support ke sath cookie
      const isProduction = process.env.NODE_ENV === 'production' || Boolean(process.env.RENDER);
      res.cookie('adminToken', token, {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000
      });

      return res.redirect('/');
    }
    res.render('login', { error: 'गलत Admin ईमेल या पासवर्ड!' });
  } catch (err) {
    res.render('login', { error: 'Server error: ' + err.message });
  }
});

app.get('/admin/logout', (req, res) => {
  res.clearCookie('adminToken').redirect('/');
});

// 4. SELL LAND (Admin only)
app.get('/add', requireAdmin, (req, res) => {
  res.render('add');
});

app.post('/add', requireAdmin, upload.single('image'), async (req, res) => {
  try {
    const { title, location, price, size, whatsapp, description } = req.body;
    const imagePath = req.file ? `/uploads/${req.file.filename}` : undefined;

    await Land.create({
      title,
      location,
      price,
      size,
      description,
      whatsapp: whatsapp.replace(/[^0-9]/g, ''),
      ...(imagePath && { image: imagePath })
    });

    res.redirect('/');
  } catch (err) {
    res.status(500).send('Upload Error: ' + err.message);
  }
});

// 5. DELETE LAND (Admin only)
app.post('/delete/:id', requireAdmin, async (req, res) => {
  try {
    const land = await Land.findById(req.params.id);
    if (land && land.image && land.image.startsWith('/uploads/')) {
      const filePath = path.join(__dirname, 'public', land.image);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    await Land.findByIdAndDelete(req.params.id);
    res.redirect('/');
  } catch (err) {
    res.status(500).send('Delete Error: ' + err.message);
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server live on http://localhost:${PORT}`));