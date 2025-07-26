// server.js
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const mongoose = require("mongoose");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://ilhankimsop:5OK1Z4HT9pzUspev@cluster0.2p8ogod.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

// --- MODELES MONGODB ---
const UserSchema = new mongoose.Schema({
  pseudo: String,
  role: { type: String, default: "user" }, // 'admin' ou 'user'
});
const MessageSchema = new mongoose.Schema({
  salon: String,
  pseudo: String,
  text: String,
  createdAt: { type: Date, default: Date.now },
});
const SalonSchema = new mongoose.Schema({
  name: String,
});

const User = mongoose.model("User", UserSchema);
const Message = mongoose.model("Message", MessageSchema);
const Salon = mongoose.model("Salon", SalonSchema);

// --- Connexion MongoDB ---
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => console.log("MongoDB connecté"))
  .catch(err => console.error("Erreur MongoDB:", err));

// --- Middleware static ---
app.use(express.static("public"));

// --- Routes ---
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/public/index.html");
});

// --- Socket.io ---
io.on("connection", (socket) => {
  console.log("Un utilisateur connecté");

  // Stockage du pseudo et salon dans le socket
  socket.on("join", async ({ pseudo, salon }) => {
    if (!pseudo || !salon) return;

    socket.pseudo = pseudo;
    socket.salon = salon;

    // Création ou récupération du salon
    let salonObj = await Salon.findOne({ name: salon });
    if (!salonObj) {
      salonObj = new Salon({ name: salon });
      await salonObj.save();
    }

    // Si premier utilisateur, rendre admin (simplifié)
    const usersCount = await User.countDocuments();
    let role = "user";
    if (usersCount === 0) role = "admin";

    // Sauvegarder user (si nouveau)
    let user = await User.findOne({ pseudo });
    if (!user) {
      user = new User({ pseudo, role });
      await user.save();
    }

    socket.role = user.role;

    socket.join(salon);
    // Envoyer l’historique messages du salon
    const messages = await Message.find({ salon }).sort({ createdAt: 1 }).limit(100);
    socket.emit("history", messages);

    io.to(salon).emit("user joined", { pseudo, role: socket.role });
  });

  // Réception message
  socket.on("chat message", async (text) => {
    if (!socket.pseudo || !socket.salon) return;

    const message = new Message({
      salon: socket.salon,
      pseudo: socket.pseudo,
      text,
    });
    await message.save();

    io.to(socket.salon).emit("chat message", {
      pseudo: socket.pseudo,
      text,
      id: message._id,
      createdAt: message.createdAt,
    });
  });

  // Suppression message par admin
  socket.on("delete message", async (msgId) => {
    if (socket.role !== "admin") return;

    await Message.deleteOne({ _id: msgId });
    io.to(socket.salon).emit("delete message", msgId);
  });

  // Déconnexion
  socket.on("disconnect", () => {
    console.log(`${socket.pseudo} déconnecté`);
  });
});

server.listen(PORT, () => {
  console.log(`Serveur lancé sur http://localhost:${PORT}`);
});
