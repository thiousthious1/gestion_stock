const express = require('express');
const path = require('path');
const session = require('express-session');
const app = express();
const qs = require('qs');
const flash = require('connect-flash');
const db = require('./models/db'); // doit être en haut

function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  next();
}


app.use(flash());

app.use(express.urlencoded({
    extended: true,
    parameterLimit: 10000,
    limit: '10mb'
}));

// Correction pour parser correctement les champs type products[][quantity]
app.use((req, res, next) => {
    if (req.method === 'POST' && req.headers['content-type'] && req.headers['content-type'].includes('application/x-www-form-urlencoded')) {
        req.body = qs.parse(req.body);
    }
    next();
});


// Définir EJS comme moteur de templates
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middlewares pour parser les formulaires HTML et JSON
app.use(express.json());

// Servir les fichiers statiques
app.use(express.static(path.join(__dirname, 'public')));

// Session
app.use(session({
  secret: 'supersecretkey',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false }
}));

// Middleware global
app.use(async (req, res, next) => {
  if (req.session.user) {
    const roleId = req.session.user.role;
    const permissions = await getRolePermissions(roleId);
    res.locals.permissions = permissions;
    //console.log("✅ Permissions injectées pour l'utilisateur :", req.session.user?.email || req.session.user?.id);
    //console.log(permissions);

  } else {
    res.locals.permissions = {};
  }
  next();
});

const { hasRight } = require('./helpers/permissions');

app.use((req, res, next) => {
  res.locals.hasRight = (permName, action) =>
    hasRight(res.locals.permissions || {}, permName, action);
  next();
});


// Flash messages
app.use((req, res, next) => {
  // 🔍 Debug temporaire pour vérifier si un message d'erreur est bien là
  if (req.session.errorMessage) {
    console.log("🔴 Message d'erreur détecté :", req.session.errorMessage);
  }
  res.locals.user = req.session.user || null;
  res.locals.successMessage = req.session.successMessage || '';
  res.locals.errorMessage = req.session.errorMessage || '';
  res.locals.message = req.session.message || '';

  res.locals.currentPage = res.locals.currentPage || '';

  // Supprimer les messages après affichage
  delete req.session.successMessage;
  delete req.session.errorMessage;
  delete req.session.message;

  next();
});

app.use(async (req, res, next) => {
  try {
    const [rows] = await db.query(`SELECT value FROM settings WHERE \`key\` = 'day_current_status'`);
    res.locals.journeeStatus = rows[0]?.value || 'closed';
  } catch (err) {
    console.error('Erreur récupération statut journée :', err);
    res.locals.journeeStatus = 'closed';
  }

  next();
});

const getRolePermissions = async (roleId) => {
  const [permissions] = await db.query(`
    SELECT p.name, rp.can_view, rp.can_add, rp.can_edit, rp.can_delete
    FROM role_permissions rp
    JOIN permissions p ON rp.permission_id = p.id
    WHERE rp.role_id = ?
  `, [roleId]);

  const result = {};
  permissions.forEach(p => {
    result[p.name] = {
      view: !!p.can_view,
      add: !!p.can_add,
      edit: !!p.can_edit,
      delete: !!p.can_delete
    };
  });
  return result;
};


// Importation des routes
const productRoutes = require('./routes/productRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const salesRoutes = require('./routes/sales');
const customersRoutes = require('./routes/customers');
const paymentRoutes = require('./routes/payments');
const returnRoutes = require('./routes/returns');
const verifyRoutes = require('./routes/verify');
const purchaseRoutes = require('./routes/purchases');
const supplierRoutes = require('./routes/suppliers');
const expenseCategoriesRoutes = require('./routes/expenseCategories');
const expensesRoutes = require('./routes/expenses');
const inventoryRoutes = require('./routes/inventories');
const reportsRoutes = require('./routes/reports');
const purchaseReturnRoute = require('./routes/purchaseReturn');
const purchasePaymentRoute = require('./routes/purchasePayment');
const settingsRoutes = require('./routes/settings');
const userRoutes = require('./routes/users');
const authRoutes = require('./routes/auth');
const purchaseOrderRoutes = require('./routes/purchaseOrders');
const deliveryNoteRoutes = require('./routes/deliveryNotes');
const permissionRoutes = require('./routes/permissions');


app.use('/permissions', permissionRoutes);
app.use('/', authRoutes); // accessible sans login
app.use('/dashboard', requireAuth, dashboardRoutes);
app.use('/products', requireAuth, productRoutes);
app.use('/categories', requireAuth, categoryRoutes);
app.use('/sales', requireAuth, salesRoutes);
app.use('/customers', requireAuth, customersRoutes);
app.use('/payments', requireAuth, paymentRoutes);
app.use('/returns', requireAuth, returnRoutes);
app.use('/verify', requireAuth, verifyRoutes);
app.use('/purchases', requireAuth, purchaseRoutes);
app.use('/suppliers', requireAuth, supplierRoutes);
app.use('/expense-categories', requireAuth, expenseCategoriesRoutes);
app.use('/expenses', requireAuth, expensesRoutes);
app.use('/inventories', requireAuth, inventoryRoutes);
app.use('/reports', requireAuth, reportsRoutes);
app.use('/purchase-returns', requireAuth, purchaseReturnRoute);
app.use('/purchase-payments', requireAuth, purchasePaymentRoute);
app.use('/settings', requireAuth, settingsRoutes);
app.use('/users', requireAuth, userRoutes);
app.use('/purchase-orders', purchaseOrderRoutes);
app.use('/delivery-notes', deliveryNoteRoutes);


// Gestion 404
app.use((req, res) => {
  res.status(404).render('404', { title: 'Page non trouvée', currentPage: '' });
});

// Lancement serveur
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Serveur lancé sur http://localhost:${PORT}`);
});
