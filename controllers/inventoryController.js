const db = require('../models/db');
const puppeteer = require('puppeteer');
const ejs = require('ejs');
const path = require('path');
const fs = require('fs');

// Liste des inventaires
exports.getAllInventories = async (req, res) => {
    try {
        const filter = req.query.filter;

        let query = `
            SELECT i.*, 
                u.username AS user_name,
                EXISTS (
                    SELECT 1 FROM inventory_items ii 
                    WHERE ii.inventory_id = i.id AND ii.adjustment != 0
                ) AS has_adjustment
            FROM inventories i 
            LEFT JOIN users u ON i.user_id = u.id
        `;

        if (filter === 'adjusted') {
            query += `
                WHERE EXISTS (
                    SELECT 1 FROM inventory_items ii 
                    WHERE ii.inventory_id = i.id AND ii.adjustment != 0
                )
            `;
        }

        query += `
            ORDER BY inventory_date DESC
        `;

        const [inventories] = await db.query(query);

        res.render('inventories/list', {
            inventories,
            pageGroup: 'inventories',
            page: 'inventories',
            success: req.query.success || null,
            filter 
        });        

    } catch (err) {
        console.error(err);
        res.status(500).send('Erreur lors de la récupération des inventaires.');
    }
};


// Formulaire de création
exports.showAddForm = async (req, res) => {
    try {
        const [products] = await db.query('SELECT * FROM products');

        // Générer la référence automatiquement
        const date = new Date();
        const datePart = date.toISOString().split('T')[0].replace(/-/g, ''); // YYYYMMDD

        const [rows] = await db.query(
            'SELECT COUNT(*) AS count FROM inventories WHERE inventory_date = ?',
            [date.toISOString().split('T')[0]]
        );

        const count = rows[0].count + 1;
        const countPart = count.toString().padStart(3, '0');
        const reference = `INV-${datePart}-${countPart}`;

        res.render('inventories/add', {
            products,
            reference,
            pageGroup: 'inventories',
            page: 'inventories-add',
            success: req.query.success || null
        });

    } catch (err) {
        console.error(err);
        res.status(500).send('Erreur lors de l\'affichage du formulaire.');
    }
};

// Enregistrer un inventaire
exports.addInventory = async (req, res) => {
    const { inventory_date, note } = req.body;  // On ne récupère plus "reference" du formulaire
    const user_id = req.session.user_id || 1;

    try {
        // Générer la référence à partir de la date choisie par l'utilisateur
        const datePart = inventory_date.replace(/-/g, '');

        // Compter combien d'inventaires existent déjà pour cette date
        const [rows] = await db.query(
            'SELECT COUNT(*) AS count FROM inventories WHERE inventory_date = ?',
            [inventory_date]
        );

        const count = rows[0].count + 1;
        const countPart = count.toString().padStart(3, '0');

        const reference = `INV-${datePart}-${countPart}`;

        // 1. Créer l'inventaire
        const [result] = await db.query(`
            INSERT INTO inventories (inventory_date, reference, note, user_id) 
            VALUES (?, ?, ?, ?)
        `, [inventory_date, reference, note, user_id]);

        const inventory_id = result.insertId;

        // 2. Enregistrer les lignes
        const products = req.body.product_id;
        const system_quantities = req.body.system_quantity;
        const counted_quantities = req.body.counted_quantity;

        for (let i = 0; i < products.length; i++) {
            const product_id = products[i];
            const sys_qty = parseFloat(system_quantities[i]);
            const counted_qty = parseFloat(counted_quantities[i]);
            const adjustment = counted_qty - sys_qty;

            await db.query(`
                INSERT INTO inventory_items 
                (inventory_id, product_id, system_quantity, counted_quantity, adjustment)
                VALUES (?, ?, ?, ?, ?)
            `, [inventory_id, product_id, sys_qty, counted_qty, adjustment]);
        }

        res.redirect('/inventories?success=Inventaire enregistré avec succès');

    } catch (err) {
        console.error(err);
        res.status(500).send('Erreur lors de l\'enregistrement de l\'inventaire.');
    }
};


// Voir un inventaire
exports.viewInventory = async (req, res) => {
    const id = req.params.id;

    try {
        const [inventories] = await db.query(`
            SELECT i.*, u.username AS user_name 
            FROM inventories i 
            LEFT JOIN users u ON i.user_id = u.id
            WHERE i.id = ?
        `, [id]);

        if (inventories.length === 0) {
            return res.redirect('/inventories?success=Aucun inventaire trouvé');
        }

        const inventory = inventories[0];

        const [items] = await db.query(`
            SELECT ii.*, p.nom AS product_name 
            FROM inventory_items ii 
            LEFT JOIN products p ON ii.product_id = p.id 
            WHERE ii.inventory_id = ?
        `, [id]);

        res.render('inventories/view', {
            inventory,
            items,
            pageGroup: 'inventories',
            page: 'inventories'
        });

    } catch (err) {
        console.error(err);
        res.status(500).send('Erreur lors de l\'affichage du détail de l\'inventaire.');
    }
};

// Export PDF
exports.exportToPDF = async (req, res) => {
    const id = req.params.id;

    try {
        // 1. Récupérer inventaire + items
        const [inventories] = await db.query(`
            SELECT i.*, u.username AS user_name 
            FROM inventories i 
            LEFT JOIN users u ON i.user_id = u.id
            WHERE i.id = ?
        `, [id]);

        if (!inventories.length) {
            return res.redirect('/inventories?success=Inventaire introuvable');
        }

        const inventory = inventories[0];

        const [items] = await db.query(`
            SELECT ii.*, p.nom AS product_name 
            FROM inventory_items ii 
            LEFT JOIN products p ON ii.product_id = p.id 
            WHERE ii.inventory_id = ?
        `, [id]);

        // 2. Encoder le logo en base64
        const logoPath = path.resolve(__dirname, '../public/images/logo_happy.jpg');
        const logoBase64 = fs.readFileSync(logoPath).toString('base64');
        const logo = `data:image/jpeg;base64,${logoBase64}`;

        // 3. Générer le HTML via EJS
        const html = await ejs.renderFile(
            path.join(__dirname, '../views/inventories/pdf_view.ejs'),
            { inventory, items, logo }
        );

        // 4. Lancer Puppeteer
        const browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();

        await page.setContent(html, { waitUntil: 'networkidle0' });

        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            displayHeaderFooter: true,
            headerTemplate: '<div></div>',
            footerTemplate: `
                <div style="font-size:10px; width:100%; text-align:center; color:#555;">
                    Document généré automatiquement par <strong>Happy Délices</strong> | Page <span class="pageNumber"></span> / <span class="totalPages"></span>
                </div>
            `,
            margin: { top: '20mm', bottom: '40mm', left: '15mm', right: '15mm' } // ⇐ augmente bottom à 40mm
        });
        

        await browser.close();

        // 5. Envoyer le PDF
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Inventaire_${inventory.reference}.pdf`);
        res.send(pdfBuffer);

    } catch (err) {
        console.error(err);
        res.status(500).send('Erreur lors de la génération du PDF avec Puppeteer.');
    }
};

exports.printInventory = async (req, res) => {
    const id = req.params.id;

    try {
        const [inventories] = await db.query(`
            SELECT i.*, u.username AS user_name 
            FROM inventories i 
            LEFT JOIN users u ON i.user_id = u.id
            WHERE i.id = ?
        `, [id]);

        if (!inventories.length) {
            return res.redirect('/inventories?success=Aucun inventaire trouvé');
        }

        const inventory = inventories[0];

        const [items] = await db.query(`
            SELECT ii.*, p.nom AS product_name 
            FROM inventory_items ii 
            LEFT JOIN products p ON ii.product_id = p.id 
            WHERE ii.inventory_id = ?
        `, [id]);

        res.render('inventories/print_view', { inventory, items });

    } catch (err) {
        console.error(err);
        res.status(500).send('Erreur lors de l\'affichage de l\'inventaire pour impression.');
    }
};

exports.showEditForm = async (req, res) => {
    const id = req.params.id;

    try {
        const [inventories] = await db.query(`
            SELECT i.*, u.username AS user_name 
            FROM inventories i 
            LEFT JOIN users u ON i.user_id = u.id
            WHERE i.id = ?
        `, [id]);

        if (!inventories.length) {
            return res.redirect('/inventories?success=Aucun inventaire trouvé');
        }

        const inventory = inventories[0];

        const [items] = await db.query(`
            SELECT ii.*, p.nom AS product_name 
            FROM inventory_items ii 
            LEFT JOIN products p ON ii.product_id = p.id 
            WHERE ii.inventory_id = ?
        `, [id]);

        res.render('inventories/edit', {
            inventory,
            items,
            pageGroup: 'inventories',
            page: 'inventories-edit'
        });

    } catch (err) {
        console.error(err);
        res.status(500).send('Erreur lors de l\'affichage du formulaire de modification.');
    }
};

exports.updateInventory = async (req, res) => {
    const id = req.params.id;
    const { inventory_date, note } = req.body;

    try {
        // 1. Mettre à jour la date et la note de l’inventaire
        await db.query(`
            UPDATE inventories SET inventory_date = ?, note = ? WHERE id = ?
        `, [inventory_date, note, id]);

        // 2. Mettre à jour les quantités constatées et les écarts pour chaque ligne
        const counted_quantities = req.body.counted_quantity;
        const item_ids = req.body.item_id;
        const system_quantities = req.body.system_quantity;

        for (let i = 0; i < item_ids.length; i++) {
            const counted_qty = parseFloat(counted_quantities[i]);
            const sys_qty = parseFloat(system_quantities[i]);
            const adjustment = counted_qty - sys_qty;

            await db.query(`
                UPDATE inventory_items 
                SET counted_quantity = ?, adjustment = ?
                WHERE id = ?
            `, [counted_qty, adjustment, item_ids[i]]);
        }

        res.redirect('/inventories?success=Inventaire modifié avec succès');

    } catch (err) {
        console.error(err);
        res.status(500).send('Erreur lors de la mise à jour de l\'inventaire.');
    }
};

exports.deleteInventory = async (req, res) => {
    const id = req.params.id;

    try {
        // 1. Supprimer les lignes de produits d’abord (contrainte étrangère sinon)
        await db.query('DELETE FROM inventory_items WHERE inventory_id = ?', [id]);

        // 2. Puis supprimer l’inventaire
        await db.query('DELETE FROM inventories WHERE id = ?', [id]);

        res.redirect('/inventories?success=Inventaire supprimé avec succès');

    } catch (err) {
        console.error(err);
        res.status(500).send('Erreur lors de la suppression de l\'inventaire.');
    }
};

exports.exportReportPDF = async (req, res) => {
    try {
        // 1. Récupérer tous les inventaires avec nombre d’ajustements
        const [inventories] = await db.query(`
            SELECT i.*, 
                u.username AS user_name,
                (
                    SELECT COUNT(*) FROM inventory_items ii 
                    WHERE ii.inventory_id = i.id AND ii.adjustment != 0
                ) AS nb_adjustments
            FROM inventories i
            LEFT JOIN users u ON i.user_id = u.id
            ORDER BY inventory_date DESC
        `);

        // 2. Encoder le logo
        const logoBase64 = fs.readFileSync(
            path.resolve(__dirname, '../public/images/logo_happy.jpg')
        ).toString('base64');
        const logo = `data:image/jpeg;base64,${logoBase64}`;

        // 3. Générer le HTML avec EJS
        const html = await ejs.renderFile(
            path.join(__dirname, '../views/inventories/report_pdf.ejs'),
            { inventories, logo }
        );

        // 4. Générer le PDF avec Puppeteer
        const browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();

        await page.setContent(html, { waitUntil: 'networkidle0' });

        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            displayHeaderFooter: true,
            headerTemplate: '<div></div>',
            footerTemplate: `
                <div style="font-size:10px; width:100%; text-align:center; color:#555;">
                    Rapport généré automatiquement par <strong>Happy Délices</strong> | Page <span class="pageNumber"></span> / <span class="totalPages"></span>
                </div>
            `,
            margin: { top: '20mm', bottom: '30mm', left: '15mm', right: '15mm' }
        });

        await browser.close();

        // 5. Envoyer le PDF
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Rapport_Inventaires.pdf`);
        res.send(pdfBuffer);

    } catch (err) {
        console.error(err);
        res.status(500).send('Erreur lors de la génération du rapport PDF.');
    }
};



