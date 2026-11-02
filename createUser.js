require('dotenv').config();
const mongoose = require('mongoose');

// Atlas URL .env se lein, agar .env me nahi hai to direct quotation me Atlas URL paste kar sakte hain
const MONGO_URI = process.env.MONGO_URI || 'APNA_ATLAS_CONNECTION_STRING_YAHAN_DAALEIN';

// Aapka exact schema
const userSchema = new mongoose.Schema({
  email: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  role: { type: String, default: 'admin' }
});

const User = mongoose.models.User || mongoose.model('User', userSchema);

async function main() {
  if (!MONGO_URI || MONGO_URI.includes('127.0.0.1')) {
    console.error('Error: Atlas connection string nahi mila! Kripya MONGO_URI me cloud DB URL dalein.');
    return;
  }

  await mongoose.connect(MONGO_URI);
  console.log('MongoDB Atlas Connected Successfully');

  // Purana admin check karein taaki duplicate error na aaye
  const adminEmail = 'admin@gmail.com';
  await User.deleteOne({ email: adminEmail });

  // Agar aap bcrypt use kar rahe hain:
  // const bcrypt = require('bcrypt');
  // const hashedPassword = await bcrypt.hash('Admin@123', 10);

  // Default setup ke hisaab se plain password (agar bcrypt use kiya ho to comment hatayein)
  const newAdmin = new User({
    email: adminEmail,
    password: 'Admin@123', // Agar bcrypt use kar rahe hain to yahan hashedPassword pass karein
    role: 'admin'
  });

  await newAdmin.save();
  console.log('Admin user successfully created in Atlas!');
  console.log('Email: admin@gmail.com');
  console.log('Password: Admin@123');

  await mongoose.disconnect();
}

main().catch(err => console.error('Error creating user:', err));