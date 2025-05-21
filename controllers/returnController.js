const db = require('../models/db');

// Formulaire de retour
exports.showReturnForm = async (req, res) => {
  const saleId = req.query.saleId || null;

  try {
    // 👉 Ne récupérer que les ventes sans retour
    const [sales] = await db.query(`
      SELECT s.id
      FROM sales s
      WHERE NOT EXISTS (
        SELECT 1 FROM returns r WHERE r.sale_id = s.id
      )
    `);

    // ✅ Vérifie si l'ID demandé est dans la liste autorisée
    if (saleId) {
      const found = sales.find(s => s.id == saleId);
      if (!found) {
        req.session.errorMessage = "❌ Cette vente a déjà connu un retour.";
        return res.redirect("/returns/add");
      }

      // Récupérer les produits de cette vente
      const [products] = await db.query(`
        SELECT sd.product_id, p.nom AS name, sd.quantity AS sold_qty
        FROM sale_details sd
        JOIN products p ON p.id = sd.product_id
        WHERE sd.sale_id = ?
      `, [saleId]);

      // Ajouter les quantités déjà retournées
      for (let product of products) {
        const [returnedResult] = await db.query(`
          SELECT SUM(rd.quantity) AS returned_qty
          FROM returns r
          JOIN returns_details rd ON rd.return_id = r.id
          WHERE r.sale_id = ? AND rd.product_id = ?
        `, [saleId, product.product_id]);

        const alreadyReturned = returnedResult[0].returned_qty || 0;
        product.returned_qty = alreadyReturned;
        product.maxReturnable = product.sold_qty - alreadyReturned;
      }

      return res.render('returns/add', {
        sales,
        selectedSale: saleId,
        products,
        errorMessage: req.session.errorMessage || null
      });
    }

    res.render('returns/add', {
      sales,
      selectedSale: null,
      products: [],
      errorMessage: req.session.errorMessage || null
    });

    delete req.session.errorMessage;

  } catch (err) {
    console.error('Erreur formulaire retour :', err);
    res.status(500).send('Erreur serveur');
  }
};


// Enregistrement du retour
exports.submitReturn = async (req, res) => {
  const { sale_id, product_ids = [], quantities = [], reasons = [] } = req.body;
  const userId = req.session.user?.id || null;

  const connection = await db.getConnection();
  await connection.beginTransaction();

  try {
    const [[sale]] = await connection.query(`SELECT * FROM sales WHERE id = ?`, [sale_id]);
    if (!sale) {
      req.session.errorMessage = "❌ Vente introuvable.";
      await connection.rollback(); connection.release();
      return res.redirect("/returns");
    }

    let montantTotalRetour = 0;
    const details = [];

    for (let i = 0; i < product_ids.length; i++) {
      const product_id = parseInt(product_ids[i]);
      const qte = parseFloat(quantities[i]);
      const reason = reasons[i] || null;

      const [[detail]] = await connection.query(`
        SELECT * FROM sale_details 
        WHERE sale_id = ? AND product_id = ?`,
        [sale_id, product_id]);

      if (!detail) {
        req.session.errorMessage = `❌ Ce produit (ID ${product_id}) n'existe pas dans cette vente.`;
        await connection.rollback(); connection.release();
        return res.redirect("/returns");
      }

      // 1️⃣ Vérifier quantité déjà retournée
      const [[retourExistants]] = await connection.query(`
        SELECT COALESCE(SUM(quantity), 0) AS total_retour
        FROM returns_details rd
        JOIN returns r ON r.id = rd.return_id
        WHERE r.sale_id = ? AND rd.product_id = ?
      `, [sale_id, product_id]);

      const dejaRetournee = parseFloat(retourExistants.total_retour) || 0;
      const maxRetournable = parseFloat(detail.quantity) - dejaRetournee;

      if (qte > maxRetournable) {
        req.session.errorMessage = `❌ Retour invalide : Max autorisé pour le produit ${product_id} : ${maxRetournable}`;
        await connection.rollback(); connection.release();
        return res.redirect("/returns");
      }

      const unit_price = parseFloat(detail.unit_price);
      const remise = parseFloat(detail.discount) || 0;
      const taxe = parseFloat(detail.tax) || 0;

      let montantHT = unit_price * qte;
      montantHT -= (montantHT * remise / 100);
      const montantTVA = montantHT * (taxe / 100);
      const montantTotal = montantHT + montantTVA;

      montantTotalRetour += montantTotal;

      details.push({ product_id, qte, unit_price, remise, taxe, reason });
    }

    // Enregistrer le retour principal
    const [retourResult] = await connection.query(`
      INSERT INTO returns (sale_id, user_id, total_amount) VALUES (?, ?, ?)`,
      [sale_id, userId, montantTotalRetour]);
    const returnId = retourResult.insertId;

    // Détails des produits retournés
    for (const d of details) {
      await connection.query(`
        INSERT INTO returns_details (return_id, product_id, quantity, unit_price, discount, tax, reason)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [returnId, d.product_id, d.qte, d.unit_price, d.remise, d.taxe, d.reason]);

      await connection.query(`UPDATE products SET quantite = quantite + ? WHERE id = ?`,
        [d.qte, d.product_id]);
    }

    // Mise à jour vente
    const nouveauTotal = parseFloat(sale.total_amount) - montantTotalRetour;
    const nouveauDu = parseFloat(sale.due_amount) - montantTotalRetour;
    const nouveauStatut = (nouveauDu <= 0)
      ? "Paid"
      : (sale.paid_amount > 0 ? "Partially Paid" : "Unpaid");

    await connection.query(`
      UPDATE sales 
      SET total_amount = ?, due_amount = ?, payment_status = ?
      WHERE id = ?`,
      [nouveauTotal, Math.max(nouveauDu, 0), nouveauStatut, sale_id]);

    await connection.commit();
    connection.release();

    req.session.successMessage = "✅ Retour enregistré avec mise à jour du paiement.";
    res.redirect("/returns");

  } catch (err) {
    await connection.rollback();
    connection.release();
    console.error("Erreur retour client :", err);
    req.session.errorMessage = "❌ Une erreur est survenue.";
    res.redirect("/returns");
  }
};



// Liste des retours
exports.listReturns = async (req, res) => {
  try {
    const [results] = await db.query(`
      SELECT r.id AS return_id, r.return_date, r.total_amount, r.sale_id, 
             rd.product_id, rd.quantity, rd.unit_price, rd.discount, rd.tax,
             p.nom AS product_name, s.id AS sale_ref
      FROM returns r
      JOIN returns_details rd ON r.id = rd.return_id
      JOIN products p ON rd.product_id = p.id
      JOIN sales s ON r.sale_id = s.id
      ORDER BY r.return_date DESC
    `);

    res.render('returns/index', { returns: results, currentPage: 'returns' });

  } catch (error) {
    console.error('Erreur lors de la récupération des retours :', error);
    res.status(500).send('Erreur serveur');
  }
};
