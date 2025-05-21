document.addEventListener('DOMContentLoaded', function () {

    const supplierForm = document.getElementById('addSupplierForm');
    const supplierSelect = document.getElementById('supplierSelect');

    if (!supplierForm) return; // Sécurité

    supplierForm.addEventListener('submit', async function (e) {
        e.preventDefault();

        // Récupérer les champs
        const name = supplierForm.querySelector('input[name="name"]').value;
        const contact = supplierForm.querySelector('input[name="contact"]').value;
        const phone = supplierForm.querySelector('input[name="phone"]').value;
        const email = supplierForm.querySelector('input[name="email"]').value;

        // Créer formData simulant un vrai formulaire
        const formData = new URLSearchParams();
        formData.append('name', name);
        formData.append('contact', contact);
        formData.append('phone', phone);
        formData.append('email', email);

        try {
            const response = await fetch('/suppliers/ajax-add', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: formData.toString()
            });

            const result = await response.json();

            if (result.success) {
                const option = document.createElement('option');
                option.value = result.supplier.id;
                option.textContent = result.supplier.name;
                option.selected = true;
                supplierSelect.appendChild(option);

                // ✅ Notification
                if (window.Swal) {
                    Swal.fire({
                        toast: true,
                        position: 'top-end',
                        icon: 'success',
                        title: 'Fournisseur ajouté avec succès',
                        showConfirmButton: false,
                        timer: 2000
                    });
                } else {
                    alert('Fournisseur ajouté avec succès');  // fallback basique
                }


                const offcanvas = bootstrap.Offcanvas.getInstance(document.getElementById('addSupplierDrawer'));
                offcanvas.hide();
                supplierForm.reset();

            } else {
                alert(result.message || 'Erreur lors de l\'ajout.');
            }

        } catch (err) {
            console.error('Erreur AJAX :', err);
            alert('Erreur serveur.');
        }
    });

});
