const db = require('../models/db');

exports.listSuppliers = async (req, res) => {
  try {
    const [suppliers] = await db.query('SELECT * FROM suppliers ORDER BY name ASC');
    
    const message = req.session.successMessage;
    req.session.successMessage = null;

    res.render('suppliers/index', {
      suppliers,
      successMessage: message,
      user: req.session.user,
      page: 'suppliers',
      pageGroup: 'clients'
    });
  } catch (err) {
    console.error('Erreur récupération fournisseurs :', err);
    res.status(500).send('Erreur serveur');
  }
};


// Formulaire d'ajout
exports.showAddForm = (req, res) => {
  res.render('suppliers/add');
};

// Enregistrement d'un fournisseur
exports.addSupplier = async (req, res) => {
  try {
      const { name, contact, phone, email } = req.body;

      const [result] = await db.query(
          'INSERT INTO suppliers (name, contact, phone, email) VALUES (?, ?, ?, ?)',
          [name, contact, phone, email]
      );

      const newSupplierId = result.insertId;

      // Si c'est une requête AJAX (XHR ou Fetch)
      if (req.xhr || req.headers.accept.indexOf('json') > -1) {
          return res.json({
              success: true,
              supplier: {
                  id: newSupplierId,
                  name: name
              }
          });
      } else {
          // Sinon (soumission classique), on redirige avec message
          req.session.successMessage = '✅ Fournisseur ajouté avec succès.';
          return res.redirect('/suppliers');
      }

  } catch (err) {
      console.error('Erreur ajout fournisseur :', err);

      if (req.xhr || req.headers.accept.indexOf('json') > -1) {
          return res.status(500).json({ success: false, message: 'Erreur serveur' });
      } else {
          req.session.errorMessage = '❌ Erreur lors de l\'ajout du fournisseur.';
          return res.redirect('/suppliers');
      }
  }
};

exports.addSupplierAjax = async (req, res) => {
  try {
      const { name, contact, phone, email } = req.body;

      const [result] = await db.query(
          'INSERT INTO suppliers (name, contact, phone, email) VALUES (?, ?, ?, ?)',
          [name, contact, phone, email]
      );

      const newSupplierId = result.insertId;

      res.json({
          success: true,
          supplier: {
              id: newSupplierId,
              name: name
          }
      });

  } catch (err) {
      console.error('Erreur ajout fournisseur AJAX :', err);
      res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
};

// Formulaire d'édition
exports.showEditForm = async (req, res) => {
  const supplierId = req.params.id;
  try {
    const [rows] = await db.query('SELECT * FROM suppliers WHERE id = ?', [supplierId]);
    if (rows.length === 0) return res.status(404).send('Fournisseur non trouvé.');
    res.render('suppliers/edit', { supplier: rows[0] });
  } catch (err) {
    console.error('Erreur chargement fournisseur :', err);
    res.status(500).send('Erreur serveur');
  }
};

// Mise à jour fournisseur
exports.updateSupplier = async (req, res) => {
  const supplierId = req.params.id;
  const { name, contact, phone, email } = req.body;

  try {
    await db.query(`
      UPDATE suppliers SET name = ?, contact = ?, phone = ?, email = ?
      WHERE id = ?
    `, [name, contact, phone, email, supplierId]);

    res.redirect('/suppliers?success=Fournisseur modifié avec succès.');
  } catch (err) {
    console.error('Erreur mise à jour fournisseur :', err);
    res.status(500).send('Erreur serveur');
  }
};

// Suppression fournisseur
exports.deleteSupplier = async (req, res) => {
  const supplierId = req.params.id;

  try {
    await db.query('DELETE FROM suppliers WHERE id = ?', [supplierId]);
    res.redirect('/suppliers?success=Fournisseur supprimé.');
  } catch (err) {
    console.error('Erreur suppression fournisseur :', err);
    res.status(500).send('Erreur serveur');
  }
};

exports.viewSupplierPurchases = async (req, res) => {
    const supplierId = req.params.id;
  
    try {
      const [suppliers] = await db.query('SELECT * FROM suppliers WHERE id = ?', [supplierId]);
      if (suppliers.length === 0) return res.status(404).send('Fournisseur non trouvé.');
  
      const supplier = suppliers[0];
  
      const [purchases] = await db.query(`
      SELECT 
        pd.quantity, 
        pd.unit_price, 
        p.purchase_date, 
        pr.nom AS product_name
      FROM purchases p
      LEFT JOIN purchase_details pd ON pd.purchase_id = p.id
      LEFT JOIN products pr ON pd.product_id = pr.id
      WHERE p.supplier_id = ?
      ORDER BY p.purchase_date DESC
    `, [supplierId]);

  
      res.render('suppliers/history', { supplier, purchases });
  
    } catch (err) {
      console.error('Erreur chargement historique fournisseur :', err);
      res.status(500).send('Erreur serveur');
    }
  };
  