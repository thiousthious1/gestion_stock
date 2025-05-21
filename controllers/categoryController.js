const db = require('../models/db');

// Liste des catégories
exports.getAllCategories = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM categories');

    const message = req.session.message;
    req.session.message = null; // Reset après affichage

    res.render('products/categories', {
      categories: rows,
      message,
      currentPage: 'categories' // 👈 AJOUT ici
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Erreur serveur");
  }
};

// Ajouter une catégorie
exports.addCategory = async (req, res) => {
  const { nom } = req.body;

  try {
    await db.query('INSERT INTO categories (nom) VALUES (?)', [nom]);
    req.session.message = '✅ Catégorie ajoutée avec succès.';
    res.redirect('/categories');
  } catch (error) {
    console.error(error);
    req.session.message = '❌ Une erreur est survenue lors de l\'ajout de la catégorie.';
    res.redirect('/categories');
  }
};

// Supprimer une catégorie
exports.deleteCategory = async (req, res) => {
  const { id } = req.params;

  try {
    await db.query('DELETE FROM categories WHERE id = ?', [id]);
    req.session.message = '🗑️ Catégorie supprimée avec succès.';
    res.redirect('/categories');
  } catch (error) {
    console.error(error);
    req.session.message = '❌ Une erreur est survenue lors de la suppression de la catégorie.';
    res.redirect('/categories');
  }
};
