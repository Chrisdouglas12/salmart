require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/userSchema.js'); // Adjust path if needed

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    const result = await User.updateOne(
      { email: 'salmarttechnologies@gmail.com' },
      { $set: { isSystemUser: true } }
    );

    console.log('Update result:', result);
    process.exit(0);
  } catch (err) {
    console.error('Error updating system user:', err.message);
    process.exit(1);
  }
})();