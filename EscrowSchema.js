const mongoose = require('mongoose');

const escrowSchema = new mongoose.Schema({
  buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', required: true },
  amount: { type: Number, required: true }, // Full amount paid by buyer
  commission: { type: Number, default: 0 }, // Platform's cut
  sellerShare: { type: Number, default: 0 }, // What seller will get
  status: { 
    type: String, 
    enum: ['Pending', 'In Escrow', 'Delivered', 'Released', 'Refunded'], 
    default: 'Pending' 
  },
  paymentReference: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('Escrow', escrowSchema);