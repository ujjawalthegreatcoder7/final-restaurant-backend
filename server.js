const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const twilio = require("twilio");
require("dotenv").config();

const Menu = require("./models/menu");

const app = express();
const dns = require("dns");

/* FORCE IPV4 */
dns.setDefaultResultOrder("ipv4first");

dns.setServers([
  "1.1.1.1",
  "8.8.8.8",
]);

app.use(cors());
app.use(express.json());

/* =========================
   TWILIO CONFIG
========================= */
let client;
try {
  client = twilio(
    process.env.TWILIO_SID,
    process.env.TWILIO_AUTH_TOKEN
  );
} catch (err) {
  console.log("Twilio init failed:", err.message);
}

const TWILIO_NUMBER = process.env.TWILIO_NUMBER;

/* OTP STORAGE */
const otpStore = new Map();

/* =========================
   MONGODB
========================= */
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch((err) => console.log(err));

/* =========================
   MENU API
========================= */
app.get("/menu", async (req, res) => {
  try {
    const menuItems = await Menu.find();
    res.json(menuItems);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/* =========================
   SEND OTP
========================= */
app.post("/send-otp", async (req, res) => {
  try {
    let { phone } = req.body;

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: "Phone required",
      });
    }

    if (!phone.startsWith("+")) {
      phone = "+91" + phone;
    }

    const otp = Math.floor(100000 + Math.random() * 900000);
    const expiresAt = Date.now() + 5 * 60 * 1000;

    otpStore.set(phone, { otp, expiresAt });

    if (client) {
      await client.messages.create({
        body: `Your OTP is: ${otp}`,
        from: TWILIO_NUMBER,
        to: phone,
      });
    } else {
      console.log("Twilio not configured, OTP:", otp);
    }

    res.json({
      success: true,
      message: "OTP sent successfully",
    });

  } catch (error) {
    console.log("OTP ERROR:", error);

    /* FALLBACK SUCCESS */
    res.json({
      success: true,
      message: "OTP generated (Twilio limit reached)",
    });
  }
});

/* =========================
   VERIFY OTP
========================= */
app.post("/verify-otp", (req, res) => {
  try {
    let { phone, otp } = req.body;

    if (!phone || !otp) {
      return res.status(400).json({
        success: false,
        message: "Phone and OTP required",
      });
    }

    if (!phone.startsWith("+")) {
      phone = "+91" + phone;
    }

    const record = otpStore.get(phone);

    if (!record) {
      return res.status(400).json({
        success: false,
        message: "OTP not found",
      });
    }

    if (Date.now() > record.expiresAt) {
      otpStore.delete(phone);
      return res.status(400).json({
        success: false,
        message: "OTP expired",
      });
    }

    if (Number(otp) !== record.otp) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP",
      });
    }

    otpStore.delete(phone);

    res.json({
      success: true,
      message: "Phone verified successfully",
    });

  } catch (error) {
    console.log(error);
    res.status(500).json({
      success: false,
      message: "OTP verification failed",
    });
  }
});

/* =========================
   PLACE ORDER
========================= */
app.post("/place-order", async (req, res) => {
  try {
    const {
      customerName,
      phone,
      tableNumber,
      cartItems,
      AdditionalInformation,
      totalPrice
    } = req.body;

    if (!phone || !cartItems || cartItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Missing data",
      });
    }

    let formattedPhone = phone;

    if (!formattedPhone.startsWith("+")) {
      formattedPhone = "+91" + formattedPhone;
    }

    // OTP verification disabled temporarily
    // if (otpStore.has(formattedPhone)) {
    //   return res.status(400).json({
    //     success: false,
    //     message: "Please verify OTP firstserver",
    //   });
    // }

    const orderDetails = cartItems
      .map(
        (item) =>
          `${item.name} | Qty: ${item.quantity} | ₹${item.price}`
      )
      .join("\n");

    /* ORDER LOG */
    console.log(`
=========================

NEW ORDER RECEIVED
Customer: ${customerName}
Phone: ${phone}
Table: ${tableNumber}

Additional Information : ${AdditionalInformation}

Items:
${orderDetails}

Total: ₹${totalPrice}

=========================
`);

    /* SUCCESS WITHOUT EMAIL */
    res.json({
      success: true,
      message: "Order placed successfully",
    });

  } catch (error) {
    console.log("ORDER ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Order failed",
    });
  }
});

/* =========================
   SERVER
========================= */
app.listen(5000, () => {
  console.log("Server running on port 5000");
});


// const express = require("express");
// const mongoose = require("mongoose");
// const cors = require("cors");
// const axios = require("axios");
// require("dotenv").config();

// const Menu = require("./models/menu");

// const app = express();
// const dns = require("dns");

// /* FORCE IPV4 */
// dns.setDefaultResultOrder("ipv4first");

// dns.setServers([
//   "1.1.1.1",
//   "8.8.8.8",
// ]);

// app.use(cors());
// app.use(express.json());

// /* =========================
//    MSG91 CONFIG
// ========================= */
// const MSG91_AUTH_KEY = process.env.MSG91_AUTH_KEY;
// const MSG91_TEMPLATE_ID = process.env.MSG91_TEMPLATE_ID;

// /* OTP STORAGE */
// const otpStore = new Map();

// /* =========================
//    MONGODB
// ========================= */
// mongoose.connect(process.env.MONGO_URI)
//   .then(() => console.log("MongoDB Connected"))
//   .catch((err) => console.log(err));

// /* =========================
//    MENU API
// ========================= */
// app.get("/menu", async (req, res) => {
//   try {
//     const menuItems = await Menu.find();
//     res.json(menuItems);
//   } catch (error) {
//     res.status(500).json({ message: error.message });
//   }
// });

// /* =========================
//    SEND OTP
// ========================= */
// app.post("/send-otp", async (req, res) => {
//   try {
//     let { phone } = req.body;

//     if (!phone) {
//       return res.status(400).json({
//         success: false,
//         message: "Phone required",
//       });
//     }

//     // Normalize phone
//     if (phone.startsWith("+91")) {
//       phone = phone.replace("+91", "");
//     }

//     const fullPhone = "+91" + phone;

//     const otp = Math.floor(100000 + Math.random() * 900000);
//     const expiresAt = Date.now() + 5 * 60 * 1000;

//     otpStore.set(fullPhone, { otp, expiresAt });

//     /* SEND OTP USING MSG91 */
// await axios.get("https://control.msg91.com/api/v5/otp", {
//   params: {
//     template_id: MSG91_TEMPLATE_ID,
//     mobile: `91${phone}`,
//     authkey: MSG91_AUTH_KEY,
//     otp: otp
//   }
// });
//     res.json({
//       success: true,
//       message: "OTP sent successfully",
//     });

//   } catch (error) {
//     console.log("OTP ERROR:", error.response?.data || error.message);

//     res.status(500).json({
//       success: false,
//       message: "Failed to send OTP",
//     });
//   }
// });

// /* =========================
//    VERIFY OTP
// ========================= */
// app.post("/verify-otp", (req, res) => {
//   try {
//     let { phone, otp } = req.body;

//     if (!phone || !otp) {
//       return res.status(400).json({
//         success: false,
//         message: "Phone and OTP required",
//       });
//     }

//     if (!phone.startsWith("+")) {
//       phone = "+91" + phone;
//     }

//     const record = otpStore.get(phone);

//     if (!record) {
//       return res.status(400).json({
//         success: false,
//         message: "OTP not found",
//       });
//     }

//     if (Date.now() > record.expiresAt) {
//       otpStore.delete(phone);
//       return res.status(400).json({
//         success: false,
//         message: "OTP expired",
//       });
//     }

//     if (Number(otp) !== record.otp) {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid OTP",
//       });
//     }

//     otpStore.delete(phone);

//     res.json({
//       success: true,
//       message: "Phone verified successfully",
//     });

//   } catch (error) {
//     console.log(error);
//     res.status(500).json({
//       success: false,
//       message: "OTP verification failed",
//     });
//   }
// });

// /* =========================
//    PLACE ORDER
// ========================= */
// app.post("/place-order", async (req, res) => {
//   try {
//     const {
//       customerName,
//       phone,
//       tableNumber,
//       cartItems,
//       AdditionalInformation,
//       totalPrice
//     } = req.body;

//     if (!phone || !cartItems || cartItems.length === 0) {
//       return res.status(400).json({
//         success: false,
//         message: "Missing data",
//       });
//     }

//     let formattedPhone = phone;

//     if (!formattedPhone.startsWith("+")) {
//       formattedPhone = "+91" + formattedPhone;
//     }

//     // OTP verification disabled temporarily
//     // if (otpStore.has(formattedPhone)) {
//     //   return res.status(400).json({
//     //     success: false,
//     //     message: "Please verify OTP firstserver",
//     //   });
//     // }

//     const orderDetails = cartItems
//       .map(
//         (item) =>
//           `${item.name} | Qty: ${item.quantity} | ₹${item.price}`
//       )
//       .join("\n");

//     /* ORDER LOG */
//     console.log(`
// =========================

// NEW ORDER RECEIVED
// Customer: ${customerName}
// Phone: ${phone}
// Table: ${tableNumber}

// Additional Information : ${AdditionalInformation}

// Items:
// ${orderDetails}

// Total: ₹${totalPrice}

// =========================
// `);

//     /* SUCCESS WITHOUT EMAIL */
//     res.json({
//       success: true,
//       message: "Order placed successfully",
//     });

//   } catch (error) {
//     console.log("ORDER ERROR:", error);
//     res.status(500).json({
//       success: false,
//       message: "Order failed",
//     });
//   }
// });

// /* =========================
//    SERVER
// ========================= */
// app.listen(5000, () => {
//   console.log("Server running on port 5000");
// });