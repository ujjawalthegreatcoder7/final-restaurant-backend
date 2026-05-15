// Backend/seedMenu.js

const mongoose = require("mongoose");
const Menu = require("./models/Menu");
const menuData = require("./data/menuData");

const dns = require("dns");
dns.setServers([
  '1.1.1.1',
  '8.8.8.1',
])

// MongoDB Connection
mongoose.connect("mongodb+srv://ujjawalarora777:radhakrishna108@cluster0.cuqbx.mongodb.net/?appName=Cluster0")
    .then(() => {
        console.log("MongoDB Connected Successfully");
    })
    .catch((err) => {
        console.log("MongoDB Connection Error:", err);
    });

// Insert Dummy Menu Data
const seedMenu = async () => {
    try {
        // Clear existing menu
        await Menu.deleteMany();

        // Insert new menu data
        await Menu.insertMany(menuData);

        console.log("Dummy Menu Data Inserted Successfully");
        mongoose.connection.close();
    } catch (error) {
        console.log("Error inserting menu data:", error);
    }
};

seedMenu();