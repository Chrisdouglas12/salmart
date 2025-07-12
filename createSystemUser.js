// createPlatformRecipient.js

const axios = require('axios');
require('dotenv').config();

const recipientPayload = {
  type: 'nuban',
  name: 'Salmart Technologies',
  account_number: '9011195990',  // Replace with your actual account number
  bank_code: '50515',         // Replace with correct bank code (e.g., '058' for GTBank)
  currency: 'NGN'
};

async function createRecipient() {
  try {
    const response = await axios.post(
      'https://api.paystack.co/transferrecipient',
      recipientPayload,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`
        }
      }
    );

    console.log('[PLATFORM RECIPIENT CREATED]', response.data);
    console.log('Recipient Code:', response.data.data.recipient_code);
  } catch (error) {
    console.error('Failed to create platform recipient:', error.response?.data || error.message);
  }
}

createRecipient();