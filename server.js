const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const twilio = require("twilio");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
require("dotenv").config();
const Menu = require("./models/menu");
let liveOrders = [];

const app = express();

const Counter = require("./models/counter");

const ADMIN_PASSWORD = "yummy7";

const adminAuth = (req, res, next) => {

  const password = req.headers["x-admin-password"];

  if (!password || password !== ADMIN_PASSWORD) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized Access",
    });
  }

  next();
};
/* =========================
   BILL NUMBER GENERATOR (SAFE + PRODUCTION)
========================= */
const getNextBillNumber = async () => {
  const counter = await Counter.findOneAndUpdate(
    { name: "bill" },
    { $inc: { value: 1 } },
    { new: true, upsert: true }
  );
//   await Counter.findOneAndUpdate(
//   { name: "bill" },
//   { $set: { value: 0 } }
// );

  return `BILL-${String(counter.value).padStart(5, "0")}`;
};

const dns = require("dns");
/* FORCE IPV4 */
dns.setDefaultResultOrder("ipv4first");
dns.setServers(["1.1.1.1", "8.8.8.8"]);
app.use("/bills", express.static(path.join(__dirname, "bills")));
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

/* =========================
   RAZORPAY CONFIG
========================= */
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

/* OTP STORAGE */
const otpStore = new Map();

/* =========================
   PDF BILL GENERATOR
========================= */

const generatePDFBill = (order) => {
  return new Promise((resolve, reject) => {
    try {
      const billsDir = path.join(__dirname, "bills");

      if (!fs.existsSync(billsDir)) {
        fs.mkdirSync(billsDir);
      }

      const fileName = `bill_${Date.now()}.pdf`;
      const filePath = path.join(billsDir, fileName);

      // Thermal Receipt Size
      const doc = new PDFDocument({
        size: [226, 800],
        margin: 10,
      });

      const stream = fs.createWriteStream(filePath);

      doc.pipe(stream);

      // =========================
      // HEADER
      // =========================

      doc
        .fontSize(18)
        .text("Karigar Labs", {
          align: "center",
        });

      doc
        .fontSize(11)
        .text("Thanks For Purchasing", {
          align: "center",
        });

      doc.moveDown(0.5);

      doc
        .fontSize(8)
        .text("Retail Invoice", {
          align: "center",
        });

      doc.moveDown();

      // =========================
      // CUSTOMER INFO
      // =========================

      doc.fontSize(9);

      doc.text(`Customer : ${order.customerName}`);
      doc.text(`Bill No  : ${order.billNumber}`);
      doc.text(`Table    : ${order.tableNumber}`);
      doc.text(
        `Date     : ${new Date().toLocaleString()}`
      );

      doc.moveDown(0.5);

      doc.text("--------------------------------");

      // =========================
      // TABLE HEADER
      // =========================

      doc.text("Item             Qty    Amt");
      doc.text("--------------------------------");

      let totalQty = 0;

      order.cartItems.forEach((item) => {
        totalQty += item.quantity;

        const amount =
          item.price * item.quantity;

        const itemName =
          item.name.length > 15
            ? item.name.substring(0, 15)
            : item.name;

        doc.text(
          `${itemName.padEnd(15)} ${String(
            item.quantity
          ).padEnd(4)} ₹${amount}`
        );
      });

      doc.text("--------------------------------");

      // =========================
      // GST CALCULATION
      // =========================

      const subtotal =
        order.totalPrice / 1.05;

      const cgst = subtotal * 0.025;
      const sgst = subtotal * 0.025;

      doc.moveDown(0.5);

      doc.text(
        `Items : ${order.cartItems.length}`
      );

      doc.text(
        `Qty   : ${totalQty}`
      );

      doc.moveDown(0.5);

      doc.text(
        `Subtotal      ₹${subtotal.toFixed(2)}`
      );

      doc.text(
        `CGST (2.5%)   ₹${cgst.toFixed(2)}`
      );

      doc.text(
        `SGST (2.5%)   ₹${sgst.toFixed(2)}`
      );

      doc.text("--------------------------------");

      doc
        .fontSize(12)
        .text(
          `NET TOTAL : ₹${Number(
            order.totalPrice
          ).toFixed(2)}`
        );

      doc.text("--------------------------------");

      // =========================
      // ADDITIONAL INFO
      // =========================

      if (order.AdditionalInformation) {
        doc.moveDown();

        doc
          .fontSize(9)
          .text(
            `Note: ${order.AdditionalInformation}`
          );
      }

      // =========================
      // TOKEN
      // =========================

      const tokenNo =
        Math.floor(
          1000 + Math.random() * 9000
        );

      doc.moveDown();

      doc
        .fontSize(12)
        .text(
          `Token No. T${tokenNo}`,
          {
            align: "center",
          }
        );

      // =========================
      // FOOTER
      // =========================

      doc.moveDown();

      doc
        .fontSize(10)
        .text(
          "Thank You For Visiting",
          {
            align: "center",
          }
        );

      doc.text(
        "Visit Again!",
        {
          align: "center",
        }
      );

      doc.end();

      stream.on("finish", () =>
        resolve(fileName)
      );

      stream.on("error", reject);

    } catch (error) {
      reject(error);
    }
  });
};

/* =========================
   BILL SMS
========================= */
const sendBillSMS = async (phone, order) => {
  try {
    if (client) {
      const billMessage = `
Thank you ${order.customerName}!

Order Confirmed
Table: ${order.tableNumber}
Total Bill: ₹${order.totalPrice}

Enjoy your meal!
`;

      await client.messages.create({
        body: billMessage,
        from: TWILIO_NUMBER,
        to: phone,
      });

      console.log("Bill SMS sent successfully");
    }
  } catch (error) {
    console.log("Bill SMS failed:", error.message);
  }
};

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

app.get("/menu/:id", async (req, res) => {
  try {
    const product = await Menu.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        message: "Product not found",
      });
    }

    res.json(product);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Server Error",
    });
  }
});


app.get("/admin/menu", async (req, res) => {

  try {

    const menuItems = await Menu.find();

    res.json(menuItems);

  } catch (error) {

    res.status(500).json({
      success: false,
      message: "Server Error",
    });

  }

});

/* =========================
   TOGGLE FOOD AVAILABILITY
========================= */

app.put("/admin/toggle-food/:id", async (req, res) => {

  try {

    const { id } = req.params;

    const food = await Menu.findById(id);

    if (!food) {
      return res.status(404).json({
        success: false,
        message: "Food item not found",
      });
    }

    food.available = !food.available;

    await food.save();

    res.json({
      success: true,
      message: `Food ${
        food.available ? "Available" : "Not Available"
      } Successfully`,
      food,
    });

  } catch (error) {

    console.log(error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });

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
   CREATE RAZORPAY ORDER
========================= */
app.post("/create-razorpay-order", async (req, res) => {
  try {
    const { amount } = req.body;

    if (!amount) {
      return res.status(400).json({
        success: false,
        message: "Amount is required",
      });
    }

    const options = {
      amount: Number(amount) * 100,
      currency: "INR",
      receipt: `receipt_${Date.now()}`,
    };

    const order = await razorpay.orders.create(options);

    res.json({
      success: true,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      key: process.env.RAZORPAY_KEY_ID,
    });

  } catch (error) {
    console.log("RAZORPAY ORDER ERROR:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});
/* =========================
   VERIFY RAZORPAY PAYMENT
========================= */
app.post("/verify-razorpay-payment", (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = req.body;

    const body = razorpay_order_id + "|" + razorpay_payment_id;

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest("hex");

    if (expectedSignature === razorpay_signature) {
      res.json({
        success: true,
        message: "Payment verified successfully",
      });
    } else {
      res.status(400).json({
        success: false,
        message: "Invalid payment signature",
      });
    }

  } catch (error) {
    console.log("PAYMENT VERIFY ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Payment verification failed",
    });
  }
});


// GOOGLE
app.post("/saveuser", (req, res) => {

  try {

    // OPTIONAL API
    // USER SAVE SUCCESS RESPONSE

    res.json({
      success: true,
      message: "User saved successfully",
    });

  } catch (error) {

    console.log("SAVE USER ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Failed to save user",
    });

  }

});


app.post("/place-order", async (req, res) => {
  try {
    const {
      // tableNumber,
      cartItems,
      AdditionalInformation,
      totalPrice,
      paymentMethod,
      customerUID,
      customerName,
      customerEmail,
      customerPhoto,
    } = req.body;



    if ( !cartItems || cartItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Missing required data",
      });
    }

    /* =========================
       ✅ BILL NUMBER FROM MONGO
    ========================= */
    const billNumber = await getNextBillNumber();

    const orderDetails = cartItems
      .map(
        (item, index) =>
          `${index + 1}. ${item.name}
Quantity: ${item.quantity}
Price Per Item: ₹${item.price}
Total Item Cost: ₹${item.price * item.quantity}`
      )
      .join("\n\n");

    liveOrders.push({
      billNumber,
      customerName,
      customerEmail,
      // customerUID,
      // tableNumber,
      paymentMethod,
      AdditionalInformation,
      cartItems,
      totalPrice,
      time: new Date().toLocaleString(),
    });

    console.log(`
======================================================
                NEW ORDER RECEIVED
======================================================

BILL NO: ${billNumber}

CUSTOMER DETAILS
------------------------------------------------------
Name   : ${customerName || "N/A"}
Email  : ${customerEmail || "N/A"}
UID    : ${customerUID || "N/A"}

------------------------------------------------------

Payment Method: ${paymentMethod}

Additional Info:
${AdditionalInformation || "None"}

------------------ CART ITEMS ------------------------

${orderDetails}

------------------------------------------------------

TOTAL BILL: ₹${totalPrice}

Order Time: ${new Date().toLocaleString()}

======================================================
    `);

    const pdfFileName = await generatePDFBill({
      customerName,
      customerEmail,
      // tableNumber,
      cartItems,
      AdditionalInformation,
      totalPrice,
      billNumber, // ✅ IMPORTANT
    });

    const pdfUrl = `${req.protocol}://${req.get("host")}/bills/${pdfFileName}`;

    return res.json({
      success: true,
      message: "Order placed successfully",

      billNumber, // ✅ FRONTEND + PDF + LOG SAME

      billUrl: pdfUrl,
      orderedItems: cartItems,
      paymentMethod,

      customer: {
        name: customerName,
        email: customerEmail,
        photo: customerPhoto,
        uid: customerUID,
      },
    });

  } catch (error) {
    console.log("ORDER ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Order failed",
      error: error.message,
    });
  }
});


// https://final-restaurant-backend-1.onrender.com/yummyrestaurant/backend
app.get("/yummyrestaurant/backend", adminAuth, (req, res) => {
  res.json({
    success: true,
    totalOrders: liveOrders.length,
    orders: [...liveOrders].reverse(), // ✅ SAFE COPY
  });
});


/* =========================
   SERVER
========================= */
app.listen(5000, () => {
  console.log("Server running on port 5000");
});
