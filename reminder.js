// sendSingleReminder.js
const mongoose = require('mongoose');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const User = require('./models/userSchema'); // Adjust path to your model
require('dotenv').config();

// ====== SET THIS TO THE EMAIL YOU WANT TO TARGET ======
const TARGET_EMAIL = 'akingadeborah@gmail.com';
// ======================================================

// Email transporter
const transporter = nodemailer.createTransport({
  service: 'Zoho',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  },
  priority: 'high' // Set high priority at transport level
});

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => {
  console.log('✅ MongoDB connected');
  sendSingleReminder(TARGET_EMAIL);
})
.catch(err => {
  console.error(`❌ MongoDB connection error: ${err.message}`);
  process.exit(1);
});

async function sendSingleReminder(email) {
  try {
    const user = await User.findOne({ email });

    if (!user) {
      console.log(`⚠️ No user found with email: ${email}`);
      process.exit(0);
    }

    if (!user.verificationToken) {
      user.verificationToken = crypto.randomBytes(32).toString('hex');
    }

    const verifyUrl = `https://salmartonline.com.ng/verify-email.html?token=${user.verificationToken}`;
    const reminderCount = (user.verificationReminderCount || 0) + 1;

    let subject;
    let urgencyMessage;

    if (reminderCount === 1) {
      subject = '👋 Welcome to Salmart! Please Verify Your Email';
      urgencyMessage = `
        <div style="background-color: #e8f5e9; border-left: 4px solid #4caf50; padding: 12px 20px; margin: 20px 0; border-radius: 4px;">
          <p style="color: #2e7d32; margin: 0; font-weight: 500;">
            This is your first reminder! Verify now to unlock all features of your Salmart account.
          </p>
        </div>
      `;
    } else if (reminderCount >= 3) {
      subject = '⚠️ Final Reminder: Verify Your Email to Maintain Account Access';
      urgencyMessage = `
        <div style="background-color: #ffebee; border-left: 4px solid #f44336; padding: 12px 20px; margin: 20px 0; border-radius: 4px;">
          <p style="color: #c62828; font-weight: 600; margin: 0;">
            ⏰ This is your final reminder (#${reminderCount}). Verify now to prevent account restrictions.
          </p>
        </div>
      `;
    } else {
      subject = '📧 Reminder: Complete Your Salmart Registration';
      urgencyMessage = `
        <div style="background-color: #e3f2fd; border-left: 4px solid #2196f3; padding: 12px 20px; margin: 20px 0; border-radius: 4px;">
          <p style="color: #1565c0; margin: 0; font-weight: 500;">
            This is reminder #${reminderCount}. Just one quick step to complete your registration!
          </p>
        </div>
      `;
    }

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${subject}</title>
    <style>
        body { font-family: 'Inter', Arial, sans-serif; line-height: 1.6; color: #333333; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 0 auto; background: #ffffff; }
        .header { background: linear-gradient(135deg, #28a745, #20c997); padding: 30px; text-align: center; }
        .content { padding: 30px; }
        .button { background: linear-gradient(135deg, #28a745, #20c997); color: white; text-decoration: none; 
                 padding: 12px 24px; border-radius: 4px; font-weight: 600; display: inline-block; }
        .footer { padding: 20px; text-align: center; font-size: 12px; color: #777777; }
        .logo { color: white; font-size: 24px; font-weight: bold; }
        .tagline { color: rgba(255,255,255,0.9); font-size: 14px; }
        .verify-icon { font-size: 48px; margin-bottom: 20px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">Salmart</div>
            <div class="tagline">Your Online Social Marketplace</div>
        </div>
        
        <div class="content">
            <div style="text-align: center; margin-bottom: 25px;">
                <div class="verify-icon">✉️</div>
                <h2 style="margin-top: 0; color: #2c3e50;">Hey ${user.firstName || 'there'}, just one more step!</h2>
            </div>
            
            ${urgencyMessage}
            
            <p style="margin-bottom: 25px;">To complete your registration and access all Salmart features, please verify your email address by clicking the button below:</p>
            
            <div style="text-align: center; margin: 30px 0;">
                <a href="${verifyUrl}" class="button">Verify My Email Address</a>
            </div>
            
            <p style="font-size: 14px; color: #666666;">If you're having trouble with the button above, copy and paste this link into your browser:</p>
            <p style="font-size: 14px; word-break: break-all;"><a href="${verifyUrl}" style="color: #28a745;">${verifyUrl}</a></p>
            
            <p style="margin-top: 30px; font-size: 14px; color: #666666;">
                If you didn't create an account with Salmart, you can safely ignore this email.
            </p>
        </div>
        
        <div class="footer">
            <p>© ${new Date().getFullYear()} Salmart Technologies. All rights reserved.</p>
            <p>Sentona Street, Karu, Nasarawa State, Nigeria</p>
        </div>
    </div>
</body>
</html>
    `;

    await transporter.sendMail({
      from: `"Salmart Team" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject,
      html: emailHtml,
      priority: 'high', // Explicit high priority
      headers: {
        'X-Priority': '1',
        'X-MSMail-Priority': 'High',
        'Importance': 'High'
      }
    });

    user.verificationReminderCount = reminderCount;
    user.lastVerificationReminderSent = new Date();
    await user.save();

    console.log(`✅ Reminder sent to ${user.email} (reminder #${reminderCount})`);
    mongoose.connection.close();
    process.exit(0);

  } catch (err) {
    console.error(`❌ Failed to send reminder: ${err.message}`);
    mongoose.connection.close();
    process.exit(1);
  }
}