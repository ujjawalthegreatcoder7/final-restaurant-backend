const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema({
  tableNumber: {
    type: Number,
    required: true,
  },

  customerName: {
    type: String,
    default: "",
  },

  customerPhone: {
    type: String,
    default: "",
  },

  items: [
    {
      menuItemId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Menu",
        required: true,
      },

      name: {
        type: String,
        required: true,
      },

      quantity: {
        type: Number,
        required: true,
        default: 1,
      },

      price: {
        type: Number,
        required: true,
      },
    },
  ],

  totalAmount: {
    type: Number,
    required: true,
  },

  specialInstructions: {
    type: String,
    default: "",
  },

  paymentMethod: {
    type: String,
    enum: ["Cash", "UPI", "Card"],
    default: "Cash",
  },

  paymentStatus: {
    type: String,
    enum: ["Pending", "Paid"],
    default: "Pending",
  },

  orderStatus: {
    type: String,
    enum: ["Pending", "Preparing", "Served", "Completed"],
    default: "Pending",
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Order", orderSchema);