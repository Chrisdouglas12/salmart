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
  const subject = `🚀 ${user.firstName || 'Seller'}, Post Your First Product Today! [#${index+1}]`;
  const postProductUrl = 'https://salmartonline.com.ng/index.html';

  // Generate unique Message-ID
  const messageId = `<${crypto.randomBytes(16).toString('hex')}@salmartonline.com.ng>`;

  const emailHtml = `
  <div style="font-family: Arial, sans-serif; max-width:600px; margin:auto; color:#333;">
    <h2 style="color:#28a745;">Hi ${user.firstName || 'Seller'},</h2>
    <p>Do you know? The fastest way to start earning on <strong>Salmart</strong> is by posting your first product!</p>
    
    <h3 style="color:#28a745;">How to Post in 6 Easy Steps:</h3>
    <ol>
      <li><a href="https://salmartonline.com.ng/SignIn.html">↗️ Log in to your account</a></li>
      <li><a href="https://salmartonline.com.ng/index.html">🏠 Navigate to the Market Tab</a></li>
      <li>📢 Click on the create an ad button</li>
      <li>📸 Upload clear a photo of your item</li>
      <li>💰 Add price, description, location, condition, title</li>
      <li>🚀 Click publish – and wait for buyers!</li>
    </ol>

    <p style="margin:20px 0;">It’s that simple. Start posting now and get connected to buyers today!</p>
    
    <a href="${postProductUrl}" style="background:#28a745;color:#fff;padding:12px 20px;text-decoration:none;border-radius:5px;display:inline-block;">
      👉 Post Your First Product Now
    </a>
    
    <p style="margin-top:30px;font-size:14px;">
      Need help? Reply to this email or contact support@salmartonline.com.ng
    </p>
    
    <p style="font-size:12px;color:#666;margin-top:20px;">
      Salmart Technologies – Safer E-commerce in Nigeria. <br/>
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