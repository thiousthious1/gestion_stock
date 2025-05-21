// ✅ FICHIER : controllers/userController.js
const db = require('../models/db');
const multer = require('multer');
const path = require('path');
const bcrypt = require('bcrypt');
const SALT_ROUNDS = 10;


// Configuration du stockage Multer pour les avatars
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'public/uploads/users');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage });
exports.uploadAvatar = upload.single('avatar');

// ✅ Liste des utilisateurs
exports.listUsers = async (req, res) => {
  try {
    const [users] = await db.query('SELECT users.*, roles.display_name AS role_display FROM users LEFT JOIN roles ON users.role = roles.id ORDER BY users.id DESC');
    const [roles] = await db.query('SELECT * FROM roles');
    const [warehouses] = await db.query('SELECT * FROM warehouses');

    res.render('users/index', { users, roles, warehouses, successMessage: req.flash('success') });
  } catch (err) {
    console.error('Erreur chargement utilisateurs :', err);
    res.sendStatus(500);
  }
};

// ✅ Créer un utilisateur
exports.createUser = async (req, res) => {
  try {
    const { username, email, password, phone, role, address, warehouse_id, status } = req.body;
    const avatar = req.file ? req.file.filename : null;

    if (!password || password.trim().length < 4) {
      req.flash('errorMessage', 'Le mot de passe est requis et doit contenir au moins 4 caractères.');
      return res.redirect('/users/add');
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    await db.query(`
      INSERT INTO users (username, email, password, phone, role, address, avatar, warehouse_id, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [username, email, hashedPassword, phone, role, address, avatar, warehouse_id, status]);

    req.flash('success', 'Utilisateur ajouté avec succès');
    res.redirect('/users');
  } catch (err) {
    console.error('Erreur ajout utilisateur :', err);
    res.sendStatus(500);
  }
};


// ✅ Formulaire ajout utilisateur
exports.showAddForm = async (req, res) => {
  try {
    const [roles] = await db.query('SELECT * FROM roles');
    const [warehouses] = await db.query('SELECT * FROM warehouses');
    res.render('users/add', { roles, warehouses });
  } catch (err) {
    console.error('Erreur chargement formulaire ajout utilisateur :', err);
    res.sendStatus(500);
  }
};

// ✅ Formulaire édition utilisateur (alias requis dans routes)
exports.showEditForm = async (req, res) => {
  try {
    const userId = req.params.id;
    const [[user]] = await db.query('SELECT * FROM users WHERE id = ?', [userId]);
    const [roles] = await db.query('SELECT * FROM roles');
    const [warehouses] = await db.query('SELECT * FROM warehouses');

    // Ajout des permissions depuis la session
    const sessionUser = req.session.user || {};
    user.permissions = sessionUser.permissions || [];

    res.render('users/edit', {
      user,
      roles,
      warehouses,
      page: 'users',
      pageGroup: 'settings'
    });
  } catch (err) {
    console.error('Erreur chargement formulaire modification utilisateur :', err);
    res.sendStatus(500);
  }
};



// ✅ Mise à jour utilisateur
exports.updateUser = async (req, res) => {
  try {
    const userId = req.params.id;
    const { username, email, password, phone, role, address, warehouse_id, status } = req.body;
    const avatar = req.file ? req.file.filename : null;

    const fields = [];
    const values = [];

    fields.push('username = ?', 'email = ?', 'phone = ?', 'role = ?', 'address = ?', 'warehouse_id = ?', 'status = ?');
    values.push(username, email, phone, role, address, warehouse_id, status);

    if (avatar) {
      fields.push('avatar = ?');
      values.push(avatar);
    }

    if (password && password.trim() !== '') {
      const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
      fields.push('password = ?');
      values.push(hashedPassword);
    }

    const sql = `UPDATE users SET ${fields.join(', ')} WHERE id = ?`;
    values.push(userId);

    await db.query(sql, values);

    req.flash('success', 'Utilisateur mis à jour avec succès');
    res.redirect('/users');
  } catch (err) {
    console.error('Erreur mise à jour utilisateur :', err);
    res.sendStatus(500);
  }
};


// ✅ Supprimer utilisateur
exports.deleteUser = async (req, res) => {
  try {
    const userId = req.params.id;
    await db.query('DELETE FROM users WHERE id = ?', [userId]);
    req.flash('success', 'Utilisateur supprimé avec succès');
    res.redirect('/users');
  } catch (err) {
    console.error('Erreur suppression utilisateur :', err);
    res.sendStatus(500);
  }
};
