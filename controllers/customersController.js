const db = require('../models/db');
const path = require('path');
const fs = require('fs');
const xlsx = require('xlsx');

// Liste des clients
exports.getAllCustomers = async (req, res) => {
    try {
        const [customers] = await db.query('SELECT * FROM customers');

        const successMessage = req.session.success;
        req.session.success = null; // Réinitialiser après affichage

        res.render('customers/index', { 
            customers, 
            successMessage, 
            currentPage: 'customers'
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Erreur lors de la récupération des clients.');
    }
};

// Ajouter un client (Formulaire classique HTML)
exports.addCustomer = async (req, res) => {
    const { name, email, phone } = req.body;

    try {
        await db.query(
            'INSERT INTO customers (name, email, phone) VALUES (?, ?, ?)',
            [name, email, phone]
        );

        req.session.success = 'Client ajouté avec succès !';
        res.redirect('/customers');
    } catch (err) {
        console.error(err);
        res.status(500).send('Erreur lors de l\'ajout du client.');
    }
};

// ➕ Ajouter un client via AJAX (pour Drawer)
exports.addCustomerAjax = async (req, res) => {
    const { name, email, phone } = req.body;

    try {
        const [result] = await db.query(
            'INSERT INTO customers (name, email, phone) VALUES (?, ?, ?)',
            [name, email, phone]
        );

        res.json({ success: true, id: result.insertId });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Erreur lors de l'ajout du client." });
    }
};

// Affiche le formulaire d'édition
exports.getEditCustomer = async (req, res) => {
  try {
    const [[client]] = await db.query('SELECT * FROM customers WHERE id = ?', [req.params.id]);
    if (!client) return res.status(404).send('Client non trouvé');

    return res.render('customers/modifier_client', {
      client,
      user: req.session.user,
      page: 'customers',
      pageGroup: 'clients'
    });
  } catch (err) {
    console.error(err);
    return res.status(500).send('Erreur serveur lors de la récupération du client.');
  }
};

// Met à jour le client
exports.updateCustomer = async (req, res) => {
    const { name, email, phone } = req.body;
    const { id } = req.params;

    try {
        await db.query('UPDATE customers SET name = ?, email = ?, phone = ? WHERE id = ?', [
            name, email, phone, id
        ]);

        req.session.success = "Client modifié avec succès !";
        res.redirect('/customers');
    } catch (err) {
        console.error(err);
        res.status(500).send("Erreur lors de la mise à jour du client.");
    }
};

// Supprime un client
exports.deleteCustomer = async (req, res) => {
  try {
    const { id } = req.params;
    await db.query('DELETE FROM customers WHERE id = ?', [id]);

    req.session.success = 'Client supprimé avec succès.';
    res.redirect('/customers');
  } catch (error) {
    console.error('Erreur lors de la suppression du client :', error);
    res.status(500).send('Erreur serveur lors de la suppression.');
  }
};

// ✅ Importation de contacts depuis fichier CSV ou Excel
exports.importContacts = async (req, res) => {
  try {
    const filePath = req.file.path;
    const workbook = xlsx.readFile(filePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawData = xlsx.utils.sheet_to_json(sheet, { header: 1 });

    if (!rawData || rawData.length < 2) {
      throw new Error("Le fichier est vide ou mal structuré.");
    }

    // Normaliser les en-têtes
    const headers = rawData[0].map(h => h.toString().trim().toLowerCase());
    const required = ['nom', 'téléphone', 'email'];
    const missing = required.filter(r => !headers.includes(r));

    if (missing.length) {
      throw new Error(`Le fichier doit contenir les colonnes : ${required.join(', ')}`);
    }

    const data = xlsx.utils.sheet_to_json(sheet); // convertit en objets clé/valeur

    for (const row of data) {
      const name = row.nom || 'Sans nom';
      const phone = row.téléphone || '';
      const email = row.email || '';

      if (phone) {
        await db.query(
          `INSERT INTO customers (name, phone, email)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE phone = VALUES(phone)`,
          [name, phone, email]
        );
      }
    }

    fs.unlinkSync(filePath);
    req.session.success = 'Importation des clients réussie.';
    res.redirect('/customers');
  } catch (err) {
    console.error('❌ Erreur importation clients :', err);
    req.session.errorMessage = err.message || "Erreur lors de l'import.";
    res.redirect('/customers');
  }
};



