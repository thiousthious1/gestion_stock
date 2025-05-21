const db = require('../models/db');

const checkDayTime = async (req, res, next) => {
  try {
    const [rows] = await db.query(`
      SELECT \`key\`, \`value\` FROM settings 
      WHERE \`key\` IN ('enable_day_schedule', 'auto_day_opening', 'opening_time', 'closing_time', 'day_current_status')
    `);

    const settings = {};
    rows.forEach(row => settings[row.key] = row.value);

    if (settings.enable_day_schedule === 'yes') {
      const now = new Date();
      const currentTime = now.toTimeString().substring(0, 5); // format HH:mm

      const opening = settings.opening_time || '00:00';
      const closing = settings.closing_time || '23:59';

      if (settings.auto_day_opening === 'yes') {
        if (currentTime < opening || currentTime > closing) {
          return res.redirect(`/sales/history?error=${encodeURIComponent('⛔ Journée fermée. Vente impossible hors plage horaire (' + opening + ' → ' + closing + ')')}`);
        }
      } else {
        const status = settings.day_current_status || 'closed';
        if (status !== 'open') {
          return res.redirect(`/sales/history?error=${encodeURIComponent('⛔ Journée fermée manuellement.')}`);
        }
      }
    }

    next();
  } catch (error) {
    console.error('Erreur middleware checkDayTime :', error);
    next(); // Ne bloque pas en cas d’erreur
  }
};

module.exports = checkDayTime;
