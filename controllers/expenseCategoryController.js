const db = require('../models/db');

// Liste toutes les catégories
exports.getAllCategories = async (req, res) => {
    try {
        const [results] = await db.query('SELECT * FROM expense_categories');
        res.render('expenses/categories', {
            categories: results,
            pageGroup: 'expenses',
            page: 'expense-categories',
            success: req.query.success || null   // <<< AJOUT ESSENTIEL !!!
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Erreur lors de la récupération des catégories.');
    }
};



// Affiche le formulaire d'ajout
exports.showAddForm = (req, res) => {
    res.render('expenses/categories_add', {
        pageGroup: 'expenses',
        page: 'expense-categories'
    });
};

// Ajout d'une nouvelle catégorie
exports.addCategory = async (req, res) => {
    const { name, description } = req.body;
    try {
        const sql = 'INSERT INTO expense_categories (name, description) VALUES (?, ?)';
        await db.query(sql, [name, description]);
        res.redirect('/expense-categories?success=Catégorie ajoutée avec succès');
    } catch (err) {
        console.error(err);
        res.status(500).send('Erreur lors de l\'ajout de la catégorie.');
    }
};

// Affiche le formulaire de modification
exports.showEditForm = async (req, res) => {
    const id = req.params.id;
    try {
        const [results] = await db.query('SELECT * FROM expense_categories WHERE id = ?', [id]);
        if (results.length === 0) {
            return res.redirect('/expense-categories?success=Aucune catégorie trouvée');
        }
        res.render('expenses/categories_edit', {
            category: results[0],
            pageGroup: 'expenses',
            page: 'expense-categories',
            success: req.query.success || null
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Erreur lors de l\'affichage du formulaire de modification.');
    }
};

// Traitement de la modification
exports.updateCategory = async (req, res) => {
    const id = req.params.id;
    const { name, description } = req.body;
    try {
        await db.query('UPDATE expense_categories SET name = ?, description = ? WHERE id = ?', [name, description, id]);
        res.redirect('/expense-categories?success=Catégorie mise à jour avec succès');
    } catch (err) {
        console.error(err);
        res.status(500).send('Erreur lors de la mise à jour.');
    }
};

// Suppression
exports.deleteCategory = async (req, res) => {
    const id = req.params.id;
    try {
        await db.query('DELETE FROM expense_categories WHERE id = ?', [id]);
        res.redirect('/expense-categories?success=Catégorie supprimée');
    } catch (err) {
        console.error(err);
        res.status(500).send('Erreur lors de la suppression.');
    }
};

