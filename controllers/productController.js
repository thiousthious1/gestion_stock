const db = require('../models/db');

// Affiche la liste des produits
exports.listProducts = async (req, res) => {
  try {
    const [products] = await db.query(`
      SELECT p.*, c.nom AS category_name
      FROM products p
      LEFT JOIN categories c ON p.categorie_id = c.id
    `);

    const [categories] = await db.query('SELECT * FROM categories');

    const successMessage = req.session.success;
    req.session.success = null;

    res.render('products/product-list', {
      produits: products,
      categories,
      successMessage,
      user: req.session.user,
      page: 'products',
      pageGroup: 'products'
    });
  } catch (err) {
    console.error('Erreur listProducts :', err);
    res.status(500).send('Erreur serveur');
  }
};


// Formulaire d'ajout
exports.showAddForm = async (req, res) => {
  try {
    const [categories] = await db.query('SELECT * FROM categories');
    res.render('products/add-product', {
      categories,
      user: req.session.user,
      page: 'products',
      pageGroup: 'products'
    });
  } catch (err) {
    console.error('Erreur showAddForm :', err);
    res.status(500).send('Erreur serveur');
  }
};

// Ajout d'un produit
exports.addProduct = async (req, res) => {
  try {
    const { nom, quantite, prix_achat, prix_vente, categorie_id, description } = req.body;

    await db.query(
      'INSERT INTO products (nom, quantite, prix_achat, prix_vente, categorie_id, description) VALUES (?, ?, ?, ?, ?, ?)',
      [nom, quantite, prix_achat, prix_vente, categorie_id, description]
    );

    req.session.success = 'Produit ajouté avec succès.';
    res.redirect('/products');
  } catch (err) {
    console.error('Erreur addProduct :', err);
    res.status(500).send('Erreur serveur');
  }
};


// ➕ Ajouter un produit via AJAX (Drawer)
exports.addProductAjax = async (req, res) => {
  const { nom, description, prix_achat, prix_vente, quantite, categorie_id } = req.body;

  try {
    const [result] = await db.query(
      'INSERT INTO products (nom, description, prix_achat, prix_vente, quantite, categorie_id) VALUES (?, ?, ?, ?, ?, ?)',
      [nom, description, prix_achat, prix_vente, quantite, categorie_id]
    );

    res.json({ success: true, id: result.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Erreur lors de l'ajout du produit." });
  }
};


// Formulaire d'édition
exports.showEditForm = async (req, res) => {
  try {
    const [products] = await db.query('SELECT * FROM products WHERE id = ?', [req.params.id]);
    const [categories] = await db.query('SELECT * FROM categories');

    const product = products[0];
    if (!product) return res.status(404).send('Produit non trouvé');

    res.render('products/product-edit', {
      product,
      categories,
      user: req.session.user,
      page: 'products',
      pageGroup: 'products'
    });
  } catch (err) {
    console.error('Erreur showEditForm :', err);
    res.status(500).send('Erreur serveur');
  }
};


// Mise à jour d'un produit
exports.updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const { nom, quantite, prix_achat, prix_vente, categorie_id, description } = req.body;

    await db.query(
      'UPDATE products SET nom = ?, quantite = ?, prix_achat = ?, prix_vente = ?, categorie_id = ?, description = ? WHERE id = ?',
      [nom, quantite, prix_achat, prix_vente, categorie_id, description, id]
    );

    req.session.success = 'Produit mis à jour avec succès.';
    res.redirect('/products');
  } catch (err) {
    console.error('Erreur updateProduct :', err);
    res.status(500).send('Erreur serveur');
  }
};


// Suppression d'un produit
exports.deleteProduct = async (req, res) => {
  try {
    await db.query('DELETE FROM products WHERE id = ?', [req.params.id]);
    req.session.success = 'Produit supprimé avec succès.';
    res.redirect('/products');
  } catch (err) {
    console.error('Erreur deleteProduct :', err);
    res.status(500).send('Erreur serveur');
  }
};


// Mise à jour rapide d'un champ (inline edit)
exports.updateFieldInline = async (req, res) => {
  const { id, field, value } = req.body;

  try {
    const allowedFields = ['nom', 'quantite']; // Liste blanche des champs modifiables

    if (!allowedFields.includes(field)) {
      return res.status(400).json({ message: 'Champ non autorisé.' });
    }

    await db.query(`UPDATE products SET ${field} = ? WHERE id = ?`, [value, id]);
    res.json({ message: 'Mise à jour réussie.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

exports.getAdvancedStockReport = async (req, res) => {
  const { days_without_movement } = req.query;
  const days = days_without_movement ? parseInt(days_without_movement) : 30;

  try {
    // Valeur du stock (achat et vente)
    const [valeurStock] = await db.query(`
      SELECT 
        SUM(p.quantite * COALESCE(
          (SELECT pd.unit_price 
           FROM purchases pu 
           JOIN purchase_details pd ON pd.purchase_id = pu.id 
           WHERE pd.product_id = p.id 
           ORDER BY pu.purchase_date DESC 
           LIMIT 1), 0)
        ) AS valeur_stock_achat,
        SUM(p.quantite * p.prix_vente) AS valeur_stock_vente
      FROM products p;
    `);

    // Produits en dessous du niveau d’alerte
    const [produitsFaibles] = await db.query(`
      SELECT id, nom, quantite, stock_alert_level 
      FROM products 
      WHERE quantite <= stock_alert_level;
    `);

    // Produits sans mouvement depuis X jours
    const [produitsSansMouvement] = await db.query(`
      SELECT 
        p.id, 
        p.nom, 
        p.quantite, 
        COALESCE(
          GREATEST(
            IFNULL((SELECT MAX(s.created_at) 
                    FROM sale_details s 
                    WHERE s.product_id = p.id), '2000-01-01'),
            IFNULL((SELECT MAX(pu.purchase_date) 
                    FROM purchases pu 
                    JOIN purchase_details pd ON pd.purchase_id = pu.id 
                    WHERE pd.product_id = p.id), '2000-01-01')
          ), '2000-01-01'
        ) AS derniere_mouvement
      FROM products p
      HAVING DATEDIFF(CURRENT_DATE, derniere_mouvement) > ?;
    `, [days]);

    res.render('products/report_advanced', {
      valeurStock: valeurStock[0],
      produitsFaibles,
      produitsSansMouvement,
      days,
      page: 'report-stock-advanced',
      pageGroup: 'reports'
    });

  } catch (err) {
    console.error('Erreur lors de la récupération du rapport de stock :', err);
    res.status(500).send('Erreur serveur');
  }
};


exports.getAdvancedStockReportPrint = async (req, res) => {
  const { days_without_movement } = req.query;
  const days = days_without_movement ? parseInt(days_without_movement) : 30;

  try {
    // Valeur stock (achat + vente)
    const [valeurStock] = await db.query(`
      SELECT 
        SUM(p.quantite * COALESCE(
          (SELECT pd.unit_price 
           FROM purchases pu 
           JOIN purchase_details pd ON pd.purchase_id = pu.id 
           WHERE pd.product_id = p.id 
           ORDER BY pu.purchase_date DESC LIMIT 1), 0)
        ) AS valeur_stock_achat,
        SUM(p.quantite * p.prix_vente) AS valeur_stock_vente
      FROM products p;
    `);

    // Produits sous seuil
    const [produitsFaibles] = await db.query(`
      SELECT id, nom, quantite, stock_alert_level 
      FROM products 
      WHERE quantite <= stock_alert_level;
    `);

    // Produits sans mouvement
    const [produitsSansMouvement] = await db.query(`
      SELECT 
        p.id, 
        p.nom, 
        p.quantite, 
        COALESCE(
          GREATEST(
            IFNULL((SELECT MAX(s.created_at) FROM sale_details s WHERE s.product_id = p.id), '2000-01-01'),
            IFNULL((SELECT MAX(pu.purchase_date) 
                    FROM purchases pu 
                    JOIN purchase_details pd ON pd.purchase_id = pu.id 
                    WHERE pd.product_id = p.id), '2000-01-01')
          ), '2000-01-01'
        ) AS derniere_mouvement
      FROM products p
      HAVING DATEDIFF(CURRENT_DATE, derniere_mouvement) > ?;
    `, [days]);

    // Affichage de la version imprimable
    res.render('products/report_advanced_print', {
      valeurStock: valeurStock[0],
      produitsFaibles,
      produitsSansMouvement,
      days
    });

  } catch (err) {
    console.error('Erreur lors de l’impression du rapport de stock :', err);
    res.status(500).send('Erreur serveur');
  }
};


exports.getStockMovementReport = async (req, res) => {
  try {
    const [results] = await db.query(`
      SELECT 
        p.id, 
        p.nom, 
        p.quantite AS stock_actuel,

        (
          p.quantite
          + IFNULL((
              SELECT SUM(sd.quantity)
              FROM sale_details sd
              WHERE sd.product_id = p.id
                AND sd.created_at >= CURDATE()
            ), 0)
          - IFNULL((
              SELECT SUM(pd.quantity)
              FROM purchases pu
              JOIN purchase_details pd ON pd.purchase_id = pu.id
              WHERE pd.product_id = p.id
                AND pu.purchase_date >= CURDATE()
            ), 0)
        ) AS stock_debut

      FROM products p
      ORDER BY p.nom ASC;
    `);

    // Calcul de l'écart dans le contrôleur
    const mouvements = results.map(row => ({
      nom: row.nom,
      stock_debut: parseFloat(row.stock_debut) || 0,
      stock_actuel: row.stock_actuel,
      ecart: row.stock_actuel - (parseFloat(row.stock_debut) || 0)
    }));

    res.render('products/report_stock_movement', {
      mouvements,
      page: 'report-stock-movement',
      pageGroup: 'reports'
    });

  } catch (err) {
    console.error('Erreur lors de la récupération du rapport de mouvement du stock :', err);
    res.status(500).send('Erreur serveur');
  }
};


exports.getStockMovementReportPrint = async (req, res) => {
  try {
    const [results] = await db.query(`
      SELECT 
        p.id, 
        p.nom, 
        p.quantite AS stock_actuel,

        (
          p.quantite
          + IFNULL((
              SELECT SUM(sd.quantity)
              FROM sale_details sd
              WHERE sd.product_id = p.id 
                AND sd.created_at >= CURDATE()
            ), 0)

          - IFNULL((
              SELECT SUM(pd.quantity)
              FROM purchases pu
              JOIN purchase_details pd ON pd.purchase_id = pu.id
              WHERE pd.product_id = p.id 
                AND pu.purchase_date >= CURDATE()
            ), 0)
        ) AS stock_debut

      FROM products p
      ORDER BY p.nom ASC;
    `);

    const mouvements = results.map(row => ({
      nom: row.nom,
      stock_debut: parseFloat(row.stock_debut) || 0,
      stock_actuel: row.stock_actuel,
      ecart: row.stock_actuel - (parseFloat(row.stock_debut) || 0)
    }));

    res.render('products/report_stock_movement_print', {
      mouvements
    });

  } catch (err) {
    console.error('Erreur lors de l’impression du rapport mouvement stock :', err);
    res.status(500).send('Erreur serveur');
  }
};





