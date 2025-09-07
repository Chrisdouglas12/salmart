// sendMarketingEmail.js
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const User = require('./models/userSchema');
require('dotenv').config();

// Email transporter setup
const transporter = nodemailer.createTransport({
  service: 'Zoho',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => {
  console.log('✅ MongoDB connected');
  sendMarketingEmails();
})
.catch(err => {
  console.error(`❌ MongoDB connection error: ${err.message}`);
  process.exit(1);
});

async function sendMarketingEmails() {
  try {
    const users = await User.find({ 
      email: { $exists: true, $ne: '', $regex: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ }
    });

    console.log(`📧 Found ${users.length} users with valid emails`);

    if (users.length === 0) {
      console.log('⚠️ No users to email');
      mongoose.connection.close();
      return;
    }

    let successCount = 0;
    let failureCount = 0;

    for (const [index, user] of users.entries()) {
      try {
        await sendSingleEmail(user, index);
        successCount++;
        console.log(`✅ Sent to ${user.email} (${successCount}/${users.length})`);
      } catch (err) {
        failureCount++;
        console.error(`❌ Failed to send to ${user.email}: ${err.message}`);
      }

      // Delay between sends
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log(`\n📊 Campaign Summary:`);
    console.log(`✅ Successful: ${successCount}`);
    console.log(`❌ Failed: ${failureCount}`);
    console.log(`📈 Success Rate: ${((successCount / users.length) * 100).toFixed(1)}%`);

    mongoose.connection.close();

  } catch (err) {
    console.error(`❌ Campaign error: ${err.message}`);
    mongoose.connection.close();
  }
}

async function sendSingleEmail(user, index) {
  // Personalized subject line
  const subject = `💚 ${user.firstName || 'Friend'}, Buy & Sell Safely on Salmart [#${index+1}]`;
  const postProductUrl = 'https://salmartonline.com.ng/index.html';

  // Generate unique Message-ID
  const messageId = `<${crypto.randomBytes(16).toString('hex')}@salmartonline.com.ng>`;

  const emailHtml = `
  <div style="font-family:Arial, sans-serif;max-width:600px;margin:auto;color:#333;">
    <h2 style="color:#28a745;">Hello ${user.firstName || 'Salmart User'} 👋</h2>
    
    <p>We know one of the biggest fears in online buying and selling is <strong>scam</strong>.  
    That’s why we built <strong>Salmart</strong> – a marketplace where <u>everyone is protected</u>.</p>
    
    <h3 style="color:#28a745;">Here’s how Salmart keeps you safe:</h3>
    <ul>
      <li>💰 <b>Buyers</b> – Your money goes into escrow first. Sellers only get paid after you confirm delivery.</li>
      <li>📦 <b>Sellers</b> – You won’t lose your goods. Payment is guaranteed before you deliver.</li>
      <li>🔒 <b>No Scams</b> – Salmart is designed to make sure both sides are covered.</li>
    </ul>
    
    <p style="margin:20px 0;">👉 Don’t just sign up, take the next step today:  
    Post your first product or make your first safe purchase!</p>
    
    <a href="${postProductUrl}" 
       style="background:#28a745;color:#fff;padding:12px 20px;text-decoration:none;border-radius:5px;display:inline-block;">
       🚀 Start Now
    </a>
    
    <p style="margin-top:30px;font-size:14px;">
      Got questions? Our team is here to help – just reply to this email or write us at  
      <a href="mailto:support@salmartonline.com.ng">support@salmartonline.com.ng</a>.
    </p>
    
    <p style="font-size:12px;color:#666;margin-top:20px;">
      Salmart Technologies – Buy and Sell Without Fear.
    </p>
  </div>`;

  return transporter.sendMail({
    from: `"Salmart Support" <${process.env.EMAIL_USER}>`,
    to: user.email,
    subject,
    html: emailHtml,
    priority: 'high',
    headers: { 
      'Reply-To': 'support@salmartonline.com.ng',
      'Message-ID': messageId 
    }
  });
}