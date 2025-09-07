// sendPartnershipEmails.js
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
require('dotenv').config();

// List of companies you want to contact
const companies = [
  { name: "Shoprite Nigeria", email: "support@shoprite.com.ng" },
 { name: "SLOT Systems", email: "support@slot.ng" },
 { name: "Jara Nigeria", email: "commercial@jaranigeria.com" },
 { name: "Sunriel Limited", email: "info@sunrialimited.com" },
  { name: "Vervecity Electric", email: "vervecityelectric@gmail.com" },
  { name: "Triton Engineering Limited", email: "customerservice@triton-engineering.com" },
 { name: "Wurvicat International Limited", email: "atinuke.owolabi@wurvicat.com" }
];

// Transporter setup (Zoho)
const transporter = nodemailer.createTransport({
  service: 'Zoho',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

async function sendPartnershipEmails() {
  for (const company of companies) {
    try {
      await sendSingleEmail(company);
      console.log(`✅ Sent partnership email to ${company.name} (${company.email})`);
    } catch (err) {
      console.error(`❌ Failed to send to ${company.name}: ${err.message}`);
    }

    // Delay to avoid spam flags
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
}

async function sendSingleEmail(company) {
  const subject = `🤝 Partnership Opportunity: ${company.name} x Salmart Technologies`;
  const messageId = `<${crypto.randomBytes(16).toString('hex')}@salmartonline.com.ng>`;

  const emailHtml = `
  <div style="font-family: Arial, sans-serif; max-width:650px; margin:auto; color:#333;">
    <h2 style="color:#28a745;">Hello ${company.name} Team,</h2>
    
    <p>My name is <strong>Christian Friday Douglas</strong>, Founder of <strong>Salmart Technologies</strong> – a Nigerian <em>social e-commerce platform</em> built to make online buying and selling safer and easier.</p>

    <p>We would love to explore a <strong>partnership with ${company.name}</strong> by showcasing your products on Salmart. Here’s why this can benefit you:</p>

    <ul>
      <li>🔒 <strong>Secure Escrow System</strong> – both buyers and sellers are protected from fraud.</li>
      <li>📢 <strong>Increased Reach</strong> – connect with new Nigerian buyers daily.</li>
      <li>⚡ <strong>Real-time Engagement</strong> – buyers and sellers chat directly within the app.</li>
      <li>📈 <strong>Boosted Sales</strong> – our platform actively drives user engagement and product discovery.</li>
    </ul>

    <p>We believe ${company.name} can gain a new digital sales channel by leveraging Salmart’s growing marketplace. 
    We’d be delighted to discuss how your team can onboard seamlessly.</p>

    <a href="https://salmartonline.com.ng" 
      style="background:#28a745;color:#fff;padding:12px 20px;text-decoration:none;border-radius:5px;display:inline-block;">
      🌍 Visit Salmart Online
    </a>
    


    <p style="margin-top:25px;">I’ll be happy to schedule a quick chat or share more details about how we can collaborate.</p>

    <p style="margin-top:25px;font-size:14px;">
      Best Regards,<br/>
      <strong>Christian Friday Douglas</strong><br/>
      Founder & CEO, Salmart Technologies<br/>
      📧 support@salmartonline.com.ng
    </p>
  </div>`;

  return transporter.sendMail({
    from: `"Salmart Partnerships" <${process.env.EMAIL_USER}>`,
    to: company.email,
    subject,
    html: emailHtml,
    headers: { "Message-ID": messageId, "Reply-To": "support@salmartonline.com.ng" }
  });
}

// Run the campaign
sendPartnershipEmails();