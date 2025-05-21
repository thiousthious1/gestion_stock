document.addEventListener('DOMContentLoaded', function () {
    const productSelect = document.getElementById('productSelect');
    const customerSelect = document.getElementById('customerSelect');
    const productTableBody = document.getElementById('productTableBody');
    const globalDiscountInput = document.getElementById('globalDiscount');
    const globalTaxInput = document.getElementById('globalTax');
    const subtotalDisplay = document.getElementById('subtotalDisplay');
    const grandTotalDisplay = document.getElementById('grandTotalDisplay');

    const addCustomerBtn = document.getElementById('addCustomerBtn');
    const drawerCustomer = document.getElementById('drawerCustomer');
    const closeDrawerCustomer = document.getElementById('closeDrawerCustomer');

    const addProductBtn = document.getElementById('addProductBtn');
    const drawerProduct = document.getElementById('drawerProduct');
    const closeDrawerProduct = document.getElementById('closeDrawerProduct');

    addCustomerBtn.addEventListener('click', function () {
        drawerCustomer.classList.remove('d-none');
        drawerCustomer.classList.add('show');
    });

    closeDrawerCustomer.addEventListener('click', function () {
        drawerCustomer.classList.remove('show');
        drawerCustomer.classList.add('d-none');
    });

    addProductBtn.addEventListener('click', function () {
        drawerProduct.classList.remove('d-none');
        drawerProduct.classList.add('show');
    });

    closeDrawerProduct.addEventListener('click', function () {
        drawerProduct.classList.remove('show');
        drawerProduct.classList.add('d-none');
    });


    productSelect.addEventListener('change', function () {
    const selectedOption = productSelect.options[productSelect.selectedIndex];
    const productId = selectedOption.value;
    const productName = selectedOption.getAttribute('data-name');
    const unitPrice = selectedOption.getAttribute('data-price');

    const stock = parseInt(selectedOption.getAttribute('data-stock')) || 0;
    const seuil = parseInt(selectedOption.getAttribute('data-stock-threshold')) || 0;
    const seuilActif = selectedOption.getAttribute('data-stock-threshold-enabled') === 'yes';

    if (productId) {
        if (seuilActif && stock <= seuil) {
        Swal.fire({
            icon: 'warning',
            title: 'Stock insuffisant',
            text: `Ce produit ne peut pas être vendu. Stock actuel : ${stock}, seuil requis : ${seuil}.`,
            toast: true,
            position: 'top-end',
            timer: 3000,
            showConfirmButton: false
        });
        productSelect.selectedIndex = 0;
        return;
        }

        createProductRow(productId, productName, unitPrice);
        productSelect.selectedIndex = 0;
    }
    });



    function createProductRow(productId, productName, unitPrice) {
        const existingRow = productTableBody.querySelector(`tr[data-product-id="${productId}"]`);
        if (existingRow) {
            Swal.fire('Attention', 'Ce produit a déjà été ajouté.', 'warning');
            return;
        }

        const tr = document.createElement('tr');
        tr.classList.add('product-line');
        tr.setAttribute('data-product-id', productId);

        tr.innerHTML = `
          <td>${productName}</td>
          <td><input type="number" class="form-control quantity-input" value="1" min="1"></td>
          <td><input type="text" class="form-control unit-price" value="${parseFloat(unitPrice).toFixed(2)}" readonly></td>
          <td><input type="number" class="form-control discount-input" value="0" min="0"></td>
          <td><input type="number" class="form-control tax-input" value="0" min="0"></td>
          <td class="line-subtotal text-end">0 CFA</td>
          <td><button type="button" class="btn btn-danger btn-sm remove-line">🗑️</button></td>
        `;
        productTableBody.appendChild(tr);
        calculateTotals();
    }

    function calculateTotals() {
        let subtotal = 0;

        document.querySelectorAll('.product-line').forEach(line => {
            const quantity = parseFloat(line.querySelector('.quantity-input').value) || 0;
            const price = parseFloat(line.querySelector('.unit-price').value) || 0;
            const discount = parseFloat(line.querySelector('.discount-input').value) || 0;
            const tax = parseFloat(line.querySelector('.tax-input').value) || 0;

            let lineTotal = price * quantity;
            lineTotal -= (lineTotal * discount / 100);
            lineTotal += (lineTotal * tax / 100);

            subtotal += lineTotal;

            line.querySelector('.line-subtotal').innerText = lineTotal.toLocaleString() + ' CFA';
        });

        const globalDiscount = parseFloat(globalDiscountInput.value) || 0;
        const globalTax = parseFloat(globalTaxInput.value) || 0;

        const discountAmount = (subtotal * globalDiscount) / 100;
        const subtotalAfterDiscount = subtotal - discountAmount;
        const taxAmount = (subtotalAfterDiscount * globalTax) / 100;
        const grandTotal = subtotalAfterDiscount + taxAmount;

        subtotalDisplay.innerText = subtotal.toLocaleString() + ' CFA';
        document.getElementById('discountDisplay').innerText = discountAmount.toLocaleString() + ' CFA';
        document.getElementById('taxDisplay').innerText = taxAmount.toLocaleString() + ' CFA';
        grandTotalDisplay.innerHTML = `<strong>${grandTotal.toLocaleString()} CFA</strong>`;
    }

    productSelect.addEventListener('change', function () {
        const selectedOption = productSelect.options[productSelect.selectedIndex];
        const productId = selectedOption.value;
        const productName = selectedOption.getAttribute('data-name');
        const unitPrice = selectedOption.getAttribute('data-price');

        if (productId) {
            createProductRow(productId, productName, unitPrice);
            productSelect.selectedIndex = 0;
        }
    });

    productTableBody.addEventListener('input', calculateTotals);

    productTableBody.addEventListener('click', function (e) {
        if (e.target.classList.contains('remove-line')) {
            e.target.closest('tr').remove();
            calculateTotals();
        }
    });

    globalDiscountInput.addEventListener('input', calculateTotals);
    globalTaxInput.addEventListener('input', calculateTotals);

    // ➕ Enregistrer Nouveau Client
    document.getElementById('customerForm').addEventListener('submit', async function (e) {
        e.preventDefault();
        const name = document.getElementById('customerName').value.trim();
        const email = document.getElementById('customerEmail').value.trim();
        const phone = document.getElementById('customerPhone').value.trim();

        if (name) {
            try {
                const response = await fetch('/customers/ajax-add', { // ✅ Correction ici
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, email, phone })
                });
                const data = await response.json();

                if (data.success) {
                    const newOption = document.createElement('option');
                    newOption.text = name + (phone ? ` (${phone})` : '');
                    newOption.value = data.id;
                    customerSelect.appendChild(newOption);
                    customerSelect.value = data.id;

                    drawerCustomer.classList.remove('show');
                    drawerCustomer.classList.add('d-none');
                    this.reset();
                } else {
                    Swal.fire('Erreur', data.message || 'Erreur inconnue.', 'error');
                }
            } catch (err) {
                console.error('Erreur réseau:', err);
                Swal.fire('Erreur', 'Erreur réseau.', 'error');
            }
        } else {
            Swal.fire('Erreur', 'Veuillez remplir le nom du client.', 'error');
        }
    });

   // ➕ Enregistrer Nouveau Produit
document.getElementById('productForm').addEventListener('submit', async function (e) {
    e.preventDefault();

    const name = document.getElementById('productName').value.trim();
    const description = document.getElementById('productDescription').value.trim();
    const price = parseFloat(document.getElementById('productPrice').value);
    const salePrice = parseFloat(document.getElementById('productSalePrice').value);
    const quantity = parseInt(document.getElementById('productStock').value);
    const categoryId = parseInt(document.getElementById('productCategorySelect').value);

    if (name && !isNaN(price) && !isNaN(salePrice)) {
        try {
            const response = await fetch('/products/ajax-add', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    nom: name,
                    description,
                    prix_achat: price,
                    prix_vente: salePrice,
                    quantite: quantity,
                    categorie_id: categoryId
                })
            });

            const data = await response.json();

            if (data.success) {
                const newOption = document.createElement('option');
                newOption.text = name + (quantity ? ` (${quantity} en stock)` : '');
                newOption.value = data.id;
                newOption.setAttribute('data-name', name);
                newOption.setAttribute('data-price', price.toFixed(2));

                productSelect.appendChild(newOption);
                productSelect.value = data.id;

                drawerProduct.classList.remove('show');
                drawerProduct.classList.add('d-none');
                this.reset();
            } else {
                Swal.fire('Erreur', data.message || 'Erreur inconnue.', 'error');
            }
        } catch (err) {
            console.error('Erreur réseau:', err);
            Swal.fire('Erreur', 'Erreur réseau.', 'error');
        }
    } else {
        Swal.fire('Erreur', 'Veuillez remplir correctement tous les champs requis.', 'error');
    }
});


    // 🎯 ENREGISTRER LA VENTE
    document.getElementById('saleForm').addEventListener('submit', async function (e) {
        e.preventDefault();

        const customerId = customerSelect.value;
        const globalDiscount = parseFloat(globalDiscountInput.value) || 0;
        const globalTax = parseFloat(globalTaxInput.value) || 0;
        const items = [];

        document.querySelectorAll('#productTableBody tr').forEach(row => {
            const productId = row.getAttribute('data-product-id');
            const quantity = parseFloat(row.querySelector('.quantity-input').value) || 0;
            const unitPrice = parseFloat(row.querySelector('.unit-price').value) || 0;
            const discount = parseFloat(row.querySelector('.discount-input').value) || 0;
            const tax = parseFloat(row.querySelector('.tax-input').value) || 0;

            items.push({ product_id: productId, quantity, unit_price: unitPrice, discount, tax });
        });

        if (!customerId) return Swal.fire('Erreur', 'Veuillez sélectionner un client.', 'error');
        if (items.length === 0) return Swal.fire('Erreur', 'Veuillez ajouter au moins un produit.', 'error');

        Swal.fire({
            title: 'Enregistrement...',
            text: 'Veuillez patienter',
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading()
        });

        try {
            const response = await fetch('/sales/add', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ customer_id: customerId, global_discount: globalDiscount, global_tax: globalTax, items })
            });

            if (response.ok) {
                Swal.fire({
                    icon: 'success',
                    title: 'Vente enregistrée !',
                    showConfirmButton: false,
                    timer: 2000
                }).then(() => window.location.href = '/sales/history');
            } else {
                const errorData = await response.json();

                if (response.status === 403 && errorData.message.includes('Journée fermée')) {
                    // 🔒 Cas spécifique : journée fermée
                    return Swal.fire({
                        icon: 'warning',
                        title: 'Accès refusé',
                        text: errorData.message,
                        confirmButtonText: 'OK'
                    });
                }

                // 🔁 Cas général d'erreur (stock, seuil, etc.)
                Swal.fire('Erreur', errorData.message || 'Une erreur est survenue.', 'error');
            }

        } catch (err) {
            console.error('Erreur réseau :', err);
            Swal.fire('Erreur', 'Erreur réseau.', 'error');
        }
    });
});
