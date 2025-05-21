const db = require('../models/db');
const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'public/uploads'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, 'logo' + ext);
  }
});
exports.uploadMiddleware = multer({ storage }).single('logo');

exports.getSettingsForm = async (req, res) => {
  try {
    const [settings] = await db.query('SELECT * FROM settings');
    const settingsMap = {};
    settings.forEach(row => {
      settingsMap[row.key] = row.value;
    });
    res.render('settings/company', { settings: settingsMap, successMessage: req.flash('success') });
  } catch (err) {
    console.error('Erreur récupération paramètres :', err);
    res.sendStatus(500);
  }
};

exports.companySettings = async (req, res) => {
  try {
    const [settings] = await db.query('SELECT * FROM settings');
    const settingsMap = {};
    settings.forEach(row => {
      settingsMap[row.key] = row.value;
    });

    res.render('settings/layout', {
    section: 'company',
    body: 'company', // ← juste le nom du fichier, pas tout le chemin
    successMessage: req.flash('success'),
    settings: settingsMap
    });


  } catch (err) {
    console.error('Erreur chargement company settings :', err);
    res.sendStatus(500);
  }
};

exports.saveSettings = async (req, res) => {
  try {
    const entries = Object.entries(req.body);
    for (const [key, value] of entries) {
      await db.query(
        'INSERT INTO settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?',
        [key, value, value]
      );
    }
    if (req.file) {
      await db.query(
        'INSERT INTO settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?',
        ['logo', req.file.filename, req.file.filename]
      );
    }
    req.flash('success', 'Paramètres mis à jour avec succès');
    res.redirect('/settings/company');

  } catch (err) {
    console.error('Erreur mise à jour paramètres :', err);
    res.sendStatus(500);
  }
};

exports.profileSettings = async (req, res) => {
  try {
    const userId = req.params.id;
    const [user] = await db.query('SELECT * FROM users WHERE id = ?', [userId]);
    //console.log('Résultat utilisateur :', user);
    user[0].permissions = req.session.user?.permissions || [];

    res.render('settings/layout', {
      section: 'profile',
      body: 'profile',
      successMessage: req.flash('success'),
      user: user[0] // ⬅ très important !
    });
  } catch (err) {
    console.error('Erreur chargement profil :', err);
    res.sendStatus(500);
  }
};

exports.saveProfileSettings = async (req, res) => {
  try {
    const userId = req.params.id;
    const { username, email, phone, address, password } = req.body;
    let avatar = req.file ? '/uploads/users/' + req.file.filename : req.body.existingAvatar;

    const fields = [username, email, phone, address, avatar];
    let sql = 'UPDATE users SET username = ?, email = ?, phone = ?, address = ?, avatar = ?';

    if (password && password.trim() !== '') {
      sql += ', password = ?';
      fields.push(password);
    }

    sql += ' WHERE id = ?';
    fields.push(userId);
    await db.query(sql, fields);

    req.flash('success', 'Profil mis à jour avec succès');
    res.redirect(`/settings/profile/${userId}`);
  } catch (err) {
    console.error('Erreur mise à jour profil :', err);
    res.sendStatus(500);
  }
};

// 🔹 Liste
exports.listPaymentModes = async (req, res) => {
  try {
    const [modes] = await db.query('SELECT * FROM payment_modes ORDER BY id DESC');
    res.render('settings/layout', {
      section: 'payment_modes',
      body: 'payment-modes',
      successMessage: req.flash('success'),
      paymentModes: modes
    });
  } catch (err) {
    console.error('Erreur chargement modes :', err);
    res.sendStatus(500);
  }
};

// 🔹 Ajout
exports.addPaymentMode = async (req, res) => {
  const { name, type } = req.body;
  try {
    await db.query('INSERT INTO payment_modes (name, type) VALUES (?, ?)', [name, type]);
    req.flash('success', 'Mode de paiement ajouté');
    res.redirect('/settings/payment-modes');
  } catch (err) {
    console.error('Erreur ajout mode :', err);
    res.sendStatus(500);
  }
};

exports.updatePaymentMode = async (req, res) => {
  const { id } = req.params;
  const { name, type } = req.body;

  try {
    await db.query('UPDATE payment_modes SET name = ?, type = ? WHERE id = ?', [name, type, id]);
    req.flash('success', 'Mode de paiement modifié avec succès');
    res.redirect('/settings/payment-modes');
  } catch (err) {
    console.error('Erreur modification mode :', err);
    res.sendStatus(500);
  }
};

// 🔹 Suppression
exports.deletePaymentMode = async (req, res) => {
  try {
    await db.query('DELETE FROM payment_modes WHERE id = ?', [req.params.id]);
    req.flash('success', 'Mode supprimé');
    res.redirect('/settings/payment-modes');
  } catch (err) {
    console.error('Erreur suppression mode :', err);
    res.sendStatus(500);
  }
};

// 🔹 Liste des unités
exports.listUnits = async (req, res) => {
  try {
    const [units] = await db.query('SELECT * FROM units ORDER BY id DESC');
    res.render('settings/layout', {
      section: 'units',
      body: 'units',
      successMessage: req.flash('success'),
      units
    });
  } catch (err) {
    console.error('Erreur chargement unités :', err);
    res.sendStatus(500);
  }
};

// 🔹 Ajout
exports.addUnit = async (req, res) => {
  const { name, short_name } = req.body;
  try {
    await db.query('INSERT INTO units (name, short_name) VALUES (?, ?)', [name, short_name]);
    req.flash('success', 'Unité ajoutée');
    res.redirect('/settings/units');
  } catch (err) {
    console.error('Erreur ajout unité :', err);
    res.sendStatus(500);
  }
};

// 🔹 Modification
exports.editUnit = async (req, res) => {
  const { name, short_name } = req.body;
  try {
    await db.query('UPDATE units SET name = ?, short_name = ? WHERE id = ?', [name, short_name, req.params.id]);
    req.flash('success', 'Unité modifiée');
    res.redirect('/settings/units');
  } catch (err) {
    console.error('Erreur modif unité :', err);
    res.sendStatus(500);
  }
};

// 🔹 Suppression
exports.deleteUnit = async (req, res) => {
  try {
    await db.query('DELETE FROM units WHERE id = ?', [req.params.id]);
    req.flash('success', 'Unité supprimée');
    res.redirect('/settings/units');
  } catch (err) {
    console.error('Erreur suppression unité :', err);
    res.sendStatus(500);
  }
};


exports.getEmailSettings = async (req, res) => {
  try {
    const [result] = await db.query('SELECT * FROM email_settings LIMIT 1');
    const email = result[0] || {};
    res.render('settings/layout', {
      section: 'email',
      body: 'email',
      successMessage: req.flash('success'),
      email
    });
  } catch (err) {
    console.error('Erreur chargement paramètres mail :', err);
    res.sendStatus(500);
  }
};

exports.saveEmailSettings = async (req, res) => {
  try {
    const {
      mail_driver, mail_from_name, mail_from_email, enable_queue,
      host, port, encryption, username, password,

      // Stock Adjustment
      send_on_create_stock_adjustment,
      send_on_update_stock_adjustment,
      send_on_delete_stock_adjustment,

      // Purchase Return
      send_on_create_purchase_return,
      send_on_update_purchase_return,
      send_on_delete_purchase_return,

      // Purchases
      send_on_create_purchase,
      send_on_update_purchase,
      send_on_delete_purchase,

      // Sales
      send_on_create_sale,
      send_on_update_sale,
      send_on_delete_sale,

      // Sales Return
      send_on_create_sale_return,
      send_on_update_sale_return,
      send_on_delete_sale_return,

      // Expenses
      send_on_create_expense,
      send_on_update_expense,
      send_on_delete_expense,

      // Staff Members
      send_on_create_staff,
      send_on_update_staff,
      send_on_delete_staff
    } = req.body;

    const [rows] = await db.query('SELECT id FROM email_settings LIMIT 1');

    const data = [
      mail_driver, mail_from_name, mail_from_email,
      enable_queue === 'on',
      host, port, encryption, username, password,

      // Stock Adjustment
      !!send_on_create_stock_adjustment,
      !!send_on_update_stock_adjustment,
      !!send_on_delete_stock_adjustment,

      // Purchase Return
      !!send_on_create_purchase_return,
      !!send_on_update_purchase_return,
      !!send_on_delete_purchase_return,

      // Purchases
      !!send_on_create_purchase,
      !!send_on_update_purchase,
      !!send_on_delete_purchase,

      // Sales
      !!send_on_create_sale,
      !!send_on_update_sale,
      !!send_on_delete_sale,

      // Sales Return
      !!send_on_create_sale_return,
      !!send_on_update_sale_return,
      !!send_on_delete_sale_return,

      // Expenses
      !!send_on_create_expense,
      !!send_on_update_expense,
      !!send_on_delete_expense,

      // Staff Members
      !!send_on_create_staff,
      !!send_on_update_staff,
      !!send_on_delete_staff
    ];

    if (rows.length > 0) {
      await db.query(`
        UPDATE email_settings SET
          mail_driver = ?, mail_from_name = ?, mail_from_email = ?, enable_queue = ?,
          host = ?, port = ?, encryption = ?, username = ?, password = ?,

          send_on_create_stock_adjustment = ?, send_on_update_stock_adjustment = ?, send_on_delete_stock_adjustment = ?,
          send_on_create_purchase_return = ?, send_on_update_purchase_return = ?, send_on_delete_purchase_return = ?,
          send_on_create_purchase = ?, send_on_update_purchase = ?, send_on_delete_purchase = ?,
          send_on_create_sale = ?, send_on_update_sale = ?, send_on_delete_sale = ?,
          send_on_create_sale_return = ?, send_on_update_sale_return = ?, send_on_delete_sale_return = ?,
          send_on_create_expense = ?, send_on_update_expense = ?, send_on_delete_expense = ?,
          send_on_create_staff = ?, send_on_update_staff = ?, send_on_delete_staff = ?

        WHERE id = ?
      `, [...data, rows[0].id]);
    } else {
      await db.query(`
        INSERT INTO email_settings (
          mail_driver, mail_from_name, mail_from_email, enable_queue, host, port, encryption, username, password,

          send_on_create_stock_adjustment, send_on_update_stock_adjustment, send_on_delete_stock_adjustment,
          send_on_create_purchase_return, send_on_update_purchase_return, send_on_delete_purchase_return,
          send_on_create_purchase, send_on_update_purchase, send_on_delete_purchase,
          send_on_create_sale, send_on_update_sale, send_on_delete_sale,
          send_on_create_sale_return, send_on_update_sale_return, send_on_delete_sale_return,
          send_on_create_expense, send_on_update_expense, send_on_delete_expense,
          send_on_create_staff, send_on_update_staff, send_on_delete_staff
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?
        )
      `, data);
    }

    req.flash('success', 'Paramètres mail mis à jour');
    res.redirect('/settings/email');
  } catch (err) {
    console.error('Erreur mise à jour paramètres mail :', err);
    res.sendStatus(500);
  }
};

exports.sendTestEmail = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM email_settings LIMIT 1');
    const config = rows[0];

    if (!config || config.mail_driver !== 'SMTP') {
      return res.json({ success: false, message: "Configuration SMTP invalide" });
    }

    // Exemple d'envoi avec nodemailer
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.encryption === 'ssl',
      auth: {
        user: config.username,
        pass: config.password
      }
    });

    await transporter.sendMail({
      from: `"${config.mail_from_name}" <${config.mail_from_email}>`,
      to: config.mail_from_email,
      subject: 'Test Mail',
      text: 'Ceci est un mail de test depuis votre application.'
    });

    res.json({ success: true, message: 'Mail de test envoyé avec succès ✅' });
  } catch (err) {
    console.error('Erreur envoi test mail :', err);
    res.json({ success: false, message: 'Échec de l’envoi : ' + err.message });
  }
};

exports.createRole = async (req, res) => {
  const { display_name, role_name, description, perm } = req.body;
    console.log('Permissions reçues :', perm);

  try {
    // Étape 1 : créer le rôle
    const [result] = await db.query(
      `INSERT INTO roles (display_name, role_name, description) VALUES (?, ?, ?)`,
      [display_name, role_name, description]
    );
    const roleId = result.insertId;

    // Étape 2 : récupérer toutes les permissions existantes
    const [permissions] = await db.query('SELECT id, name FROM permissions');

    // Étape 3 : créer les enregistrements dans role_permissions
    const inserts = [];

    for (let permName in perm) {
      const permission = permissions.find(p => p.name === permName);
      if (!permission) continue;

      const actions = perm[permName];
      inserts.push([
        roleId,
        permission.id,
        actions.view ? 1 : 0,
        actions.add ? 1 : 0,
        actions.edit ? 1 : 0,
        actions.delete ? 1 : 0,
        actions.approve ? 1 : 0,
        actions.assign_to_all ? 1 : 0,
        actions.edit_all ? 1 : 0,
        actions.delete_all ? 1 : 0,
        actions.mark_weekend ? 1 : 0
      ]);
    }

    // Étape 4 : insertion en masse
    if (inserts.length > 0) {
      await db.query(
        `INSERT INTO role_permissions (
          role_id, permission_id,
          can_view, can_add, can_edit, can_delete,
          can_approve, can_assign_to_all, can_edit_all, can_delete_all, can_mark_weekend
        ) VALUES ?`,
        [inserts]
      );
    }

    req.flash('success', 'Rôle ajouté avec permissions');
    res.redirect('/settings/roles');
  } catch (err) {
    console.error('Erreur création rôle :', err);
    res.sendStatus(500);
  }
};

exports.listRoles = async (req, res) => {
  try {
    const [roles] = await db.query('SELECT * FROM roles ORDER BY id DESC');
    const [permissions] = await db.query('SELECT * FROM permissions ORDER BY name ASC');
    res.render('settings/layout', {
      section: 'roles',
      body: 'roles',
      successMessage: req.flash('success'),
      roles,
      permissions
    });
  } catch (err) {
    console.error('Erreur chargement rôles :', err);
    res.sendStatus(500);
  }
};

exports.editRoleForm = async (req, res) => {
  const roleId = req.params.id;

  try {
    const [[role]] = await db.query('SELECT * FROM roles WHERE id = ?', [roleId]);

    // 🔁 Récupération complète des permissions AVEC les droits existants (ou 0 par défaut)
    const [permissions] = await db.query(`
      SELECT p.id, p.name, p.display_name,
             COALESCE(rp.can_view, 0) AS can_view,
             COALESCE(rp.can_add, 0) AS can_add,
             COALESCE(rp.can_edit, 0) AS can_edit,
             COALESCE(rp.can_delete, 0) AS can_delete,
             COALESCE(rp.can_approve, 0) AS can_approve,
             COALESCE(rp.can_assign_to_all, 0) AS can_assign_to_all,
             COALESCE(rp.can_edit_all, 0) AS can_edit_all,
             COALESCE(rp.can_delete_all, 0) AS can_delete_all,
             COALESCE(rp.can_mark_weekend, 0) AS can_mark_weekend
      FROM permissions p
      LEFT JOIN role_permissions rp ON rp.permission_id = p.id AND rp.role_id = ?
      ORDER BY p.display_name ASC
    `, [roleId]);

    // ⬇️ Envoie directement les permissions enrichies à la vue
    res.render('settings/edit_role', {
      role,
      permissions
    });
  } catch (err) {
    console.error('Erreur chargement édition rôle :', err);
    res.sendStatus(500);
  }
};


exports.updateRole = async (req, res) => {
  const roleId = req.params.id;
  const { display_name, role_name, description, perm } = req.body;

  try {
    await db.query(
      `UPDATE roles SET display_name = ?, role_name = ?, description = ? WHERE id = ?`,
      [display_name, role_name, description, roleId]
    );

    await db.query('DELETE FROM role_permissions WHERE role_id = ?', [roleId]);

    const [permissions] = await db.query('SELECT id, name FROM permissions');
    const inserts = [];

    for (let permName in perm) {
      const permission = permissions.find(p => p.name === permName);
      if (!permission) continue;

      const actions = perm[permName] || {};
      inserts.push([
        roleId,
        permission.id,
        actions.view ? 1 : 0,
        actions.add ? 1 : 0,
        actions.edit ? 1 : 0,
        actions.delete ? 1 : 0,
        actions.approve ? 1 : 0,
        actions.assign_to_all ? 1 : 0,
        actions.edit_all ? 1 : 0,
        actions.delete_all ? 1 : 0,
        actions.mark_weekend ? 1 : 0
      ]);
    }

    if (inserts.length > 0) {
      await db.query(`
        INSERT INTO role_permissions (
          role_id, permission_id,
          can_view, can_add, can_edit, can_delete,
          can_approve, can_assign_to_all, can_edit_all, can_delete_all, can_mark_weekend
        ) VALUES ?`, [inserts]);
    }

    req.flash('success', 'Rôle mis à jour avec succès');
    res.redirect('/settings/roles');
  } catch (err) {
    console.error('Erreur mise à jour rôle :', err);
    res.sendStatus(500);
  }
};

exports.deleteRole = async (req, res) => {
  const roleId = req.params.id;
  try {
    await db.query('DELETE FROM role_permissions WHERE role_id = ?', [roleId]);
    await db.query('DELETE FROM roles WHERE id = ?', [roleId]);
    req.flash('success', 'Rôle supprimé avec succès');
    res.redirect('/settings/roles');
  } catch (err) {
    console.error('Erreur suppression rôle :', err);
    res.sendStatus(500);
  }
};

exports.showAddRoleForm = async (req, res) => {
  try {
    const modules = [
      'Products', 'Sales', 'Purchases', 'Expenses', 'Returns', 'Staff Members',
      'Stock Adjustment', 'Stock Transfer', 'Reports', 'POS', 'Settings',
      'Email Settings', 'Company Settings', 'Database Backup', 'Update App',
      'Categories', 'Brands', 'Users', 'Roles', 'Units', 'Currencies', 'Taxes'
    ];

    res.render('settings/roles/add', {
      modules
    });
  } catch (err) {
    console.error('Erreur affichage formulaire rôle :', err);
    res.sendStatus(500);
  }
};

// 🔹 Affichage
exports.getOtherSettings = async (req, res) => {
  try {
    const [settings] = await db.query('SELECT * FROM settings');
    const settingsMap = {};
    settings.forEach(row => {
      settingsMap[row.key] = row.value;
    });

    res.render('settings/layout', {
      section: 'other',
      body: 'other',
      settings: settingsMap,
      successMessage: req.flash('success')
    });
  } catch (err) {
    console.error('Erreur chargement paramètres Autres :', err);
    res.sendStatus(500);
  }
};

// 🔹 Sauvegarde
exports.saveOtherSettings = async (req, res) => {
  try {
    const entries = Object.entries(req.body);
    for (const [key, value] of entries) {
      await db.query(
        'INSERT INTO settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?',
        [key, value, value]
      );
    }
    req.flash('success', 'Paramètres mis à jour');
    res.redirect('/settings/other');
  } catch (err) {
    console.error('Erreur mise à jour paramètres autres :', err);
    res.sendStatus(500);
  }
};

// 🔁 Bascule manuel ouvert/fermé
exports.toggleDayStatus = async (req, res) => {
  try {
    const [row] = await db.query(`SELECT value FROM settings WHERE \`key\` = 'day_current_status'`);
    const current = row[0]?.value || 'closed';
    const updated = current === 'open' ? 'closed' : 'open';

    await db.query(`UPDATE settings SET value = ? WHERE \`key\` = 'day_current_status'`, [updated]);
    res.json({ success: true, status: updated });
  } catch (err) {
    console.error('Erreur changement statut journée :', err);
    res.status(500).json({ success: false });
  }
};

// 🔎 Lire le statut actuel
exports.getDayStatus = async (req, res) => {
  try {
    const [row] = await db.query(`SELECT value FROM settings WHERE \`key\` = 'day_current_status'`);
    res.json({ status: row[0]?.value || 'closed' });
  } catch (err) {
    console.error('Erreur lecture statut journée :', err);
    res.status(500).json({ status: 'closed' });
  }
};


/*exports.showRolesPage = async (req, res) => {
  try {
    const [roles] = await db.query('SELECT * FROM roles');

    const permissions = [
      { name: 'products', display_name: 'Produits' },
      { name: 'sales', display_name: 'Ventes' },
      { name: 'purchases', display_name: 'Achats' },
      { name: 'expenses', display_name: 'Dépenses' },
      { name: 'stock_adjustment', display_name: 'Ajustement de stock' },
      { name: 'stock_transfer', display_name: 'Transfert de stock' },
      { name: 'pos', display_name: 'POS' },
      { name: 'reports', display_name: 'Rapports' },
      { name: 'users', display_name: 'Utilisateurs' },
      { name: 'roles', display_name: 'Rôles' },
      { name: 'units', display_name: 'Unités' },
      { name: 'currencies', display_name: 'Devises' },
      { name: 'taxes', display_name: 'Taxes' },
      { name: 'categories', display_name: 'Catégories' },
      { name: 'brands', display_name: 'Marques' },
      { name: 'email_settings', display_name: 'Paramètres Email' },
      { name: 'company_settings', display_name: 'Paramètres Société' },
      { name: 'database_backup', display_name: 'Sauvegarde BDD' },
      { name: 'update_app', display_name: 'Mise à jour App' },
    ];

    res.render('settings/roles', {
      roles,
      permissions
    });
  } catch (err) {
    console.error('Erreur chargement rôles :', err);
    res.sendStatus(500);
  }
};*/






