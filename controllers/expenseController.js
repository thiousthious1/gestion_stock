const db = require('../models/db');
const path = require('path');
const fs = require('fs');

// Liste toutes les dépenses
exports.getAllExpenses = async (req, res) => {
    try {
        const sql = `
            SELECT e.*, c.name AS category_name
            FROM expenses e
            LEFT JOIN expense_categories c ON e.category_id = c.id
            ORDER BY expense_date DESC
        `;
        const [results] = await db.query(sql);
        res.render('expenses/expenses', {
            expenses: results,
            pageGroup: 'expenses',
            page: 'expenses',
            success: req.query.success || null   // <<< AJOUT ESSENTIEL !!
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Erreur lors de la récupération des dépenses.');
    }
};

// Affiche le formulaire d'ajout
exports.showAddForm = async (req, res) => {
    try {
        const [categories] = await db.query('SELECT * FROM expense_categories');
        res.render('expenses/expenses_add', {
            categories,
            pageGroup: 'expenses',
            page: 'expenses',
            success: req.query.success || null   // <<< On prévoit aussi si besoin futur
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Erreur lors de l\'affichage du formulaire.');
    }
};

// Ajout d'une dépense
exports.addExpense = async (req, res) => {
    const { category_id, amount, description, expense_date } = req.body;
    let attachment = null;

    if (req.file) {
        attachment = req.file.filename; // Nom du fichier uploadé
    }

    try {
        const sql = `
            INSERT INTO expenses (category_id, amount, description, expense_date, attachment)
            VALUES (?, ?, ?, ?, ?)
        `;
        await db.query(sql, [category_id, amount, description, expense_date, attachment]);
        res.redirect('/expenses?success=Dépense ajoutée avec succès');
    } catch (err) {
        console.error(err);
        res.status(500).send('Erreur lors de l\'ajout de la dépense.');
    }
};

// Affiche le formulaire de modification d'une dépense
exports.showEditForm = async (req, res) => {
    const id = req.params.id;
    try {
        const [expenses] = await db.query('SELECT * FROM expenses WHERE id = ?', [id]);
        if (expenses.length === 0) {
            return res.redirect('/expenses?success=Aucune dépense trouvée');
        }
        const expense = expenses[0];
        const [categories] = await db.query('SELECT * FROM expense_categories');

        res.render('expenses/expenses_edit', {
            expense,
            categories,
            pageGroup: 'expenses',
            page: 'expenses',
            success: req.query.success || null
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Erreur lors de l\'affichage de la dépense.');
    }
};

// Traitement de modification d'une dépense
exports.updateExpense = async (req, res) => {
    const id = req.params.id;
    const { category_id, amount, description, expense_date } = req.body;
    let attachment = null;

    if (req.file) {
        attachment = req.file.filename;
    }

    try {
        let sql, params;

        if (attachment) {
            sql = `
                UPDATE expenses 
                SET category_id = ?, amount = ?, description = ?, expense_date = ?, attachment = ?
                WHERE id = ?
            `;
            params = [category_id, amount, description, expense_date, attachment, id];
        } else {
            sql = `
                UPDATE expenses 
                SET category_id = ?, amount = ?, description = ?, expense_date = ?
                WHERE id = ?
            `;
            params = [category_id, amount, description, expense_date, id];
        }

        await db.query(sql, params);
        res.redirect('/expenses?success=Dépense mise à jour avec succès');

    } catch (err) {
        console.error(err);
        res.status(500).send('Erreur lors de la mise à jour.');
    }
};

// Suppression d'une dépense
exports.deleteExpense = async (req, res) => {
    const id = req.params.id;
    try {
        await db.query('DELETE FROM expenses WHERE id = ?', [id]);
        res.redirect('/expenses?success=Dépense supprimée');
    } catch (err) {
        console.error(err);
        res.status(500).send('Erreur lors de la suppression.');
    }
};

// Rapport détaillé des dépenses (vue normale)
exports.getAdvancedExpenseReport = async (req, res) => {
    const { startDate, endDate } = req.query;

    try {
        // 1️⃣ - Liste des dépenses avec catégorie
        const [expenses] = await db.query(`
            SELECT 
                expenses.id, 
                expenses.expense_date, 
                expense_categories.name AS category_name, 
                expenses.description, 
                expenses.amount
            FROM expenses
            LEFT JOIN expense_categories 
                ON expenses.category_id = expense_categories.id
            WHERE DATE(expense_date) BETWEEN ? AND ?
            ORDER BY expenses.expense_date ASC
        `, [startDate, endDate]);

        // 2️⃣ - Totaux par catégorie
        const [totauxParCategorie] = await db.query(`
            SELECT 
                expense_categories.name AS category_name, 
                SUM(expenses.amount) AS total_depenses
            FROM expenses
            LEFT JOIN expense_categories 
                ON expenses.category_id = expense_categories.id
            WHERE DATE(expense_date) BETWEEN ? AND ?
            GROUP BY expense_categories.name
        `, [startDate, endDate]);

        res.render('expenses/report_advanced', {
            expenses,
            totauxParCategorie,
            startDate,
            endDate,
            page: 'report-expenses-advanced',
            pageGroup: 'reports'
        });

    } catch (err) {
        console.error('Erreur lors de la récupération du rapport des dépenses :', err);
        res.status(500).send('Erreur serveur');
    }
};

// Rapport imprimable
exports.getAdvancedExpenseReportPrint = async (req, res) => {
    const { startDate, endDate } = req.query;

    try {
        // 1️⃣ - Liste des dépenses
        const [expenses] = await db.query(`
            SELECT 
                expenses.id, 
                expenses.expense_date, 
                expense_categories.name AS category_name, 
                expenses.description, 
                expenses.amount
            FROM expenses
            LEFT JOIN expense_categories 
                ON expenses.category_id = expense_categories.id
            WHERE DATE(expense_date) BETWEEN ? AND ?
            ORDER BY expenses.expense_date ASC
        `, [startDate, endDate]);

        // 2️⃣ - Totaux par catégorie
        const [totauxParCategorie] = await db.query(`
            SELECT 
                expense_categories.name AS category_name, 
                SUM(expenses.amount) AS total_depenses
            FROM expenses
            LEFT JOIN expense_categories 
                ON expenses.category_id = expense_categories.id
            WHERE DATE(expense_date) BETWEEN ? AND ?
            GROUP BY expense_categories.name
        `, [startDate, endDate]);

        res.render('expenses/report_advanced_print', {
            expenses,
            totauxParCategorie,
            startDate,
            endDate
        });

    } catch (err) {
        console.error('Erreur lors de la génération du rapport imprimable :', err);
        res.status(500).send('Erreur serveur');
    }
};


