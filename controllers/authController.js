const db = require('../models/db');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

exports.showLoginForm = (req, res) => {
  res.render('login', { errorMessage: req.flash('errorMessage') });
};

exports.login = async (req, res) => {
  const { email, password } = req.body;
  console.log('Tentative de connexion avec email :', email);

  try {
    const [[user]] = await db.query('SELECT * FROM users WHERE email = ?', [email]);

    if (!user) {
      console.log('Utilisateur non trouvé');
      req.flash('errorMessage', 'Utilisateur non trouvé');
      return res.redirect('/login');
    }

    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      console.log('Mot de passe incorrect');
      req.flash('errorMessage', 'Mot de passe incorrect');
      return res.redirect('/login');
    }

    // Chargement des permissions
    const [permissionsResult] = await db.query(`
      SELECT p.name FROM role_permissions rp
      JOIN permissions p ON rp.permission_id = p.id
      WHERE rp.role_id = ?
    `, [user.role]);

    const permissions = permissionsResult.map(p => p.name);

    console.log('Permissions chargées :', permissions);

    req.session.user = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      permissions
    };

    console.log('Session définie :', req.session.user);

    // Redirection intelligente
    const redirectMap = [
      { permission: 'view_dashboard', url: '/dashboard' },
      { permission: 'view_products', url: '/products' },
      { permission: 'view_sales', url: '/sales/history' }
    ];

    let redirectTo = '/login';
    for (const item of redirectMap) {
      if (permissions.includes(item.permission)) {
        redirectTo = item.url;
        break;
      }
    }

    return res.redirect(redirectTo);

  } catch (err) {
    console.error('Erreur lors de la connexion :', err);
    req.flash('errorMessage', 'Erreur serveur');
    return res.redirect('/login');
  }
};



exports.logout = (req, res) => {
  req.session.destroy(() => {
    res.render('logout-confirm');
  });
};

// Utilise ta configuration SMTP
const transporter = nodemailer.createTransport({
  host: 'mail.tvbitcontact.com',
  port: 465,
  auth: {
    user: 'tvbitcontact@tvbitcontact.com',
    pass: 'M@thieu@2023'
  }
});

// ✅ Affiche le formulaire "mot de passe oublié"
exports.showForgotPasswordForm = (req, res) => {
  res.render('forgot-password');
};

// ✅ Traitement de la demande de réinitialisation
exports.sendResetLink = async (req, res) => {
  const { email } = req.body;

  try {
    const [[user]] = await db.query('SELECT * FROM users WHERE email = ?', [email]);

    if (!user) {
      req.flash('errorMessage', 'Aucun compte ne correspond à cet email.');
      return res.redirect('/forgot-password');
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 3600000); // expire dans 1h

    await db.query('UPDATE users SET reset_token = ?, reset_expires = ? WHERE email = ?', [token, expires, email]);

    const resetLink = `http://localhost:3000/reset-password/${token}`;

    await transporter.sendMail({
      from: '"Support TVBIT" <tvbitcontact@tvbitcontact.com>',
      to: email,
      subject: 'Réinitialisation de votre mot de passe',
      html: `<p>Bonjour ${user.username},</p>
             <p>Pour réinitialiser votre mot de passe, cliquez sur le lien suivant :</p>
             <a href="${resetLink}">${resetLink}</a>
             <p>Ce lien expirera dans une heure.</p>`
    });

    req.flash('successMessage', 'Un lien de réinitialisation a été envoyé à votre adresse e-mail.');
    res.redirect('/forgot-password');
  } catch (err) {
    console.error('Erreur envoi email réinitialisation :', err);
    res.sendStatus(500);
  }
};

// ✅ Affichage du formulaire de nouveau mot de passe
exports.showResetForm = async (req, res) => {
  const token = req.params.token;

  const [[user]] = await db.query(
    'SELECT * FROM users WHERE reset_token = ? AND reset_expires > NOW()', [token]
  );

  if (!user) return res.send('Lien expiré ou invalide.');

  res.render('reset-password', { token });
};

// ✅ Traitement du nouveau mot de passe
exports.resetPassword = async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;

  const hashedPassword = await bcrypt.hash(password, 10);

  await db.query(`
    UPDATE users SET password = ?, reset_token = NULL, reset_expires = NULL
    WHERE reset_token = ? AND reset_expires > NOW()
  `, [hashedPassword, token]);

  req.flash('successMessage', 'Mot de passe réinitialisé avec succès. Vous pouvez vous connecter.');
  res.redirect('/login');
};


