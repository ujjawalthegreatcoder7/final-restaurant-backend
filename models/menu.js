const mongoose = require("mongoose");

const menuSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },

  description: {
    type: String,
    required: true,
  },

  price: {
    type: Number,
    required: true,
  },

category: {
  type: String,
  enum: [
    "Pizza",
    "Burger",
    "Pasta",
    "Starters",
    "Beverages",
    "Main Course",
    "Salads",
    "Desserts"
  ],
  required: true,
},
  image: {
    type: String,
    required: true,
  },

  isVeg: {
    type: Boolean,
    default: true,
  },

  spicyLevel: {
    type: String,
    enum: ["Mild", "Medium", "Spicy"],
    default: "Medium",
  },

  preparationTime: {
    type: Number, // in minutes
    default: 15,
  },

  available: {
    type: Boolean,
    default: true,
  },

  rating: {
    type: Number,
    default: 4.5,
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Menu", menuSchema);