const db = require('../models/db');

exports.listReturns = async (req, res) => {
    const [returns] = await db.query(`
        SELECT pr.id AS return_id, pr.return_date, pr.reason,
               pr.purchase_id,
               p.purchase_date,
               GROUP_CONCAT(CONCAT(prod.nom, ' (Qté: ', prd.quantity, ')') SEPARATOR '<br>') AS products
        FROM purchase_returns pr
        JOIN purchase_returns_details prd ON pr.id = prd.return_id
        JOIN products prod ON prd.product_id = prod.id
        JOIN purchases p ON pr.purchase_id = p.id
        GROUP BY pr.id
        ORDER BY pr.return_date DESC
    `);

    res.render('purchases/returns_list', { returns });
};

exports.showAddForm = async (req, res) => {
    const [purchases] = await db.query(`
        SELECT id FROM purchases
    `);
    res.render('purchases/returns_add', { purchases });
};

// ✅ Charger les produits dynamiquement (AJAX) avec quantité restante
exports.getPurchaseProducts = async (req, res) => {
    const purchase_id = req.params.id;

    const [products] = await db.query(`
        SELECT 
            pd.product_id, 
            pd.quantity AS purchased_quantity, 
            p.nom AS product_name
        FROM purchase_details pd
        JOIN products p ON pd.product_id = p.id
        WHERE pd.purchase_id = ?
    `, [purchase_id]);

    for (let product of products) {
        const [alreadyReturnedRows] = await db.query(`
            SELECT COALESCE(SUM(prd.quantity), 0) AS total_returned
            FROM purchase_returns_details prd
            JOIN purchase_returns pr ON prd.return_id = pr.id
            WHERE pr.purchase_id = ? AND prd.product_id = ?
        `, [purchase_id, product.product_id]);

        product.already_returned = alreadyReturnedRows[0].total_returned;
        product.remaining_quantity = product.purchased_quantity - product.already_returned;

        if (product.remaining_quantity < 0) product.remaining_quantity = 0;
    }

    res.json(products);
};

exports.addReturn = async (req, res) => {
    const { purchase_id, reason } = req.body;
    const products = req.body.products;

    if (!purchase_id || !products) {
        req.session.errorMessage = 'Veuillez remplir tous les champs.';
        return res.redirect('/purchase-returns/add');
    }

    let auMoinsUnProduitARetourner = false;

    for (let item of products) {
        if (parseFloat(item.quantity) > 0) {
            auMoinsUnProduitARetourner = true;
            break;
        }
    }

    if (!auMoinsUnProduitARetourner) {
        req.session.errorMessage = 'Veuillez renseigner au moins une quantité à retourner.';
        return res.redirect('/purchase-returns/add');
    }

    // ✅ Créer le retour principal
    const [result] = await db.query(`
        INSERT INTO purchase_returns (purchase_id, reason)
        VALUES (?, ?)`,
        [purchase_id, reason]
    );
    const return_id = result.insertId;

    let total_return_amount = 0;

    // ✅ Enregistrer les détails et vérifier la quantité disponible
    for (let item of products) {
        const product_id = item.product_id;
        const quantity = parseFloat(item.quantity);
        const reason_detail = item.reason || '';

        if (quantity > 0) {
            // Vérification quantité restante
            const [availableRows] = await db.query(`
                SELECT pd.quantity - COALESCE((
                    SELECT SUM(prd.quantity)
                    FROM purchase_returns_details prd
                    JOIN purchase_returns pr2 ON prd.return_id = pr2.id
                    WHERE pr2.purchase_id = ? AND prd.product_id = ?
                ), 0) AS remaining_quantity, pd.unit_price
                FROM purchase_details pd
                WHERE pd.purchase_id = ? AND pd.product_id = ?
            `, [purchase_id, product_id, purchase_id, product_id]);

            const remaining_quantity = availableRows[0] ? availableRows[0].remaining_quantity : 0;
            const purchase_price = availableRows[0] && !isNaN(availableRows[0].unit_price) ? parseFloat(availableRows[0].unit_price) : 0;


            if (quantity > remaining_quantity) {
                req.session.errorMessage = `Vous ne pouvez pas retourner plus que ${remaining_quantity} unité(s) pour le produit sélectionné.`;
                return res.redirect('/purchase-returns/add');
            }

            // ✅ Insertion du détail
            await db.query(`
                INSERT INTO purchase_returns_details (return_id, product_id, quantity, reason)
                VALUES (?, ?, ?, ?)`,
                [return_id, product_id, quantity, reason_detail]
            );

            // ✅ Mise à jour du stock
            await db.query(`
                UPDATE products SET quantite = quantite - ? WHERE id = ?`,
                [quantity, product_id]
            );

            // ✅ Calcul du montant retourné
            total_return_amount += quantity * purchase_price;
        }
    }
    console.log('Montant total retourné calculé :', total_return_amount);

    // ✅ Si montant retourné > 0, enregistrer un paiement négatif (avoir fournisseur)
    if (total_return_amount > 0) {
        await db.query(`
            INSERT INTO purchase_payments 
                (purchase_id, amount, payment_date, payment_method, notes)
            VALUES (?, ?, NOW(), ?, ?)`,
            [
                purchase_id,
                -total_return_amount,
                'Avoir / Retour fournisseur',
                `Retour fournisseur n° ${return_id}`
            ]
        );
    }

    req.session.successMessage = 'Retour fournisseur enregistré avec succès.';
    res.redirect('/purchase-returns');
};

// ✅ Vue détail du retour
exports.viewReturn = async (req, res) => {
    const return_id = req.params.id;

    const [returnInfoRows] = await db.query(`
        SELECT pr.id AS return_id, pr.return_date, pr.reason AS general_reason,
               pr.purchase_id, p.purchase_date
        FROM purchase_returns pr
        JOIN purchases p ON pr.purchase_id = p.id
        WHERE pr.id = ?
    `, [return_id]);

    if (returnInfoRows.length === 0) {
        req.session.errorMessage = "Retour fournisseur introuvable.";
        return res.redirect('/purchase-returns');
    }

    const returnInfo = returnInfoRows[0];

    const [productRows] = await db.query(`
        SELECT prod.nom AS product_name, prd.quantity, prd.reason
        FROM purchase_returns_details prd
        JOIN products prod ON prd.product_id = prod.id
        WHERE prd.return_id = ?
    `, [return_id]);

    res.render('purchases/returns_view', {
        returnInfo,
        productRows
    });
};
