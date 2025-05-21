const db = require('../models/db');

// Affichage du formulaire
exports.showAddForm = async (req, res) => {
  try {
    const [roles] = await db.query('SELECT * FROM roles');
    res.render('permissions/add', {
      roles,
      successMessage: req.flash('successMessage'),
      errorMessage: req.flash('errorMessage'),
    });
  } catch (error) {
    console.error('Erreur chargement des rôles :', error);
    res.redirect('/dashboard');
  }
};

// Traitement du formulaire
exports.addPermission = async (req, res) => {
  const { name, display_name, role_id } = req.body;
  const can_view = req.body.can_view ? 1 : 0;
  const can_add = req.body.can_add ? 1 : 0;
  const can_edit = req.body.can_edit ? 1 : 0;
  const can_delete = req.body.can_delete ? 1 : 0;

  try {
    // Insertion dans permissions
    const [insertResult] = await db.query(
      'INSERT INTO permissions (name, display_name) VALUES (?, ?)',
      [name, display_name]
    );

    const permission_id = insertResult.insertId;

    // Insertion dans role_permissions
    await db.query(
      `INSERT INTO role_permissions 
       (role_id, permission_id, can_view, can_add, can_edit, can_delete) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [role_id, permission_id, can_view, can_add, can_edit, can_delete]
    );

    req.flash('successMessage', 'Permission ajoutée avec succès.');
    res.redirect('/permissions/add');
  } catch (error) {
    console.error('Erreur ajout permission :', error);
    req.flash('errorMessage', 'Erreur lors de l\'ajout de la permission.');
    res.redirect('/permissions/add');
  }
};
